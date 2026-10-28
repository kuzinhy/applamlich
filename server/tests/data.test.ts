import { test } from 'node:test';
import assert from 'node:assert/strict';

import { migrateState, extractLeaders, SCHEMA_VERSION } from '../store.ts';
import { coerceAiEvent } from '../engines/extractor.ts';
import { parseLooseJson } from '../engines/gemini.ts';
import { buildIcs } from '../engines/ics.ts';
import { officialDocumentHtml } from '../engines/official_document.ts';
import { scorePriority } from '../engines/priority.ts';
import { extractPreparation } from '../engines/preparation.ts';
import { extractText, SUPPORTED_UPLOAD_EXTENSIONS } from '../engines/document_text.ts';
import { DEFAULT_SETTINGS, type EventRecord } from '../types.ts';
import { agencyHeadLines, advisorUnitName } from '../utils/organization.ts';

const CTX = { source_doc: 'Thông báo 15/TB-UBND', source_id: null, source_priority: 70, week_start: '2026-10-26' };

function ev(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'e1', source_id: null, source_document: '', source_page: null, source_paragraph: null,
    event_date: '2026-10-26', start_time: '08:00', end_time: '09:30',
    title: 'Họp giao ban', content: 'Đánh giá công tác tuần', chair: 'Chủ tịch UBND Nguyễn Văn An',
    participants: 'Các ngành', participant_group: '', location: 'Phòng họp Trụ sở UBND phường',
    organizer: '', preparation: '', documents_required: '', contact_person: '',
    priority_score: 60, confidence: 0.9, status: 'APPROVED', missing_data_fields: [],
    leaders: [], also_from: [], tasks: [], series_id: null,
    created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z',
    ...over,
  };
}

// ---------------------------------------------------------------- migration dữ liệu thật

test('migrateState giữ nguyên lịch cũ khi nâng lên schema v4', () => {
  const v3 = {
    schema_version: 3,
    events: [{ id: 'e1', event_date: '2026-10-26', start_time: '08:00', title: 'Họp giao ban' }],
    sources: [{ id: 's1', file_name: 'tb15.docx' }],
    settings: { unit_name: 'Đảng ủy Phường An Bình', travel_buffers: { sameWard: 20 } },
    audit_log: [{ id: 'a1', at: '2026-10-01T00:00:00.000Z', action: 'x', entity: 'e', entity_id: '1', detail: '' }],
  };
  const state = migrateState(structuredClone(v3));

  assert.equal(state.schema_version, SCHEMA_VERSION);
  assert.equal(state.events.length, 1, 'không được bỏ sự kiện cũ');
  assert.equal(state.events[0].title, 'Họp giao ban');
  assert.deepEqual(state.events[0].also_from, [], 'sự kiện cũ được bổ sung trường also_from');
  assert.equal(state.settings.unit_name, 'Đảng ủy Phường An Bình', 'thiết lập cũ phải còn');
  assert.equal(state.settings.travel_buffers.sameWard, 20, 'buffer tùy biến còn giữ');
  assert.equal(state.settings.travel_buffers.sameCity, DEFAULT_SETTINGS.travel_buffers.sameCity, 'thiếu thì lấy mặc định');
  assert.deepEqual(state.publications, [], 'schema mới thêm nhật ký ban hành rỗng');
  assert.equal(state.audit_log.length, 1);
});

test('migrateState chịu được store thiếu mảng và chuỗi danh sách hỏng', () => {
  const state = migrateState({
    schema_version: 1,
    events: [
      { id: 'e1', event_date: '2026-10-26', start_time: '08:00', title: 'A', also_from: '["Văn bản 1","Văn bản 2"]' },
      { id: 'e2', event_date: '2026-10-27', start_time: '09:00', title: 'B', also_from: 'Công văn 9, Thông tri 3' },
      { id: 'e3', event_date: '2026-10-28', start_time: '10:00', title: 'C', also_from: '[hỏng' },
    ],
    memory: null,
  });
  assert.deepEqual(state.events[0].also_from, ['Văn bản 1', 'Văn bản 2']);
  assert.deepEqual(state.events[1].also_from, ['Công văn 9', 'Thông tri 3'], 'chuỗi phẩy đơn cũng đọc được');
  assert.ok(Array.isArray(state.events[2].also_from), 'chuỗi JSON hỏng không làm crash');
  assert.equal(state.events[2].status, 'PROPOSED', 'thiếu status phải về PROPOSED');
  assert.deepEqual(state.memory, []);
  assert.equal(state.conflicts.length, 0);
});

