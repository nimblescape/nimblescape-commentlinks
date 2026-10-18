// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * Find the Markdown links inside the comments of a source or configuration
 * file and locate the heading that a link fragment names in a Markdown
 * document. These functions read text only. They touch no editor API and no
 * file system, so the extension module can resolve the link targets and the
 * tests can run without an editor.
 */

/** StringForm describes one string literal form of a language. */
export interface StringForm {
  /** The quote character. */
  mark: string;
  /** Whether a backslash escapes the next character. */
  escapes: boolean;
  /** Whether the literal may span lines. */
  multiline: boolean;
}

/**
 * CommentSyntax is the comment syntax of a language: the markers that start a
 * line comment, the pairs that delimit a block comment and the string
 * literals that the scanner skips.
 */
export interface CommentSyntax {
  line: string[];
  block: [open: string, close: string][];
  strings: StringForm[];
}

/** Span is the offset range of one comment. */
export interface Span {
  start: number;
  end: number;
}

/**
 * CommentLink is one Markdown link in a comment: the offsets of the label
 * text, the offsets of the whole link from its opening bracket to its closing
 * parenthesis, the path part of the target and the fragment without its
 * number sign.
 */
export interface CommentLink {
  start: number;
  end: number;
  open: number;
  close: number;
  path: string;
  fragment: string;
}

/** Heading is one heading of a Markdown document: its one-based line, its anchor and its text. */
export interface Heading {
  line: number;
  slug: string;
  text: string;
}

/**
 * TargetBeingWritten is the target of a link that is being written: the
 * offset where the target starts and the text of the target before the
 * cursor, split into the path part and the fragment part, and the label of
 * the link with the offset where the label starts.
 */
export interface TargetBeingWritten {
  start: number;
  path: string;
  fragment: string | undefined;
  labelStart: number;
  label: string;
}

/**
 * quote describes one string literal form of a language.
 * @param mark - The quote character.
 * @param escapes - Whether a backslash escapes the next character.
 * @param multiline - Whether the literal may span lines.
 */
const quote = (mark: string, escapes: boolean, multiline = false): StringForm => ({ mark, escapes, multiline });

/** cLike is the comment syntax of the languages with C-style comments and template strings. */
const cLike: CommentSyntax = {
  line: ['//'],
  block: [['/*', '*/']],
  strings: [quote('"', true), quote("'", true), quote('`', true, true)],
};

/** jsonLike is the comment syntax of JSON documents that allow comments. */
const jsonLike: CommentSyntax = { line: ['//'], block: [['/*', '*/']], strings: [quote('"', true)] };

/** styleLike is the comment syntax of style sheets with line comments. */
const styleLike: CommentSyntax = { line: ['//'], block: [['/*', '*/']], strings: [quote('"', true), quote("'", true)] };

/** markup is the comment syntax of markup documents. */
const markup: CommentSyntax = { line: [], block: [['<!--', '-->']], strings: [] };

/** hash is the comment syntax of the languages whose comments start with a number sign. */
const hash: CommentSyntax = { line: ['#'], block: [], strings: [quote('"', true), quote("'", false)] };

/**
 * syntaxes maps the language identifier of the editor to the comment syntax of
 * that language: the markers that start a line comment, the pairs that
 * delimit a block comment and the string literals that the scanner skips. A
 * number sign or a semicolon starts a line comment only at the start of a
 * line or after white space, so that a fragment inside a plain value is no
 * comment. Markdown is absent on purpose: the editor handles its links.
 */
export const syntaxes: Record<string, CommentSyntax> = {
  go: { line: ['//'], block: [['/*', '*/']], strings: [quote('"', true), quote("'", true), quote('`', false, true)] },
  'go.mod': { line: ['//'], block: [], strings: [quote('"', true), quote('`', false, true)] },
  javascript: cLike,
  javascriptreact: cLike,
  typescript: cLike,
  typescriptreact: cLike,
  json: jsonLike,
  jsonc: jsonLike,
  css: { line: [], block: [['/*', '*/']], strings: [quote('"', true), quote("'", true)] },
  scss: styleLike,
  less: styleLike,
  html: markup,
  xml: markup,
  yaml: hash,
  'github-actions-workflow': hash,
  shellscript: hash,
  dockerfile: hash,
  ignore: hash,
  makefile: hash,
  toml: hash,
  properties: { line: ['#', ';'], block: [], strings: [] },
  ini: { line: ['#', ';'], block: [], strings: [] },
  sql: { line: ['--'], block: [['/*', '*/']], strings: [quote("'", false, true), quote('"', false, true)] },
};

