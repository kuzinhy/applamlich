import { getState, mutate, persist, rememberNotification, markReminderSent } from '../store.ts';
import { eventsBetween } from '../store.ts';
import { signWebhookBody } from './webhook.ts';
import { formatDdMmYyyy, toIso, addDays } from '../utils/dates.ts';
import type { EventRecord, NotificationConfig } from '../types.ts';

const TELEGRAM_API = 'https://api.telegram.org';

export function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface NotificationResult {
  channel: 'telegram' | 'email' | 'webhook';
  status: 'sent' | 'failed' | 'skipped';
  detail: string;
}

/** Bản tin không lộ nội dung: chỉ ngày, giờ, số lượng. */
export function briefEvent(ev: EventRecord, includeDetails: boolean) {
  if (!includeDetails) {
    return { time: ev.start_time, date: ev.event_date };
  }
  return {
    time: ev.start_time,
    end: ev.end_time,
    date: ev.event_date,
    title: ev.title,
    chair: ev.chair,
    participants: ev.participants,
    location: ev.location,
    preparation: ev.preparation,
    priority: ev.priority_score,
    status: ev.status,
  };
}

export function buildDigestText(date: string, events: EventRecord[], config: NotificationConfig, unitName: string): string {
  const header = `📅 <b>LỊCH CÔNG TÁC ${formatDdMmYyyy(date)}</b>\n${escapeHtml(unitName)}`;
  if (!events.length) return `${header}\nHôm nay chưa có mục lịch nào.`;
  if (!config.include_details) {
    return `${header}\nHôm nay có ${events.length} mục lịch (bật "gửi kèm chi tiết" trong Cài đặt để xem nội dung).`;
  }
  const lines = events
    .slice()
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((ev, index) => {
      const time = `${ev.start_time}${ev.end_time ? `–${ev.end_time}` : ''}`;
      const parts = [`${index + 1}. <b>${time}</b> — ${escapeHtml(ev.title)}`];
      if (ev.location) parts.push(`   📍 ${escapeHtml(ev.location)}`);
      if (ev.chair) parts.push(`   👤 Chủ trì: ${escapeHtml(ev.chair)}`);
      if (ev.preparation) parts.push(`   📝 ${escapeHtml(ev.preparation.slice(0, 220))}`);
      return parts.join('\n');
    });
  return `${header}\n\n${lines.join('\n\n')}`;
}

export function buildReminderText(ev: EventRecord, hoursBefore: number, config: NotificationConfig): string {
  const when = hoursBefore >= 24 ? `${Math.round(hoursBefore / 24)} ngày` : `${hoursBefore} giờ`;
  if (!config.include_details) {
    return `⏰ Nhắc lịch: còn ${when} nữa có một mục lịch lúc ${ev.start_time} ngày ${formatDdMmYyyy(ev.event_date)}.`;
  }
  return [
    `⏰ <b>Nhắc lịch — còn ${when}</b>`,
    `<b>${ev.start_time}${ev.end_time ? `–${ev.end_time}` : ''}</b> ngày ${formatDdMmYyyy(ev.event_date)}`,
    escapeHtml(ev.title),
    ev.location ? `📍 ${escapeHtml(ev.location)}` : '',
    ev.chair ? `👤 Chủ trì: ${escapeHtml(ev.chair)}` : '',
    ev.preparation ? `📝 ${escapeHtml(ev.preparation.slice(0, 220))}` : '',
  ].filter(Boolean).join('\n');
}

