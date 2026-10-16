// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * Turn the Markdown links inside the comments of source and configuration
 * files into editor links and show only their labels. A language server
 * links web addresses at most, so a citation such as
 * `[A-UNIT-001](docs/architecture/<level>/<unit>.md#a-unit-001)` reaches its
 * document through no link of its own. This extension registers a document
 * link provider for the languages that links.ts lists. It puts a link on
 * the label of such a citation and resolves the target against the
 * directory of the file first and against the workspace folder second.
 * A target must lie inside a folder of the workspace, or, for a file outside
 * the folders of the workspace, inside the folder of that file, so that a
 * label cannot hide a link to any other file of the computer. Every link
 * opens through a command of the extension, which opens only the targets that
 * its links name, with the editor that the window associates with it. A Markdown
 * target with a fragment opens at the heading the fragment names when that
 * editor can show one: the text editor and the Markdown preview can, and
 * another editor opens the document at its start. The command also keeps
 * the cursor of the source editor where it was before a mouse click on the
 * link, because the editor moves the cursor to the click before it follows
 * the link. The label carries the link because the Go language server takes
 * the file name of the target for a web address, and the editor keeps only
 * the later registered of two links that overlap. The extension hides the
 * brackets and the target of a resolved link behind its label with an editor
 * decoration, except on the lines of the cursor, so that the link reads as
 * rendered Markdown and the hidden web-address link shows no underline. A
 * setting turns the hiding off. While a link to a local file is written, the
 * extension completes the folders and files of the target under the same
 * resolution, and the headings of a Markdown target after its number sign.
 *
 * VS Code calls activate and owns the registrations through
 * context.subscriptions. The extension reads files through the workspace file
 * system, changes no file, runs no process and needs no opt-in. A target that
 * resolves nowhere receives no link and stays visible.
 */

import * as vscode from 'vscode';
import { type CommentLink, commentLinks, defaultEditor, headingLine, headings, linkUnderCursor, syntaxes } from './links';

/** openCommand names the command that opens the target of a link. */
const openCommand = 'nimblescape.markdownCommentLinks.open';

/** previewEditor identifies the Markdown preview of the editor, which scrolls to a fragment of its resource. */
const previewEditor = 'vscode.markdown.preview.editor';

/** clickWindow bounds, in milliseconds, how long after a mouse selection change a followed link restores the cursor. */
const clickWindow = 2000;

/** completionTriggers are the characters that open the completion of a link target: its start, a directory and a fragment. */
const completionTriggers = ['(', '/', '#'];

/** changeDelay is the pause, in milliseconds, after the last change of a document before the hiding of its editors follows it. */
const changeDelay = 150;

/** settingsSection names the configuration section of the extension. */
const settingsSection = 'nimblescape.markdownCommentLinks';

/** UriParts are the components of the target URI that a command link carries. */
interface UriParts {
  scheme: string;
  authority: string;
  path: string;
}

/** ResolvedTarget is the command link that opens the target of a link, with its tooltip and the file it opens. */
interface ResolvedTarget {
  uri: vscode.Uri;
  tooltip: string;
  parts: UriParts;
}

/** ResolvedLink is a link of a comment whose target resolves to a file, with the target. */
type ResolvedLink = CommentLink & ResolvedTarget;

/**
 * LinkCache keeps the resolution of the links of a document by its URI, with
 * the version of the document. The resolution of one version runs once: the
 * link provider and the hiding of every editor of the document share it.
 */
type LinkCache = Map<string, { version: number; links: Promise<ResolvedLink[]> }>;

/**
 * activate registers the command, the document link provider for the listed
 * languages, the decoration that hides link targets and the listeners that
 * refresh the hiding. VS Code disposes everything with the extension.
 * @param context - The extension context.
 */
