/**
 * Kiểm chứng bộ máy suy ra người dự / người dự thay từ hồ sơ cơ quan.
 * Bất biến cần bảo vệ: không có tên người nào được tự bịa — gợi ý chỉ hiện khi
 * chức danh đó đã khai người giữ thật và người đó rảnh trong khung giờ đang xét.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applySubstitute,
  attendanceWeight,
  findSubstitute,
  matchPost,
  mentionsPost,
  orgProfilePrompt,
  postsBySeniority,
  requiredPostsOf,
  suggestSubstitute,
  unitAliasWords,
} from '../engines/attendance.ts';
import { analyzeConflicts } from '../engines/conflict.ts';
import { migrateState, normalizeOrgProfile } from '../store.ts';
import { cloneOrgProfile, DEFAULT_SETTINGS } from '../types.ts';
import type { EventRecord, OrgPost, OrgProfile, SettingsRecord } from '../types.ts';

const BUFFERS = { sameBuilding: 5, sameWard: 15, sameCity: 30, outsideArea: 60 };

function ev(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: over.id || `ev-${Math.random().toString(36).slice(2, 8)}`,
    source_id: null,
    source_document: '',
    source_page: null,
    source_paragraph: null,
    event_date: '2026-10-26',
    start_time: '08:00',
    end_time: '09:30',
    title: 'Họp',
    content: '',
    chair: '',
    participants: '',
    participant_group: '',
    location: '',
    organizer: '',
    preparation: '',
    documents_required: '',
    contact_person: '',
    priority_score: 5,
    confidence: 0.8,
    status: 'APPROVED',
    missing_data_fields: [],
    leaders: [],
    also_from: [],
    tasks: [],
    series_id: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...over,
  };
}

/** Bộ máy mặc định để test chỉ cần điền tên người, không phải khai lại chức danh. */
function profile(overrides: Record<string, string> = {}): OrgProfile {
  const p = cloneOrgProfile();
  for (const post of p.posts) {
    if (overrides[post.title]) post.holder = overrides[post.title];
  }
  return p;
}

const CO = profile({
  'Bí thư Đảng ủy': 'Nguyễn Văn An',
  'Phó Bí thư Thường trực': 'Trần Thị Bình',
  'Chủ tịch UBND': 'Lê Văn Cường',
  'Phó Chủ tịch UBND': 'Phạm Minh Đức',
});

const postOf = (p: OrgProfile, title: string): OrgPost => {
  const found = p.posts.find((x) => x.title === title);
  assert.ok(found, `chức danh "${title}" phải có trong bộ mặc định`);
  return found;
};

// ---------------------------------------------------------------- chức danh

test('matchPost khớp không dấu và ưu tiên cách gọi dài nhất', () => {
  assert.equal(matchPost(CO, 'đ/c Bí thư Đảng ủy chủ trì')?.title, 'Bí thư Đảng ủy');
  assert.equal(matchPost(CO, 'Phó Bí thư thường trực phát biểu')?.title, 'Phó Bí thư Thường trực',
    '"Bí thư" không được cướp chức danh Phó Bí thư Thường trực');
  assert.equal(matchPost(CO, 'đồng chí Lê Văn Cường kết luận')?.title, 'Chủ tịch UBND', 'tên người cũng là một cách gọi');
  assert.equal(matchPost(CO, 'anh bảo vệ trực'), null);
  assert.equal(matchPost(CO, ''), null);
});

test('postsBySeniority sắp bậc ưu tiên mà không sửa hồ sơ gốc', () => {
  const unordered = profile({ 'Bí thư Đảng ủy': 'Nguyễn Văn An' });
  unordered.posts.reverse();
  const gioNhat = [...unordered.posts.map((p) => p.title)];
  const ordered = postsBySeniority(unordered).map((p) => p.title);
  assert.equal(ordered[0], 'Bí thư Đảng ủy');
  assert.ok(ordered.indexOf('Phó Bí thư Thường trực') < ordered.indexOf('Chủ tịch UBND'));
  assert.deepEqual(unordered.posts.map((p) => p.title), gioNhat, 'hồ sơ gốc vẫn giữ thứ tự khai');
});

