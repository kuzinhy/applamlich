import { contentFingerprint } from '../engines/document_text.ts';
import { tokenize } from '../engines/retrieval.ts';
import { getState, mutate, persist } from '../store.ts';

export interface Chunk {
  id: string;
  text: string;
  source_id: string;
}

const chunks: Chunk[] = [];

export function ingest(sourceId: string, text: string) {
  // Simple chunking strategy: split by paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 50);
  for (const p of paragraphs) {
    chunks.push({
      id: `${sourceId}-${contentFingerprint(p)}`.slice(0, 32),
      text: p,
      source_id: sourceId
    });
  }
}

export function retrieve(query: string, limit: number = 3): string[] {
  const queryTokens = new Set(tokenize(query));
  return chunks
    .map(chunk => ({
      ...chunk,
      score: tokenize(chunk.text).filter(t => queryTokens.has(t)).length
    }))
    .sort((a, b) => b.score - a.score)
    .filter(c => c.score > 0)
    .slice(0, limit)
    .map(c => c.text);
}