test('extractLeaders chỉ nhận người có chức danh lãnh đạo', () => {
  const leaders = extractLeaders('Đ/c Nguyễn Văn An - Bí thư Đảng ủy, Trần Thị Bình', 'Phó Chủ tịch Lê Văn C và các ngành');
  assert.ok(leaders.some((l) => l.includes('Bí thư Đảng ủy')));
  assert.ok(leaders.some((l) => l.includes('Phó Chủ tịch')));
  assert.ok(!leaders.some((l) => l === 'Trần Thị Bình'), 'không có chức danh thì không tính là lãnh đạo');
});

// ---------------------------------------------------------------- an toàn dữ liệu AI

test('parseLooseJson cứu được JSON trả về kèm chữ thừa', () => {
  assert.deepEqual(parseLooseJson('{"a":1}'), { a: 1 });
  assert.deepEqual(parseLooseJson('```json\n{"events":[]}\n```'), { events: [] });
  assert.deepEqual(parseLooseJson('Đây là kết quả:\n{"events":[{"title":"Họp"}]}'), { events: [{ title: 'Họp' }] });
  assert.deepEqual(parseLooseJson('[{"title":"A"}] (hết)'), [{ title: 'A' }]);
  assert.equal(parseLooseJson('không có JSON nào'), null);
});

test('coerceAiEvent suy ngày giờ từ mô tả và liệt kê chỗ trống', () => {
  const out = coerceAiEvent(
    { title: 'Kiểm tra cải cách hành chính ngày 28/10', content: 'Thành phần: các ngành. Chủ trì: đồng chí Chủ tịch UBND', location: '' },
    CTX,
  );
  assert.ok(out);
  assert.equal(out!.event_date, '2026-10-28', 'ngày trong tiêu đề phải được đọc ra');
  assert.equal(out!.status, 'PROPOSED', 'AI chỉ đề xuất, không tự duyệt');
  assert.equal(out!.source_document, CTX.source_doc);
  assert.equal(out!.location, 'Chưa xác định (cần kiểm tra)');
  assert.ok(out!.missing_data_fields.includes('location'));
  assert.ok(out!.missing_data_fields.includes('start_time'));
  assert.ok(out!.priority_score >= 10 && out!.priority_score <= 100);
});

test('coerceAiEvent từ chối mục rỗng và kẹp confidence trong 0..1', () => {
  assert.equal(coerceAiEvent({}, CTX), null);
  assert.equal(coerceAiEvent({ title: '   ', content: '' }, CTX), null);
  const clipped = coerceAiEvent({ title: 'Họp', content: 'nội dung', confidence: 4 }, CTX);
  assert.equal(clipped!.confidence, 1);
  const fallbackDate = coerceAiEvent({ title: 'Trực cơ quan', content: 'Cả ngày', start_time: '13h' }, CTX);
  assert.equal(fallbackDate!.event_date, CTX.week_start, 'không có ngày thì lấy đầu tuần và báo thiếu');
  assert.equal(fallbackDate!.start_time, '13:00');
});

// ---------------------------------------------------------------- xuất văn bản

test('scorePriority nâng mục bắt buộc của lãnh đạo đạo', () => {
  const batBuoc = scorePriority({ source_priority: 80, title: 'Họp thường vụ', chair: 'Bí thư Đảng ủy', content: 'triệu tập bắt buộc' });
  const thuong = scorePriority({ source_priority: 80, title: 'Sinh hoạt câu lạc bộ', chair: '', content: 'cử đại diện tham gia' });
  assert.ok(batBuoc > thuong, `${batBuoc} phải cao hơn ${thuong}`);
  assert.equal(scorePriority({}), 54, 'mục không có tín hiệu nào ở mức trung bình');
});

test('extractPreparation lấy đầu việc chuẩn bị từ câu chữ văn bản', () => {
  assert.equal(extractPreparation('Đề nghị các đơn vị chuẩn bị báo cáo công tác quý'), 'báo cáo công tác quý');
  assert.match(extractPreparation('Yêu cầu chuẩn bị tham luận và tài liệu mang theo: Kế hoạch 55') || '', /tham luận/);
  assert.equal(extractPreparation('Không có yêu cầu gì thêm'), null);
  assert.equal(extractPreparation(''), null);
});

