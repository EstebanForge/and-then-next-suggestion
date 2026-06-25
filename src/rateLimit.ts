/**
 * Pure rate-limit math (no vscode dependency).
 *
 * The caller owns the monotonic "last call time" and reads the configured
 * floor from vscode; this function computes the wait and the slot to reserve,
 * so the concurrent-caller race can be unit-tested in isolation.
 */

export interface RateWait {
    /** Milliseconds the caller should sleep before firing. */
    wait: number;
    /** Value the caller should record as the new "last call time". */
    reservedTime: number;
}

/**
 * Computes the wait required to honour a global rate-limit floor, and the
 * projected fire time to reserve synchronously (before any await) so concurrent
 * callers space out rather than racing past the check together.
 *
 * - rateLimitMs <= 0: floor disabled, no wait, slot = now.
 * - elapsed >= floor: no wait, slot = now.
 * - elapsed <  floor: wait = floor - elapsed, slot = now + wait.
 */
export function computeRateWait(now: number, lastTime: number, rateLimitMs: number): RateWait {
    if (rateLimitMs <= 0) {
        return { wait: 0, reservedTime: now };
    }
    const elapsed = now - lastTime;
    const wait = Math.max(0, rateLimitMs - elapsed);
    return { wait, reservedTime: now + wait };
}
