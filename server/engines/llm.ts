import { GoogleGenAI } from '@google/genai';

export class AIUnavailableError extends Error {}

export type LlmProviderName = 'gemini' | 'ollama' | 'openai';

export interface LlmCandidate {
  provider: LlmProviderName;
  model: string;
}

export interface AskOptions {
  systemInstruction: string;
  prompt: string;
  temperature?: number;
  json?: boolean;
  label?: string;
  /** Giới hạn thời gian một lần gọi; mặc định 90s cho cloud, 180s cho Ollama. */
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function env(name: string): string {
  return String(process.env[name] || '').trim();
}

/** Danh sách nhà cung cấp theo thứ tự ưu tiên. `LLM_PROVIDER=auto` thử lần lượt. */
export function candidateProviders(): LlmCandidate[] {
  const mode = (env('LLM_PROVIDER') || 'auto').toLowerCase();
  const gemini: LlmCandidate = { provider: 'gemini', model: env('GEMINI_MODEL') || 'gemini-3.8-flash' };
  const ollama: LlmCandidate = {
    provider: 'ollama',
    model: env('OLLAMA_MODEL') || 'qwen2.5:7b',
  };
  const openai: LlmCandidate = {
    provider: 'openai',
    model: env('OPENAI_MODEL') || 'llama-3.3-70b-versatile',
  };
  if (mode === 'gemini') return [gemini];
  if (mode === 'ollama') return [ollama];
  if (mode === 'openai') return [openai];
  const list: LlmCandidate[] = [];
  if (env('GEMINI_API_KEY')) list.push(gemini);
  if (env('OPENAI_API_KEY') && env('OPENAI_BASE_URL')) list.push(openai);
  // Ollama chạy cục bộ: thử sau cùng, lỗi kết nối sẽ tự loại khỏi vòng lặp.
  if (env('OLLAMA_DISABLED') !== '1') list.push(ollama);
  return list;
}

export function aiModel(): string {
  const first = candidateProviders()[0];
  return first ? `${first.provider}:${first.model}` : '(chưa cấu hình)';
}

export function hasApiKey(): boolean {
  return candidateProviders().some((c) => c.provider !== 'ollama')
    || env('LLM_PROVIDER') === 'ollama'
    || env('OLLAMA_ENABLED') === '1';
}

function providerLabel(c: LlmCandidate): string {
  return `${c.provider}:${c.model}`;
}

function isAuthError(message: string): boolean {
  return /\b(401|403)\b/.test(message) || /api key not valid|permission denied|unauthenticated|invalid_api_key/i.test(message);
}

function isConnectError(message: string): boolean {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|aborted|network|không kết nối/i.test(message);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AIUnavailableError(`${label} quá thời gian chờ (${Math.round(ms / 1000)}s).`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let geminiClient: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!env('GEMINI_API_KEY')) {
    throw new AIUnavailableError('Chưa cấu hình GEMINI_API_KEY.');
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey: env('GEMINI_API_KEY'),
      httpOptions: { headers: { 'User-Agent': 'applamlich-agency-advisor' } },
    });
  }
  return geminiClient;
}

async function callGemini(c: LlmCandidate, o: AskOptions): Promise<string> {
  const response = await gemini().models.generateContent({
    model: c.model,
    contents: [{ role: 'user', parts: [{ text: o.prompt }] }],
    config: {
      systemInstruction: o.systemInstruction,
      temperature: o.temperature ?? 0.2,
      ...(o.json ? { responseMimeType: 'application/json' } : {}),
    },
  });
  const blockReason = (response as any).promptFeedback?.blockReason;
  if (blockReason) throw new AIUnavailableError(`Gemini chặn yêu cầu (blockReason=${blockReason}).`);
  const text = response.text;
  if (!text || !text.trim()) throw new AIUnavailableError('Gemini trả về nội dung rỗng.');
  return text;
}

async function callOpenAiCompatible(c: LlmCandidate, o: AskOptions): Promise<string> {
  const baseUrl = env('OPENAI_BASE_URL').replace(/\/+$/, '');
  const apiKey = env('OPENAI_API_KEY');
  if (!baseUrl || !apiKey) throw new AIUnavailableError('Chưa cấu hình OPENAI_BASE_URL/OPENAI_API_KEY.');
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: c.model,
      messages: [
        { role: 'system', content: o.systemInstruction },
        { role: 'user', content: o.prompt },
      ],
      temperature: o.temperature ?? 0.2,
      ...(o.json ? { response_format: { type: 'json_object' } } : {}),
    }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 90000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AIUnavailableError(`Nhà cung cấp OpenAI-compatible trả HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || !String(text).trim()) throw new AIUnavailableError('Mô hình trả về nội dung rỗng.');
  return String(text);
}

async function callOllama(c: LlmCandidate, o: AskOptions): Promise<string> {
  const baseUrl = (env('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: c.model,
      messages: [
        { role: 'system', content: o.systemInstruction },
        { role: 'user', content: o.prompt },
      ],
      stream: false,
      ...(o.json ? { format: 'json' } : {}),
      options: { temperature: o.temperature ?? 0.2 },
    }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 180000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AIUnavailableError(`Ollama trả HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  const text = data?.message?.content;
  if (!text || !String(text).trim()) throw new AIUnavailableError('Ollama trả về nội dung rỗng.');
  return String(text);
}