test('buildIcs xuất VCALENDAR hợp lệ và bỏ sự kiện thiếu giờ', () => {
  const ics = buildIcs([ev({ id: 'a', start_time: '08:00', end_time: '09:30' }), ev({ id: 'b', start_time: '' })], 'Lịch công tác An Bình');
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'), 'phải bắt đầu bằng VCALENDAR');
  assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
  assert.equal(ics.split('BEGIN:VEVENT').length - 1, 1, 'mục không có giờ phải bị loại');
  assert.match(ics, /DTSTART;TZID=Asia\/Ho_Chi_Minh:20261026T080000/);
  assert.match(ics, /DTEND;TZID=Asia\/Ho_Chi_Minh:20261026T093000/);
  assert.match(ics, /UID:a@applamlich\.local/);
  assert.match(ics, /STATUS:CONFIRMED/);
  const long = buildIcs([ev({ title: 'Họp trực tuyến triển khai nhiệm vụ chuyển đổi số liên ngành của địa phương trong tuần' })], 'Lịch');
  const folded = long.split('\r\n').filter((l) => l.startsWith(' '));
  assert.ok(folded.length > 0, 'dòng dài phải được gãy theo RFC 5545');
});

test('buildIcs escape dấu chấm phẩy và xuống dòng trong mô tả', () => {
  const ics = buildIcs([ev({ title: 'Họp; tổng kết', content: 'Dòng 1\nDòng 2' })], 'Lịch');
  assert.ok(ics.includes('SUMMARY:Họp\\; tổng kết'), 'dấu ; phải được escaped theo RFC 5545');
  assert.ok(ics.includes('Dòng 1\\nDòng 2'), 'xuống dòng trong mô tả phải thành \\n escaped');
  assert.ok(!/\r\nDòng 2/.test(ics), 'không được để xuống dòng thật làm gãy dòng ICS');
});

test('officialDocumentHtml dựng đủ thể thức và escape nội dung', () => {
  const html = officialDocumentHtml({
    events: [ev({ title: '<script>alert(1)</script>' }), ev({ id: 'e2', start_time: '07:30', title: 'Tiếp công dân' })],
    settings: { ...DEFAULT_SETTINGS, document_number: '44-LCT/VP', signer: 'Chủ tịch UBND Nguyễn Văn An' },
    weekStart: '2026-10-26',
    weekEnd: '2026-11-01',
    weekNumber: 44,
    conflicts: [],
  });
  assert.match(html, /ĐẢNG CỘNG SẢN VIỆT NAM/, 'đơn vị là tổ chức Đảng nên không ghi quốc hiệu');
  assert.ok(!html.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM'), 'bản Đảng không có tiêu ngữ');
  assert.match(html, /Đảng bộ Thành phố Hồ Chí Minh/, 'dòng tổ chức cấp trên lấy từ cài đặt');
  assert.match(html, /Thủ Dầu Một, ngày /, 'địa danh suy từ tên đơn vị');
  assert.match(html, /Số: 44-LCT\/VP/);
  assert.match(html, /Lịch công tác tuần 44/);
  assert.match(html, /Nơi nhận/);
  assert.ok(!html.includes('<script>alert'), 'nội dung sự kiện phải được escape');
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.indexOf('07:30') < html.indexOf('08:00'), 'các mục trong ngày sắp theo giờ');
});

test('Bản in A4 dùng Times New Roman cho văn bản, font hệ thống cho thanh công cụ', () => {
  const html = officialDocumentHtml({
    events: [ev()],
    settings: DEFAULT_SETTINGS,
    weekStart: '2026-10-26',
    weekEnd: '2026-11-01',
    weekNumber: 44,
    conflicts: [],
  });
  const bodyFont = /body \{ font-family: ([^;]+);/.exec(html)?.[1] ?? '';
  assert.ok(bodyFont.startsWith('"Times New Roman"'), `khổ chữ văn bản phải mở đầu bằng Times New Roman, nhận được "${bodyFont}"`);
  assert.match(bodyFont, /Liberation Serif/, 'máy Linux chưa có Times phải có serif cùng số đo');
  const toolbarFont = /\.toolbar \{[^}]*font-family: ([^;]+);/.exec(html)?.[1] ?? '';
  assert.ok(toolbarFont.startsWith('"Segoe UI"'), `thanh công cụ dùng font giao diện, nhận được "${toolbarFont}"`);
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(html), 'bản in không được tải chữ từ mạng');
});

