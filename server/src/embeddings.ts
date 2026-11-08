// Text embeddings computed on this machine (no Replicate call, no rate limit),
// with a Postgres cache so text we've already embedded, like an article read
// again on re-research, is never embedded twice.
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import type { FeatureExtractionPipeline } from '@huggingface/transformers';
import { pool } from './db.ts';

// BGE small (384 dimensions; knowledge_chunks.embedding and
// embedding_cache.embedding must match). Downloaded once (~34 MB) on first use.
export const EMBEDDING_MODEL = 'Xenova/bge-small-en-v1.5';
export const EMBEDDING_DIMENSIONS = 384;
// BGE retrieves better when queries (not passages) carry this instruction.
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';
const BATCH = 16;

env.cacheDir = process.env.MODEL_CACHE_DIR ?? join(import.meta.dirname, '..', '.model-cache');

let extractor: Promise<FeatureExtractionPipeline> | null = null;
function model() {
  extractor ??= pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' }).catch((err: unknown) => {
    extractor = null; // try again next time
    throw err;
  });
  return extractor;
}

const hash = (text: string) => createHash('sha256').update(`${EMBEDDING_MODEL}\n${text}`).digest('hex');
export const toVector = (v: number[]) => `[${v.join(',')}]`;

async function compute(texts: string[]): Promise<number[][]> {
  const run = await model();
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const output = await run(texts.slice(i, i + BATCH), { pooling: 'cls', normalize: true });
    vectors.push(...(output.tolist() as number[][]));
  }
  return vectors;
}

// Embeds passages (or queries, with kind 'query'), reusing cached vectors.
export async function embed(texts: string[], kind: 'passage' | 'query' = 'passage'): Promise<number[][]> {
  if (texts.length === 0) return [];
  const inputs = texts.map((t) => (kind === 'query' ? QUERY_PREFIX + t : t));
  const keys = inputs.map(hash);

  const { rows } = await pool.query<{ hash: string; embedding: string }>(
    'SELECT hash, embedding::text FROM embedding_cache WHERE hash = ANY($1)',
    [keys],
  );
  const cached = new Map(rows.map((r) => [r.hash, JSON.parse(r.embedding) as number[]]));

  const missing = [...new Set(keys.filter((k) => !cached.has(k)))];
  if (missing.length > 0) {
    const missingInputs = missing.map((k) => inputs[keys.indexOf(k)]);
    const vectors = await compute(missingInputs);
    await pool.query(
      `INSERT INTO embedding_cache (hash, embedding)
       SELECT * FROM unnest($1::text[], $2::vector[]) ON CONFLICT (hash) DO UPDATE SET last_used_at = now()`,
      [missing, vectors.map(toVector)],
    );
    missing.forEach((k, i) => cached.set(k, vectors[i]));
  }
  if (rows.length > 0) {
    await pool.query('UPDATE embedding_cache SET last_used_at = now() WHERE hash = ANY($1)', [rows.map((r) => r.hash)]);
  }
  return keys.map((k) => cached.get(k) as number[]);
}

// Loads the model in the background so the first research run doesn't wait.
export function warmUpEmbeddings() {
  model().then(() => console.log(`Embedding model ready (${EMBEDDING_MODEL})`)).catch((err: unknown) => {
    console.warn('Couldn’t load the embedding model yet:', err instanceof Error ? err.message : err);
  });
}

// Vectors unused for a week go, like the knowledge they came from.
export async function deleteStaleEmbeddings() {
  await pool.query("DELETE FROM embedding_cache WHERE last_used_at < now() - interval '7 days'");
}
