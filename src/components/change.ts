import type { TrackerState } from '@/lib/model';
// Clone, mutate, save through the encrypted vault, then report the outcome.
export function changer(
  state: TrackerState,
  save: (next: TrackerState) => Promise<void>,
  onError: (message: string) => void,
  notify: (message: string) => void,
) {
  return async (fn: (s: TrackerState) => void, success?: string) => {
    try {
      const next = structuredClone(state);
      fn(next);
      await save(next);
      if (success) notify(success);
      return true;
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Unable to save.');
      return false;
    }
  };
}
