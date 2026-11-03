import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PARTY_SIGNAL_GROUPS,
  auditCoverage,
  canonicalPersonName,
  detectPartySignals,
  matchGroups,
  matchPeople,
  resolveAttendeeScope,
} from '../engines/party_signals.ts';
import {
  eventToInput,
  learnAssignments,
  mergeLearnedRules,
  rosterFromPersonnel,
  runPartyDetection,
} from '../services/party_detection.ts';
import type { EventRecord } from '../types.ts';

const ROSTER = [
  { id: 'p1', name: 'Lê Thị Minh Tâm', title: 'Trưởng Ban Xây dựng Đảng', role_description: 'Ủy viên Ban Thường vụ Đảng ủy; Ủy viên Ban Kinh tế - Ngân sách HĐND phường' },
  { id: 'p2', name: 'Phan Hữu Nghĩa', title: 'Phó Trưởng Ban Thường trực', role_description: 'Phụ trách tổ chức cán bộ, đảng viên' },
  { id: 'p3', name: 'Nguyễn Thị Hồng Kim', title: 'Phó Trưởng Ban', role_description: 'Phụ trách tuyên giáo, dân vận' },
  { id: 'p4', name: 'Trần Văn An', title: 'Chuyên viên', role_description: 'Theo dõi công tác đảng viên' },
];

function detect(overrides: Record<string, unknown> = {}) {
  const [detection] = detectPartySignals([{ title: '', ...overrides } as never], { roster: ROSTER });
  return detection;
}

function groupIds(detection: { matched_signals: Array<{ group_id: string }> }): string[] {
  return detection.matched_signals.map((s) => s.group_id);
}

function fakeEvent(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'e1',
    event_date: '2026-10-12',
    start_time: '08:00',
    end_time: '09:30',
    title: 'Họp giao ban',
    content: '',
    chair: '',
    participants: '',
    participant_group: '',
    location: 'Phòng họp',
    organizer: '',
    preparation: '',
    documents_required: '',
    leaders: [],
    status: 'PROPOSED',
    ...over,
  } as EventRecord;
}

// ---------------------------------------------------------------- 16 nhóm dấu hiệu

test('Nhóm 1 — Ban Thường vụ Đảng ủy: gợi ý Trưởng Ban vì có chức danh kiêm nhiệm UVBTV', () => {
  const detection = detect({
    title: 'Ban Thường vụ Đảng ủy phường giao ban, cho ý kiến về công tác cán bộ và công tác đảng viên',
    start_time: '08:00',
    date: '2026-10-12',
  });
  assert.ok(groupIds(detection).includes('btv_dang_uy'));
  assert.equal(detection.detection_level, 'B');
  assert.deepEqual(detection.suggested_person_ids, ['p1']);
  assert.match(detection.reason, /Trưởng Ban là Ủy viên Ban Thường vụ/);
  assert.equal(detection.requires_confirmation, true);
});

test('Nhóm 1 — không tự thêm Phó Ban hay chuyên viên khi chỉ triệu tập Ban Thường vụ', () => {
  const detection = detect({ title: 'Họp Ban Thường vụ Đảng ủy' });
  assert.deepEqual([...detection.assigned_person_ids, ...detection.accompanying_person_ids], []);
  assert.deepEqual(detection.suggested_person_ids, ['p1']);
});

test('Nhóm 2 — "Lãnh đạo Ban" chưa rõ chức danh thì để cả diện chờ phân công', () => {
  const detection = detect({ title: 'Tiếp và làm việc với Lãnh đạo Ban Xây dựng Đảng về công tác chuẩn bị đại hội' });
  assert.equal(detection.detection_level, 'A');
  assert.deepEqual(detection.suggested_person_ids.sort(), ['p1', 'p2', 'p3']);
  assert.deepEqual(detection.assigned_person_ids, []);
  assert.match(detection.reason, /cần phân công/);
});

test('Nhóm 2 — viết tắt PTBTT BXDĐ ánh xạ đúng Phó Trưởng Ban Thường trực', () => {
  const detection = detect({ attendees: 'PTBTT BXDĐ' });
  assert.deepEqual(detection.suggested_person_ids, ['p2']);
});

