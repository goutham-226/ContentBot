// Per-run context, carried through async calls, so a cancel can reach the
// Replicate requests a run has in flight.
import { AsyncLocalStorage } from 'node:async_hooks';

export type RunContext = {
  runId: string;
  canceled: boolean;
  predictions: Set<string>; // Replicate prediction ids still running
  notify?: (title: string, detail: string) => Promise<void>; // shows a note in the run's thinking trail
};

export const runContext = new AsyncLocalStorage<RunContext>();

export class CanceledError extends Error {
  constructor() {
    super('Canceled.');
  }
}

export function throwIfCanceled() {
  if (runContext.getStore()?.canceled) throw new CanceledError();
}