/**
 * startsLineComment reports whether a line comment marker starts at the
 * offset. A single-character marker counts only at the start of the text, at
 * the start of a line or after white space.
 * @param text - Complete source text.
 * @param offset - The offset to test.
 * @param marker - The line comment marker.
 * @returns Whether a line comment starts at the offset.
 */
function startsLineComment(text: string, offset: number, marker: string): boolean {
  if (!text.startsWith(marker, offset)) return false;
  if (marker.length > 1 || offset === 0) return true;
  return /\s/.test(text[offset - 1]);
}

/**
 * commentSpans returns the offset ranges of every comment in source text of
 * the given syntax, in document order. A small scanner skips the string
 * literals of the syntax, so that a comment marker inside a literal starts no
 * comment. An unterminated block comment runs to the end of the text.
 * @param text - Complete source text.
 * @param syntax - The comment syntax of the language.
 * @returns Comment ranges as offsets.
 */
export function commentSpans(text: string, syntax: CommentSyntax): Span[] {
  const spans: Span[] = [];
  let i = 0;
  while (i < text.length) {
    if (syntax.line.some((marker) => startsLineComment(text, i, marker))) {
      let end = text.indexOf('\n', i);
      if (end === -1) end = text.length;
      spans.push({ start: i, end });
      i = end;
      continue;
    }
    const block = syntax.block.find(([open]) => text.startsWith(open, i));
    if (block) {
      let end = text.indexOf(block[1], i + block[0].length);
      end = end === -1 ? text.length : end + block[1].length;
      spans.push({ start: i, end });
      i = end;
      continue;
    }
    const literal = syntax.strings.find((form) => text[i] === form.mark);
    if (literal) {
      i = skipLiteral(text, i, literal);
      continue;
    }
    i++;
  }
  return spans;
}

/**
 * skipLiteral returns the offset after a string literal that starts at the
 * given offset. A backslash escapes the next character when the form allows
 * escapes. A literal of a single-line form ends at the end of its line when
 * it is not terminated. An unterminated multiline literal runs to the end of
 * the text.
 * @param text - Complete source text.
 * @param start - Offset of the opening quote.
 * @param form - The string literal form.
 * @returns The offset after the literal.
 */
function skipLiteral(text: string, start: number, form: StringForm): number {
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (form.escapes && c === '\\') {
      i += 2;
      continue;
    }
    if (c === form.mark) return i + 1;
    if (c === '\n' && !form.multiline) return i;
    i++;
  }
  return text.length;
}

/**
 * linkPattern matches one Markdown link with a non-empty label and target. The
 * label holds no bracket and the target no parenthesis, so that each attempt
 * stops at the next bracket or parenthesis: a line of thousands of brackets
 * takes linear time. A label with a nested bracket is no link, as in
 * Markdown, where `[a[b](t)` links only `b`.
 */
const linkPattern = /\[([^[\]\n]+)\]\(([^()\s]+)\)/g;

/** schemePattern matches a target that starts with a URI scheme, such as https:. */
const schemePattern = /^[a-z][a-z0-9+.-]*:/i;

/**
 * commentLinks returns every Markdown link inside the comments of source text
 * of the given syntax whose target is a relative path, in document order. A
 * target with a scheme, an absolute path or a bare fragment is skipped. Each
 * result carries the offsets of the label text, the offsets of the whole
 * link from its opening bracket to its closing parenthesis, the path part of
 * the target and the fragment without its number sign. The editor link sits
 * on the label, as in rendered Markdown: the Go language server links the
 * file name of the target as a web address, and the editor keeps only the
 * later registered of two links that overlap, so a link on the target would
 * disappear behind that one.
 * @param text - Complete source text.
 * @param syntax - The comment syntax of the language.
 * @returns The links.
 */
export function commentLinks(text: string, syntax: CommentSyntax): CommentLink[] {
  const links: CommentLink[] = [];
  for (const span of commentSpans(text, syntax)) {
    const comment = text.slice(span.start, span.end);
    linkPattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = linkPattern.exec(comment)) !== null) {
      const target = match[2];
      if (schemePattern.test(target) || target.startsWith('/') || target.startsWith('#')) continue;
      const hashIndex = target.indexOf('#');
      const labelStart = span.start + match.index + 1;
      links.push({
        start: labelStart,
        end: labelStart + match[1].length,
        open: span.start + match.index,
        close: span.start + match.index + match[0].length,
        path: hashIndex === -1 ? target : target.slice(0, hashIndex),
        fragment: hashIndex === -1 ? '' : target.slice(hashIndex + 1),
      });
    }
  }
  return links;
}