export function activate(context: vscode.ExtensionContext): void {
  /** resolved caches the resolved links of a document by its version. */
  const resolved: LinkCache = new Map();
  /** targets keeps every file that a link of this window opens; the command opens no other file. */
  const targets = new Set<string>();
  /** links returns the resolved links of a document and records their files as targets of the command. */
  const links = (document: vscode.TextDocument): Promise<ResolvedLink[]> => resolvedLinks(document, resolved, targets);
  /** hiding is the decoration that renders no text for the decorated ranges. */
  const hiding = vscode.window.createTextEditorDecorationType({ textDecoration: 'none; display: none;' });
  /** generations orders the refreshes of an editor, so that an older one never wins. */
  const generations = new WeakMap<vscode.TextEditor, number>();
  /** selections keeps the last known selections of an editor, so that a mouse change can be undone. */
  const selections = new WeakMap<vscode.TextEditor, readonly vscode.Selection[]>();
  /** clicks keeps, per editor, the selections before its last mouse selection change and the time of that change. */
  const clicks = new WeakMap<vscode.TextEditor, { selections: readonly vscode.Selection[]; at: number }>();
  /** refresh recomputes the hidden ranges of one editor and applies them unless a newer refresh started. */
  const refresh = async (editor: vscode.TextEditor): Promise<void> => {
    const generation = (generations.get(editor) ?? 0) + 1;
    generations.set(editor, generation);
    const ranges = await hiddenRanges(editor, links);
    if (generations.get(editor) === generation) editor.setDecorations(hiding, ranges);
  };
  /** changes keeps, per editor, the timer of the refresh after a change of its document. */
  const changes = new WeakMap<vscode.TextEditor, ReturnType<typeof setTimeout>>();
  /**
   * refreshAfterChange refreshes an editor after a pause of changeDelay
   * without a further change, so that typing resolves the links once and not
   * at every key.
   */
  const refreshAfterChange = (editor: vscode.TextEditor): void => {
    clearTimeout(changes.get(editor));
    changes.set(
      editor,
      setTimeout(() => {
        changes.delete(editor);
        void refresh(editor);
      }, changeDelay),
    );
  };
  /** refreshAll records the selections of every visible editor not seen before and refreshes every visible editor. */
  const refreshAll = (): void => {
    for (const editor of vscode.window.visibleTextEditors) {
      if (!selections.has(editor)) selections.set(editor, editor.selections);
      refresh(editor);
    }
  };
  /**
   * restoreCursor puts the cursor of the source editor back to where it was
   * before a recent mouse click, so that following a link with the mouse
   * moves no cursor.
   */
  const restoreCursor = (): void => {
    const editor = vscode.window.activeTextEditor;
    const click = editor && clicks.get(editor);
    if (!editor || !click || Date.now() - click.at > clickWindow) return;
    clicks.delete(editor);
    if (click.selections.length) editor.selections = click.selections;
  };
  context.subscriptions.push(
    hiding,
    vscode.commands.registerCommand(openCommand, (parts: unknown, fragment: unknown) => {
      // Only the file of a link of this window: the command opens no file that another caller names.
      const target = targetUri(parts);
      if (!target || !targets.has(target.toString())) return undefined;
      restoreCursor();
      return openTarget(target, typeof fragment === 'string' ? fragment : '');
    }),
    vscode.languages.registerDocumentLinkProvider(
      Object.keys(syntaxes).map((language) => ({ language })),
      {
        /**
         * provideDocumentLinks returns one editor link, on the label, per
         * Markdown link in a comment whose target resolves to a file. A
         * cancelled request returns no link.
         */
        async provideDocumentLinks(document, token) {
          const found = await links(document);
          if (token.isCancellationRequested) return [];
          return found.map((link) => {
            const range = new vscode.Range(document.positionAt(link.start), document.positionAt(link.end));
            const documentLink = new vscode.DocumentLink(range, link.uri);
            documentLink.tooltip = link.tooltip;
            return documentLink;
          });
        },
      },
    ),
    vscode.languages.registerCompletionItemProvider(
      Object.keys(syntaxes).map((language) => ({ language })),
      {
        /** provideCompletionItems completes the target of a link that is being written in a comment. */
        provideCompletionItems: (document, position) => completeTarget(document, position),
      },
      ...completionTriggers,
    ),
    vscode.window.onDidChangeVisibleTextEditors(refreshAll),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.kind === vscode.TextEditorSelectionChangeKind.Mouse) {
        clicks.set(event.textEditor, { selections: selections.get(event.textEditor) ?? [], at: Date.now() });
      }
      selections.set(event.textEditor, event.selections);
      // While a change of the document waits for its pause, that refresh follows the selection too.
      if (changes.has(event.textEditor)) return undefined;
      return refresh(event.textEditor);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      for (const editor of vscode.window.visibleTextEditors) {
        if (editor.document === event.document) refreshAfterChange(editor);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => resolved.delete(document.uri.toString())),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(settingsSection)) refreshAll();
    }),
  );
  refreshAll();
}