test('mentionsPost đọc cả chủ trì, lãnh đạo, thành phần và đầu mối', () => {
  const event = ev({
    chair: 'Nguyễn Văn An',
    leaders: ['Trần Thị Bình'],
    participants: 'Phạm Minh Đức – Phó Chủ tịch UBND',
    contact_person: 'Văn phòng',
  });
  assert.ok(mentionsPost(event, postOf(CO, 'Bí thư Đảng ủy')));
  assert.ok(mentionsPost(event, postOf(CO, 'Phó Bí thư Thường trực')));
  assert.ok(mentionsPost(event, postOf(CO, 'Phó Chủ tịch UBND')));
  assert.ok(!mentionsPost(event, postOf(CO, 'Trưởng Ban Xây dựng Đảng')));
  assert.ok(!mentionsPost(ev({}), postOf(CO, 'Bí thư Đảng ủy')));
});

// ---------------------------------------------------------------- quy chế triệu tập

test('quy chế triệu tập chỉ bắt buộc khi đúng chức danh đó có mặt và đã có người giữ', () => {
  const hoiNghi = ev({ title: 'Hội nghị quán triệt của Quận ủy', organizer: 'Quận ủy', chair: 'Nguyễn Văn An' });
  assert.equal(requiredPostsOf(CO, hoiNghi).map((p) => p.title).join(','), 'Bí thư Đảng ủy,Phó Bí thư Thường trực');
  assert.equal(attendanceWeight(CO, hoiNghi).mandatory, true);
  assert.equal(attendanceWeight(CO, hoiNghi).score, hoiNghi.priority_score + 100);

  const khongAiTren = ev({ title: 'Hội nghị quán triệt của Quận ủy', chair: 'Phạm Minh Đức' });
  assert.equal(attendanceWeight(CO, khongAiTren).mandatory, false, 'Phó Chủ tịch không thuộc thành phần bắt buộc');
  assert.equal(attendanceWeight(CO, khongAiTren).score, khongAiTren.priority_score);

  const hoSoChuaKien = ev({ title: 'Hội nghị quán triệt của Quận ủy', chair: 'Nguyễn Văn An' });
  assert.equal(attendanceWeight(cloneOrgProfile(), hoSoChuaKien).mandatory, false,
    'chưa khai người giữ thì chưa được coi là bắt buộc');
});

test('quy chế UBND cấp trên áp cho chức danh chính quyền', () => {
  const ev_ = ev({ title: 'Họp giao ban', organizer: 'UBND thành phố', participants: 'Lê Văn Cường' });
  assert.equal(attendanceWeight(CO, ev_).mandatory, true);
});

// ---------------------------------------------------------------- chuỗi ủy quyền

test('findSubstitute đi theo đúng chuỗi ủy quyền đã khai', () => {
  const target = ev({ id: 'noidb', title: 'Sinh hoạt Chi bộ', participants: 'Nguyễn Văn An' });
  const res = findSubstitute(CO, [target], postOf(CO, 'Bí thư Đảng ủy'), target);
  assert.equal(res.substitute?.title, 'Phó Bí thư Thường trực');
  assert.equal(res.substitute?.holder, 'Trần Thị Bình');
  assert.deepEqual(res.chain, ['Bí thư Đảng ủy', 'Phó Bí thư Thường trực']);
  assert.deepEqual(res.blocked, []);
});

test('findSubstitute bỏ người đã bận rồi lần xuống bậc tiếp theo', () => {
  const busy = ev({ id: 'khac', title: 'Làm việc với Sở', participants: 'Trần Thị Bình' });
  const target = ev({ id: 'noidb', title: 'Sinh hoạt Chi bộ', participants: 'Nguyễn Văn An' });
  const res = findSubstitute(CO, [busy, target], postOf(CO, 'Bí thư Đảng ủy'), target);
  assert.equal(res.substitute?.title, 'Chủ tịch UBND');
  assert.match(res.blocked[0].reason, /Trần Thị Bình đã có "Làm việc với Sở" cùng giờ/);
});

