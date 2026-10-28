import { askJson } from './gemini.ts';
import { analyzeConflicts, durationOf } from './conflict.ts';
import { findFreeSlots, peopleOf, workloadByPerson } from './free_slots.ts';
import { bm25Rank, snippet } from './retrieval.ts';
import { scorePriority } from './priority.ts';
import { extractPreparation } from './preparation.ts';
import { upsertEvents } from '../services/merge.ts';
import { getState, mutate, newId, persist, extractLeaders, normalizeTask, normalizeTasks } from '../store.ts';
import { addDays, startOfWeek, todayIso, weekDays, formatDdMmYyyy } from '../utils/dates.ts';
import type { EventRecord } from '../types.ts';
import { EVENT_TASK_LIMIT } from '../types.ts';

/**
 * Agent dùng giao thức JSON thay vì function-calling riêng của từng hãng,
 * nên chạy được với Gemini, Ollama (Qwen/Gemma) và mọi API OpenAI-compatible.
 */
const TOOL_DOCS = `
- search_events {"query":"từ khoá","from":"YYYY-MM-DD","to":"YYYY-MM-DD","limit":10}
  Tìm sự kiện trong kho theo nội dung/người/địa điểm.
- get_week {"week_start":"YYYY-MM-DD"}
  Xem toàn bộ lịch của một tuần kèm xung đột đang mở.
- find_free_slots {"date":"YYYY-MM-DD","duration_minutes":90,"people":["Tên chủ trì"],"location":"..."}
  Tìm khung giờ trống đủ thời gian di chuyển cho những người nêu tên.
- check_conflicts {"week_start":"YYYY-MM-DD"}
  Liệt kê xung đột trùng giờ/trùng người/thiếu thời gian di chuyển.
- lookup_personnel {"query":"từ khoá"}
  Tra danh sách cán bộ, chức danh.
- summarize_workload {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}
  Thống kê số việc và số phút theo từng cán bộ.
- create_event_proposal {"title":"...","event_date":"YYYY-MM-DD","start_time":"HH:MM","end_time":"HH:MM","location":"...","chair":"...","participants":"...","content":"...","preparation":"...","tasks":["Chuẩn bị hội trường"]}
  Tạo một mục lịch ở trạng thái ĐỀ XUẤT (chưa ban hành), kèm đầu việc chuẩn bị nếu có. Chỉ gọi khi người dùng đã yêu cầu rõ ràng.
- add_preparation_task {"event_id":"...","text":"...","owner":"...","due_date":"YYYY-MM-DD"}
  Ghi thêm một đầu việc chuẩn bị vào sự kiện đã có. Chỉ gọi khi người dùng yêu cầu rõ.
- list_pending_tasks {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}
  Liệt kê các đầu việc chuẩn bị chưa hoàn thành trong khoảng ngày.
`.trim();

const SYSTEM = `
Bạn là Thư ký AI của Văn phòng Đảng ủy / UBND cấp phường, chuyên xử lý lịch công tác.
Bạn trả lời bằng tiếng Việt, ngắn gọn, đúng thể thức hành chính, không bịa dữ liệu.

Bạn có các công cụ sau:
${TOOL_DOCS}

Mỗi lượt CHỈ trả về MỘT đối tượng JSON hợp lệ, không kèm chữ khác:
- Gọi công cụ: {"thought":"lý do ngắn","action":"tên_công_cụ","args":{...}}
- Trả lời cuối: {"thought":"...","action":"final","answer":"câu trả lời cho cán bộ"}

Quy tắc:
1. Trước khi khẳng định lịch trống/bận, phải gọi công cụ để kiểm tra.
2. Không tự tạo lịch nếu người dùng chưa yêu cầu tạo; nếu chưa rõ ngày/giờ thì hỏi lại.
3. Chỉ dùng thông tin có trong dữ liệu; thiếu thì nói rõ "chưa có trong dữ liệu".
4. Khi đề xuất dời lịch, nêu rõ giữ việc nào, dời việc nào, vì sao.
5. Tối đa 6 lượt gọi công cụ; sau đó phải trả lời cuối.
`.trim();

