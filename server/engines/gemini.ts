import { ask, parseLooseJson, AIUnavailableError, type AskOptions } from './llm.ts';

export { AIUnavailableError, ask, aiModel, hasApiKey, parseLooseJson, probeProviders, updateRuntimeAiConfig } from './llm.ts';
export type { AskOptions, LlmProviderName } from './llm.ts';

/** Nhận JSON từ mô hình, tự sửa một lần nếu lần đầu trả về chuỗi hỏng định dạng. */
export async function askJson<T = Record<string, unknown>>(options: AskOptions): Promise<T> {
  const raw = await ask({ ...options, json: true });
  const parsed = parseLooseJson(raw);
  if (parsed !== null) return parsed as T;

  //Khôi phục: hỏi lại đúng bản lỗi, yêu cầu sửa thành JSON hợp lệ (không bịa thêm nội dung).
  try {
    const fixed = await ask({
      systemInstruction: 'Bạn là bộ sửa JSON. Chỉ trả về JSON hợp lệ, giữ nguyên nội dung gốc, không thêm trường mới, không giải thích.',
      prompt: `Đoạn dưới đây là kết quả bị lỗi định dạng. Hãy sửa thành JSON hợp lệ:\n\n${raw.slice(0, 6000)}`,
      temperature: 0,
      label: `${options.label || 'json'}-repair`,
    });
    const repaired = parseLooseJson(fixed);
    if (repaired !== null) return repaired as T;
  } catch {
    /* rơi xuống lỗi chung bên dưới */
  }

  throw new AIUnavailableError(`Mô hình trả về JSON không hợp lệ (${options.label || 'json'}): ${raw.slice(0, 200)}`);
}