test('findSubstitute không đùn việc ra ngoài thành phần bắt buộc của hội nghị', () => {
  const busy = ev({ id: 'khac', title: 'Làm việc với Sở', participants: 'Trần Thị Bình' });
  const target = ev({
    id: 'hn',
    title: 'Hội nghị của Thành ủy',
    organizer: 'Thành ủy',
    participants: 'Nguyễn Văn An',
  });
  const res = findSubstitute(CO, [busy, target], postOf(CO, 'Bí thư Đảng ủy'), target);
  assert.equal(res.substitute, null, 'chỉ Bí thư/Phó Bí thư được dự → không được đẩy sang Chủ tịch UBND');
  assert.match(res.blocked.map((b) => b.reason).join(' '), /không thuộc thành phần bắt buộc/);
  assert.ok(res.chain.includes('Chủ tịch UBND'), 'vẫn ghi lại chuỗi đã lần để giải trình');
});

test('findSubstitute nói thẳng khi hồ sơ thiếu, thay vì đoán người', () => {
  const target = ev({ id: 'noidb', title: 'Sinh hoạt Chi bộ', participants: 'Nguyễn Văn An' });

  const chuaKhaiUyQuyen = cloneOrgProfile();
  postOf(chuaKhaiUyQuyen, 'Bí thư Đảng ủy').holder = 'Nguyễn Văn An';
  postOf(chuaKhaiUyQuyen, 'Bí thư Đảng ủy').deputy_title = '';
  const chuaUy = findSubstitute(chuaKhaiUyQuyen, [target], postOf(chuaKhaiUyQuyen, 'Bí thư Đảng ủy'), target);
  assert.equal(chuaUy.substitute, null);
  assert.match(chuaUy.blocked[0].reason, /chưa khai người được ủy quyền/);

  const phoChuaCoNguoi = profile({ 'Bí thư Đảng ủy': 'Nguyễn Văn An' });
  const thieuNguoi = findSubstitute(phoChuaCoNguoi, [target], postOf(phoChuaCoNguoi, 'Bí thư Đảng ủy'), target);
  assert.equal(thieuNguoi.substitute, null, 'chức danh ủy quyền chưa có người giữ thì không được bịa tên');
  assert.match(thieuNguoi.blocked[0].reason, /chưa có người giữ chức danh/);

  const truongBan = cloneOrgProfile();
  const trachDanh = findSubstitute(truongBan, [target], postOf(truongBan, 'Trưởng Ban Xây dựng Đảng'), target);
  assert.equal(trachDanh.substitute, null);
  assert.match(trachDanh.blocked[0].reason, /không có trong danh sách chức danh của cơ quan/);
});

test('findSubstitute chặn vòng lặp ủy quyền', () => {
  const loop = profile({ 'Bí thư Đảng ủy': 'Nguyễn Văn An', 'Phó Bí thư Thường trực': 'Trần Thị Bình' });
  postOf(loop, 'Phó Bí thư Thường trực').deputy_title = 'Bí thư Đảng ủy';
  const busy = ev({ id: 'busy', title: 'Công tác tại Sở Nội vụ', participants: 'Trần Thị Bình' });
  const target = ev({ id: 't', title: 'Sinh hoạt Chi bộ', participants: 'Nguyễn Văn An' });
  const res = findSubstitute(loop, [busy, target], postOf(loop, 'Bí thư Đảng ủy'), target);
  assert.equal(res.substitute, null);
  assert.match(res.blocked[res.blocked.length - 1].reason, /vòng lặp ủy quyền/);
});

// ---------------------------------------------------------------- gợi ý cho cặp xung đột

