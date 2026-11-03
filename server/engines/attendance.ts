/**
 * Suy ra người phải dự / người dự thay từ hồ sơ cơ quan và quy chế phân công.
 *
 * Bất biến: không bao giờ tự bịa tên người. Mọi gợi ý chỉ lấy từ `org_profile.posts`
 * đã được quản trị khai báo, và chỉ khi chức danh đó có `holder` thật.
 */
import { foldVietnamese } from '../services/merge.ts';
import { timesOverlap } from '../utils/clock.ts';
import type {
  EventRecord,
  OrgConveningRule,
  OrgPost,
  OrgProfile,
  SettingsRecord,
  SubstituteSuggestion,
} from '../types.ts';

const MAX_DEPUTY_HOPS = 4;

export function emptyOrgProfile(): OrgProfile {
  return { admin_level: '', admin_level_label: '', aliases: [], address: '', phone: '', email: '', liaison: '', posts: [], convening_rules: [] };
}

/** Chức danh đã sắp xếp theo bậc ưu tiên giảm dần (1 = cao nhất). */
export function postsBySeniority(profile: OrgProfile): OrgPost[] {
  return [...(profile.posts || [])].sort((a, b) => (a.seniority || 99) - (b.seniority || 99));
}

/** Mọi cách gọi một chức danh trong văn bản: tên đầy đủ + biệt danh + tên người giữ. */
export function nameKeysOf(post: OrgPost): string[] {
  return [post.title, ...(post.aliases || []), post.holder]
    .map((s) => foldVietnamese(s))
    .filter((s) => s.length >= 3);
}

/** Nhận chức danh nào được nhắc tới trong một đoạn chữ; khớp dài nhất thắng để "Phó Bí thư
 *  Thường trực" không bị "Bí thư" cướp. */
export function matchPost(profile: OrgProfile, text: string): OrgPost | null {
  const folded = foldVietnamese(text);
  if (!folded) return null;
  let best: { post: OrgPost; length: number } | null = null;
  for (const post of profile.posts || []) {
    for (const key of nameKeysOf(post)) {
      if (!folded.includes(key)) continue;
      if (!best || key.length > best.length) best = { post, length: key.length };
    }
  }
  return best?.post ?? null;
}

/** Chữ dùng để đối chiếu người trong một sự kiện. */
function peopleTextOf(event: EventRecord): string {
  return [event.chair, ...(event.leaders || []), event.participants, event.contact_person]
    .filter(Boolean)
    .join(' | ');
}

/** Người của chức danh này có được nhắc trong sự kiện không? */
export function mentionsPost(event: EventRecord, post: OrgPost): boolean {
  const text = foldVietnamese(peopleTextOf(event));
  if (!text) return false;
  return nameKeysOf(post).some((key) => text.includes(key));
}

/**
 * Sự kiện có buộc một chức danh cụ thể phải có mặt không, theo quy chế triệu tập
 * khớp với nơi triệu tập / tiêu đề văn bản.
 */
export function matchedConveningRule(profile: OrgProfile, event: EventRecord): OrgConveningRule | null {
  const haystack = foldVietnamese([event.organizer, event.title, event.source_document, event.content].filter(Boolean).join(' '));
  if (!haystack) return null;
  for (const rule of profile.convening_rules || []) {
    const hit = (rule.keywords || []).some((k) => {
      const key = foldVietnamese(k);
      return key.length >= 3 && haystack.includes(key);
    });
    if (hit) return rule;
  }
  return null;
}

/** Chức danh bắt buộc dự của một sự kiện, theo thứ tự ưu tiên trong quy chế. */
export function requiredPostsOf(profile: OrgProfile, event: EventRecord): OrgPost[] {
  const rule = matchedConveningRule(profile, event);
  if (!rule) return [];
  return (rule.required_titles || [])
    .map((title) => (profile.posts || []).find((p) => foldVietnamese(p.title) === foldVietnamese(title)))
    .filter((p): p is OrgPost => Boolean(p));
}

