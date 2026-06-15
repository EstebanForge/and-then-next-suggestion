import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildExplainHtml, prismLanguageId, prismComponentFiles } from './explainWebview';
import { PRISM_LANG_MAP, PRISM_DEPS } from './explainWebview';

const baseOpts = {
    styleHref: 'vscode-resource:/prism-okaidia.min.css',
    coreScriptHref: 'vscode-resource:/prism-core.min.js',
    componentScriptHrefs: ['vscode-resource:/prism-clike.min.js'],
    nonce: 'abc123nonce',
    cspSource: 'vscode-resource:'
};

describe('prismLanguageId', () => {
    it('maps known VS Code languageIds', () => {
        expect(prismLanguageId('typescript')).toBe('typescript');
        expect(prismLanguageId('typescriptreact')).toBe('tsx');
        expect(prismLanguageId('python')).toBe('python');
        expect(prismLanguageId('javascriptreact')).toBe('jsx');
        expect(prismLanguageId('shellscript')).toBe('bash');
        expect(prismLanguageId('html')).toBe('markup');
    });

    it('returns null for unknown languageIds', () => {
        expect(prismLanguageId('clojure')).toBeNull();
        expect(prismLanguageId('')).toBeNull();
    });
});

describe('prismComponentFiles', () => {
    it('lists a single file for dependency-free languages', () => {
        expect(prismComponentFiles('python')).toEqual(['prism-python.min.js']);
        expect(prismComponentFiles('go')).toEqual(['prism-go.min.js']);
        expect(prismComponentFiles('clike')).toEqual(['prism-clike.min.js']);
    });

    it('orders dependencies before the target language', () => {
        expect(prismComponentFiles('javascript')).toEqual(['prism-clike.min.js', 'prism-javascript.min.js']);
        expect(prismComponentFiles('typescript')).toEqual([
            'prism-clike.min.js', 'prism-javascript.min.js', 'prism-typescript.min.js'
        ]);
        expect(prismComponentFiles('cpp')).toEqual(['prism-c.min.js', 'prism-cpp.min.js']);
    });

    it('resolves transitive dependencies (tsx)', () => {
        // tsx -> typescript -> javascript -> clike (post-order DFS)
        expect(prismComponentFiles('tsx')).toEqual([
            'prism-clike.min.js',
            'prism-javascript.min.js',
            'prism-typescript.min.js',
            'prism-jsx.min.js',
            'prism-tsx.min.js'
        ]);
    });

    it('falls back to clike for unknown languages', () => {
        expect(prismComponentFiles('does-not-exist')).toEqual(['prism-clike.min.js']);
    });

    it('deduplicates when a dependency repeats', () => {
        const files = prismComponentFiles('tsx');
        const uniq = new Set(files);
        expect(uniq.size).toBe(files.length);
    });
});