test('suggestSubstitute chỉ tìm người thay cho chức danh bận ở CẢ HAI sự kiện', () => {
  const keep = ev({ id: 'keep', title: 'Hội nghị của Quận ủy', organizer: 'Quận ủy', chair: 'Nguyễn Văn An' });
  const cungNguoi = ev({ id: 'move', title: 'Họp giao ban nội bộ', participants: 'Nguyễn Văn An' });
  const s = suggestSubstitute(CO, [keep, cungNguoi], keep, cungNguoi);
  assert.ok(s);
  assert.equal(s?.event_id, 'move');
  assert.equal(s?.absent_holder, 'Nguyễn Văn An');
  assert.equal(s?.substitute_holder, 'Trần Thị Bình');
  assert.equal(s?.substitute_also_busy, false);

  const nguoiKhac = ev({ id: 'move2', title: 'Họp giao ban nội bộ', participants: 'Phạm Minh Đức' });
  assert.equal(suggestSubstitute(CO, [keep, nguoiKhac], keep, nguoiKhac), null,
    'không có ai trùng mặt thì không được gợi ý thay');
  assert.equal(suggestSubstitute(cloneOrgProfile(), [keep, cungNguoi], keep, cungNguoi), null,
    'hồ sơ chưa có ai giữ chức danh thì trả null');
});

// ---------------------------------------------------------------- áp dụng

test('applySubstitute thay đúng chỗ người vắng, ưu tiên dòng chủ trì', () => {
  const s = {
    event_id: 'x',
    event_title: 'Họp',
    absent_title: 'Bí thư Đảng ủy',
    absent_holder: 'Nguyễn Văn An',
    substitute_title: 'Phó Bí thư Thường trực',
    substitute_holder: 'Trần Thị Bình',
    reason: '',
    chain: [],
    substitute_also_busy: false,
  };
  const inChair = applySubstitute(ev({ chair: 'Nguyễn Văn An', participants: 'Văn phòng' }), s);
  assert.equal(inChair.changed, 'chair');
  assert.equal(inChair.chair, 'Trần Thị Bình – Phó Bí thư Thường trực');
  assert.equal(inChair.participants, 'Văn phòng', 'không đụng dòng khác');

  const inParticipants = applySubstitute(ev({ chair: 'Lê Văn Cường', participants: 'Nguyễn Văn An, các ban' }), s);
  assert.equal(inParticipants.changed, 'participants');
  assert.match(inParticipants.participants, /Trần Thị Bình – Phó Bí thư Thường trực, các ban/);

  const append = applySubstitute(ev({ chair: 'ai đó', participants: 'các ban ngành' }), s);
  assert.equal(append.changed, 'participants_appended');
  assert.match(append.participants, /Phó Bí thư Thường trực dự thay Nguyễn Văn An/);
  assert.equal(append.chair, 'ai đó');
});

test('applySubstitute tôn trọng cách ghi thành phần bằng chức danh của lịch phường', () => {
  const s = {
    event_id: 'x',
    event_title: 'Họp',
    absent_title: 'Bí thư Đảng ủy',
    absent_holder: 'Nguyễn Văn An',
    substitute_title: 'Phó Bí thư Thường trực',
    substitute_holder: 'Trần Thị Bình',
    reason: '',
    chain: [],
    substitute_also_busy: false,
  };
  const theoChucDanh = applySubstitute(ev({ chair: 'Bí thư Đảng ủy', participants: 'Các ban xây dựng Đảng' }), s);
  assert.equal(theoChucDanh.changed, 'chair');
  assert.equal(theoChucDanh.chair, 'Phó Bí thư Thường trực', 'không pha tên người vào dòng chỉ ghi chức danh');
  assert.equal(theoChucDanh.participants, 'Các ban xây dựng Đảng');

  const phoChuTich = applySubstitute(ev({ chair: 'Phó Chủ tịch UBND', participants: '' }), {
    ...s, absent_title: 'Chủ tịch UBND', absent_holder: 'Lê Văn Cường',
    substitute_title: 'Phó Chủ tịch UBND', substitute_holder: 'Phạm Minh Đức',
  });
  assert.equal(phoChuTich.changed, 'participants_appended', '"Chủ tịch UBND" không được ăn bớt chữ của "Phó Chủ tịch UBND"');
  assert.equal(phoChuTich.chair, 'Phó Chủ tịch UBND');
});