export interface AttendanceWeight {
  score: number;
  /** Sự kiện do cấp trên triệu tập và buộc đúng chức danh đang có mặt phải dự. */
  mandatory: boolean;
  reason: string;
}

/**
 * Điểm dùng để quyết định việc nào được giữ khi trùng giờ: việc mà cấp trên triệu tập
 * và buộc chức danh đó dự luôn thắng việc nội bộ, bất kể điểm ưu tiên tự chấm.
 */
export function attendanceWeight(profile: OrgProfile, event: EventRecord): AttendanceWeight {
  const required = requiredPostsOf(profile, event);
  const present = required.filter((post) => mentionsPost(event, post) && post.holder);
  if (present.length) {
    return {
      score: event.priority_score + 100,
      mandatory: true,
      reason: `${present.map((p) => p.title).join(', ')} bắt buộc dự theo quy chế triệu tập`,
    };
  }
  return { score: event.priority_score, mandatory: false, reason: '' };
}

/** Sự kiện khác trong cùng khung giờ có nhắc tới chức danh này. */
function busyEventsForPost(
  profile: OrgProfile,
  events: EventRecord[],
  post: OrgPost,
  target: EventRecord,
  ignoreEventIds: string[],
): EventRecord[] {
  return events.filter((other) => {
    if (other.id === target.id) return false;
    if (ignoreEventIds.includes(other.id)) return false;
    if (other.event_date !== target.event_date) return false;
    if (other.status === 'REJECTED') return false;
    if (!timesOverlap(other.start_time, other.end_time, target.start_time, target.end_time)) return false;
    return mentionsPost(other, post);
  });
}

export interface SubstituteSearch {
  substitute: OrgPost | null;
  /** Chuỗi chức danh đã lần theo, kể cả chức danh bị loại. */
  chain: string[];
  /** Lý do loại từng chức danh — hiển thị để người duyệt hiểu vì sao không có ai thay. */
  blocked: Array<{ title: string; reason: string }>;
}

/**
 * Lần theo chuỗi ủy quyền của một chức danh để tìm người rảnh dự thay.
 * Không nhảy sang chức danh tùy tiện: chỉ đi theo `deputy_title` đã khai.
 */
export function findSubstitute(
  profile: OrgProfile,
  events: EventRecord[],
  absent: OrgPost,
  target: EventRecord,
  ignoreEventIds: string[] = [],
): SubstituteSearch {
  const chain: string[] = [absent.title];
  const blocked: Array<{ title: string; reason: string }> = [];
  const byTitle = new Map((profile.posts || []).map((p) => [foldVietnamese(p.title), p]));
  let current = absent;

  for (let hop = 0; hop < MAX_DEPUTY_HOPS; hop += 1) {
    const nextTitle = String(current.deputy_title || '').trim();
    if (!nextTitle) {
      if (hop === 0) blocked.push({ title: absent.title, reason: 'chưa khai người được ủy quyền' });
      break;
    }
    const next = byTitle.get(foldVietnamese(nextTitle));
    if (!next) {
      blocked.push({ title: nextTitle, reason: 'không có trong danh sách chức danh của cơ quan' });
      break;
    }
    if (chain.some((t) => foldVietnamese(t) === foldVietnamese(next.title))) {
      blocked.push({ title: next.title, reason: 'vòng lặp ủy quyền' });
      break;
    }
    chain.push(next.title);
    if (!next.holder) {
      blocked.push({ title: next.title, reason: 'chưa có người giữ chức danh' });
      current = next;
      continue;
    }
    const clashes = busyEventsForPost(profile, events, next, target, ignoreEventIds);
    if (clashes.length) {
      blocked.push({ title: next.title, reason: `${next.holder} đã có "${clashes[0].title}" cùng giờ` });
      current = next;
      continue;
    }
    const requiredHere = requiredPostsOf(profile, target);
    if (requiredHere.length && !requiredHere.some((p) => foldVietnamese(p.title) === foldVietnamese(next.title))) {
      blocked.push({ title: next.title, reason: 'không thuộc thành phần bắt buộc của hội nghị này' });
      current = next;
      continue;
    }
    return { substitute: next, chain, blocked };
  }
  return { substitute: null, chain, blocked };
}

