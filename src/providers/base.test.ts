import { describe, it, expect } from 'vitest';
import { sanitize, stripThinking } from './base';
import { CompletionContext } from './types';

describe('stripThinking', () => {
    it('removes <thinking> blocks', () => {
        expect(stripThinking('<thinking>x</thinking>code')).toBe('code');
    });

    it('removes <think blocks with missing closing bracket (DeepSeek)', () => {
        expect(stripThinking('<think\nreason\n</think\nreal code')).toBe('real code');
    });

    it('leaves content unchanged when no thinking block present', () => {
        expect(stripThinking('return a + b;')).toBe('return a + b;');
    });
});

describe('sanitize', () => {
    const baseCtx = (textBefore = '', textAfter = ''): CompletionContext => ({
        textBefore, textAfter,
        languageId: 'typescript', fileExtension: '.ts',
        maxTokens: 500, temperature: 0.1
    });

    it('returns null for empty content', () => {
        expect(sanitize('', baseCtx())).toBeNull();
    });

    it('returns null for conversational prefixes', () => {
        expect(sanitize('Here is the code: x = 1', baseCtx())).toBeNull();
        expect(sanitize('Sure, I can help', baseCtx())).toBeNull();
    });

    it('strips prefix overlap from textBefore', () => {
        const ctx = baseCtx('$current_slug = str_replace(');
        expect(sanitize('$current_slug = str_replace(\'-\', \' \', $current_slug)', ctx))
            .toBe('\'-\', \' \', $current_slug)');
    });

    it('strips suffix overlap from textAfter', () => {
        const ctx = baseCtx('echo ', '");');
        expect(sanitize('"hello");', ctx)).toBe('"hello');
    });

    it('strips both prefix and suffix overlap', () => {
        const ctx = baseCtx('foo(', ')');
        expect(sanitize('foo(bar)', ctx)).toBe('bar');
    });

    it('caps the overlap scan at MAX_OVERLAP (300) — long verbatim repeat is still stripped up to the cap', () => {
        // A 600-char overlap is well past MAX_OVERLAP. The cap means the scanner
        // only considers the last 300 chars of textBefore. It should still find
        // and strip those 300 chars (the function must not return the full 600).
        const longOverlap = 'x'.repeat(600);
        const ctx = baseCtx(longOverlap);
        const result = sanitize(longOverlap + 'tail', ctx);
        // Prefix overlap up to 300 chars stripped; the remaining content is the
        // un-scanned prefix portion plus 'tail'.
        expect(result).not.toBe(longOverlap + 'tail');
        expect(result?.endsWith('tail')).toBe(true);
        // The scan did NOT strip all 600 chars (capped at 300).
        expect(result?.length).toBeGreaterThan(300);
    });

    it('still strips a short overlap that sits within the cap', () => {
        const ctx = baseCtx('function add(a, b) {');
        // No textAfter, so the trailing '}' is not suffix-stripped.
        expect(sanitize('function add(a, b) {return a + b;}', ctx)).toBe('return a + b;}');
    });

    it('returns content unchanged when no overlap exists', () => {
        const ctx = baseCtx('const a = ', ';\nconst b = 2;');
        expect(sanitize('42', ctx)).toBe('42');
    });
});
