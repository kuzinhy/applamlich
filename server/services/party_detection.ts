/**
 * Nối engine nhận diện dấu hiệu với dữ liệu thật của ứng dụng: danh bạ cán bộ Ban,
 * các mục lịch trích từ văn bản nguồn, và lịch đã có trong tuần (để phát hiện trùng).
 */
import {
  PARTY_SIGNAL_GROUPS,
  auditCoverage,
  detectPartySignals,
  matchGroups,
  matchPeople,
  type CoverageWarning,
  type Detection,
  type DetectionInput,
  type RosterPerson,
  type SignalLevel,
} from '../engines/party_signals.ts';
import type { EventRecord, PersonnelRecord } from '../types.ts';

export interface PartyRosterEntry extends RosterPerson {
  /** 0 = thôi công tác; vẫn lấy từ `personnel` của kho. */
  active: boolean;
}

/** Danh bạ do quản trị viên bảo trì; role_description có thể ghi chức danh kiêm nhiệm. */
export function rosterFromPersonnel(personnel: PersonnelRecord[]): PartyRosterEntry[] {
  return (personnel ?? [])
    .filter((p) => String(p.name ?? '').trim().length > 2)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name).trim(),
      title: String(p.title ?? ''),
      role_description: String(p.role_description ?? ''),
      active: Number(p.is_active ?? 1) !== 0,
    }))
    .filter((p) => p.active);
}

export function eventToInput(event: EventRecord): DetectionInput {
  const attendance = [event.chair, event.participants, event.participant_group, event.organizer]
    .filter(Boolean)
    .join('. ');
  return {
    id: event.id,
    date: event.event_date,
    start_time: event.start_time ?? '',
    end_time: event.end_time ?? '',
    title: event.title,
    location: event.location ?? '',
    attendees: attendance,
    content: event.content ?? '',
    preparation: [event.preparation, event.documents_required].filter(Boolean).join('. '),
    source_page: event.source_page ?? null,
    excerpt: [event.source_document, event.content].filter(Boolean).join(' — ').slice(0, 300),
  };
}

/**
 * Ai đã bận khung giờ nào, tính từ lịch đang có trong tuần.
 * khoá: `YYYY-MM-DD HH:MM` → danh sách {mục lịch, mã người}.
 */
type BusySlot = { title: string; personIds: string[] };

/**
 * Ai đã bận khung giờ nào, tính từ lịch đang có trong tuần.
 * Khoá: `YYYY-MM-DD HH:MM` → danh sách mục lịch và mã người.
 */
function buildBusyMap(events: EventRecord[], roster: RosterPerson[]): Map<string, BusySlot[]> {
  const busy = new Map<string, BusySlot[]>();
  for (const event of events) {
    if (!event.event_date || !event.start_time || event.status === 'REJECTED') continue;
    const text = [event.title, event.chair, event.participants, event.leaders?.join(', ')].filter(Boolean).join('\n');
    const personIds = matchPeople(text, roster).map((m) => m.person.id);
    if (!personIds.length) continue;
    const key = `${event.event_date} ${event.start_time}`;
    const list = busy.get(key) ?? [];
    list.push({ title: event.title, personIds });
    busy.set(key, list);
  }
  return busy;
}

function nameOf(roster: RosterPerson[], id: string): string {
  return roster.find((p) => p.id === id)?.name ?? id;
}

/** Gắn trùng lịch với từng đề xuất; không tự ý dời hay xoá mục nào. */
function applyConflicts(detections: Detection[], busy: Map<string, BusySlot[]>, roster: RosterPerson[]): void {
  for (const detection of detections) {
    const people = [...detection.assigned_person_ids, ...detection.suggested_person_ids, ...detection.accompanying_person_ids];
    if (!people.length || !detection.date || !detection.start_time) continue;
    const clashes = busy.get(`${detection.date} ${detection.start_time}`) ?? [];
    for (const clash of clashes) {
      const shared = clash.personIds.filter((id) => people.includes(id));
      for (const id of shared) {
        const note = `${nameOf(roster, id)} đã có lịch "${clash.title}" lúc ${detection.start_time}`;
        if (!detection.conflicts.includes(note)) detection.conflicts.push(note);
      }
    }
  }
}