test('Nhóm 2 — Phó Trưởng Ban (số nhiều) không tự chọn một người', () => {
  const detection = detect({ attendees: 'Đồng chí Phó Trưởng Ban Xây dựng Đảng dự họp' });
  assert.deepEqual(detection.suggested_person_ids.sort(), ['p2', 'p3']);
});

test('Nhóm 3 — toàn thể cán bộ công chức cơ quan Ban: đưa đủ danh bạ vào cột cùng dự', () => {
  const detection = detect({
    title: 'Sinh hoạt chuyên đề toàn thể cán bộ, công chức cơ quan Ban Xây dựng Đảng',
    attendees: 'toàn thể cán bộ, công chức cơ quan Ban Xây dựng Đảng',
  });
  assert.equal(detection.detection_level, 'A');
  assert.equal(detection.accompanying_person_ids.length, 4);
  assert.equal(detection.review_status, 'auto_accepted');
});

test('Nhóm 3 — "toàn thể cán bộ, công chức phường" không tự đồng nhất với Ban', () => {
  const detection = detect({ attendees: 'Toàn thể cán bộ, công chức phường' });
  assert.equal(resolveAttendeeScope('Toàn thể cán bộ, công chức phường').kind, 'toan_phuong');
  assert.equal(detection.accompanying_person_ids.length, 0);
  assert.equal(detection.requires_confirmation, true);
});

test('Nhóm 3 — phân biệt phạm vi khối Đảng, đảng viên và cơ quan Ban', () => {
  assert.equal(resolveAttendeeScope('cán bộ, công chức các cơ quan Đảng phường').kind, 'khoi_dang');
  assert.equal(resolveAttendeeScope('Toàn thể đảng viên thuộc các chi bộ').kind, 'dang_vien');
  assert.equal(resolveAttendeeScope('Họp chi bộ tổ dân phố').kind, 'unknown');
});

test('Nhóm 4 — hội nghị triển khai nghị quyết trực tuyến chỉ là diện cần kiểm tra thành phần', () => {
  const detection = detect({
    title: 'Hội nghị trực tuyến toàn quốc nghiên cứu, học tập, quán triệt Nghị quyết Trung ương',
    location: 'Điểm cầu phường',
  });
  assert.ok(groupIds(detection).includes('trien_khai_van_ban'));
  assert.equal(detection.detection_level, 'C');
  assert.equal(detection.requires_confirmation, true);
  assert.equal(detection.review_status, 'pending');
});

test('Nhóm 5 — họp chuẩn bị Lễ trao Huy hiệu Đảng giữ nguyên ngày của cuộc họp, không suy ra ngày lễ', () => {
  const detection = detect({
    title: 'Họp chuẩn bị Lễ trao Huy hiệu Đảng đợt 07/11',
    date: '2026-10-12',
    start_time: '14:00',
  });
  assert.ok(groupIds(detection).includes('huy_hieu_dang'));
  assert.equal(detection.date, '2026-10-12');
  assert.equal(detection.start_time, '14:00');
  assert.equal(detection.detection_level, 'C');
});

test('Nhóm 6 — sơ kết, báo cáo viên và Ban Chỉ đạo 35 đều ở diện rà soát', () => {
  assert.ok(groupIds(detect({ title: 'Hội nghị sơ kết công tác xây dựng Đảng 9 tháng' })).includes('so_ket_tong_ket'));
  assert.ok(groupIds(detect({ title: 'Hội nghị Báo cáo viên Thành phố' })).includes('bao_cao_vien'));
  const bcd35 = detect({ title: 'Hội nghị giao ban công tác Ban Chỉ đạo 35' });
  assert.ok(groupIds(bcd35).includes('ban_chi_dao_35'));
  assert.equal(bcd35.suggested_person_ids.length, 0, 'không mặc định lãnh đạo Ban là thành viên');
});

