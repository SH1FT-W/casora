// Test-only time scale for dev/qa/bereit.mjs (CASORA_BEREIT_SCALE, e.g. 0.01). Unset, not a number, zero,
// negative or infinite = 1 (real time).
export function timeScale(env) {
  const v = Number(env.CASORA_BEREIT_SCALE);
  return Number.isFinite(v) && v > 0 ? v : 1;
}
