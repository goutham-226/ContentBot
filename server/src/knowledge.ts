// A research run's temporary knowledge base, stored in Postgres with pgvector.
import { pool } from './db.ts';
import { embed, toVector } from './embeddings.ts';

const CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 150;

export type KnowledgeDoc = { source: string; url: string | null; text: string };
export type KnowledgeHit = { source: string; url: string | null; content: string };

// Splits on paragraph boundaries into ~CHUNK_CHARS pieces with a little overlap.
function chunk(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const para of text.split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
    if (current && current.length + para.length > CHUNK_CHARS) {
      chunks.push(current);
      current = current.slice(-CHUNK_OVERLAP);
    }
    current = current ? `${current}\n${para}` : para;
    while (current.length > CHUNK_CHARS * 1.5) {
      chunks.push(current.slice(0, CHUNK_CHARS));
      current = current.slice(CHUNK_CHARS - CHUNK_OVERLAP);
    }
  }
  if (current.trim().length > 80) chunks.push(current);
  return chunks;
}

// Returns how many chunks were stored.
export async function storeKnowledge(runId: string, docs: KnowledgeDoc[]): Promise<number> {
  const rows = docs.flatMap((doc) => chunk(doc.text).map((content) => ({ ...doc, content })));
  if (rows.length === 0) return 0;
  const vectors = await embed(rows.map((r) => r.content));
  for (const [i, row] of rows.entries()) {
    await pool.query(
      'INSERT INTO knowledge_chunks (run_id, source, url, content, embedding) VALUES ($1, $2, $3, $4, $5::vector)',
      [runId, row.source, row.url, row.content, toVector(vectors[i])],
    );
  }
  return rows.length;
}

// The chunks closest to any of the queries (cosine distance), without repeats.
export async function searchKnowledge(runId: string, queries: string[], perQuery: number): Promise<KnowledgeHit[]> {
  if (queries.length === 0) return [];
  const vectors = await embed(queries, 'query');
  const seen = new Set<string>();
  const hits: KnowledgeHit[] = [];
  for (const v of vectors) {
    const { rows } = await pool.query<KnowledgeHit & { id: string }>(
      `SELECT id, source, url, content FROM knowledge_chunks
        WHERE run_id = $1 ORDER BY embedding <=> $2::vector LIMIT $3`,
      [runId, toVector(v), perQuery],
    );
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      hits.push({ source: row.source, url: row.url, content: row.content });
    }
  }
  return hits;
}

export async function clearKnowledge(runId: string) {
  await pool.query('DELETE FROM knowledge_chunks WHERE run_id = $1', [runId]);
}

export async function deleteExpiredKnowledge() {
  await pool.query('DELETE FROM knowledge_chunks WHERE expires_at < now()');
}
