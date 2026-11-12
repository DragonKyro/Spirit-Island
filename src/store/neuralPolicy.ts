// The trained network, fetched once (in the AI worker, or on the main thread when there is no worker).
// The file is a Vite asset: hashed, cached by the browser, and only downloaded when the neural AI is used.

import { SpiritPolicy } from '../engine/nn/runtime';
import policyUrl from '../engine/nn/spirit-policy.bin?url';

let loading: Promise<SpiritPolicy | null> | null = null;

/** The shipped policy, or null if it could not be loaded (the caller falls back to the search AI). */
export function loadNeuralPolicy(): Promise<SpiritPolicy | null> {
  loading ??= fetch(policyUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((buf) => SpiritPolicy.parse(buf))
    .catch((e: Error) => {
      console.warn('[ai] neural policy unavailable, using the search AI:', e.message);
      return null;
    });
  return loading;
}