test('Nhóm 7 — có danh sách thành viên Ban Chỉ đạo thì đề xuất đúng người', () => {
  const detection = detectPartySignals(
    [{ title: 'Họp Ban Chỉ đạo về phát triển khoa học, công nghệ và chuyển đổi số' }],
    { roster: ROSTER, learnedAssignments: { ban_chi_dao_khac: ['p3'] } },
  )[0];
  assert.deepEqual(detection.suggested_person_ids, ['p3']);
  assert.match(detection.reason, /danh sách thành viên/);
});

test('Nhóm 8 — nhận diện tên người qua các biến thể có dấu, không dấu và tên gọi', () => {
  const full = detect({ title: 'Đồng chí Lê Thị Minh Tâm chủ trì hội nghị' });
  assert.deepEqual(full.assigned_person_ids, ['p1']);
  assert.equal(full.detection_level, 'A');

  const short = detect({ title: 'đ/c Minh Tâm báo cáo tại hội trường' });
  assert.deepEqual(short.assigned_person_ids, ['p1']);

  const noAccent = detect({ title: 'LE THI MINH TAM chủ trì' });
  assert.deepEqual(noAccent.assigned_person_ids, ['p1']);

  assert.equal(matchPeople('Báo cáo của Trần Văn An', ROSTER).length, 1);
  assert.equal(matchPeople(' ông Trần Văn B', ROSTER).length, 0, 'không được nhận nhầm người gần giống tên');

  const danhBaCoLoiGoi = detectPartySignals(
    [{ title: 'Lê Thị Minh Tâm chủ trì giao ban khối Đảng' }, { title: 'đ/c Phan Hữu Nghĩa làm việc với Tổ chức cán bộ' }] as never,
    { roster: ROSTER.map((p) => ({ ...p, name: `Đ/c ${p.name}` })) },
  );
  assert.deepEqual(danhBaCoLoiGoi[0].assigned_person_ids, ['p1'], 'danh bạ ghi "Đ/c" đầu tên vẫn khớp khi nguồn chỉ ghi tên thuần');
  assert.deepEqual(danhBaCoLoiGoi[1].assigned_person_ids, ['p2'], 'nguồn ghi "đ/c" còn danh bạ cũng ghi "đ/c" thì vẫn khớp');
});

test('Nhóm 8 — hoạt động theo chức danh kiêm nhiệm vẫn được nhận diện cho lãnh đạo Ban', () => {
  const detection = detect({ title: 'Đồng chí Lê Thị Minh Tâm dự họp Ban Kinh tế - Ngân sách HĐND phường' });
  assert.deepEqual(detection.assigned_person_ids, ['p1']);
  assert.match(detection.evidence_refs.join(' '), /Tên người/);
});

test('Nhóm 9 và 13 — hội nghị cấp ủy, đại hội chỉ ra đúng nhóm dấu hiệu', () => {
  assert.ok(groupIds(detect({ title: 'Hội nghị Ban Chấp hành Đảng bộ phường' })).includes('cap_uy_to_chuc_dang'));
  assert.ok(groupIds(detect({ title: 'Đại hội Đảng bộ phường nhiệm kỳ 2025-2030' })).includes('cap_uy_to_chuc_dang'));
});

test('Nhóm 10 — công tác cán bộ, đảng viên, bảo vệ chính trị nội bộ đánh dấu chuyên môn', () => {
  const detection = detect({ title: 'Họp xét chuyển đảng chính thức và kết luận tiêu chuẩn chính trị' });
  assert.ok(groupIds(detection).includes('can_bo_dang_vien'));
  assert.equal(detection.detection_level, 'C');
});

test('Nhóm 11 — tuyên giáo, dân vận tách khỏi thành phần dự họp thực tế', () => {
  const detection = detect({ title: 'Hội nghị đối thoại giữa người đứng đầu cấp ủy, chính quyền với Nhân dân' });
  assert.ok(groupIds(detection).includes('tuyen_giao_dan_van'));
  assert.equal(detection.requires_confirmation, true);
});

