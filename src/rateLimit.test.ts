import { describe, it, expect } from 'vitest';
import { computeRateWait } from './rateLimit';

describe('computeRateWait', () => {
    it('disables the floor when rateLimitMs <= 0 (no wait, slot = now)', () => {
        expect(computeRateWait(1000, 0, 0)).toEqual({ wait: 0, reservedTime: 1000 });
        expect(computeRateWait(1000, 500, -5)).toEqual({ wait: 0, reservedTime: 1000 });
    });

    it('waits the remaining floor when the previous call was recent', () => {
        // Floor 200ms, last call at t=1000, now=1100 -> 100ms left to wait.
        const r = computeRateWait(1100, 1000, 200);
        expect(r.wait).toBe(100);
        // Reserved slot is the projected fire time, not "now".
        expect(r.reservedTime).toBe(1100 + 100);
    });

    it('does not wait when elapsed already exceeds the floor', () => {
        const r = computeRateWait(2000, 1000, 200);
        expect(r.wait).toBe(0);
        expect(r.reservedTime).toBe(2000);
    });

    it('treats epoch (lastTime = 0) as ancient history — no wait on first call', () => {
        // The module global starts at 0; a real first call has now in
        // epoch-millis, so elapsed always exceeds the floor -> no wait.
        const r = computeRateWait(5000, 0, 300);
        expect(r.wait).toBe(0);
        expect(r.reservedTime).toBe(5000);
    });

    it('reserves now + wait so concurrent callers space out', () => {
        // Two callers at the same instant must reserve different slots.
        const a = computeRateWait(1000, 800, 200);
        const b = computeRateWait(1000, a.reservedTime, 200);
        // First waits 0 (elapsed == floor), second would wait the full floor
        // against the first caller's reserved slot.
        expect(a.reservedTime).toBe(1000);
        expect(b.wait).toBe(200);
        expect(b.reservedTime).toBe(1200);
    });
});
