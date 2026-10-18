// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests check the text functions of the link extension: the comment
 * syntaxes, the comment scanner, the link finder and the heading lookup.
 * They run on strings only. No editor and no file system is involved.
 */

import { expect, test } from 'vitest';
import {
  commentLinks,
  commentSpans,
  defaultEditor,
  globPattern,
  headingLabel,
  headingLine,
  headings,
  headingSlug,
  headingText,
  linkUnderCursor,
  syntaxes,
} from './links';

/** spansOf returns the comment texts of source text in the given language. */
const spansOf = (language: string, source: string): string[] =>
  commentSpans(source, syntaxes[language]).map((span) => source.slice(span.start, span.end));

test('comment spans cover line and block comments of Go and skip every literal', () => {
  const source = [
    'package x',
    '',
    '// first [a](docs/a.md)',
    'var s = "// not a comment" + `/* raw */` + \'/\' // second',
    '/* block',
    '   [b](docs/b.md) */ var t = 1',
    "var u = '\\'' // third",
  ].join('\n');
  expect(spansOf('go', source)).toStrictEqual([
    '// first [a](docs/a.md)',
    '// second',
    '/* block\n   [b](docs/b.md) */',
    '// third',
  ]);
});

test('comment spans follow the syntax of each listed language', () => {
  expect(spansOf('typescript', 'const u = `http://x/${"//"}` // after template\n/* block */ const v = 1;')).toStrictEqual([
    '// after template',
    '/* block */',
  ]);
  expect(spansOf('yaml', 'url: http://x/#frag # trailing\n# leading\nkey: "a # b" #c\nname: a#b')).toStrictEqual([
    '# trailing',
    '# leading',
    '#c',
  ]);
  expect(spansOf('shellscript', "echo '#x' # note\n#!/bin/sh")).toStrictEqual(['# note', '#!/bin/sh']);
  expect(spansOf('html', '<p>x</p><!-- one\n two --><!-- open')).toStrictEqual(['<!-- one\n two -->', '<!-- open']);
  expect(spansOf('css', "a { color: red; } /* [c](docs/c.md) */ b { content: '/* no */'; }")).toStrictEqual([
    '/* [c](docs/c.md) */',
  ]);
  expect(spansOf('sql', "SELECT '--' -- trailing\n/* block */ SELECT 1;")).toStrictEqual(['-- trailing', '/* block */']);
  expect(spansOf('jsonc', '{ "a": "//x", // note\n "b": 1 /* block */ }')).toStrictEqual(['// note', '/* block */']);
  expect(spansOf('properties', 'key=value ; note\n# leading\nurl=http://x#y')).toStrictEqual(['; note', '# leading']);
  expect(spansOf('dockerfile', "# base\nFROM x\nRUN echo '#' # tail")).toStrictEqual(['# base', '# tail']);
  expect('markdown' in syntaxes).toBe(false);
});

test('comment links keep relative targets and report the exact label text', () => {
  const source = [
    '// Assures: [A-UNIT-001](docs/architecture/3-design/unit.md#a-unit-001)',
    '// See [web](https://example.test/x), [root](/etc/hosts), [here](#local) and [text](README.md).',
    'var s = "[in a string](docs/ignored.md)"',
  ].join('\n');
  const links = commentLinks(source, syntaxes.go);
  expect(
    links.map((link) => ({
      path: link.path,
      fragment: link.fragment,
      text: source.slice(link.start, link.end),
      whole: source.slice(link.open, link.close),
    })),
  ).toStrictEqual([
    {
      path: 'docs/architecture/3-design/unit.md',
      fragment: 'a-unit-001',
      text: 'A-UNIT-001',
      whole: '[A-UNIT-001](docs/architecture/3-design/unit.md#a-unit-001)',
    },
    { path: 'README.md', fragment: '', text: 'text', whole: '[text](README.md)' },
  ]);
  const yaml = '# The rule: [A-DEVOPS-002](docs/architecture/5-operations/devops.md#a-devops-002)\nkey: value\n';
  expect(commentLinks(yaml, syntaxes.yaml).map((link) => yaml.slice(link.start, link.end))).toStrictEqual([
    'A-DEVOPS-002',
  ]);
});