// ---------------------------------------------------------------- bộ máy xung đột dùng hồ sơ

test('xung đột: việc cấp trên triệu tập được giữ, và nêu tên đúng người dự thay', () => {
  const hoiNghi = ev({
    id: 'hn',
    title: 'Hội nghị Quận ủy',
    organizer: 'Quận ủy',
    chair: 'Nguyễn Văn An',
    participants: 'Trần Thị Bình',
    location: 'Trụ sở Quận ủy',
    priority_score: 3,
  });
  const giaoBan = ev({
    id: 'gb',
    title: 'Giao ban nội bộ',
    chair: 'Nguyễn Văn An',
    location: 'Phòng họp Trụ sở Đảng ủy',
    priority_score: 9,
  });

  const khongHoSo = analyzeConflicts([hoiNghi, giaoBan], BUFFERS);
  assert.equal(khongHoSo.length, 1);
  assert.match(khongHoSo[0].resolution_suggestion, /Giữ "Giao ban nội bộ"/, 'không có hồ sơ thì theo điểm ưu tiên');
  assert.equal(khongHoSo[0].suggested_substitute, null, 'chưa có hồ sơ thì không có gợi ý để ghi');

  const coHoSo = analyzeConflicts([hoiNghi, giaoBan], BUFFERS, CO);
  assert.match(coHoSo[0].resolution_suggestion, /Giữ "Hội nghị Quận ủy"/, 'quy chế triệu tập thắng điểm tự chấm');
  assert.match(coHoSo[0].resolution_suggestion, /bắt buộc theo quy chế triệu tập/);
  assert.equal(coHoSo[0].suggested_substitute?.event_id, 'gb');
  assert.equal(coHoSo[0].suggested_substitute?.substitute_holder, 'Lê Văn Cường',
    'Phó Bí thư Bình đang cùng dự hội nghị nên phải lần xuống Chủ tịch Cường');
});

test('xung đột chưa đủ căn cứ thì hướng dẫn khai hồ sơ, không gợi ý suông', () => {
  const a = ev({ id: 'a', title: 'Họp A', chair: 'Nguyễn Văn An', participants: 'abc' });
  const b = ev({ id: 'b', title: 'Họp B', chair: 'Nguyễn Văn An' });
  const [c] = analyzeConflicts([a, b], BUFFERS, cloneOrgProfile());
  assert.equal(c.suggested_substitute, null);
  assert.match(c.resolution_suggestion, /Cài đặt › Thông tin cơ quan/);
});

// ---------------------------------------------------------------- prompt & biệt danh

test('orgProfilePrompt liệt kê người giữ thật và cảnh báo chỗ chưa khai', () => {
  const settings: SettingsRecord = { ...DEFAULT_SETTINGS, org_profile: CO };
  const prompt = orgProfilePrompt(settings);
  assert.match(prompt, /Bí thư Đảng ủy: Nguyễn Văn An/);
  assert.match(prompt, /vắng thì ủy quyền: Phó Bí thư Thường trực/);
  assert.match(prompt, /Trưởng Ban Xây dựng Đảng: \(chưa có người giữ — KHÔNG tự đặt tên\)/);
  assert.match(prompt, /QUY CHẾ THÀNH PHẦN THAM DỰ/);
  assert.match(prompt, /Thành ủy \/ Quận ủy → Bí thư Đảng ủy hoặc Phó Bí thư Thường trực/);
});

test('unitAliasWords gom tên đơn vị và biệt danh để nhận phạm vi triệu tập', () => {
  const settings: SettingsRecord = {
    ...DEFAULT_SETTINGS,
    org_profile: { ...CO, aliases: ['Đảng ủy phường', 'TDM'] },
  };
  const words = unitAliasWords(settings);
  assert.ok(words.includes('dang uy phuong thu dau mot'));
  assert.ok(words.includes('dang uy phuong'));
  assert.ok(!words.some((w) => w.length < 3), 'loại chuỗi quá ngắn dễ gây khớp giả');
});