describe('buildExplainHtml', () => {
    it('escapes HTML in code and explanation to prevent XSS', () => {
        const html = buildExplainHtml({
            ...baseOpts,
            code: '<script>alert(1)</script>',
            explanation: '<img src=x onerror=alert(2)>',
            languageId: 'typescript',
            isError: false
        });
        // Angle brackets escaped: tags become inert text, never real elements.
        expect(html).not.toContain('<script>alert(1)</script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).not.toContain('<img ');
        expect(html).toContain('&lt;img');
        // The CSP also blocks inline event handlers regardless.
        const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
        expect(csp).not.toContain('unsafe-inline');
    });

    it('uses nonce-gated CSP with no unsafe-inline and no remote origins', () => {
        const html = buildExplainHtml({
            ...baseOpts,
            code: 'x',
            explanation: 'y',
            languageId: 'python',
            isError: false
        });
        const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
        expect(csp).toContain(`script-src 'nonce-${baseOpts.nonce}' ${baseOpts.cspSource}`);
        expect(csp).toContain(`style-src 'nonce-${baseOpts.nonce}' ${baseOpts.cspSource}`);
        expect(csp).toContain('default-src \'none\'');
        expect(csp).not.toContain('unsafe-inline');
        expect(csp).not.toContain('cdnjs');
    });

    it('tags every inline script and style with the nonce', () => {
        const html = buildExplainHtml({
            ...baseOpts,
            code: 'x',
            explanation: 'y',
            languageId: 'python',
            isError: false
        });
        // Every <script ...> (with or without src) must carry the nonce.
        const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
        expect(scripts.length).toBeGreaterThan(0);
        for (const tag of scripts) {
            expect(tag).toContain(`nonce="${baseOpts.nonce}"`);
        }
        // The <style> block must carry the nonce.
        const styleTag = html.match(/<style\b[^>]*>/)?.[0] ?? '';
        expect(styleTag).toContain(`nonce="${baseOpts.nonce}"`);
    });

    it('loads only the component files needed for the language, in order', () => {
        const componentHrefs = prismComponentFiles('typescript')
            .map(f => `vscode-resource:/${f}`);
        const html = buildExplainHtml({
            ...baseOpts,
            code: 'const x: number = 1;',
            explanation: 'declares a typed const',
            languageId: 'typescript',
            isError: false,
            componentScriptHrefs: componentHrefs
        });
        // core loads first, then deps in order, then inline highlight call.
        const coreIdx = html.indexOf(baseOpts.coreScriptHref);
        const clikeIdx = html.indexOf('prism-clike.min.js');
        const jsIdx = html.indexOf('prism-javascript.min.js');
        const tsIdx = html.indexOf('prism-typescript.min.js');
        expect(coreIdx).toBeLessThan(clikeIdx);
        expect(clikeIdx).toBeLessThan(jsIdx);
        expect(jsIdx).toBeLessThan(tsIdx);
        // Does not pull unrelated components.
        expect(html).not.toContain('prism-python.min.js');
    });

    it('applies the error class only when isError is true', () => {
        const okHtml = buildExplainHtml({
            ...baseOpts, code: 'x', explanation: 'all good', languageId: 'python', isError: false
        });
        const errHtml = buildExplainHtml({
            ...baseOpts, code: 'x', explanation: 'boom', languageId: 'python', isError: true
        });
        expect(okHtml).toContain('class="explanation"');
        expect(errHtml).toContain('class="explanation error"');
    });

    it('does not misclassify an explanation starting with "Error:" as an error', () => {
        // Regression: previously detected via string prefix. Now explicit flag.
        const html = buildExplainHtml({
            ...baseOpts,
            code: 'throw new Error("x")',
            explanation: 'Error: handling in this function is defensive.',
            languageId: 'javascript',
            isError: false
        });
        expect(html).toContain('class="explanation"');
        expect(html).not.toContain('error"');
    });

    it('uses clike language class for unknown languageIds', () => {
        const html = buildExplainHtml({
            ...baseOpts, code: 'x', explanation: 'y', languageId: 'brainfuck', isError: false
        });
        expect(html).toContain('class="language-clike"');
    });
});

/**
 * Packaging integrity: every Prism component file that prismComponentFiles()
 * can reference must actually exist in media/prism/. Regression guard for the
 * round-2 bug where 'powershell' was mapped but prism-powershell.min.js was
 * missing from the bundle.
 */
describe('Prism bundle integrity', () => {
    const prismDir = path.join(__dirname, '..', 'media', 'prism');
    const bundledFiles = new Set(fs.readdirSync(prismDir));

    it('ships prism-core.min.js and the okaidia theme', () => {
        expect(bundledFiles.has('prism-core.min.js')).toBe(true);
        expect(bundledFiles.has('prism-okaidia.min.css')).toBe(true);
    });

    it('ships a component file for every language referenced by any mapping', () => {
        // Collect every Prism component file reachable from any VS Code languageId
        // (prismComponentFiles already resolves transitive deps in filename form).
        const referenced = new Set<string>();
        for (const prismLang of Object.values(PRISM_LANG_MAP)) {
            for (const file of prismComponentFiles(prismLang)) {
                referenced.add(file);
            }
        }
        for (const file of referenced) {
            expect(bundledFiles.has(file), `missing bundled file: ${file}`).toBe(true);
        }
    });

    it('ships every file declared as a dependency in PRISM_DEPS', () => {
        for (const [lang, deps] of Object.entries(PRISM_DEPS)) {
            expect(bundledFiles.has(`prism-${lang}.min.js`), `missing file for ${lang}`).toBe(true);
            for (const dep of deps) {
                expect(bundledFiles.has(`prism-${dep}.min.js`), `missing dep ${dep} of ${lang}`).toBe(true);
            }
        }
    });
});
