// In-memory sliding-window limiter. Per server instance; for multi-instance production use a shared store (e.g. Upstash).
const hits = new Map<string, number[]>();
export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return false; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return true;
}
export const _resetRateLimit = () => hits.clear();