// ---------------------------------------------------------------- chuẩn hoá hồ sơ lưu kho

test('normalizeOrgProfile chặn cấp hành chính lạ và giữ nguyên chỗ chưa khai người', () => {
  const clean = normalizeOrgProfile({
    admin_level: 'huyen',
    admin_level_label: 'Huyện',
    aliases: ['  BXDĐ ', 'BXDĐ', '', 123],
    posts: [
      { title: 'Bí thư Đảng ủy', holder: '', deputy_title: 'Phó Bí thư Thường trực' },
      { title: '   ', holder: 'không có chức danh' },
      { title: 'Chủ tịch UBND', holder: '  Lê   Văn   Cường ', seniority: 999 },
    ],
    convening_rules: [
      { convener: 'Quận ủy', keywords: ['quận ủy'], required_titles: ['Bí thư Đảng ủy'] },
      { convener: 'Quận ủy', keywords: [], required_titles: ['Bí thư Đảng ủy'] },
    ],
  });
  assert.equal(clean.admin_level, 'khac');
  assert.equal(clean.admin_level_label, 'Huyện');
  assert.deepEqual(clean.aliases, ['BXDĐ', '123']);
  assert.equal(clean.posts.length, 2, 'chức danh rỗng bị loại');
  assert.equal(clean.posts[0].holder, '', 'chưa khai người giữ thì để trống, không bịa');
  assert.equal(clean.posts[1].holder, 'Lê Văn Cường');
  assert.equal(clean.posts[1].seniority, 99);
  assert.equal(clean.convening_rules.length, 1, 'quy chế thiếu từ khoá bị loại');
});

test('normalizeOrgProfile giới hạn số lượng để kho không phình', () => {
  const many = normalizeOrgProfile({
    posts: Array.from({ length: 45 }, (_, i) => ({ title: `Chức danh ${i + 1}`, seniority: i + 1 })),
    convening_rules: Array.from({ length: 30 }, (_, i) => ({
      convener: `Cấp ${i}`,
      keywords: [`tổ chức ${i}`],
      required_titles: ['Bí thư Đảng ủy'],
    })),
  });
  assert.equal(many.posts.length, 30);
  assert.equal(many.convening_rules.length, 20);
});

test('normalizeOrgProfile không nhận dữ liệu rác', () => {
  const fallback = normalizeOrgProfile(undefined);
  assert.equal(fallback.admin_level, 'phuong');
  assert.ok(fallback.posts.length > 0, 'thiếu hồ sơ thì trả bộ chức danh mặc định');
  assert.equal(normalizeOrgProfile({ posts: 'không phải mảng' }).posts.length, fallback.posts.length);
});

test('kho cũ được bổ sung hồ sơ cơ quan, kho đã khai thì giữ nguyên tên người', () => {
  const tuKhoCu = migrateState({ schema_version: 7, settings: { unit_name: 'Đảng ủy Phường An Bình' } });
  assert.equal(tuKhoCu.settings.org_profile.posts.length, 6);
  assert.equal(tuKhoCu.settings.org_profile.posts.some((p) => p.holder), false,
    'không được tự gán tên cán bộ vào chức danh');
  assert.equal(tuKhoCu.settings.unit_name, 'Đảng ủy Phường An Bình', 'các thiết lập cũ vẫn còn');

  const daKhai = migrateState({
    settings: {
      unit_name: 'Đảng ủy Phường An Bình',
      org_profile: { admin_level: 'quan', posts: [{ title: 'Bí thư Huyện ủy', holder: 'Nguyễn Văn An' }] },
    },
  });
  assert.equal(daKhai.settings.org_profile.admin_level, 'quan');
  assert.equal(daKhai.settings.org_profile.posts.length, 1);
  assert.equal(daKhai.settings.org_profile.posts[0].holder, 'Nguyễn Văn An');
});