test('Nhóm 12 — đoàn kiểm tra, giám sát không tự gán người khi nguồn không nêu tên', () => {
  const detection = detect({ title: 'Đoàn kiểm tra của Đảng ủy làm việc với chi bộ cơ quan' });
  assert.ok(groupIds(detection).includes('kiem_tra_giam_sat'));
  assert.deepEqual([...detection.assigned_person_ids, ...detection.accompanying_person_ids], []);
});

test('Nhóm 14 — nhiệm vụ chuẩn bị nội dung ghi riêng, không đồng nhất với thành phần dự', () => {
  const detection = detect({
    title: 'Hội nghị Ban Thường vụ Đảng ủy nghe báo cáo công tác cán bộ',
    preparation: 'Giao Ban Xây dựng Đảng chuẩn bị báo cáo, dự thảo kết luận',
  });
  assert.ok(groupIds(detection).includes('chuan_bi_noi_dung'));
  assert.ok(detection.preparation_person_ids.length > 0);
  assert.deepEqual(detection.preparation_tasks, ['Giao Ban Xây dựng Đảng chuẩn bị báo cáo, dự thảo kết luận']);
  assert.ok(!detection.preparation_person_ids.some((id) => detection.assigned_person_ids.includes(id)));
});

test('Nhóm 15 — hoạt động tập thể chỉ theo dõi tham khảo khi chưa nêu tên đơn vị', () => {
  const detection = detect({ title: 'Lễ ra quân dân vận, ngày thứ bảy văn minh' });
  assert.ok(groupIds(detection).includes('hoat_dong_tap_the'));
  assert.equal(detection.assigned_person_ids.length, 0);
});

test('Nhóm 16 — ủy nhiệm dự thay ghi nhận người được nêu tên', () => {
  const detection = detect({ attendees: 'Ủy nhiệm đồng chí Phan Hữu Nghĩa dự thay' });
  assert.deepEqual(detection.assigned_person_ids, ['p2']);
  assert.ok(groupIds(detection).includes('uy_nhiem_thay_mat'));
});

test('Nhóm 16 — "cử đại diện tham dự" mà chưa có tên thì giữ chờ phân công', () => {
  const detection = detect({ attendees: 'Ban Xây dựng Đảng cử đại diện tham dự' });
  assert.match(detection.reason, /chưa xác định người được cử|cần phân công/);
  assert.deepEqual(detection.assigned_person_ids, []);
});

test('Mức E — hoạt động của cơ quan khác không bị đưa vào danh sách đề xuất', () => {
  const detection = detect({ title: 'Sửa chữa điện chiếu sáng tuyến hẻm tổ 7' });
  assert.equal(detection.detection_level, 'E');
  assert.equal(detection.matched_signals.length, 0);
  assert.match(detection.reason, /Không có dấu hiệu/);
});

// ---------------------------------------------------------------- ngoài quy tắc cứng

test('Quản trị tắt một nhóm thì nhóm đó không sinh kết quả', () => {
  const [off] = detectPartySignals(
    [{ title: 'Hội nghị Báo cáo viên Thành phố' }],
    { roster: ROSTER, disabledGroups: ['bao_cao_vien'] },
  );
  assert.ok(!groupIds(off).includes('bao_cao_vien'));
  assert.equal(off.detection_level, 'E');
});

test('Từ khóa tùy biến của quản trị được hợp nhất vào nhóm tương ứng', () => {
  const hits = matchGroups('Họp tổ biên tập sổ tay đảng viên', {
    extraKeywords: { can_bo_dang_vien: ['so tay dang vien'] },
  });
  assert.ok(hits.some((h) => h.group.id === 'can_bo_dang_vien' && h.matches.includes('so tay dang vien')));
});

