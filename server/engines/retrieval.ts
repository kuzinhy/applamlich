import { foldVietnamese } from '../services/merge.ts';

const STOPWORDS = new Set([
  'va', 'hoac', 'cua', 'cho', 'voi', 'la', 'co', 'duoc', 'trong', 'khi', 'de', 'mot',
  'nay', 'nhung', 'cac', 'nhieu', 'rat', 'se', 'da', 'dang', 'boi', 'tai', 'theo',
  'thi', 'ma', 'nen', 've', 'tu', 'den', 'tren', 'duoi', 'ra', 'vao', 'di', 'lam',
  'gi', 'nao', 'sao', 'ai', 'khong', 'chua', 'roi', 'cung', 'chi', 'con', 'lai',
]);

/** Tách token tiếng Việt đã bỏ dấu; giữ số (ngày, giờ, số văn bản) vì chúng có nghĩa tra cứu. */
export function tokenize(text: string): string[] {
  return foldVietnamese(text)
    .replace(/[^a-z0-9\s/.-]/g, ' ')
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export interface RetrieverDoc {
  id: string;
  text: string;
  payload?: Record<string, unknown>;
}

export interface RankedDoc extends RetrieverDoc {
  score: number;
}

/**
 * BM25 (k1=1.5, b=0.75) — thuật toán xếp hạng văn bản cổ điển, chạy hoàn toàn cục bộ,
 * không cần embedding hay dịch vụ ngoài. Phù hợp kho vài trăm văn bản của một phường.
 */
export function bm25Rank(query: string, docs: RetrieverDoc[], limit = 8): RankedDoc[] {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || !docs.length) return [];
  const tokenized = docs.map((doc) => tokenize(`${doc.text} ${doc.id}`));
  const avgLen = tokenized.reduce((sum, tokens) => sum + tokens.length, 0) / tokenized.length || 1;
  const df = new Map<string, number>();
  for (const tokens of tokenized) {
    for (const term of new Set(tokens)) df.set(term, (df.get(term) || 0) + 1);
  }
  const N = docs.length;
  const k1 = 1.5;
  const b = 0.75;
  const ranked: RankedDoc[] = docs.map((doc, index) => {
    const tokens = tokenized[index];
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
    let score = 0;
    for (const term of terms) {
      const freq = tf.get(term) || 0;
      if (!freq) continue;
      const idf = Math.log(1 + (N - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));
      score += idf * ((freq * (k1 + 1)) / (freq + k1 * (1 - b + (b * tokens.length) / avgLen)));
    }
    return { ...doc, score };
  });
  return ranked
    .filter((doc) => doc.score > 0)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, Math.max(1, limit));
}

/** Đoạn trích ngắn quanh từ khóa đầu tiên, dùng cho phần "dẫn nguồn" trong câu trả lời AI. */
export function snippet(text: string, query: string, maxLen = 240): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const terms = tokenize(query);
  const folded = foldVietnamese(clean);
  let at = -1;
  for (const term of terms) {
    at = folded.indexOf(term);
    if (at >= 0) break;
  }
  if (at < 0) return `${clean.slice(0, maxLen)}…`;
  const start = Math.max(0, at - Math.floor(maxLen / 3));
  return `${start > 0 ? '…' : ''}${clean.slice(start, start + maxLen)}…`;
}
