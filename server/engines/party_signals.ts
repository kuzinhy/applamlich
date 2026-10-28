/**
 * Bộ máy nhận diện thành phần Ban Xây dựng Đảng trong lịch công tác của Đảng ủy.
 *
 * Nguyên tắc: mọi mẫu dò viết ở dạng "fold" (bỏ dấu, chữ thường) để khớp được dù nguồn
 * gõ có dấu/nhìn không dấu/viết tắt. Engine này hoàn toàn xác định — không gọi AI —
 * nên mỗi kết quả đều nêu được căn cứ và tái hiện được trong kiểm thử.
 */
import { foldVietnamese } from '../services/merge.ts';

export type SignalLevel = 'A' | 'B' | 'C' | 'D' | 'E';

export interface SignalGroup {
  id: string;
  label: string;
  /** Mức ưu tiên mặc định khi chỉ khớp nhóm này (chưa có tên người). */
  base_level: SignalLevel;
  patterns: string[];
  /** Giải thích cho người dùng biết vì sao nhóm này quan trọng. */
  rationale: string;
}

export interface RosterPerson {
  id: string;
  name: string;
  title: string;
  role_description: string;
}

const GROUPS: SignalGroup[] = [
  {
    id: 'btv_dang_uy',
    label: 'Ban Thường vụ Đảng ủy',
    base_level: 'B',
    rationale: 'Trưởng Ban Xây dựng Đảng là Ủy viên Ban Thường vụ, nên hội nghị triệu tập Ban Thường vụ luôn là lịch của Trưởng Ban.',
    patterns: [
      'ban thuong vu', 'ban thuong vu dang uy', 'hop ban thuong vu', 'hoi nghi ban thuong vu',
      'giao ban ban thuong vu', 'hoi y ban thuong vu', 'uvbtv', 'uv tv', 'uy vien ban thuong vu',
      'cac dong chi uvbtv', 'thanh vien ban thuong vu', 'toan the ban thuong vu',
      'ban thuong vu cho y kien', 'ban thuong vu nghe bao cao',
    ],
  },
  {
    id: 'lanh_dao_ban',
    label: 'Lãnh đạo Ban Xây dựng Đảng',
    base_level: 'A',
    rationale: 'Nguồn ghi đích danh chức danh thuộc Ban hoặc mời trực tiếp lãnh đạo Ban.',
    patterns: [
      'ld bxdd', 'lanh dao bxdd', 'lanh dao ban xay dung dang',
      'tb bxdd', 'truong ban xay dung dang', 'ptb bxdd', 'pho truong ban xay dung dang',
      'ptbtt', 'ptbtt bxdd', 'pho truong ban thuong truc', 'ld ban', 'lanh dao ban',
      'dai dien lanh dao ban', 'uy nhiem lanh dao ban',
    ],
  },
  {
    id: 'nhac_den_ban',
    label: 'Nhắc tên Ban Xây dựng Đảng',
    base_level: 'B',
    rationale: 'Chỉ nêu tên cơ quan mà chưa rõ thành phần hay chức danh — đủ để đưa vào diện phải kiểm tra, chưa đủ để gán người.',
    patterns: [
      'bxdd', 'ban xay dung dang', 'dai dien co quan tham muu ve cong tac xay dung dang',
      'co quan tham muu xay dung dang',
    ],
  },
  {
    id: 'toan_the_co_quan',
    label: 'Toàn thể cán bộ, công chức, đảng viên',
    base_level: 'A',
    rationale: 'Triệu tập theo phạm vi tập thể: phải đối chiếu xem Ban Xây dựng Đảng có nằm trong nhóm được gọi tên hay không.',
    patterns: [
      'toan the can bo cong chuc', 'toan the cbcc', 'toan the cong chuc co quan',
      'can bo cong chuc cac co quan dang', 'can bo cong chuc khoi dang',
      'can bo cong chuc vien chuc', 'toan the can bo cua ban', 'toan the the ly cong chuc',
      'chuyen vien ban xay dung dang', 'can bo ban xay dung dang', 'chuyen vien bxdd', 'toan the bxdd',
      'dang vien chi bo co quan', 'dang vien thuoc cac chi bo', 'toan the dang vien',
      'truong pho cac co quan tham muu', 'lanh dao cac co quan tham muu',
      'cac co quan chuyen trach tham muu',
    ],
  },
  {
    id: 'trien_khai_van_ban',
    label: 'Hội nghị triển khai, quán triệt văn bản',
    base_level: 'C',
    rationale: 'Chủ đề thuộc lĩnh vực Ban nhưng thành phần triệu tập mới là căn cứ, không mặc định Ban dự.',
    patterns: [
      'hoi nghi trien khai', ' trien khai nghi quyet', 'quan triet nghi quyet', 'nghien cuu hoc tap nghi quyet',
      'trien khai chi thi', 'trien khai ket luan', 'trien khai quy che', 'trien khai huong dan',
      'pho bien quy dinh', 'trien khai cac van ban moi', 'tap huan nghiep vu',
      'hoi nghi truc tuyen', 'diem cau', 'tap huan cong tac dang',
      'triển khai công tác xây dựng đảng', 'bao ve bi mat nha nuoc',
    ],
  },
  {
    id: 'huy_hieu_dang',
    label: 'Trao Huy hiệu Đảng',
    base_level: 'C',
    rationale: 'Công tác đảng viên gắn trực tiếp với Ban; cần phân biệt họp chuẩn bị với lễ trao chính thức.',
    patterns: [
      'huy hieu dang', 'le trao huy hieu', 'trao tang huy hieu', 'hop chuan bi le trao',
      'xet de nghi tang huy hieu', 'dot 03/02', 'dot 19/05', 'dot 02/09', 'dot 07/11',
    ],
  },
  {
    id: 'so_ket_tong_ket',
    label: 'Sơ kết, tổng kết công tác xây dựng Đảng',
    base_level: 'C',
    rationale: 'Hội nghị sơ kết/tổng kết thường có thành phần cơ quan tham mưu nhưng phải đọc dòng thành phần.',
    patterns: [
      'so ket', 'tong ket', 'danh gia ket qua thuc hien', 'trien khai nhiem vu nam',
      'giao ban cong tac xay dung dang', 'tong ket cong tac to chuc xay dung dang',
      'tong ket cong tac can bo', 'tong ket cong tac dang vien', 'tong ket tuyen giao', 'tong ket dan van',
      'bao ve chinh tri noi bo', 'phat trien dang vien', 'chat luong to chuc dang',
    ],
  },
  {
    id: 'bao_cao_vien',
    label: 'Báo cáo viên, thông tin thời sự',
    base_level: 'C',
    rationale: 'Tuyến tuyên giáo — kiểm tra người được phân công làm báo cáo viên hoặc chủ trì điểm cầu.',
    patterns: [
      'bao cao vien', 'thong tin thoi su', 'dinh huong thong tin', 'cung cap thong tin',
      'giao ban tuyen giao', 'tap huan bao cao vien', 'tuyen truyen vien',
    ],
  },
  {
    id: 'ban_chi_dao_35',
    label: 'Ban Chỉ đạo 35',
    base_level: 'B',
    rationale: 'Thành viên Ban Chỉ đạo 35 phải lấy theo quyết định còn hiệu lực, không mặc định lãnh đạo Ban là thành viên.',
    patterns: [
      'ban chi dao 35', 'bcd 35', 'cong tac 35', 'giao ban cong tac 35',
      'bao ve nen tang tu tuong', 'dau tranh phan bac', 'quan diem sai trai', 'thuc the thu dich',
      'tap huan luc luong 35',
    ],
  },
  {
    id: 'ban_chi_dao_khac',
    label: 'Ban Chỉ đạo, Hội đồng, Tổ công tác',
    base_level: 'B',
    rationale: 'Chỉ đề xuất khi có quyết định thành lập/kiện toàn còn hiệu lực ghi tên người thuộc Ban.',
    patterns: [
      'ban chi dao', 'hoi dong', 'to cong tac', 'to giup viec', 'ban to chuc',
      'quyet dinh kien toan', 'quyet dinh thanh lap', 'thanh vien theo quyet dinh',
      'dai dien co quan thuong truc', 'cac co quan thanh vien',
    ],
  },
  {
    id: 'cap_uy_to_chuc_dang',
    label: 'Hội nghị cấp ủy, tổ chức đảng',
    base_level: 'C',
    rationale: 'Hội nghị cấp ủy triệu tập theo tư cách đảng viên/đảng ủy viên, phải kiểm tra thành phần cụ thể.',
    patterns: [
      'ban chap hanh dang bo', 'dang uy mo rong', 'giao ban cap uy', 'chi bo dang bo truc thuoc',
      'to chuc dang khoi truong hoc', 'dang bo khoi doanh nghiep', 'kiem diem danh gia xep loai',
      'hoi nghi dang uy', 'dai hoi dang bo', 'dai hoi chi bo', 'nhiem ky',
      'hoi nghi can bo chu chot', 'lay y kien nhan su', 'gioi thieu nhan su',
      'cong bo quyet dinh ve to chuc',
    ],
  },
  {
    id: 'can_bo_dang_vien',
    label: 'Công tác cán bộ, đảng viên, bảo vệ chính trị nội bộ',
    base_level: 'C',
    rationale: 'Lĩnh vực chuyên môn của Ban; ưu tiên rà soát ngay cả khi nguồn không ghi thành phần.',
    patterns: [
      'xet cong tac can bo', 'quy hoach can bo', 'bo nhiem', 'dieu dong', 'luan chuyen',
      'phat trien dang vien', 'chuyen dang chinh thuc', 'ket luan tieu chuan chinh tri',
      'tham tra xac minh', ' chinh tri noi bo', 'dao tao boi duong', 'cap the dang vien',
      'khai ly dang vien', 'xoa ten dang vien', 'sinh hoat chi bo',
    ],
  },
  {
    id: 'tuyen_giao_dan_van',
    label: 'Tuyên giáo, dân vận',
    base_level: 'C',
    rationale: 'Phân biệt nhiệm vụ chuyên môn của Ban với thành phần dự họp thực tế.',
    patterns: [
      'tuyen giao', 'dan van', 'dan van kheo', 'phong trao thi dua',
      'doi thoai giua nguoi dung dau', 'doi thoai voi nhan dan', 'dan toc', 'ton giao',
      'hoat dong tuyen truyen', 'tu tuong dao duc phong cach ho chi minh',
      'ket hop phat trien kinh te xa hoi',
    ],
  },
  {
    id: 'kiem_tra_giam_sat',
    label: 'Kiểm tra, giám sát, đoàn công tác',
    base_level: 'B',
    rationale: 'Chỉ ghi người khi nguồn nêu tên, chức danh hoặc quyết định phân công thành viên.',
    patterns: [
      'doan kiem tra', 'doan giam sat', 'doan kha sat', 'doan cong tac', 'to kiem tra',
      'to giam sat', 'kha sat thuc te', 'giam sat chuyen de', 'cong bo quyet dinh kiem tra',
      'lam viec voi',
    ],
  },
  {
    id: 'chuan_bi_noi_dung',
    label: 'Giao nhiệm vụ chuẩn bị nội dung',
    base_level: 'A',
    rationale: 'Trách nhiệm tham mưu, soạn thảo, báo cáo khác với thành phần bắt buộc dự họp — phải tách riêng.',
    patterns: [
      'bxdd chuan bi', 'ban xay dung dang chuan bi', 'bxdd tham muu', 'ban xay dung dang tham muu',
      'giao ban xay dung dang', 'giao bxdd', 'bxdd chu tri', 'ban xay dung dang chu tri',
      'bxdd phoi hop chuan bi', 'bxdd bao cao', 'ban xay dung dang bao cao',
      'bxdd trinh', 'ban xay dung dang trinh', 'bxdd du thao', 'ban xay dung dang du thao',
      'bxdd thuyet trinh',
    ],
  },
  {
    id: 'hoat_dong_tap_the',
    label: 'Hoạt động tập thể, sự kiện chung',
    base_level: 'D',
    rationale: 'Huy động lực lượng toàn địa bàn: chỉ đưa vào khi đơn vị được nêu tên trong thông báo.',
    patterns: [
      'le phat dong', 'phat dong phong trao', 'ra quan dan van', 'ngay thu bay van minh',
      'ngay chu nhat xanh', 'hoat dong chinh tri xa hoi', 'huy dong luc luong',
      'tham gia theo yeu cau cua dang uy',
    ],
  },
  {
    id: 'uy_nhiem_thay_mat',
    label: 'Ủy nhiệm, thay mặt, cử dự',
    base_level: 'B',
    rationale: 'Người dự theo ủy nhiệm phải tra người được giao thực tế; chưa có tên thì để trạng thái chờ phân công.',
    patterns: [
      'uy nhiem', 'du thay', 'thay mat', 'cu dai dien', 'dai dien tham du',
      'chu tri theo phan cong', 'phan cong dong chi', 'du theo su phan cong', 'cử người dự',
    ],
  },
];