/**
 * Gợi ý người dự thay cho cặp xung đột: giữ sự kiện nặng hơn, tìm người ủy quyền
 * cho sự kiện nhẹ hơn. Trả null khi hồ sơ chưa đủ — không đoán mò.
 */
export function suggestSubstitute(
  profile: OrgProfile,
  events: EventRecord[],
  keep: EventRecord,
  move: EventRecord,
): SubstituteSuggestion | null {
  if (!(profile.posts || []).length) return null;
  // Chỉ tìm người thay cho chức danh thực sự có mặt ở CẢ HAI sự kiện — tức là người bận trùng.
  const shared = (profile.posts || []).filter((post) => mentionsPost(keep, post) && mentionsPost(move, post) && post.holder);
  if (!shared.length) return null;

  const absent = shared.sort((a, b) => (a.seniority || 99) - (b.seniority || 99))[0];
  const search = findSubstitute(profile, events, absent, move);
  if (!search.substitute || !search.substitute.holder) return null;

  const rule = matchedConveningRule(profile, move);
  const reason = [
    `${absent.holder || absent.title} trùng lịch giữa "${keep.title}" và "${move.title}"`,
    `${absent.title} ủy quyền cho ${search.substitute.title}`,
    rule ? `"${move.title}" do ${rule.convener} triệu tập, thành phần bắt buộc là ${rule.required_titles.join(' hoặc ')}` : '',
  ].filter(Boolean).join('; ');

  return {
    event_id: move.id,
    event_title: move.title,
    absent_title: absent.title,
    absent_holder: absent.holder,
    substitute_title: search.substitute.title,
    substitute_holder: search.substitute.holder,
    reason,
    chain: search.chain,
    substitute_also_busy: false,
  };
}