async function callProvider(c: LlmCandidate, o: AskOptions): Promise<string> {
  if (c.provider === 'gemini') return withTimeout(callGemini(c, o), o.timeoutMs ?? 90000, 'Gemini');
  if (c.provider === 'openai') return withTimeout(callOpenAiCompatible(c, o), o.timeoutMs ?? 90000, providerLabel(c));
  return withTimeout(callOllama(c, o), o.timeoutMs ?? 180000, 'Ollama');
}

/**
 * Gọi mô hình với cơ chế thử lại và dự phòng: Gemini → OpenAI-compatible → Ollama.
 * Lỗi quyền/kết nối của một nhà cung cấp được ghi lại rồi chuyển sang nhà cung cấp kế tiếp;
 * nội dung bị chặn hoặc hết mọi lựa chọn thì ném AIUnavailableError để route trả 503,
 * tuyệt đối không tự bịa dữ liệu.
 */
export async function ask(options: AskOptions): Promise<string> {
  const candidates = candidateProviders();
  if (!candidates.length) {
    throw new AIUnavailableError(
      'Chưa cấu hình nhà cung cấp AI. Điền GEMINI_API_KEY, hoặc chạy Ollama cục bộ (LLM_PROVIDER=ollama), hoặc OPENAI_BASE_URL + OPENAI_API_KEY.'
    );
  }
  const maxAttempts = Math.max(1, Number(process.env.LLM_MAX_ATTEMPTS || process.env.GEMINI_MAX_ATTEMPTS || 3));
  const errors: string[] = [];

  for (const candidate of candidates) {
    let lastError = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await callProvider(candidate, options);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (err instanceof AIUnavailableError && /chặn yêu cầu|blockReason/i.test(lastError)) throw err;
        // Lỗi cấu hình/quyền: không thử lại vô ích, chuyển nhà cung cấp kế tiếp.
        if (isAuthError(lastError) || isConnectError(lastError)) break;
      }
      if (attempt < maxAttempts) await sleep(400 * attempt);
    }
    errors.push(`${providerLabel(candidate)}: ${lastError || 'không rõ lỗi'}`);
    if (candidates.length === 1) break;
  }

  throw new AIUnavailableError(`Không gọi được mô hình AI. ${errors.join(' | ')}`);
}

/** Sửa lỗi JSON nhẹ nhàng: lấy nguyên văn, bỏ markdown fence, cắt từ dấu ngoặc đầu tiên. */
export function parseLooseJson(raw: string): unknown | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(raw)?.[1] || '';
  const braceAt = Math.min(
    raw.indexOf('{') < 0 ? Infinity : raw.indexOf('{'),
    raw.indexOf('[') < 0 ? Infinity : raw.indexOf('[')
  );
  const attempts = [raw, fence, Number.isFinite(braceAt) ? raw.slice(braceAt) : ''];
  if (Number.isFinite(braceAt)) {
    const closerAt = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (closerAt > braceAt) attempts.push(raw.slice(braceAt, closerAt + 1));
  }
  for (const candidate of attempts) {
    if (!candidate.trim()) continue;
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      /* thử cách cắt tiếp theo */
    }
  }
  return null;
}

const STATUS_CACHE_MS = 15000;
let statusCache: { at: number; value: ProviderStatus[] } | null = null;

export interface ProviderStatus {
  provider: LlmProviderName;
  model: string;
  available: boolean;
  detail: string;
}

async function probeOllama(c: LlmCandidate): Promise<ProviderStatus> {
  const baseUrl = (env('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { provider: 'ollama', model: c.model, available: false, detail: `HTTP ${res.status}` };
    const data: any = await res.json();
    const models: string[] = Array.isArray(data?.models) ? data.models.map((m: any) => String(m.name || '')) : [];
    const match = models.some((name) => name === c.model || name.startsWith(`${c.model}:`) || name.startsWith(c.model));
    return {
      provider: 'ollama',
      model: c.model,
      available: models.length > 0,
      detail: models.length
        ? (match ? `Sẵn sàng (${models.length} mô hình)` : `Đang chạy nhưng chưa có ${c.model}. Có: ${models.slice(0, 5).join(', ')}`)
        : 'Chưa tải mô hình nào (ollama pull ' + c.model + ')',
    };
  } catch {
    return { provider: 'ollama', model: c.model, available: false, detail: 'Không kết nối được Ollama tại ' + baseUrl };
  }
}

/** Trạng thái từng nhà cung cấp, có cache 15 giây để trang Cài đặt không gọi liên tục. */
export async function probeProviders(force = false): Promise<ProviderStatus[]> {
  if (!force && statusCache && Date.now() - statusCache.at < STATUS_CACHE_MS) return statusCache.value;
  const list: ProviderStatus[] = [];
  for (const c of candidateProviders()) {
    if (c.provider === 'gemini') {
      list.push({
        provider: 'gemini',
        model: c.model,
        available: Boolean(env('GEMINI_API_KEY')),
        detail: env('GEMINI_API_KEY') ? 'Đã có khoá API' : 'Chưa có GEMINI_API_KEY',
      });
    } else if (c.provider === 'openai') {
      const ok = Boolean(env('OPENAI_API_KEY') && env('OPENAI_BASE_URL'));
      list.push({ provider: 'openai', model: c.model, available: ok, detail: ok ? env('OPENAI_BASE_URL') : 'Chưa cấu hình OPENAI_BASE_URL/OPENAI_API_KEY' });
    } else {
      list.push(await probeOllama(c));
    }
  }
  statusCache = { at: Date.now(), value: list };
  return list;
}