/**
 * headingSlug returns the anchor of a Markdown heading text the way common
 * Markdown renderers form it: lower case, punctuation removed, spaces turned
 * into hyphens.
 * @param heading - Heading text without its number signs.
 * @returns The anchor.
 */
export function headingSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

/** fencePattern matches the opening or closing line of a fenced code block. */
const fencePattern = /^ {0,3}(`{3,}|~{3,})/;

/** headingStart matches the start of a heading line: up to three spaces, one to six number signs and white space. */
const headingStart = /^ {0,3}#{1,6}\s+/;

/**
 * headingText returns the text of a heading line without its number signs
 * and without the number signs and the white space at its end, or undefined
 * when the line is no heading. A text that consists of number signs keeps its
 * first one. The end of the line is scanned without a regular expression, so
 * that a line with thousands of spaces takes linear time.
 * @param line - One line of a Markdown document.
 * @returns The heading text, or undefined.
 */
export function headingText(line: string): string | undefined {
  const start = headingStart.exec(line);
  if (!start) return undefined;
  const text = line.slice(start[0].length);
  let end = text.length;
  while (end > 1 && /\s/.test(text[end - 1])) end--;
  while (end > 1 && text[end - 1] === '#') end--;
  while (end > 1 && /\s/.test(text[end - 1])) end--;
  const heading = text.slice(0, end);
  // A heading without text has no anchor, and a line break inside the text ends the line, so neither is a heading.
  return heading.trim() === '' || /[\r\u2028\u2029]/.test(heading) ? undefined : heading;
}

/**
 * headingLine returns the one-based line of the first heading of a Markdown
 * document whose anchor equals the fragment, or zero when no heading matches.
 * Headings inside fenced code blocks are ignored. A fence closes only with a
 * fence of the same character that is at least as long, as Markdown defines
 * it, so that a backtick line inside a tilde block hides no later heading.
 * @param markdown - Complete Markdown text.
 * @param fragment - The anchor without its number sign.
 * @returns The line number, or zero.
 */
export function headingLine(markdown: string, fragment: string): number {
  const wanted = fragment.toLowerCase();
  let fence = '';
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opening = fencePattern.exec(line);
    if (fence) {
      if (opening && opening[1][0] === fence[0] && opening[1].length >= fence.length && /^ {0,3}(`{3,}|~{3,})\s*$/.test(line)) {
        fence = '';
      }
      continue;
    }
    if (opening) {
      fence = opening[1];
      continue;
    }
    const text = headingText(line);
    if (text !== undefined && headingSlug(text) === wanted) return i + 1;
  }
  return 0;
}

/**
 * globPattern turns a glob of the editor associations of the editor into a
 * regular expression over a lower-case target: `**` matches across slashes,
 * `*` and `?` match within a segment, and a brace group lists alternatives.
 * The editor matches a pattern without a slash against the file name and a
 * pattern with a slash against the scheme and the path, both in lower case.
 * @param glob - The glob pattern.
 * @returns The anchored expression.
 */
export function globPattern(glob: string): RegExp {
  let source = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      source += '.*';
      i++;
    } else if (c === '*') {
      source += '[^/]*';
    } else if (c === '?') {
      source += '[^/]';
    } else if (c === '{') {
      source += '(?:';
    } else if (c === '}') {
      source += ')';
    } else if (c === ',') {
      source += '|';
    } else if ('\\^$+.()|[]'.includes(c)) {
      source += '\\' + c;
    } else {
      source += c;
    }
  }
  return new RegExp(source + '$');
}

/**
 * defaultEditor returns the editor that the associations of the editor select
 * for a resource, as the associations of the setting name it, or an empty
 * string for the text editor. The first association whose pattern matches
 * wins, as in the editor. The value `default` names the text editor.
 * @param associations - The editor associations of the setting. A value that is no string, and a pattern that forms no
 *   valid expression, are skipped.
 * @param scheme - The scheme of the resource.
 * @param path - The path of the resource.
 * @returns The identifier of the editor, or an empty string for the text editor.
 */