export const PARTY_SIGNAL_GROUPS: SignalGroup[] = GROUPS;

/** Mẫu do quản trị viên thêm vào, gộp theo nhóm. */
export type ExtraKeywords = Record<string, string[]>;

interface CompiledGroup {
  group: SignalGroup;
  regexes: RegExp[];
}

function escapePattern(raw: string): string {
  const words = normalizeSignalText(raw).split(' ').filter(Boolean);
  const body = words.join(' ');
  if (words.length > 1) return body;
  // Mẫu một từ thì chặn nằm trong một chuỗi ký tự dài hơn.
  return `(?<![a-z0-9])${body}(?![a-z0-9])`;
}

/**
 * Văn bản để dò dấu hiệu: bỏ hết dấu, chữ thường, và coi mọi dấu câu như khoảng trắng.
 * Nguồn hành chính ngắt cụm bằng dấu phẩy, gạch đầu dòng, nên "cán bộ, công chức" phải
 * khớp được mẫu "can bo cong chuc".
 */
export function normalizeSignalText(raw: string): string {
  return foldVietnamese(raw).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function compile(group: SignalGroup, extra: string[]): CompiledGroup {
  return {
    group,
    regexes: [...group.patterns, ...extra].map((pattern) => new RegExp(escapePattern(pattern), 'g')),
  };
}

/** Dò theo nhóm; trả về danh sách cụm từ đã khớp (chứng cứ để hiển thị cho người dùng). */
export function matchGroups(
  text: string,
  options: { disabledGroups?: string[]; extraKeywords?: ExtraKeywords } = {},
): Array<{ group: SignalGroup; matches: string[] }> {
  const folded = normalizeSignalText(text);
  const disabled = new Set(options.disabledGroups ?? []);
  const hits: Array<{ group: SignalGroup; matches: string[] }> = [];
  for (const group of GROUPS) {
    if (disabled.has(group.id)) continue;
    const { regexes } = compile(group, options.extraKeywords?.[group.id] ?? []);
    const matches = new Set<string>();
    for (const re of regexes) {
      for (const found of folded.match(re) ?? []) matches.add(found.trim());
    }
    if (matches.size) hits.push({ group, matches: [...matches] });
  }
  return hits;
}

// ---------------------------------------------------------------- con người

const LEADER_TITLE = /(^|[^a-z])truong ban([^a-z]|$)/;
const DEPUTY_TITLE = /pho truong ban|(^|[^a-z])ptb([^a-z]|$)/;
const STANDING_DEPUTY = /pho truong ban thuong truc|ptbtt/;
const SPECIALIST_TITLE = /chuyen vien|nhan vien|cong chuc|can bo([^a-z]|$)/;
const STANDING_COMMITTEE = /ban thuong vu|uvbtv|uy vien thuong vu/;
const COMMITTEE_MEMBER = /dang uy vien|uy vien ban chap hanh|uvbch/;

function foldName(raw: string): string {
  return foldVietnamese(raw).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Lời gọi đứng trước tên (đ/c, đồng chí, ông, bà, anh, chị) không phải phần tên. */
const HONORIFIC_PREFIX = /^(d c|dc|dong chi|ong|ba|anh|chi)\s+/;

/**
 * Tên chuẩn hoá để so khớp hoặc chống trùng danh bạ: bỏ lời gọi đầu câu, bỏ dấu, bỏ dấu câu.
 * "Đ/c Lê Thị Minh Tâm" và "Lê Thị Minh Tâm" vì vậy được coi là cùng một người.
 */
export function canonicalPersonName(raw: string): string {
  let folded = foldName(String(raw ?? ''));
  while (HONORIFIC_PREFIX.test(folded)) folded = folded.replace(HONORIFIC_PREFIX, '');
  return folded;
}

/** Các cách gọi tên một người trong văn bản: đầy đủ, không "Đ/c", tên gọi + họ, chỉ tên đệm+tên. */
function nameVariants(name: string): string[] {
  const parts = canonicalPersonName(name).split(' ').filter(Boolean);
  if (parts.length < 2) return parts.length ? [parts[0]] : [];
  const variants = new Set<string>();
  variants.add(parts.join(' '));
  if (parts.length >= 3) variants.add(parts.slice(1).join(' '));
  variants.add(`${parts[parts.length - 2]} ${parts[parts.length - 1]}`);
  return [...variants];
}

export interface PersonMatch {
  person: RosterPerson;
  /** Cách nguồn gọi người này — chính là chứng cứ hiển thị trong bảng. */
  evidence: string;
}

/** Đối chiếu tên người trong danh bạ với văn bản; không suy đoán người trùng tên mờ. */
export function matchPeople(text: string, roster: RosterPerson[]): PersonMatch[] {
  const folded = normalizeSignalText(text);
  const found: PersonMatch[] = [];
  for (const person of roster) {
    for (const variant of nameVariants(person.name)) {
      if (variant.length < 4) continue;
      const index = folded.indexOf(variant);
      if (index >= 0) {
        found.push({ person, evidence: variant });
        break;
      }
    }
  }
  return found;
}

function byTitle(roster: RosterPerson[], test: (folded: string) => boolean): RosterPerson[] {
  return roster.filter((person) => test(`${foldName(person.title)} ${foldName(person.role_description)}`));
}

export function leadersOf(roster: RosterPerson[]): RosterPerson[] {
  return byTitle(roster, (t) => LEADER_TITLE.test(t) && !DEPUTY_TITLE.test(t));
}

export function deputiesOf(roster: RosterPerson[]): RosterPerson[] {
  return byTitle(roster, (t) => DEPUTY_TITLE.test(t));
}

export function specialistsOf(roster: RosterPerson[]): RosterPerson[] {
  return byTitle(roster, (t) => SPECIALIST_TITLE.test(t) && !/truong ban|pho truong ban/.test(t));
}

// ---------------------------------------------------------------- phạm vi tập thể

export type ScopeKind = 'co_quan_ban' | 'khoi_dang' | 'toan_phuong' | 'dang_vien' | 'unknown';

/** Bốn phạm vi "toàn thể" theo nghiệp vụ; chưa rõ thì không được tự thêm người. */
export function resolveAttendeeScope(text: string): { kind: ScopeKind; evidence: string } {
  const folded = normalizeSignalText(text);
  const tests: Array<[ScopeKind, RegExp, string]> = [
    ['co_quan_ban', /ban xay dung dang|bxdd|co quan tham muu ve cong tac xay dung dang/, 'Ban Xây dựng Đảng'],
    ['khoi_dang', /khoi dang|cac co quan dang|co quan tham muu,? giup viec dang uy|cac co quan chuyen trach/, 'khối Đảng'],
    ['dang_vien', /toan the dang vien|dang vien chi bo|dang vien thuoc/, 'đảng viên'],
    ['toan_phuong', /can bo cong chuc[^.]{0,40}phuong|toan the can bo cong chuc|toan the cbcc|cbcc vien chuc/, 'toàn phường'],
  ];
  for (const [kind, re, evidence] of tests) {
    const match = folded.match(re);
    if (match) return { kind, evidence: `${evidence} (${match[0]})` };
  }
  return { kind: 'unknown', evidence: '' };
}

// ---------------------------------------------------------------- kết quả

export interface SignalHit {
  group_id: string;
  label: string;
  level: SignalLevel;
  matched: string[];
  rationale: string;
}

export interface DetectionInput {
  id?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  title: string;
  location?: string;
  attendees?: string;
  content?: string;
  preparation?: string;
  source_page?: number;
  excerpt?: string;
}

export interface Detection {
  source_event_id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  location: string;
  detection_level: SignalLevel;
  matched_signals: SignalHit[];
  assigned_person_ids: string[];
  suggested_person_ids: string[];
  accompanying_person_ids: string[];
  preparation_person_ids: string[];
  preparation_tasks: string[];
  source_page: number | null;
  source_excerpt: string;
  evidence_refs: string[];
  reason: string;
  requires_confirmation: boolean;
  conflicts: string[];
  review_status: 'pending' | 'auto_accepted';
}

export interface DetectOptions {
  roster?: RosterPerson[];
  disabledGroups?: string[];
  extraKeywords?: ExtraKeywords;
  /** Người được ủy nhiệm/nhớ từ lịch đã duyệt: nhóm → mã người. */
  learnedAssignments?: Record<string, string[]>;
}

const LEVEL_ORDER: SignalLevel[] = ['A', 'B', 'C', 'D', 'E'];

function strongest(levels: SignalLevel[]): SignalLevel {
  for (const level of LEVEL_ORDER) if (levels.includes(level)) return level;
  return 'E';
}

function textOf(event: DetectionInput): string {
  return [event.title, event.attendees, event.content, event.preparation, event.location].filter(Boolean).join('\n');
}

/** Người được nhắc đích danh trong một mảng chữ (thành dự / chuẩn bị). */
function peopleIn(roster: RosterPerson[], text: string): RosterPerson[] {
  return matchPeople(text, roster).map((m) => m.person);
}

function detectOne(event: DetectionInput, options: DetectOptions): Detection {
  const roster = options.roster ?? [];
  const attendeesText = [event.attendees, event.title, event.content].filter(Boolean).join('\n');
  const prepText = [event.preparation, event.content].filter(Boolean).join('\n');
  const hits = matchGroups(textOf(event), {
    disabledGroups: options.disabledGroups,
    extraKeywords: options.extraKeywords,
  });

  const assigned: RosterPerson[] = [];
  const suggested: RosterPerson[] = [];
  const accompanying: RosterPerson[] = [];
  const prep: RosterPerson[] = [];
  const evidence = new Set<string>();
  const reasons: string[] = [];

  const named = matchPeople(textOf(event), roster);
  for (const hit of named) {
    assigned.push(hit.person);
    evidence.add(`Tên người: ${hit.evidence}`);
  }
  if (named.length) reasons.push('có tên cán bộ của Ban trong nguồn');

  const groupIds = new Set(hits.map((h) => h.group.id));
  const levels: SignalLevel[] = hits.map((h) => h.group.base_level);

  if (groupIds.has('toan_the_co_quan')) {
    const scope = resolveAttendeeScope(attendeesText);
    evidence.add(`Phạm vi triệu tập: ${scope.kind}`);
    if (scope.kind === 'co_quan_ban') {
      for (const person of roster) accompanying.push(person);
      reasons.push('phạm vi triệu tập gồm toàn thể cán bộ, công chức của Ban');
    } else if (scope.kind === 'unknown') {
      for (let i = 0; i < levels.length; i += 1) if (levels[i] === 'A') levels[i] = 'B';
      reasons.push('có dấu hiệu triệu tập tập thể nhưng chưa xác định phạm vi bao trùm Ban');
    }
  }

  if (groupIds.has('btv_dang_uy')) {
    const standing = leadersOf(roster).filter((person) => {
      const own = `${foldName(person.title)} ${foldName(person.role_description)}`;
      return STANDING_COMMITTEE.test(own);
    });
    const picked = standing.length ? standing : leadersOf(roster);
    if (picked.length) {
      suggested.push(...picked);
      evidence.add('Chức danh kiêm nhiệm: Ủy viên Ban Thường vụ Đảng ủy');
      reasons.push('Triệu tập Ban Thường vụ Đảng ủy — Trưởng Ban là Ủy viên Ban Thường vụ');
    } else {
      levels.push('C');
      reasons.push('có dấu hiệu Ban Thường vụ nhưng danh bạ chưa lưu chức danh kiêm nhiệm');
    }
  }

  if (groupIds.has('lanh_dao_ban')) {
    const text = normalizeSignalText(attendeesText);
    if (/pho truong ban thuong truc|ptbtt/.test(text)) {
      suggested.push(...byTitle(roster, (t) => STANDING_DEPUTY.test(t)));
      evidence.add('Chức danh: Phó Trưởng Ban Thường trực');
    } else if (/pho truong ban|(^|[^a-z])ptb([^a-z]|$)/.test(text)) {
      suggested.push(...deputiesOf(roster));
      evidence.add('Chức danh: Phó Trưởng Ban');
      reasons.push('nguồn mời Phó Trưởng Ban nhưng chưa nêu tên — đưa toàn bộ Phó Ban vào diện chờ phân công');
    } else if (/truong ban|(^|[^a-z])tb([^a-z]|$)/.test(text)) {
      suggested.push(...leadersOf(roster));
      evidence.add('Chức danh: Trưởng Ban');
    } else {
      suggested.push(...leadersOf(roster), ...deputiesOf(roster));
      evidence.add('Chức danh: Lãnh đạo Ban');
      reasons.push('"Lãnh đạo Ban" chưa rõ Trưởng hay Phó — cần phân công');
    }
  }

  if (groupIds.has('ban_chi_dao_35') || groupIds.has('ban_chi_dao_khac')) {
    const learned = [...(options.learnedAssignments?.ban_chi_dao_35 ?? []), ...(options.learnedAssignments?.ban_chi_dao_khac ?? [])];
    const members = roster.filter((person) => learned.includes(person.id));
    if (members.length) {
      suggested.push(...members);
      evidence.add('Thành viên theo quyết định/ lịch đã duyệt');
      reasons.push('đối chiếu được danh sách thành viên còn hiệu lực');
    } else {
      levels.push('C');
      reasons.push('hoạt động của Ban Chỉ đạo/Tổ công tác nhưng hệ thống chưa có danh sách thành viên — cần xác minh quyết định');
    }
  }

  if (groupIds.has('chuan_bi_noi_dung')) {
    const namedPrep = peopleIn(roster, prepText);
    if (namedPrep.length) {
      prep.push(...namedPrep);
      evidence.add('Giao chuẩn bị nội dung cho người nêu đích danh');
    } else {
      prep.push(...specialistsOf(roster));
      evidence.add('Giao chuẩn bị cho Ban — chưa nêu tên');
      reasons.push('có nhiệm vụ chuẩn bị nội dung nhưng chưa có người cụ thể');
    }
  }

  if (groupIds.has('uy_nhiem_thay_mat') && !assigned.length) {
    levels.push('B');
    reasons.push('có dấu hiệu ủy nhiệm/thay mặt nhưng chưa xác định người được cử — giữ trạng thái chờ phân công');
  }

  for (const topical of ['trien_khai_van_ban', 'huy_hieu_dang', 'so_ket_tong_ket', 'bao_cao_vien',
    'cap_uy_to_chuc_dang', 'can_bo_dang_vien', 'tuyen_giao_dan_van', 'kiem_tra_giam_sat', 'hoat_dong_tap_the']) {
    if (groupIds.has(topical)) {
      const hit = hits.find((h) => h.group.id === topical);
      if (hit) evidence.add(`${hit.group.label}: ${hit.matches.join(', ')}`);
    }
  }

  let level = strongest(levels);
  if (assigned.length) level = 'A';
  if (level === 'E' && hits.length) level = 'D';

  const unique = (list: RosterPerson[]) => [...new Map(list.map((p) => [p.id, p])).values()];
  const assignedIds = unique(assigned).map((p) => p.id);
  const suggestedIds = unique(suggested.filter((p) => !assignedIds.includes(p.id))).map((p) => p.id);
  const accompanyingIds = unique(accompanying.filter((p) => !assignedIds.includes(p.id) && !suggestedIds.includes(p.id))).map((p) => p.id);
  const prepIds = unique(prep).map((p) => p.id);

  const autoAccept = level === 'A' && (assignedIds.length > 0 || accompanyingIds.length > 0 || prepIds.length > 0);
  const reason = reasons.length
    ? reasons.join('; ')
    : level === 'E'
      ? 'Không có dấu hiệu liên quan đến Ban Xây dựng Đảng trong nguồn.'
      : hits.map((h) => h.group.label).join(', ');

  return {
    source_event_id: event.id ?? '',
    date: event.date ?? '',
    start_time: event.start_time ?? '',
    end_time: event.end_time ?? '',
    title: event.title,
    location: event.location ?? '',
    detection_level: level,
    matched_signals: hits.map((h) => ({
      group_id: h.group.id,
      label: h.group.label,
      level: h.group.base_level,
      matched: h.matches,
      rationale: h.group.rationale,
    })),
    assigned_person_ids: assignedIds,
    suggested_person_ids: suggestedIds,
    accompanying_person_ids: accompanyingIds,
    preparation_person_ids: prepIds,
    preparation_tasks: event.preparation ? [event.preparation] : [],
    source_page: event.source_page ?? null,
    source_excerpt: event.excerpt ?? '',
    evidence_refs: [...evidence],
    reason,
    requires_confirmation: !autoAccept,
    conflicts: [],
    review_status: autoAccept ? 'auto_accepted' : 'pending',
  };
}

/**
 * Nhận diện hàng loạt hoạt động và đánh dấu trùng lịch theo từng người.
 * Không tự ý bỏ hoạt động nào: mức E vẫn trả về kèm lý do để người dùng tra lại.
 */
export function detectPartySignals(events: DetectionInput[], options: DetectOptions = {}): Detection[] {
  const detections = events.map((event) => detectOne(event, options));
  const roster = options.roster ?? [];
  const personName = new Map(roster.map((p) => [p.id, p.name]));
  for (const detection of detections) {
    if (!detection.date || !detection.start_time) continue;
    const people = [...detection.assigned_person_ids, ...detection.suggested_person_ids, ...detection.accompanying_person_ids];
    for (const id of people) {
      const clash = detections.find((other) => {
        if (other === detection || other.date !== detection.date || other.start_time !== detection.start_time) return false;
        const others = [...other.assigned_person_ids, ...other.suggested_person_ids, ...other.accompanying_person_ids];
        return others.includes(id);
      });
      if (clash) {
        detection.conflicts.push(`${personName.get(id) ?? id} trùng ${clash.date} ${clash.start_time}: ${clash.title}`);
      }
    }
  }
  return detections;
}

// ---------------------------------------------------------------- 8 lớp chống bỏ sót

export interface CoverageWarning {
  code: string;
  message: string;
  source_event_id: string;
}

/**
 * Kiểm tra độc lập với bước nhận diện: nếu AI/quy tắc để lọt, các lớp này vẫn bắt được.
 */
export function auditCoverage(detections: Detection[], options: DetectOptions = {}): CoverageWarning[] {
  const roster = options.roster ?? [];
  const warnings: CoverageWarning[] = [];
  const push = (detection: Detection, code: string, message: string) =>
    warnings.push({ code, message, source_event_id: detection.source_event_id });

  const allPeople = new Set(roster.map((p) => p.id));
  const enabledIds = new Set(GROUPS.filter((g) => !(options.disabledGroups ?? []).includes(g.id)).map((g) => g.id));

  for (const detection of detections) {
    const ids = new Set([...detection.assigned_person_ids, ...detection.suggested_person_ids, ...detection.accompanying_person_ids]);
    const groups = new Set(detection.matched_signals.map((s) => s.group_id));

    if (groups.has('btv_dang_uy') && !ids.size) {
      push(detection, 'BTV_NO_PERSON', 'Hoạt động có Ban Thường vụ Đảng ủy nhưng chưa gán được ai — kiểm tra chức danh kiêm nhiệm trong danh bạ.');
    }
    if ((groups.has('lanh_dao_ban') || groups.has('toan_the_co_quan'))
      && detection.detection_level !== 'E' && !ids.size && roster.length) {
      push(detection, 'SCOPE_NOT_RESOLVED', 'Có dấu hiệu triệu tập lãnh đạo Ban/tập thể nhưng chưa phân định phạm vi — không tự thêm người.');
    }
    if ((groups.has('ban_chi_dao_35') || groups.has('ban_chi_dao_khac'))
      && !roster.some((p) => ids.has(p.id))) {
      push(detection, 'COMMITTEE_MEMBERSHIP_UNKNOWN', 'Hoạt động Ban Chỉ đạo/Tổ công tác chưa đối chiếu được quyết định thành viên.');
    }
    if (groups.has('chuan_bi_noi_dung') && !detection.preparation_person_ids.length) {
      push(detection, 'PREPARATION_UNOWNED', 'Có nhiệm vụ chuẩn bị nội dung nhưng chưa có người thực hiện.');
    }
    if (detection.detection_level === 'A' && !ids.size && !detection.preparation_person_ids.length) {
      push(detection, 'LEVEL_A_NO_OWNER', 'Ưu tiên cao nhất nhưng chưa có người — cần xác nhận trước khi đưa vào lịch.');
    }
    if (detection.conflicts.length) {
      push(detection, 'DOUBLE_BOOKED', detection.conflicts.join(' | '));
    }
    // Mức E (không khớp nhóm nào) hiển nhiên không có chứng cứ — chỉ báo lỗi khi đã khớp mà mất chứng cứ.
    if (detection.matched_signals.length && !detection.evidence_refs.length) {
      push(detection, 'MISSING_EVIDENCE', 'Có nhóm dấu hiệu khớp nhưng không còn chứng cứ nào — không nên đưa thẳng vào lịch.');
    }
    if (!detection.date || !detection.start_time) {
      push(detection, 'MISSING_TIME', 'Thiếu ngày hoặc giờ nên không kiểm tra được trùng lịch.');
    }
    for (const id of [...detection.assigned_person_ids]) {
      if (!allPeople.has(id)) push(detection, 'UNKNOWN_PERSON', `Người được gán (${id}) không có trong danh bạ hiện hành.`);
    }
    for (const signal of detection.matched_signals) {
      if (!enabledIds.has(signal.group_id)) push(detection, 'DISABLED_GROUP_LEAKED', `Nhóm ${signal.label} đã tắt nhưng vẫn sinh kết quả.`);
    }
  }

  const wholeAgencySignals = detections.filter((d) => d.matched_signals.some((s) => s.group_id === 'toan_the_co_quan'));
  for (const detection of wholeAgencySignals) {
    if (detection.accompanying_person_ids.length && detection.accompanying_person_ids.length < roster.length) {
      const missing = roster.filter((p) => !detection.accompanying_person_ids.includes(p.id)
        && !detection.assigned_person_ids.includes(p.id)
        && !detection.suggested_person_ids.includes(p.id));
      if (missing.length) {
        push(detection, 'PARTIAL_ROSTER', `Triệu tập tập thể nhưng còn ${missing.map((p) => p.name).join(', ')} chưa được vào danh sách.`);
      }
    }
  }

  return warnings;
}