export interface AgentStep {
  tool: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface AgentResult {
  reply: string;
  steps: AgentStep[];
  created_events: EventRecord[];
  provider_note?: string;
}

interface AgentInput {
  message: string;
  weekStart?: string;
  allowWrite: boolean;
}

function clip(value: unknown, max = 3500): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…(lược bớt)` : text;
}

function eventBrief(ev: EventRecord) {
  return {
    id: ev.id,
    date: ev.event_date,
    start: ev.start_time,
    end: ev.end_time,
    title: ev.title,
    chair: ev.chair,
    participants: ev.participants,
    location: ev.location,
    priority: ev.priority_score,
    status: ev.status,
    source: ev.source_document,
    tasks_open: ev.tasks.filter((t) => !t.done).length,
  };
}

function runTool(tool: string, args: Record<string, any>, ctx: { allowWrite: boolean; created: EventRecord[]; weekStart: string }): unknown {
  const state = getState();
  switch (tool) {
    case 'search_events': {
      const query = String(args.query || '').trim();
      const from = String(args.from || '');
      const to = String(args.to || '');
      let pool = state.events.filter((ev) => ev.status !== 'REJECTED');
      if (/^\d{4}-\d{2}-\d{2}$/.test(from)) pool = pool.filter((ev) => ev.event_date >= from);
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) pool = pool.filter((ev) => ev.event_date <= to);
      const limit = Math.min(Number(args.limit) || 10, 20);
      if (!query) {
        return pool
          .sort((a, b) => `${b.event_date} ${b.start_time}`.localeCompare(`${a.event_date} ${a.start_time}`))
          .slice(0, limit)
          .map(eventBrief);
      }
      return bm25Rank(query, pool.map((ev) => ({
        id: ev.id,
        text: `${ev.title} ${ev.content} ${ev.chair} ${ev.participants} ${ev.location} ${ev.source_document}`,
        payload: eventBrief(ev),
      })), limit).map((hit) => ({ ...(hit.payload || {}), match_excerpt: snippet(hit.text, query, 160) }));
    }
    case 'get_week': {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(String(args.week_start || '')) ? String(args.week_start) : ctx.weekStart;
      const end = addDays(start, 6);
      const events = state.events.filter((ev) => ev.event_date >= start && ev.event_date <= end);
      const ids = new Set(events.map((ev) => ev.id));
      return {
        week: { start, end },
        events: events.sort((a, b) => `${a.event_date} ${a.start_time}`.localeCompare(`${b.event_date} ${b.start_time}`)).map(eventBrief),
        conflicts: state.conflicts
          .filter((c) => c.status === 'OPEN' && (ids.has(c.event_id_1) || ids.has(c.event_id_2)))
          .map((c) => ({ severity: c.severity, description: c.description })),
      };
    }
    case 'find_free_slots': {
      const date = String(args.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'date phải là YYYY-MM-DD' };
      return findFreeSlots({
        date,
        durationMinutes: Number(args.duration_minutes) || 90,
        workingHours: state.settings.working_hours,
        events: state.events,
        buffers: state.settings.travel_buffers,
        people: Array.isArray(args.people) ? args.people.map(String) : [],
        location: String(args.location || ''),
        limit: 5,
      });
    }
    case 'check_conflicts': {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(String(args.week_start || '')) ? String(args.week_start) : ctx.weekStart;
      const end = addDays(start, 6);
      const ids = new Set(state.events.filter((ev) => ev.event_date >= start && ev.event_date <= end).map((ev) => ev.id));
      return state.conflicts
        .filter((c) => c.status === 'OPEN' && (ids.has(c.event_id_1) || ids.has(c.event_id_2)))
        .map((c) => ({
          id: c.id,
          severity: c.severity,
          description: c.description,
          suggestion: c.resolution_suggestion,
        }));
    }
    case 'lookup_personnel': {
      const query = String(args.query || '').toLowerCase();
      const list = state.personnel
        .filter((p) => p.is_active !== 0)
        .filter((p) => !query || `${p.name} ${p.title} ${p.role_description}`.toLowerCase().includes(query));
      return list.length
        ? list.map((p) => ({ name: p.name, title: p.title, role: p.role_description }))
        : { message: 'Chưa có cán bộ phù hợp trong danh sách. Hãy bổ sung ở Cài đặt.' };
    }
    case 'summarize_workload': {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(args.from || '')) ? String(args.from) : ctx.weekStart;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(String(args.to || '')) ? String(args.to) : addDays(from, 6);
      return workloadByPerson(state.events.filter((ev) => ev.event_date >= from && ev.event_date <= to));
    }
    case 'create_event_proposal': {
      const title = String(args.title || '').trim();
      const eventDate = String(args.event_date || '');
      if (!title) return { error: 'Thiếu title' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return { error: 'event_date phải là YYYY-MM-DD' };
      const now = new Date().toISOString();
      const startTime = /^\d{2}:\d{2}$/.test(String(args.start_time || '')) ? String(args.start_time) : '08:00';
      const event: EventRecord = {
        id: newId('ev'),
        source_id: null,
        source_document: String(args.source_document || 'Trợ lý AI tạo'),
        source_page: null,
        source_paragraph: null,
        event_date: eventDate,
        start_time: startTime,
        end_time: /^\d{2}:\d{2}$/.test(String(args.end_time || '')) ? String(args.end_time) : null,
        title,
        content: String(args.content || title),
        chair: String(args.chair || ''),
        participants: String(args.participants || ''),
        participant_group: '',
        location: String(args.location || ''),
        organizer: String(args.organizer || ''),
        preparation: String(args.preparation || '') || extractPreparation(`${title} ${args.content || ''}`),
        documents_required: '',
        contact_person: '',
        priority_score: scorePriority({ title, content: String(args.content || ''), chair: String(args.chair || '') }),
        confidence: 0.8,
        status: 'PROPOSED',
        missing_data_fields: ['chair', 'location', 'end_time'].filter((field) => !args[field === 'end_time' ? 'end_time' : field]),
        leaders: extractLeaders(String(args.chair || ''), String(args.participants || '')),
        also_from: [],
        tasks: normalizeTasks(args.tasks),
        series_id: null,
        created_at: now,
        updated_at: now,
      };
      if (!ctx.allowWrite) {
        return {
          dry_run: true,
          preview: eventBrief(event),
          message: 'Chưa ghi vào kho vì người dùng chưa bật "Cho phép tạo đề xuất". Hãy hiển thị bản nháp này để cán bộ xác nhận.',
        };
      }
      let merged = false;
      mutate((s) => {
        const result = upsertEvents(s, [event]);
        merged = result.merged.length > 0;
        s.conflicts = [
          ...s.conflicts.filter((c) => c.status === 'RESOLVED'),
          ...analyzeConflicts(s.events, s.settings.travel_buffers),
        ];
      });
      persist();
      ctx.created.push(event);
      return { created: eventBrief(event), merged_into_existing: merged };
    }
    case 'list_pending_tasks': {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(String(args.from || '')) ? String(args.from) : ctx.weekStart;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(String(args.to || '')) ? String(args.to) : addDays(from, 13);
      const rows = state.events
        .filter((ev) => ev.status !== 'REJECTED' && ev.event_date >= from && ev.event_date <= to)
        .flatMap((ev) => ev.tasks.filter((t) => !t.done).map((t) => ({
          event_id: ev.id,
          event_date: ev.event_date,
          event_title: ev.title,
          task: t.text,
          owner: t.owner || ev.contact_person || 'Chưa phân công',
          due_date: t.due_date || ev.event_date,
        })))
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      return rows.length ? rows.slice(0, 25) : { message: `Không còn đầu việc chuẩn bị nào chưa xong từ ${from} đến ${to}.` };
    }
    case 'add_preparation_task': {
      const eventId = String(args.event_id || '');
      const text = String(args.text || '').trim();
      if (!text) return { error: 'Thiếu nội dung đầu việc (text)' };
      const target = state.events.find((ev) => ev.id === eventId);
      if (!target) return { error: 'Không tìm thấy sự kiện với event_id nêu trên' };
      if (!ctx.allowWrite) {
        return { dry_run: true, message: `Sẽ thêm việc "${text}" vào mục "${target.title}" sau khi cán bộ bật quyền ghi.` };
      }
      const task = normalizeTask({ text, owner: String(args.owner || ''), due_date: String(args.due_date || '') });
      if (!task) return { error: 'Nội dung đầu việc rỗng' };
      mutate((s) => {
        const ev = s.events.find((e) => e.id === eventId)!;
        ev.tasks = [...ev.tasks, task].slice(0, EVENT_TASK_LIMIT);
        ev.updated_at = new Date().toISOString();
      });
      persist();
      return { added: { event_id: eventId, event_title: target.title, task: task.text, owner: task.owner, due_date: task.due_date } };
    }
    default:
      return { error: `Công cụ "${tool}" không tồn tại. Chọn một trong: search_events, get_week, find_free_slots, check_conflicts, lookup_personnel, summarize_workload, list_pending_tasks, create_event_proposal, add_preparation_task.` };
  }
}

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(input.weekStart || '') ? (input.weekStart as string) : startOfWeek(todayIso());
  const state = getState();
  const days = weekDays(weekStart);
  const ctx = { allowWrite: input.allowWrite, created: [] as EventRecord[], weekStart };
  const steps: AgentStep[] = [];
  const transcript: string[] = [];

  const context = [
    `Hôm nay: ${formatDdMmYyyy(todayIso())}. Tuần làm việc tham chiếu: ${formatDdMmYyyy(weekStart)} – ${formatDdMmYyyy(days[6].date)}.`,
    `Đơn vị: ${state.settings.unit_name || '(chưa đặt tên)'}. Kho dữ liệu: ${state.events.length} sự kiện, ${state.sources.length} văn bản nguồn, ${state.conflicts.filter((c) => c.status === 'OPEN').length} xung đột mở.`,
    state.personnel.length
      ? `Cán bộ: ${state.personnel.filter((p) => p.is_active !== 0).map((p) => `${p.name} (${p.title})`).join('; ')}.`
      : 'Chưa có danh sách cán bộ trong Cài đặt.',
    input.allowWrite
      ? 'Người dùng ĐÃ bật quyền tạo đề xuất: được gọi create_event_proposal khi được yêu cầu rõ ràng.'
      : 'Người dùng CHƯA bật quyền tạo đề xuất: create_event_proposal chỉ trả bản nháp, không ghi dữ liệu.',
  ].join('\n');

  for (let step = 0; step < 6; step += 1) {
    const prompt = [
      context,
      transcript.length ? `\nDiễn biến:\n${transcript.join('\n')}` : '',
      `\nYêu cầu của cán bộ: ${input.message}`,
      '\nTrả về đúng một JSON theo giao thức đã mô tả.',
    ].filter(Boolean).join('\n');

    let data: any;
    try {
      data = await askJson<Record<string, any>>({
        systemInstruction: SYSTEM,
        prompt,
        temperature: 0.1,
        label: 'agent',
      });
    } catch (err) {
      throw err;
    }

    if (!data || typeof data !== 'object') {
      transcript.push('Hệ thống: mô hình trả về dữ liệu không hợp lệ, hãy trả JSON đúng giao thức.');
      continue;
    }

    const action = String(data.action || '');
    if (action === 'final' || (!action && data.answer)) {
      return {
        reply: String(data.answer || 'Tôi chưa có câu trả lời.'),
        steps,
        created_events: ctx.created,
      };
    }

    const args = data.args && typeof data.args === 'object' ? data.args : {};
    let result: unknown;
    try {
      result = runTool(action, args, ctx);
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
    }
    const summary = summarizeResult(action, result);
    steps.push({ tool: action, args, summary });
    transcript.push(`Gọi ${action}(${clip(args, 400)}) -> ${clip(result, 2200)}`);
  }

  return {
    reply: 'Tôi đã kiểm tra dữ liệu nhưng chưa thể kết luận trong 6 bước. Hãy hỏi cụ thể hơn (tuần nào, cán bộ nào, việc gì).',
    steps,
    created_events: ctx.created,
  };
}

function summarizeResult(action: string, result: unknown): string {
  if (Array.isArray(result)) return `${result.length} kết quả`;
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    if ('error' in obj) return `lỗi: ${String(obj.error)}`;
    if ('created' in obj) return `đã tạo "${(obj.created as any)?.title || ''}"`;
    if ('dry_run' in obj) return 'bản nháp (chưa ghi)';
    if ('message' in obj) return String(obj.message);
  }
  return action === 'check_conflicts' || action === 'find_free_slots' ? clip(result, 200) : 'đã xử lý';
}