/**
 * resolvedLinks returns the Markdown links of the comments of a document
 * whose targets resolve to files, with the target of each, and records the
 * file of each link in targets. The resolution is cached by the version of
 * the document, and concurrent requests for one version share it. A
 * resolution that fails is not kept, so that the next request tries again.
 * @param document - The document.
 * @param cache - Resolved links by document URI.
 * @param targets - The files that the links of the window open, as URI strings.
 * @returns The resolved links.
 */
function resolvedLinks(document: vscode.TextDocument, cache: LinkCache, targets: Set<string>): Promise<ResolvedLink[]> {
  const syntax = syntaxes[document.languageId];
  if (!syntax) return Promise.resolve([]);
  const key = document.uri.toString();
  const cached = cache.get(key);
  if (cached && cached.version === document.version) return cached.links;
  const links = (async () => {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    const found: ResolvedLink[] = [];
    for (const link of commentLinks(document.getText(), syntax)) {
      const target = await resolveTarget(document.uri, folder?.uri, link);
      if (!target) continue;
      targets.add(vscode.Uri.from(target.parts).toString());
      found.push({ ...link, ...target });
    }
    return found;
  })();
  cache.set(key, { version: document.version, links });
  links.catch(() => {
    if (cache.get(key)?.links === links) cache.delete(key);
  });
  return links;
}

/**
 * hiddenRanges returns the ranges of an editor that the hiding decoration
 * covers: the opening bracket and the part from the closing bracket to the
 * closing parenthesis of every resolved link, except on the lines that a
 * selection of the editor touches. An editor of an unlisted language, or an
 * editor whose window turned the hiding off, gets no range.
 * @param editor - The editor.
 * @param links - Returns the resolved links of a document.
 * @returns The ranges to hide.
 */
async function hiddenRanges(
  editor: vscode.TextEditor,
  links: (document: vscode.TextDocument) => Promise<CommentLink[]>,
): Promise<vscode.Range[]> {
  const document = editor.document;
  const enabled = vscode.workspace.getConfiguration(settingsSection).get<boolean>('hideTargets', true);
  if (!enabled || !syntaxes[document.languageId]) return [];
  const cursorLines = new Set<number>();
  for (const selection of editor.selections) {
    for (let line = selection.start.line; line <= selection.end.line; line++) cursorLines.add(line);
  }
  const ranges: vscode.Range[] = [];
  for (const link of await links(document)) {
    const open = document.positionAt(link.open);
    if (cursorLines.has(open.line)) continue;
    ranges.push(new vscode.Range(open, document.positionAt(link.open + 1)));
    ranges.push(new vscode.Range(document.positionAt(link.end), document.positionAt(link.close)));
  }
  return ranges;
}

/**
 * completeTarget completes the target of a Markdown link that is being
 * written in a comment. Before a number sign it offers the folders and files
 * of the directory that the target names, resolved against the directory of
 * the document first and against the workspace folder second, with the
 * entries beside the document first, and only in the folders that
 * allowedTarget permits. A folder inserts its name with a slash
 * and opens the next completion. After the number sign of a Markdown target
 * it offers the anchors of the headings of that document. A cursor outside
 * a comment, outside a link or in a link to a web address gets nothing.
 * @param document - The document.
 * @param position - The position of the cursor.
 * @returns The completions.
 */
