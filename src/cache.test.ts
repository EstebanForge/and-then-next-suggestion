import { describe, it, expect } from 'vitest';
import {
    CACHE_MAX,
    CACHE_TTL,
    CacheEntry,
    buildCacheKey,
    cacheGet,
    cacheSet,
} from './cache';

const newCache = (): Map<string, CacheEntry> => new Map();

describe('buildCacheKey', () => {
    it('produces identical keys for identical inputs', () => {
        expect(buildCacheKey('p1', 'before', 'after'))
            .toBe(buildCacheKey('p1', 'before', 'after'));
    });

    it('differs across profiles', () => {
        expect(buildCacheKey('p1', 'b', 'a'))
            .not.toBe(buildCacheKey('p2', 'b', 'a'));
    });

    it('does not collide when fields merely concatenate to the same string (NUL delimiter)', () => {
        // Without a delimiter, ('ab', 'c') and ('a', 'bc') would be ambiguous.
        expect(buildCacheKey('p', 'ab', 'c')).not.toBe(buildCacheKey('p', 'a', 'bc'));
    });
});

describe('cacheGet', () => {
    it('returns null on a miss', () => {
        expect(cacheGet(newCache(), 'missing', 1000)).toBeNull();
    });

    it('returns the stored result within TTL', () => {
        const cache = newCache();
        cacheSet(cache, 'k', 'suggestion', 1000);
        expect(cacheGet(cache, 'k', 1000 + CACHE_TTL - 1)).toBe('suggestion');
    });

    it('returns null once TTL expires', () => {
        const cache = newCache();
        cacheSet(cache, 'k', 'suggestion', 1000);
        expect(cacheGet(cache, 'k', 1000 + CACHE_TTL)).toBeNull();
    });

    it('reflects the latest write to the same key', () => {
        const cache = newCache();
        cacheSet(cache, 'k', 'old', 1000);
        cacheSet(cache, 'k', 'new', 2000);
        expect(cacheGet(cache, 'k', 2000)).toBe('new');
    });
});

describe('cacheSet LRU eviction', () => {
    it('evicts the oldest entry when CACHE_MAX is exceeded', () => {
        const cache = newCache();
        // Fill exactly to capacity.
        for (let i = 0; i < CACHE_MAX; i++) {
            cacheSet(cache, `k${i}`, `v${i}`, i);
        }
        expect(cache.size).toBe(CACHE_MAX);
        // Insert one more: oldest (k0) must be evicted.
        cacheSet(cache, 'k_new', 'v_new', CACHE_MAX);
        expect(cache.size).toBe(CACHE_MAX);
        expect(cache.has('k0')).toBe(false);
        expect(cache.has('k_new')).toBe(true);
        expect(cache.has(`k${CACHE_MAX - 1}`)).toBe(true);
    });

    it('refreshing a key moves it to the LRU tail (not FIFO)', () => {
        const cache = newCache();
        cacheSet(cache, 'keep', 'v', 1);
        for (let i = 1; i < CACHE_MAX; i++) {
            cacheSet(cache, `k${i}`, `v${i}`, i + 1);
        }
        // Now 'keep' is oldest by insertion. Touch it to refresh recency.
        cacheSet(cache, 'keep', 'v-refreshed', 9999);
        // Insert one more: the NEW oldest (k1) should evict, not 'keep'.
        cacheSet(cache, 'overflow', 'v', 10000);
        expect(cache.has('keep')).toBe(true);
        expect(cache.has('k1')).toBe(false);
    });

    it('never exceeds CACHE_MAX regardless of churn', () => {
        const cache = newCache();
        for (let i = 0; i < CACHE_MAX * 5; i++) {
            cacheSet(cache, `k${i}`, `v${i}`, i);
        }
        expect(cache.size).toBe(CACHE_MAX);
    });
});