test('heading lookup matches the anchor of a heading outside fenced code', () => {
  const markdown = [
    '# Unit',
    '',
    '```text',
    '#### A-UNIT-001',
    '```',
    '',
    '~~~',
    '```',
    '#### A-UNIT-002',
    '~~~',
    '',
    '    #### A-UNIT-003',
    '',
    '#### A-UNIT-001',
    '',
    'Rule text.',
    '',
    '## Verification and status',
  ].join('\n');
  expect(headingSlug('Verification and status')).toBe('verification-and-status');
  expect(headingLine(markdown, 'a-unit-001')).toBe(14);
  expect(headingLine(markdown, 'A-UNIT-001')).toBe(14);
  expect(headingLine(markdown, 'a-unit-002')).toBe(0);
  expect(headingLine(markdown, 'a-unit-003')).toBe(0);
  expect(headingLine(markdown, 'verification-and-status')).toBe(18);
  expect(headingLine(markdown, 'missing')).toBe(0);
});

test('the headings of a document carry their line, anchor and text outside fenced code', () => {
  expect(headings('# Unit\n\n```\n## no\n```\n\n#### A-UNIT-001 ##\n')).toStrictEqual([
    { line: 1, slug: 'unit', text: 'Unit' },
    { line: 7, slug: 'a-unit-001', text: 'A-UNIT-001' },
  ]);
});

test('a link being written is found in a comment only and only for a local relative target', () => {
  const source = [
    'package x',
    '// see [x](docs/arch',
    'var s = "[y](docs/"',
    '// [z](docs/a.md#a-uni',
    '// [w](https://x/',
    '// [v](/etc/',
    '// [](docs/b.md#',
  ].join('\n');
  const at = (needle: string): number => source.indexOf(needle) + needle.length;
  expect(linkUnderCursor(source, at('docs/arch'), syntaxes.go)).toStrictEqual({
    start: source.indexOf('docs/arch'),
    path: 'docs/arch',
    fragment: undefined,
    labelStart: source.indexOf('x]'),
    label: 'x',
  });
  expect(linkUnderCursor(source, at('"[y](docs/'), syntaxes.go)).toBe(undefined);
  expect(linkUnderCursor(source, at('a.md#a-uni'), syntaxes.go)).toStrictEqual({
    start: source.indexOf('docs/a.md'),
    path: 'docs/a.md',
    fragment: 'a-uni',
    labelStart: source.indexOf('z]'),
    label: 'z',
  });
  expect(linkUnderCursor(source, at('b.md#'), syntaxes.go)).toStrictEqual({
    start: source.indexOf('docs/b.md'),
    path: 'docs/b.md',
    fragment: '',
    labelStart: source.indexOf('[](') + 1,
    label: '',
  });
  expect(linkUnderCursor(source, at('https://x/'), syntaxes.go)).toBe(undefined);
  expect(linkUnderCursor(source, at('/etc/'), syntaxes.go)).toBe(undefined);
  expect(linkUnderCursor(source, 5, syntaxes.go)).toBe(undefined);
});

test('the label from a heading keeps letters, digits and simple punctuation and never ends a comment or a string', () => {
  expect(headingLabel('R-ORDER-003')).toBe('R-ORDER-003');
  expect(headingLabel('Größe und Maße (Teil 4), Kunde & Shop: 100% #12')).toBe('Größe und Maße (Teil 4), Kunde Shop: 100 12');
  expect(headingLabel('  [Draft]   order  `total` **now** ')).toBe('Draft order total now');
  expect(headingLabel('[]')).toBe(undefined);
  expect(headingLabel('\t')).toBe(undefined);
  expect(headingLabel('Ends */ here, opens /* there')).toBe('Ends / here, opens / there');
  expect(headingLabel('Ends --> <script>x</script>')).toBe('Ends - script x /script');
  expect(headingLabel('Ends --!> here')).toBe('Ends - here');
  expect(headingLabel('CLI --help')).toBe('CLI -help');
  expect(headingLabel('Limits\u0085debug: true\u2028x\fy')).toBe('Limits debug: true x y');
  expect(headingLabel('Admin\u202e\u2066 rights\u200b')).toBe('Admin rights');
  expect(headingLabel('Run $(cmd), `cmd` and a\\b')).toBe('Run (cmd), cmd and a b');
  expect(headingLabel("Notes'; touch x; : '\"")).toBe('Notes touch x :');
  expect(headingLabel('Runtime @jsxImportSource x, audit #__PURE__')).toBe('Runtime jsxImportSource x, audit __PURE__');
  expect(headingLabel('Order\ufe0f\u034fx\u{e0100}')).toBe('Order x');
  expect(headingLabel('\u3164')).toBe(undefined);
  expect(headingLabel('\u0301 -')).toBe(undefined);
});