async function completeTarget(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<vscode.CompletionItem[] | undefined> {
  const syntax = syntaxes[document.languageId];
  if (!syntax) return undefined;
  const link = linkUnderCursor(document.getText(), document.offsetAt(position), syntax);
  if (!link) return undefined;
  const folder = vscode.workspace.getWorkspaceFolder(document.uri);
  const bases = [{ uri: vscode.Uri.joinPath(document.uri, '..'), detail: 'beside the file' }];
  if (folder) bases.push({ uri: folder.uri, detail: 'in the workspace folder' });
  if (link.fragment !== undefined) {
    if (!/\.md$/i.test(link.path)) return undefined;
    const range = new vscode.Range(document.positionAt(link.start + link.path.length + 1), position);
    for (const base of bases) {
      const target = vscode.Uri.joinPath(base.uri, link.path);
      if (!allowedTarget(document.uri, folder?.uri, target)) continue;
      let markdown: string;
      try {
        markdown = (await vscode.workspace.openTextDocument(target)).getText();
      } catch {
        continue;
      }
      return headings(markdown).map((heading) => {
        const item = new vscode.CompletionItem(heading.slug, vscode.CompletionItemKind.Reference);
        item.detail = heading.text;
        item.range = range;
        return item;
      });
    }
    return undefined;
  }
  const slash = link.path.lastIndexOf('/');
  const directory = slash === -1 ? '' : link.path.slice(0, slash + 1);
  const range = new vscode.Range(document.positionAt(link.start + directory.length), position);
  const items = new Map<string, vscode.CompletionItem>();
  for (const base of bases) {
    const listed = directory ? vscode.Uri.joinPath(base.uri, directory) : base.uri;
    if (!allowedTarget(document.uri, folder?.uri, listed)) continue;
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(listed);
    } catch {
      continue;
    }
    for (const [name, type] of entries) {
      if (items.has(name)) continue;
      const isFolder = (type & vscode.FileType.Directory) !== 0;
      const item = new vscode.CompletionItem(
        isFolder ? `${name}/` : name,
        isFolder ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File,
      );
      item.detail = base.detail;
      item.range = range;
      item.sortText = `${isFolder ? '0' : '1'}${name}`;
      if (isFolder) item.command = { command: 'editor.action.triggerSuggest', title: 'Suggest' };
      items.set(name, item);
    }
  }
  return [...items.values()];
}

/**
 * isWithin reports whether a URI is a folder or lies inside it: the same
 * scheme and authority, and the path of the folder or a path below it.
 * @param folder - The folder.
 * @param target - The URI to test.
 * @returns Whether the URI is the folder or lies inside it.
 */
function isWithin(folder: vscode.Uri, target: vscode.Uri): boolean {
  if (target.scheme !== folder.scheme || target.authority !== folder.authority) return false;
  const base = folder.path.endsWith('/') ? folder.path : `${folder.path}/`;
  return target.path === folder.path || target.path.startsWith(base);
}

/**
 * allowedTarget reports whether a link of a document may name a file or a
 * folder: one inside a folder of the workspace, or, for a document outside
 * the folders of the workspace, one inside the folder of the document. A
 * target such as `../../../etc/hostname` that leaves these folders gets no
 * link and no completion.
 * @param documentUri - The URI of the document.
 * @param folderUri - The workspace folder of the document, if any.
 * @param target - The file or folder that the target names.
 * @returns Whether the link may name it.
 */
function allowedTarget(documentUri: vscode.Uri, folderUri: vscode.Uri | undefined, target: vscode.Uri): boolean {
  if (vscode.workspace.getWorkspaceFolder(target)) return true;
  return !folderUri && isWithin(vscode.Uri.joinPath(documentUri, '..'), target);
}