test('agencyHeadLines lấy tên Ban từ cài đặt, góc phải theo loại tổ chức cấp trên', () => {
  const party = agencyHeadLines(DEFAULT_SETTINGS);
  assert.deepEqual(party.left, ['Đảng ủy Phường Thủ Dầu Một', 'Ban Xây dựng Đảng'], 'cấp trên là đơn vị ban hành lịch tuần, dòng dưới là tên Ban');
  assert.deepEqual(party.right, ['ĐẢNG CỘNG SẢN VIỆT NAM'], 'Ban trực thuộc Đảng ủy nên không ghi quốc hiệu - tiêu ngữ');

  const renamed = agencyHeadLines({ ...DEFAULT_SETTINGS, advisor_unit: '  Ban Tuyên giáo  ' });
  assert.equal(renamed.left[1], 'Ban Tuyên giáo', 'tên Ban cắt khoảng trắng thừa và thay đổi được');
  assert.equal(advisorUnitName({ ...DEFAULT_SETTINGS, advisor_unit: '' }), 'Ban Xây dựng Đảng', 'để trống thì dùng mặc định');

  const ward = agencyHeadLines({ ...DEFAULT_SETTINGS, unit_name: 'UBND Phường Chánh Hiệp' });
  assert.equal(ward.left[0], 'UBND Phường Chánh Hiệp');
  assert.deepEqual(ward.right, ['CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', 'Độc lập - Tự do - Hạnh phúc'], 'cấp trên là chính quyền thì ghi quốc hiệu - tiêu ngữ');
});

test('officialDocumentHtml trở về quốc hiệu khi đơn vị là cơ quan chính quyền', () => {
  const html = officialDocumentHtml({
    events: [ev()],
    settings: { ...DEFAULT_SETTINGS, unit_name: 'UBND Phường Chánh Hiệp', parent_org: '' },
    weekStart: '2026-10-26',
    weekEnd: '2026-11-01',
    weekNumber: 44,
    conflicts: [],
  });
  assert.match(html, /CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM/);
  assert.match(html, /Độc lập - Tự do - Hạnh phúc/);
  assert.match(html, /ĐẢNG BỘ Chánh Hiệp/, 'thiếu parent_org thì suy dòng cấp trên từ tên phường');
  assert.ok(!html.includes('ĐẢNG CỘNG SẢN VIỆT NAM'));
});

test('officialDocumentHtml báo xung đột mở ngay trên bản in', () => {
  const html = officialDocumentHtml({
    events: [ev()],
    settings: DEFAULT_SETTINGS,
    weekStart: '2026-10-26',
    weekEnd: '2026-11-01',
    weekNumber: 44,
    conflicts: [{ id: 'c1', event_id_1: 'e1', event_id_2: 'e9', conflict_type: 'OVERLAP_TIME', severity: 'CONFLICT HIGH', description: '', resolution_suggestion: '', status: 'OPEN', created_at: '' }],
  });
  assert.match(html, /1 mốc trùng lịch/);
});

// ---------------------------------------------------------------- đọc văn bản nguồn

test('extractText đọc txt/md/json và báo lỗi trung thực với định dạng không hỗ trợ', () => {
  const txt = extractText('thong-bao.txt', Buffer.from('  Lịch làm việc tuần 44  ', 'utf8'));
  assert.equal(txt.text, 'Lịch làm việc tuần 44');
  assert.equal(txt.chars, txt.text.length);
  assert.equal(extractText('note.md', Buffer.from('', 'utf8')).error, 'Tệp trống.');
  const pdf = extractText('tai-lieu.pdf', Buffer.from('%PDF-1.4', 'utf8'));
  assert.match(pdf.error || '', /extractTextAsync/);
  assert.match(extractText('anh.png', Buffer.from('x')).error || '', /OCR/);
  assert.match(extractText('anh.png', Buffer.from('x')).error || '', /extractTextAsync/);
  assert.ok(SUPPORTED_UPLOAD_EXTENSIONS.includes('.docx'));
  assert.ok(SUPPORTED_UPLOAD_EXTENSIONS.includes('.pdf'));
  assert.ok(SUPPORTED_UPLOAD_EXTENSIONS.includes('.xlsx'));
});

test('extractText đọc được .docx thật (zip chứa word/document.xml)', () => {
  const xml = '<?xml version="1.0"?><w:document><w:body><w:p><w:t>Họp giao ban</w:t></w:p><w:p><w:t>ngày 27/10</w:t></w:p></w:body></w:document>';
  const res = extractText('lich.docx', buildZip('word/document.xml', Buffer.from(xml, 'utf8')));
  assert.equal(res.error, undefined, res.error);
  assert.match(res.text, /Họp giao ban/);
  assert.match(res.text, /27\/10/);
});

test('extractText báo đúng lỗi khi .docx không có phần thân văn bản', () => {
  const res = extractText('rong.docx', buildZip('docProps/app.xml', Buffer.from('<Properties/>', 'utf8')));
  assert.equal(res.text, '');
  assert.match(res.error || '', /word\/document\.xml/);
});

/** ZIP một entry "stored" (method 0) vừa đủ để readZipEntry duyệt được. */
function buildZip(name: string, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBuf.length, 12);
  end.writeUInt32LE(local.length + nameBuf.length + data.length, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, end]);
}