test('Trùng lịch: hai hoạt động cùng giờ có cùng người phải bị đánh dấu, không tự xoá mục nào', () => {
  const detections = detectPartySignals([
    { id: 'a', title: 'Họp Ban Thường vụ Đảng ủy', date: '2026-10-12', start_time: '08:00' },
    { id: 'b', title: 'Ban Thường vụ Đảng ủy nghe báo cáo quy hoạch cán bộ', date: '2026-10-12', start_time: '08:00' },
    { id: 'c', title: 'Họp Ban Thường vụ Đảng ủy', date: '2026-10-13', start_time: '08:00' },
  ], { roster: ROSTER });
  assert.equal(detections.length, 3);
  for (const detection of detections.slice(0, 2)) {
    assert.ok(detection.conflicts.length > 0, `mục ${detection.source_event_id} phải nêu xung đột`);
  }
  assert.equal(detections[2].conflicts.length, 0, 'khác ngày thì không phải xung đột');
});

test('Kiểm tra độc lập 8 lớp: BTV không có người, thiếu giờ, chuẩn bị không người phụ trách', () => {
  const detections = detectPartySignals([
    { id: 'x', title: 'Giao Ban Xây dựng Đảng chuẩn bị báo cáo', preparation: 'BXDD chuẩn bị báo cáo' },
    { id: 'y', title: 'Hội nghị Ban Chỉ đạo 35', date: '2026-10-12' },
    { id: 'z', title: 'Tiếp Đoàn kiểm tra của Thành ủy', attendees: 'Toàn thể cán bộ, công chức phường', date: '2026-10-13', start_time: '09:00' },
  ], { roster: ROSTER });
  const codes = auditCoverage(detections, { roster: ROSTER }).map((w) => w.code);
  assert.ok(codes.includes('PREPARATION_UNOWNED') || codes.includes('LEVEL_A_NO_OWNER'));
  assert.ok(codes.includes('COMMITTEE_MEMBERSHIP_UNKNOWN'));
  assert.ok(codes.includes('MISSING_TIME'));
  assert.ok(codes.includes('SCOPE_NOT_RESOLVED'));
});

test('Lớp chứng cứ: khớp nhóm mà mất căn cứ thì báo, mức E không bị báo oan', () => {
  const topical = detectPartySignals([{ id: 'e', title: 'Hội nghị triển khai chuyên đề năm 2026', date: '2026-10-14', start_time: '08:00' }], { roster: ROSTER });
  assert.equal(topical[0].matched_signals.length > 0, true, 'phải khớp nhóm triển khai văn bản');
  assert.ok(topical[0].evidence_refs.length > 0, 'kết quả đã có căn cứ thì không bị báo');
  assert.equal(auditCoverage(topical, { roster: ROSTER }).filter((w) => w.code === 'MISSING_EVIDENCE').length, 0);

  const noEvidence = detectPartySignals([{ id: 'f', title: 'Hội nghị Ban Chỉ đạo 35', date: '2026-10-14', start_time: '08:00' }], { roster: ROSTER });
  assert.equal(noEvidence[0].matched_signals.length > 0, true);
  noEvidence[0].evidence_refs = [];
  assert.ok(auditCoverage(noEvidence, { roster: ROSTER }).map((w) => w.code).includes('MISSING_EVIDENCE'));

  const levelE = detectPartySignals([{ id: 'g', title: 'Trực cơ quan', date: '2026-10-14', start_time: '08:00', excerpt: 'bảng phân công trực' }], { roster: ROSTER });
  assert.equal(auditCoverage(levelE, { roster: ROSTER }).filter((w) => w.code === 'MISSING_EVIDENCE').length, 0, 'mức E đương nhiên không có chứng cứ, không được báo');
});

test('Danh bạ chuyển thành roster: bỏ người đã nghỉ, giữ họ tên đã cắt whitespace', () => {
  const roster = rosterFromPersonnel([
    { id: 'p1', name: '  Lê Thị Minh Tâm ', title: 'Trưởng Ban', role_description: '', is_active: 1 },
    { id: 'p2', name: 'Người đã nghỉ', title: 'Chuyên viên', role_description: '', is_active: 0 },
    { id: 'p3', name: '', title: 'Chuyên viên', role_description: '', is_active: 1 },
  ] as never);
  assert.equal(roster.length, 1);
  assert.equal(roster[0].name, 'Lê Thị Minh Tâm');
});

