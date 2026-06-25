/**
 * Pure response cache (no vscode dependency) for inline-completion suggestions.
 *
 * Extracted from extension.ts so the LRU + TTL behaviour is unit-testable.
 * The cache is a plain insertion-ordered Map owned by the caller; these
 * helpers mutate it in place.
 */

// Identical prefix + suffix + profile reuses the last suggestion within TTL,
// skipping the API call entirely.
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// Bounded size keeps memory predictable under heavy editing.
export const CACHE_MAX = 50;

export interface CacheEntry {
    result: string;
    timestamp: number;
}

/**
 * Cache key: profile + surrounding context. The NUL byte delimits fields so
 * (profile, before, after) tuples that merely concatenate to the same string
 * cannot collide.
 */
export function buildCacheKey(profileId: string, textBefore: string, textAfter: string): string {
    return `${profileId}\0${textBefore}\0${textAfter}`;
}

/**
 * Returns the cached result if present and within TTL, otherwise null.
 * Stale entries are not evicted here; they fall to LRU eviction on the next set.
 */
export function cacheGet(cache: Map<string, CacheEntry>, key: string, now: number): string | null {
    const cached = cache.get(key);
    if (cached && now - cached.timestamp < CACHE_TTL) {
        return cached.result;
    }
    return null;
}

/**
 * Inserts/refreshes an entry with true-LRU semantics: delete-then-set moves a
 * refreshed key to the insertion-order tail (Map.set on an existing key would
 * keep its original position, making this FIFO). Evicts the oldest entry while
 * size exceeds CACHE_MAX.
 */
export function cacheSet(cache: Map<string, CacheEntry>, key: string, result: string, now: number): void {
    cache.delete(key);
    cache.set(key, { result, timestamp: now });
    while (cache.size > CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) { break; }
        cache.delete(oldest);
    }
}