export interface PartyDetectionResult {
  detections: Detection[];
  warnings: CoverageWarning[];
  stats: {
    total: number;
    by_level: Record<SignalLevel, number>;
    needing_confirmation: number;
    with_conflict: number;
    roster_size: number;
  };
  groups: Array<{ id: string; label: string; base_level: SignalLevel; rationale: string; disabled: boolean }>;
}

export interface PartyDetectionOptions {
  roster: RosterPerson[];
  disabledGroups?: string[];
  extraKeywords?: Record<string, string[]>;
  learnedAssignments?: Record<string, string[]>;
  /** Lịch đang có trong tuần, dùng để phát hiện trùng giờ. */
  existingEvents?: EventRecord[];
  /** Mục tiêu: chỉ trả hoạt động liên quan (true) hay cả mức E để đối chiếu (false). */
  relevantOnly?: boolean;
}

export function runPartyDetection(events: EventRecord[], options: PartyDetectionOptions): PartyDetectionResult {
  const roster = options.roster ?? [];
  const inputs = events.map(eventToInput);
  const detections = detectPartySignals(inputs, {
    roster,
    disabledGroups: options.disabledGroups,
    extraKeywords: options.extraKeywords,
    learnedAssignments: options.learnedAssignments,
  });
  applyConflicts(detections, buildBusyMap(options.existingEvents ?? [], roster), roster);
  const warnings = auditCoverage(detections, { roster, disabledGroups: options.disabledGroups });
  const by_level: Record<SignalLevel, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  for (const detection of detections) by_level[detection.detection_level] += 1;
  const kept = options.relevantOnly ? detections.filter((d) => d.detection_level !== 'E') : detections;
  const disabled = new Set(options.disabledGroups ?? []);

  return {
    detections: kept,
    warnings,
    stats: {
      total: kept.length,
      by_level,
      needing_confirmation: kept.filter((d) => d.requires_confirmation).length,
      with_conflict: kept.filter((d) => d.conflicts.length > 0).length,
      roster_size: roster.length,
    },
    groups: PARTY_SIGNAL_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      base_level: group.base_level,
      rationale: group.rationale,
      disabled: disabled.has(group.id),
    })),
  };
}

/**
 * Học từ lịch đã duyệt: với mỗi mục đã APPROVED/PUBLISHED, ghi nhận "ai thường dự
 * hoạt động thuộc nhóm dấu hiệu nào". Kết quả chỉ dùng để ưu tiên gợi ý, không thay
 * quyết định phân công của con người.
 */
export function learnAssignments(
  events: EventRecord[],
  roster: RosterPerson[],
  limitPerGroup = 4,
): Record<string, string[]> {
  const learned: Record<string, Set<string>> = {};
  for (const event of events) {
    if (event.status !== 'APPROVED' && event.status !== 'PUBLISHED') continue;
    const text = [event.title, event.chair, event.participants, event.participant_group, event.content].filter(Boolean).join('\n');
    const people = matchPeople(text, roster).map((m) => m.person.id);
    if (!people.length) continue;
    for (const hit of matchGroups(text)) {
      const bucket = (learned[hit.group.id] ??= new Set<string>());
      for (const id of people) {
        if (bucket.size >= limitPerGroup) break;
        bucket.add(id);
      }
    }
  }
  return Object.fromEntries(Object.entries(learned).map(([key, value]) => [key, [...value]]));
}

/** Giới hạn bộ nhớ: mỗi nhóm chỉ giữ vài người, tránh bảng đề xuất phình to. */
export function mergeLearnedRules(
  current: Record<string, string[]>,
  incoming: Record<string, string[]>,
  limitPerGroup = 4,
): Record<string, string[]> {
  const merged: Record<string, string[]> = { ...(current ?? {}) };
  for (const [group, ids] of Object.entries(incoming ?? {})) {
    const seen = [...(merged[group] ?? []), ...(ids ?? [])];
    const unique: string[] = [];
    for (const id of seen) if (!unique.includes(id)) unique.push(id);
    merged[group] = unique.slice(0, limitPerGroup);
  }
  return merged;
}