test('the default editor of a resource follows the editor associations as the editor matches them', () => {
  expect(globPattern('*.md').test('readme.md')).toBe(true);
  expect(globPattern('*.md').test('a/readme.md')).toBe(false);
  expect(globPattern('**/docs/*.{md,txt}').test('file:/a/docs/x.txt')).toBe(true);
  expect(defaultEditor({ '*.md': 'vscode.markdown.editor' }, 'file', '/a/b/X.MD')).toBe('vscode.markdown.editor');
  expect(defaultEditor({ '*.md': 'default' }, 'file', '/a/b/x.md')).toBe('');
  expect(defaultEditor({ '**/docs/*.md': 'vscode.markdown.preview.editor' }, 'file', '/a/docs/x.md')).toBe(
    'vscode.markdown.preview.editor',
  );
  expect(defaultEditor({ '*.txt': 'e' }, 'file', '/a/x.md')).toBe('');
  expect(defaultEditor(undefined, 'file', '/a/x.md')).toBe('');
});

test('a label holds no bracket and a target no parenthesis, as in Markdown', () => {
  const source = '// [a[b](docs/b.md) [c](docs/c(1).md) [d](docs/d.md)';
  expect(commentLinks(source, syntaxes.go).map((link) => [source.slice(link.start, link.end), link.path])).toStrictEqual([
    ['b', 'docs/b.md'],
    ['d', 'docs/d.md'],
  ]);
});

test('the text of a heading line drops the number signs and the white space at its ends', () => {
  const cases: [string, string | undefined][] = [
    ['# Title', 'Title'],
    ['   ### Title ##   ', 'Title'],
    ['## A-UNIT-001 #', 'A-UNIT-001'],
    ['# C#', 'C'],
    ['#\tTabbed\t#\t', 'Tabbed'],
    ['# Title\r', 'Title'],
    ['# ##', '#'],
    ['# a # b', 'a # b'],
    ['#Title', undefined],
    ['    # Indented', undefined],
    ['####### Seven', undefined],
    ['# ', undefined],
    ['#   ', undefined],
    ['# a\rb', undefined],
    ['text # no', undefined],
  ];
  for (const [line, text] of cases) expect(headingText(line), JSON.stringify(line)).toBe(text);
  // The reference: the short regular expression of a heading line gives the same text for every heading with text. It
  // backtracks on long lines, so headingText scans the end of the line without it.
  const reference = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/;
  for (const [line, text] of cases) {
    if (text !== undefined) expect(reference.exec(line)?.[1], JSON.stringify(line)).toBe(text);
  }
});

test('long lines take linear time: thousands of brackets, parentheses and spaces', () => {
  const within = (limit: number, run: () => unknown): void => {
    const started = performance.now();
    run();
    expect(performance.now() - started).toBeLessThan(limit);
  };
  // With patterns that backtrack, each of these takes between 0.3 and 5 seconds.
  within(100, () => commentLinks(`// ${'['.repeat(20_000)}`, syntaxes.go));
  within(100, () => commentLinks(`// ${'[a]('.repeat(5_000)}`, syntaxes.go));
  within(100, () => commentLinks(`// [a](${'('.repeat(20_000)}`, syntaxes.go));
  within(100, () => linkUnderCursor(`// ${'['.repeat(20_000)}`, 20_003, syntaxes.go));
  within(100, () => headingLine(`# a${' '.repeat(4_000)}x\n`, 'a'));
  within(100, () => headings(`# a${' '.repeat(4_000)}x\n## ${'#'.repeat(4_000)} ${' '.repeat(4_000)}\n`));
});

test('an editor association whose pattern forms no valid expression is skipped', () => {
  expect(defaultEditor({ '{*.md': 'broken', '*.md': 'vscode.markdown.editor' }, 'file', '/a/x.md')).toBe('vscode.markdown.editor');
  expect(defaultEditor({ '*.md}': 'broken' }, 'file', '/a/x.md')).toBe('');
});