async function sendTelegram(config: NotificationConfig, text: string): Promise<NotificationResult> {
  const { bot_token, chat_id } = config.telegram;
  if (!bot_token || !chat_id) return { channel: 'telegram', status: 'skipped', detail: 'Thiếu bot_token/chat_id' };
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body?.ok === false) {
      return { channel: 'telegram', status: 'failed', detail: `HTTP ${res.status} ${body?.description || ''}`.trim() };
    }
    return { channel: 'telegram', status: 'sent', detail: `chat ${chat_id}` };
  } catch (err) {
    return { channel: 'telegram', status: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}

async function sendEmail(config: NotificationConfig, subject: string, text: string): Promise<NotificationResult> {
  const email = config.email;
  if (!email.smtp_host || !email.to.length) return { channel: 'email', status: 'skipped', detail: 'Thiếu SMTP host hoặc người nhận' };
  try {
    const mod: any = await import('nodemailer');
    const nodemailer = mod.default ?? mod;
    const transport = nodemailer.createTransport({
      host: email.smtp_host,
      port: email.smtp_port || 587,
      secure: Boolean(email.secure),
      auth: email.user ? { user: email.user, pass: email.pass } : undefined,
      connectionTimeout: 10000,
    });
    await transport.sendMail({
      from: email.from || email.user,
      to: email.to.join(','),
      subject,
      text: text.replace(/<[^>]+>/g, ''),
      html: text.replace(/\n/g, '<br>'),
    });
    return { channel: 'email', status: 'sent', detail: `${email.to.length} người nhận` };
  } catch (err) {
    return { channel: 'email', status: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Gửi qua webhook đã cấu hình (kèm chữ ký HMAC) — dùng chung khoá với webhook xuất lịch. */
async function sendWebhook(text: string, kind: string): Promise<NotificationResult> {
  const hook = getState().webhook_config;
  if (!hook.enabled || !hook.url) return { channel: 'webhook', status: 'skipped', detail: 'Webhook chưa bật' };
  const body = JSON.stringify({
    event: 'notification',
    kind,
    occurred_at: new Date().toISOString(),
    unit_name: getState().settings.unit_name || '',
    redacted: !hook.include_details,
    text: hook.include_details ? text : undefined,
    counts: { notifications: 1 },
  });
  try {
    const signature = signWebhookBody(hook.secret, body);
    const res = await fetch(`${hook.url}${hook.url.includes('?') ? '&' : '?'}sig=${encodeURIComponent(signature)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TG-Signature': signature,
        'X-TG-Event': 'notification',
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
    return {
      channel: 'webhook',
      status: res.ok ? 'sent' : 'failed',
      detail: res.ok ? `HTTP ${res.status}` : `HTTP ${res.status}`,
    };
  } catch (err) {
    return { channel: 'webhook', status: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Gửi một bản tin qua mọi kênh đang bật; luôn ghi nhật ký gửi. */
export async function notifyAll(kind: 'digest' | 'reminder' | 'test' | 'publish', subject: string, text: string): Promise<NotificationResult[]> {
  const config = getState().notifications;
  const isTest = kind === 'test';
  if (!config.enabled && !isTest) {
    return [{ channel: 'telegram', status: 'skipped', detail: 'Thông báo đang tắt' }];
  }
  const useTelegram = config.telegram.enabled || (isTest && Boolean(config.telegram.bot_token && config.telegram.chat_id));
  const useEmail = config.email.enabled || (isTest && Boolean(config.email.smtp_host && config.email.to.length));
  const results: NotificationResult[] = [];
  if (useTelegram) results.push(await sendTelegram(config, text));
  if (useEmail) results.push(await sendEmail(config, subject, text));
  const hook = await sendWebhook(text, kind);
  if (hook.status !== 'skipped') results.push(hook);
  if (!results.length) results.push({ channel: 'telegram', status: 'skipped', detail: 'Chưa bật kênh nào' });
  for (const r of results) {
    rememberNotification({
      at: new Date().toISOString(),
      channel: r.channel,
      kind,
      target: r.channel === 'telegram' ? (config.telegram.chat_id || '(chưa đặt)') : r.channel === 'email' ? config.email.to.join(',') : 'webhook',
      status: r.status,
      error: r.status === 'sent' ? '' : r.detail,
    });
  }
  persist();
  return results;
}

export function buildTaskReminderText(ev: EventRecord, taskText: string, owner: string, dueDate: string, dueToday: boolean): string {
  return [
    dueToday ? '⏰ <b>Hạn chuẩn bị hôm nay</b>' : '⏰ <b>Hạn chuẩn bị ngày mai</b>',
    escapeHtml(taskText),
    `📅 Hạn: ${formatDdMmYyyy(dueDate)}`,
    `🗓 Việc của: ${escapeHtml(ev.title)} (${formatDdMmYyyy(ev.event_date)} ${ev.start_time})`,
    owner ? `👤 Phụ trách: ${escapeHtml(owner)}` : '',
  ].filter(Boolean).join('\n');
}

function minutesUntil(ev: EventRecord, now: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.event_date) || !/^\d{2}:\d{2}$/.test(ev.start_time)) return null;
  const target = new Date(`${ev.event_date}T${ev.start_time}:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

export interface SchedulerRunResult {
  digest_sent: boolean;
  reminders_sent: number;
  notes: string[];
}

/**
 * Chạy mỗi phút: gửi bản tin đầu ngày đúng giờ và nhắc trước sự kiện theo số giờ đã cấu hình.
 * Mọi mốc đã gửi được ghi vào kho để không gửi lặp khi khởi động lại.
 */
export async function runSchedulerTick(now = new Date()): Promise<SchedulerRunResult> {
  const state = getState();
  const config = state.notifications;
  const notes: string[] = [];
  if (!config.enabled) return { digest_sent: false, reminders_sent: 0, notes: ['Thông báo đang tắt'] };

  let digestSent = false;
  const today = toIso(now);
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (config.daily_digest_enabled && hhmm === config.daily_digest_time && state.last_digest_date !== today) {
    const events = eventsBetween(today, today).filter((ev) => ev.status !== 'REJECTED' && ev.status !== 'DRAFT');
    mutate((s) => { s.last_digest_date = today; });
    await notifyAll('digest', `Lịch công tác ${formatDdMmYyyy(today)}`, buildDigestText(today, events, config, state.settings.unit_name));
    digestSent = true;
    notes.push(`Đã gửi bản tin ngày ${today} (${events.length} mục)`);
  }

  let reminders = 0;
  if (config.reminder_enabled) {
    const sent = new Set(state.sent_reminders);
    const events = state.events.filter((ev) => ev.status !== 'REJECTED' && ev.status !== 'DRAFT');
    for (const ev of events) {
      const diff = minutesUntil(ev, now);
      if (diff === null || diff < -5) continue;
      for (const hours of config.reminder_before_hours) {
        const threshold = hours * 60;
        const key = `${ev.id}|${hours}`;
        if (sent.has(key)) continue;
        // Chỉ gửi trong cửa sổ 6 phút quanh mốc để không dồn tin khi server bật lại.
        if (diff <= threshold && diff > threshold - 6) {
          const text = buildReminderText(ev, hours, config);
          await notifyAll('reminder', `Nhắc lịch: ${ev.title}`, text);
          markReminderSent(key);
          sent.add(key);
          reminders += 1;
        }
      }
    }
    if (reminders) {
      mutate((s) => {
        s.sent_reminders = s.sent_reminders.slice(-500);
      });
      persist();
    }
  }

  // Nhắc hạn chuẩn bị (tasks) — gửi một lần mỗi ngày sau giờ bản tin, cho hạn hôm nay và ngày mai.
  let taskReminders = 0;
  if (config.reminder_enabled && hhmm >= config.daily_digest_time) {
    const sentTasks = new Set(getState().sent_reminders);
    const todayDate = today;
    const tomorrowDate = addDays(today, 1);
    for (const ev of getState().events) {
      if (ev.status === 'REJECTED' || ev.status === 'DRAFT') continue;
      for (const task of ev.tasks || []) {
        if (task.done || !task.due_date) continue;
        if (task.due_date !== todayDate && task.due_date !== tomorrowDate) continue;
        const key = `task|${ev.id}|${task.id}|${task.due_date}`;
        if (sentTasks.has(key)) continue;
        const text = buildTaskReminderText(ev, task.text, task.owner, task.due_date, task.due_date === todayDate);
        await notifyAll('reminder', `Hạn chuẩn bị: ${task.text}`, text);
        markReminderSent(key);
        sentTasks.add(key);
        taskReminders += 1;
      }
    }
    if (taskReminders) {
      mutate((s) => {
        s.sent_reminders = s.sent_reminders.slice(-500);
      });
      persist();
      notes.push(`Đã nhắc ${taskReminders} hạn chuẩn bị`);
    }
  }

  return { digest_sent: digestSent, reminders_sent: reminders + taskReminders, notes };
}

let timer: NodeJS.Timeout | null = null;

export function startNotificationScheduler(): void {
  if (timer || process.env.NOTIFY_SCHEDULER === '0') return;
  const ms = Math.max(20000, Number(process.env.NOTIFY_TICK_MS || 60000));
  timer = setInterval(() => {
    runSchedulerTick().catch((err) => console.error('Lỗi gửi thông báo:', err));
  }, ms);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`  Nhắc việc: bộ hẹn giờ đang chạy (mỗi ${Math.round(ms / 1000)}s).`);
}