/** Câu chữ in vào `resolution_suggestion`; nói thẳng khi nào chưa suy được và thiếu gì. */
export function describeSubstitute(suggestion: SubstituteSuggestion | null, fallback: string): string {
  if (!suggestion) return fallback;
  return (
    `Theo quy chế phân công: ${suggestion.absent_holder || suggestion.absent_title} bận trùng, ` +
    `cử ${suggestion.substitute_holder} (${suggestion.substitute_title}) dự thay "${suggestion.event_title}".`
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Thay lần xuất hiện đầu tiên của chức danh (không phân biệt hoa thường).
 * Bỏ qua chỗ bị "Phó" đứng ngay trước: lịch ghi "Phó Chủ tịch UBND" thì không được coi là
 * dòng của "Chủ tịch UBND".
 */
function replaceTitleOnce(text: string, needle: string, replacement: string): string {
  const foldedNeedle = foldVietnamese(needle);
  if (foldedNeedle.length < 3) return text;
  const skipDeputy = !/^pho\s/.test(foldedNeedle);
  const re = new RegExp(escapeRegExp(needle), 'gi');
  let replaced = false;
  return text.replace(re, (match: string, offset: number, whole: string) => {
    if (replaced) return match;
    if (skipDeputy && /(^|\s)pho\s$/.test(foldVietnamese(whole.slice(0, offset)))) return match;
    replaced = true;
    return replacement;
  });
}

/**
 * Viết lại dòng chủ trì / thành phần khi cán bộ bấm "Áp dụng người dự thay".
 * Lịch của phường ghi thành phần bằng CHỨC DANH ("Bí thư Đảng ủy"), có nơi lại ghi tên người.
 * Vì vậy: gặp tên người thì thay bằng "Tên – Chức danh", gặp chức danh thì thay bằng
 * chức danh người dự thay — không pha hai kiểu vào cùng một dòng.
 * Không tìm thấy chỗ nào thì ghi thêm dòng dự thay, tuyệt đối không xoá ai.
 */
export function applySubstitute(
  event: EventRecord,
  suggestion: SubstituteSuggestion,
): { chair: string; participants: string; changed: string } {
  const withName = `${suggestion.substitute_holder} – ${suggestion.substitute_title}`;
  const absentName = String(suggestion.absent_holder || '').trim();
  const absentTitle = String(suggestion.absent_title || '').trim();

  const swap = (text: string): string | null => {
    if (!text) return null;
    if (absentName.length >= 3) {
      const byName = text.replace(new RegExp(escapeRegExp(absentName), 'i'), withName);
      if (byName !== text) return byName;
    }
    if (absentTitle.length >= 3) {
      const byTitle = replaceTitleOnce(text, absentTitle, suggestion.substitute_title);
      if (byTitle !== text) return byTitle;
    }
    return null;
  };

  const chair = swap(event.chair || '');
  if (chair) return { chair, participants: event.participants || '', changed: 'chair' };
  const participants = swap(event.participants || '');
  if (participants) return { chair: event.chair || '', participants, changed: 'participants' };
  const absentLabel = absentName || absentTitle;
  return {
    chair: event.chair || '',
    participants: [event.participants, `${suggestion.substitute_title} dự thay ${absentLabel}`].filter(Boolean).join('; '),
    changed: 'participants_appended',
  };
}

/** Khối chữ đưa vào prompt AI để bóc tách đúng người, đúng chức danh của cơ quan mình. */
export function orgProfilePrompt(settings: SettingsRecord): string {
  const profile = settings.org_profile || emptyOrgProfile();
  const posts = postsBySeniority(profile).filter((p) => p.title);
  const lines = [
    `ĐƠN VỊ: ${settings.unit_name || '(chưa đặt tên)'}` +
      (profile.admin_level_label ? ` — cấp ${profile.admin_level_label}` : '') +
      (settings.parent_org ? `; cấp trên trực tiếp: ${settings.parent_org}` : ''),
  ];
  if (profile.liaison) lines.push(`Đầu mối lịch công tác: ${profile.liaison}`);
  if (posts.length) {
    lines.push('CHỨC DANH CỦA ĐƠN VỊ (thứ tự ưu tiên, tên người giữ thật — không tự thêm người ngoài danh sách này):');
    lines.push(
      posts
        .map((p) => {
          const who = p.holder || '(chưa có người giữ — KHÔNG tự đặt tên)';
          const deputy = p.deputy_title ? ` | vắng thì ủy quyền: ${p.deputy_title}` : '';
          const alias = (p.aliases || []).filter((a) => foldVietnamese(a) !== foldVietnamese(p.title)).slice(0, 3);
          return `- ${p.seniority || '-'}. ${p.title}: ${who}${deputy}${alias.length ? ` | cách gọi tắt: ${alias.join(', ')}` : ''}`;
        })
        .join('\n'),
    );
  }
  const rules = (profile.convening_rules || []).filter((r) => (r.keywords || []).length && (r.required_titles || []).length);
  if (rules.length) {
    lines.push('QUY CHẾ THÀNH PHẦN THAM DỰ (khi văn bản nêu cấp triệu tập này thì bắt buộc chức danh này dự):');
    lines.push(rules.map((r) => `- ${r.convener} → ${r.required_titles.join(' hoặc ')}`).join('\n'));
  }
  return lines.join('\n');
}

/** Tên cơ quan + biệt danh để máy nhận diện phạm vi triệu tập của chính mình. */
export function unitAliasWords(settings: SettingsRecord): string[] {
  const profile = settings.org_profile || emptyOrgProfile();
  return [settings.unit_name, settings.advisor_unit, settings.parent_org, ...(profile.aliases || [])]
    .map((s) => foldVietnamese(s))
    .filter((s) => s.length >= 3);
}