export function defaultEditor(associations: Record<string, unknown> | undefined, scheme: string, path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  const full = `${scheme}:${path}`.toLowerCase();
  for (const [pattern, editor] of Object.entries(associations ?? {})) {
    if (typeof editor !== 'string') continue;
    let glob: RegExp;
    try {
      glob = globPattern(pattern.toLowerCase());
    } catch {
      // A pattern that forms no valid expression, such as one with an open brace, matches nothing.
      continue;
    }
    if (glob.test(pattern.includes('/') ? full : name)) {
      return editor === 'default' ? '' : editor;
    }
  }
  return '';
}

/**
 * headings returns every heading of a Markdown document outside fenced code
 * blocks, in document order, with its one-based line, its anchor and its
 * text, under the same fence rules as headingLine.
 * @param markdown - Complete Markdown text.
 * @returns The headings.
 */
export function headings(markdown: string): Heading[] {
  const found: Heading[] = [];
  let fence = '';
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opening = fencePattern.exec(line);
    if (fence) {
      if (opening && opening[1][0] === fence[0] && opening[1].length >= fence.length && /^ {0,3}(`{3,}|~{3,})\s*$/.test(line)) {
        fence = '';
      }
      continue;
    }
    if (opening) {
      fence = opening[1];
      continue;
    }
    const text = headingText(line);
    if (text !== undefined) found.push({ line: i + 1, slug: headingSlug(text), text: text.trim() });
  }
  return found;
}

/**
 * labelOthers matches a run of characters that a label from a heading does
 * not keep: all but letters, combining marks, digits, the space and the
 * characters . , ( ) _ / + -. Without * and > no label ends a block
 * comment or opens one, without brackets no label ends the label, without
 * quotes no label ends a string that the scanner takes for a comment,
 * without $, backticks and backslashes no label holds a character that a
 * shell expands, and without #, @ and : no label forms a comment that a tool
 * reads, such as #__PURE__, @ts-ignore or a modeline of Vim (vim: set …).
 * Line breaks, other white space and
 * format characters, such as the controls of the text direction, do not
 * remain either.
 */
const labelOthers = /[^\p{L}\p{M}\p{N} .,()_\/+-]+/gu;

/**
 * invisible matches a run of characters that show nothing, such as variation
 * selectors and fillers, which labelOthers would keep as letters or marks.
 */
const invisible = /\p{Default_Ignorable_Code_Point}+/gu;

/**
 * headingLabel returns the label that a link being written with an empty
 * label takes from the heading that its completion chooses: the text of the
 * heading with a space for each run of characters that invisible or
 * labelOthers matches, one hyphen for each run of hyphens, which an XML
 * comment does not allow, and single spaces. It returns undefined when the
 * label holds no letter and no digit.
 * @param text - The text of the heading.
 * @returns The label, or undefined.
 */
export function headingLabel(text: string): string | undefined {
  const label = text.replace(invisible, ' ').replace(labelOthers, ' ').replace(/-{2,}/g, '-').replace(/ {2,}/g, ' ').trim();
  return /[\p{L}\p{N}]/u.test(label) ? label : undefined;
}

/**
 * linkUnderCursor returns the target that a Markdown link is being written
 * with at an offset of source text of the given syntax, or undefined when
 * the offset is outside a comment, outside the target part of a link, or in
 * a target that is no local relative path, such as a web address or an
 * absolute path. The result carries the text of the target before the
 * offset, split into the path part and the fragment part, the offset where
 * the target starts, and the label of the link with the offset where the
 * label starts.
 * @param text - Complete source text.
 * @param offset - The offset of the cursor.
 * @param syntax - The comment syntax of the language.
 * @returns The target being written.
 */
export function linkUnderCursor(text: string, offset: number, syntax: CommentSyntax): TargetBeingWritten | undefined {
  const span = commentSpans(text, syntax).find((s) => s.start <= offset && offset <= s.end);
  if (!span) return undefined;
  const before = text.slice(span.start, offset);
  // Without brackets in the label and parentheses in the target, as linkPattern, so that the search takes linear time.
  const match = /\[([^[\]\n]*)\]\(([^()\s]*)$/.exec(before);
  if (!match) return undefined;
  const [, label, target] = match;
  if (schemePattern.test(target) || target.startsWith('/') || target.startsWith('#')) return undefined;
  const hashIndex = target.indexOf('#');
  return {
    start: offset - target.length,
    path: hashIndex === -1 ? target : target.slice(0, hashIndex),
    fragment: hashIndex === -1 ? undefined : target.slice(hashIndex + 1),
    labelStart: span.start + match.index + 1,
    label,
  };
}
