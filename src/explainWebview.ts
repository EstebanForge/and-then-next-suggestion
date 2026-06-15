/**
 * Code Explanation webview HTML builder.
 *
 * Pure module (no vscode dependency): the caller resolves local resource URIs
 * (via `webview.asWebviewUri`) and the CSP source, passes them in, and this
 * function produces the HTML. This keeps it fully unit-testable.
 *
 * Syntax highlighting uses Prism.js bundled locally under media/prism/.
 * No CDN, no autoloader, no remote fetches.
 */

// VS Code languageId -> Prism component language name.
export const PRISM_LANG_MAP: Record<string, string> = {
    typescript: 'typescript', typescriptreact: 'tsx', tsx: 'tsx',
    javascript: 'javascript', javascriptreact: 'jsx',
    python: 'python', rust: 'rust', go: 'go', java: 'java',
    c: 'c', cpp: 'cpp',
    php: 'php', ruby: 'ruby', json: 'json', markdown: 'markdown',
    css: 'css', scss: 'scss', less: 'less', yaml: 'yaml',
    bash: 'bash', shellscript: 'bash', sh: 'bash', powershell: 'powershell',
    sql: 'sql', html: 'markup', xml: 'markup',
    swift: 'swift', kotlin: 'kotlin', scala: 'scala', lua: 'lua', dart: 'dart'
};

// Prism component dependency graph: language -> ordered prerequisite languages.
// Keys are languages we bundle. Unknown languages fall back to 'clike'.
// Dependency order matters: a language must load after its prerequisites.
export const PRISM_DEPS: Record<string, string[]> = {
    clike: [], markup: [], css: [], json: [], yaml: [], python: [], go: [],
    rust: [], bash: [], sql: [], swift: [], kotlin: [], scala: [], lua: [],
    dart: [], ruby: [], c: [], powershell: [],
    javascript: ['clike'],
    typescript: ['javascript'],
    jsx: ['javascript', 'clike'],
    tsx: ['typescript', 'jsx'],
    java: ['clike'],
    cpp: ['c'],
    php: ['clike'],
    scss: ['css'],
    less: ['css'],
    markdown: ['markup']
};

/**
 * Resolves a VS Code languageId to a Prism language name, or null if unknown
 * (caller falls back to 'clike').
 */
export function prismLanguageId(languageId: string): string | null {
    return PRISM_LANG_MAP[languageId] ?? null;
}

/**
 * Returns the ordered, deduplicated list of Prism component filenames
 * (e.g. ['prism-clike.min.js', 'prism-javascript.min.js']) that must be loaded
 * to highlight the given Prism language, dependencies first. Unknown languages
 * resolve to the 'clike' base.
 */
export function prismComponentFiles(prismLang: string): string[] {
    const lang = (prismLang in PRISM_DEPS) ? prismLang : 'clike';
    const ordered: string[] = [];
    const seen = new Set<string>();
    // Post-order DFS: each language loads only after all of its (transitive)
    // prerequisites, which Prism component files require to extend safely.
    const visit = (l: string): void => {
        if (seen.has(l)) { return; }
        seen.add(l);
        for (const dep of (PRISM_DEPS[l] ?? [])) {
            visit(dep);
        }
        ordered.push(`prism-${l}.min.js`);
    };
    visit(lang);
    return ordered;
}

function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export interface ExplainWebviewOpts {
    code: string;
    explanation: string;
    languageId: string;
    isError: boolean;
    /** webview URI of prism-okaidia.min.css */
    styleHref: string;
    /** webview URI of prism-core.min.js */
    coreScriptHref: string;
    /** ordered webview URIs of prism component files for the detected language */
    componentScriptHrefs: string[];
    /** random nonce for inline <script>/<style> CSP */
    nonce: string;
    /** webview.cspSource — the origin local resources are served from */
    cspSource: string;
}

export function buildExplainHtml(opts: ExplainWebviewOpts): string {
    const escapedCode = escapeHtml(opts.code);
    const escapedExplanation = escapeHtml(opts.explanation).replace(/\n/g, '<br>');
    const prismLang = prismLanguageId(opts.languageId) ?? 'clike';

    const componentTags = opts.componentScriptHrefs
        .map(href => `        <script nonce="${opts.nonce}" src="${href}"></script>`)
        .join('\n');

    // CSP: inline scripts/styles gated by nonce; local resources by cspSource.
    // No remote origins, no 'unsafe-inline'.
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'nonce-${opts.nonce}' ${opts.cspSource}; script-src 'nonce-${opts.nonce}' ${opts.cspSource};">
<link rel="stylesheet" href="${opts.styleHref}">
<title>Code Explanation</title>
<style nonce="${opts.nonce}">
    body {
        font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
        font-size: var(--vscode-editor-font-size, 14px);
        color: var(--vscode-editor-foreground);
        background-color: var(--vscode-editor-background);
        padding: 1.2rem;
        line-height: 1.6;
        margin: 0;
    }
    h2 { margin-top: 0; color: var(--vscode-titleBar-activeForeground); }
    h3 {
        margin-bottom: 0.4rem; margin-top: 0;
        color: var(--vscode-descriptionForeground);
        font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.05em;
    }
    pre {
        background-color: var(--vscode-textBlockQuote-background);
        padding: 1rem; border-radius: 6px; overflow-x: auto;
        font-family: var(--vscode-editor-font-family, monospace);
        border: 1px solid var(--vscode-panel-border, transparent);
        margin: 0;
    }
    pre code { background: none; padding: 0; font-size: inherit; }
    .explanation {
        margin-top: 1.5rem; padding: 1rem;
        background-color: var(--vscode-textBlockQuote-background);
        border-left: 3px solid var(--vscode-textLink-foreground);
        border-radius: 4px; white-space: normal;
    }
    .explanation.error {
        border-left-color: var(--vscode-errorForeground);
        color: var(--vscode-errorForeground);
    }
</style>
</head>
<body>
<h2>Code Explanation</h2>
<h3>Selected Code (${escapeHtml(opts.languageId)})</h3>
<pre><code class="language-${prismLang}">${escapedCode}</code></pre>
<div class="explanation${opts.isError ? ' error' : ''}">
    <h3>Explanation</h3>
    <p>${escapedExplanation}</p>
</div>
        <script nonce="${opts.nonce}" src="${opts.coreScriptHref}"></script>
${componentTags}
        <script nonce="${opts.nonce}">self.Prism = self.Prism || {}; Prism.manual = true; Prism.highlightAll();</script>
</body>
</html>`;
}