/**
 * resolveTarget finds the file that a relative link target names: first the
 * path relative to the directory of the document, then the path relative to
 * the workspace folder of the document. A file outside the folders that
 * allowedTarget permits does not count. The result is a command link that
 * opens the file, at the heading of the fragment when the target is a
 * Markdown file with a fragment. A target that names a directory or that
 * resolves nowhere yields undefined.
 * @param documentUri - The URI of the document.
 * @param folderUri - The workspace folder of the document, if any.
 * @param link - The path and the fragment of the link.
 * @returns The resolved target.
 */
async function resolveTarget(
  documentUri: vscode.Uri,
  folderUri: vscode.Uri | undefined,
  link: Pick<CommentLink, 'path' | 'fragment'>,
): Promise<ResolvedTarget | undefined> {
  const candidates = [vscode.Uri.joinPath(documentUri, '..', link.path)];
  if (folderUri) candidates.push(vscode.Uri.joinPath(folderUri, link.path));
  for (const candidate of candidates) {
    if (!allowedTarget(documentUri, folderUri, candidate)) continue;
    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(candidate);
    } catch {
      continue;
    }
    if (stat.type & vscode.FileType.Directory) continue;
    const relative = vscode.workspace.asRelativePath(candidate, false);
    const fragment = /\.md$/i.test(link.path) ? link.fragment : '';
    const parts: UriParts = { scheme: candidate.scheme, authority: candidate.authority, path: candidate.path };
    const query = encodeURIComponent(JSON.stringify([parts, fragment]));
    return {
      uri: vscode.Uri.parse(`command:${openCommand}?${query}`),
      tooltip: `Open ${relative}${fragment ? '#' + fragment : ''}`,
      parts,
    };
  }
  return undefined;
}

/**
 * targetUri returns the URI that the components of a command link name, or
 * undefined when the arguments of the command are no such components.
 * @param parts - The first argument of the command.
 * @returns The URI, or undefined.
 */
function targetUri(parts: unknown): vscode.Uri | undefined {
  if (typeof parts !== 'object' || parts === null) return undefined;
  const { scheme, authority, path } = parts as Partial<Record<keyof UriParts, unknown>>;
  if (typeof scheme !== 'string' || typeof authority !== 'string' || typeof path !== 'string') return undefined;
  try {
    return vscode.Uri.from({ scheme, authority, path });
  } catch {
    // Uri.from refuses components that form no URI, such as an empty scheme.
    return undefined;
  }
}

/**
 * openTarget opens the target of a link with the editor that the window
 * associates with it. For a Markdown target with a fragment, the command
 * looks up the first heading whose anchor equals the fragment in the current
 * text of the document and requests the line of that heading as the
 * selection. The text editor shows that line at the top. The Markdown
 * preview receives the fragment of its resource instead and scrolls to it.
 * Another editor receives the requested selection and decides whether it
 * shows the line: the Markdown Editor of the editor ignores it and opens the
 * document at its start. A fragment without a heading requests the start of
 * the document. A target without a fragment opens as the editor opens files.
 * @param uri - The target URI.
 * @param fragment - The anchor without its number sign, or an empty string.
 */
async function openTarget(uri: vscode.Uri, fragment: string): Promise<void> {
  if (!fragment) {
    await vscode.commands.executeCommand('vscode.open', uri);
    return;
  }
  const associations = vscode.workspace.getConfiguration('workbench', uri).get<Record<string, unknown>>('editorAssociations');
  const editor = defaultEditor(associations, uri.scheme, uri.path);
  if (editor === previewEditor) {
    await vscode.commands.executeCommand('vscode.openWith', uri.with({ fragment }), editor);
    return;
  }
  const document = await vscode.workspace.openTextDocument(uri);
  const line = headingLine(document.getText(), fragment);
  const position = new vscode.Position(line > 0 ? line - 1 : 0, 0);
  const range = new vscode.Range(position, position);
  if (editor) {
    await vscode.commands.executeCommand('vscode.openWith', uri, editor, { selection: range });
    return;
  }
  const shown = await vscode.window.showTextDocument(document, { selection: range });
  shown.revealRange(range, vscode.TextEditorRevealType.AtTop);
}

/** deactivate has nothing to release: VS Code disposes the registrations. */
export function deactivate(): void {}