test('eventToInput gộp chủ trì, thành phần, nhóm tham dự vào khối thành phần', () => {
  const input = eventToInput(fakeEvent({
    chair: 'Thường trực Đảng ủy',
    participants: 'Đ/c Lê Thị Minh Tâm',
    participant_group: 'Bí thư chi bộ',
    documents_required: 'Báo cáo công tác cán bộ',
  }));
  assert.match(input.attendees ?? '', /Thường trực Đảng ủy/);
  assert.match(input.attendees ?? '', /Bí thư chi bộ/);
  assert.match(input.preparation ?? '', /Báo cáo công tác cán bộ/);
});

test('runPartyDetection: nối danh bạ, lịch tuần và thống kê theo mức', () => {
  const result = runPartyDetection(
    [
      fakeEvent({ id: 'e1', title: 'Họp Ban Thường vụ Đảng ủy cho ý kiến công tác cán bộ', event_date: '2026-10-12', start_time: '08:00' }),
      fakeEvent({ id: 'e2', title: 'Sửa chữa điện chiếu sáng', event_date: '2026-10-12', start_time: '08:00' }),
    ],
    { roster: ROSTER, existingEvents: [fakeEvent({ id: 'old', title: 'Tiếp công dân', chair: 'Lê Thị Minh Tâm', event_date: '2026-10-12', start_time: '08:00', status: 'APPROVED' })] },
  );
  assert.equal(result.stats.total, 2);
  assert.equal(result.stats.by_level.E, 1);
  const btv = result.detections.find((d) => d.title.startsWith('Họp Ban Thường vụ'))!;
  assert.ok(btv.conflicts.some((c) => c.includes('Lê Thị Minh Tâm')), 'phải thấy Trưởng Ban đã bận tiếp công dân');
  assert.equal(result.groups.length, PARTY_SIGNAL_GROUPS.length);
});

test('Học từ lịch đã phê duyệt rồi hợp nhất thành quy tắc, có trần mỗi nhóm', () => {
  const approved = [
    fakeEvent({ title: 'Hội nghị Báo cáo viên Thành phố', participants: 'Nguyễn Thị Hồng Kim', status: 'APPROVED' }),
    fakeEvent({ title: 'Hội nghị Báo cáo viên Quận ủy', participants: 'Nguyễn Thị Hồng Kim, Phan Hữu Nghĩa', status: 'PUBLISHED' }),
    fakeEvent({ title: 'Hội nghị Báo cáo viên định kỳ', participants: 'Trần Văn An', status: 'PROPOSED' }),
  ];
  const learned = learnAssignments(approved, ROSTER);
  assert.deepEqual(learned.bao_cao_vien.sort(), ['p2', 'p3']);

  const merged = mergeLearnedRules({ bao_cao_vien: ['p4'] }, learned, 2);
  assert.equal(merged.bao_cao_vien.length, 2);
  assert.ok(!merged.bao_cao_vien.includes('p2') || !merged.bao_cao_vien.includes('p3'));
});

test('Quy tắc học được đưa vào đề xuất cho nhóm Ban Chỉ đạo', () => {
  const result = runPartyDetection(
    [fakeEvent({ title: 'Họp Ban Chỉ đạo thực hiện dân chủ ở cơ sở' })],
    { roster: ROSTER, learnedAssignments: { ban_chi_dao_khac: ['p4'] } },
  );
  assert.deepEqual(result.detections[0].suggested_person_ids, ['p4']);
  assert.equal(result.detections[0].requires_confirmation, true, 'đề xuất vẫn chờ người duyệt, không tự phê duyệt');
});

test('Tên chuẩn hoá: lời gọi đầu câu không biến một người thành hai', () => {
  assert.equal(canonicalPersonName('Đ/c Lê Thị Minh Tâm'), canonicalPersonName('Lê Thị Minh Tâm'));
  assert.equal(canonicalPersonName('Đồng chí Trần Quốc Tuấn'), canonicalPersonName('trần quốc tuấn'));
  assert.equal(canonicalPersonName('Ông Phan Hữu Nghĩa'), canonicalPersonName('Phan Hữu Nghĩa'));
  assert.equal(canonicalPersonName(''), '');
});
