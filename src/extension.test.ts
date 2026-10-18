// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

/**
 * These tests load the real activation module with a fake editor API over a
 * temporary workspace. They check the registration for every listed
 * language, the resolution order of a link target, the command link of every
 * link, the editor that the command opens for the default editor of the
 * window, the cursor that a followed link keeps, the hiding of link targets
 * outside the lines of the cursor, the handling of a target that resolves
 * nowhere, the activation events and the setting of the manifest, the files
 * of the package, and the links, the images and the settings table of its
 * documents. No installed editor is touched.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, onTestFinished, test, vi } from 'vitest';
import { syntaxes } from './links';

/** repository is the root folder of this repository, which holds the manifest and the documents. */
const repository = path.resolve(__dirname, '..');

/** openCommand is the command of the extension that opens a heading. */
const openCommand = 'nimblescape.commentlinks.open';

/** settingsSection is the configuration section of the extension, which the fake editor API serves alone. */
const settingsSection = 'nimblescape.commentlinks';

/**
 * plain copies a value into ordinary objects, so that strict deep equality
 * compares structure only and ignores the classes of the fake editor API.
 * @param value - The value to copy.
 */
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** FakeUri is a minimal file URI of the fake editor API. */
interface FakeUri {
  scheme: string;
  authority: string;
  path: string;
  fsPath: string;
  fragment: string;
  with(change: { fragment?: string }): FakeUri;
  toString(): string;
}

/** CommandUri is a command URI of the fake editor API: the path is the command, the query is decoded. */
interface CommandUri {
  scheme: string;
  path: string;
  query: string;
  toString(): string;
}

/** Position keeps a line and a character. */
class Position {
  line: number;
  character: number;
  constructor(line: number, character: number) {
    this.line = line;
    this.character = character;
  }
}

/** Range keeps two positions. */
class Range {
  start: Position;
  end: Position;
  constructor(start: Position, end: Position) {
    this.start = start;
    this.end = end;
  }
}

/** DocumentLink keeps the range and the target as the editor API does. */
class DocumentLink {
  range: Range;
  target: CommandUri;
  declare tooltip?: string;
  constructor(range: Range, target: CommandUri) {
    this.range = range;
    this.target = target;
  }
}

/** TextEdit keeps a range and its new text, as the editor API does. */
class TextEdit {
  range: Range;
  newText: string;
  constructor(range: Range, newText: string) {
    this.range = range;
    this.newText = newText;
  }
  static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }
}

/** CompletionItem keeps a label and a kind, as the editor API does. */
class CompletionItem {
  label: string;
  kind: number;
  declare detail?: string;
  declare range?: Range;
  declare sortText?: string;
  declare command?: { command: string; title: string };
  declare additionalTextEdits?: TextEdit[];
  constructor(label: string, kind: number) {
    this.label = label;
    this.kind = kind;
  }
}

/** FakeDocument is a fake text document over a fixture file. */
interface FakeDocument {
  uri: FakeUri;
  languageId: string;
  version: number;
  getText(): string;
  positionAt(offset: number): Position;
  offsetAt(position: Position): number;
}

/** Selection is the part of a selection that the extension reads. */
interface Selection {
  start: Position;
  end: Position;
}

/** FakeEditor is a fake visible text editor that records its decorations. */
interface FakeEditor {
  document: FakeDocument;
  selections: Selection[];
  decorations: Range[] | undefined;
  setDecorations(type: unknown, ranges: Range[]): void;
}

/** OpenedDocument is a document that the fake openTextDocument returns. */
interface OpenedDocument {
  uri: FakeUri;
  getText(): string;
}

/** ShownEditor is the editor that the fake showTextDocument returns, which records its reveals. */
interface ShownEditor {
  document: OpenedDocument;
  options: { selection: Range };
  reveals: { range: Range; type: number }[];
  revealRange(range: Range, type: number): void;
}

/** LinkProvider is the document link provider that the extension registers. */
interface LinkProvider {
  provideDocumentLinks(document: FakeDocument, token: { isCancellationRequested: boolean }): Promise<DocumentLink[]>;
}

/** CompletionProvider is the completion provider that the extension registers. */
interface CompletionProvider {
  provideCompletionItems(document: FakeDocument, position: Position): Promise<CompletionItem[] | undefined>;
}

/** Manifest is the part of package.json that the tests read. */
interface Manifest {
  main: string;
  files?: unknown;
  activationEvents: string[];
  contributes: { configuration: { properties: Record<string, { type: string; default: unknown }> } };
}

/** readManifest reads package.json of this repository. */
async function readManifest(): Promise<Manifest> {
  return JSON.parse(await fs.readFile(path.join(repository, 'package.json'), 'utf8')) as Manifest;
}

/** queryOf returns the arguments of the open command that the command link of a document link carries. */
const queryOf = (link: DocumentLink): unknown[] => JSON.parse(link.target.query) as unknown[];

/**
 * uri builds a minimal file URI of the fake editor API over an absolute path.
 * @param fsPath - The absolute path.
 */
function uri(fsPath: string, fragment = ''): FakeUri {
  return {
    scheme: 'file',
    authority: '',
    path: fsPath,
    fsPath,
    fragment,
    /** with copies the URI with another fragment, as the editor API does. */
    with: (change) => uri(fsPath, change.fragment ?? fragment),
    /** toString renders the URI as the editor API does, with its fragment. */
    toString: () => `file://${fsPath}${fragment ? '#' + fragment : ''}`,
  };
}

/**
 * inside reports whether a path lies inside a folder.
 * @param folder - The absolute path of the folder.
 * @param target - The absolute path to test.
 */
const inside = (folder: string, target: string): boolean => target.startsWith(folder + path.sep);

/**
 * fixture creates a temporary workspace with a Go file, a YAML file, a
 * Markdown file beside the Go file and a Markdown file at the root, and,
 * beside the workspace folder, a Markdown file and a folder `loose` with a Go
 * file that belong to no workspace folder. It loads src/extension.ts with a
 * fake editor API in place of the module `vscode` and returns the registered
 * provider, the registered command, the captured listeners and the
 * documents. The end of the test removes the temporary folder.
 */
async function fixture(goText: string, yamlText = '', looseText = '') {
  const outer = await fs.mkdtemp(path.join(os.tmpdir(), 'ns-links-'));
  onTestFinished(() => fs.rm(outer, { recursive: true, force: true }));
  const root = path.join(outer, 'workspace');
  await fs.mkdir(path.join(root, 'internal', 'app', 'docs'), { recursive: true });
  await fs.mkdir(path.join(outer, 'loose', 'docs'), { recursive: true });
  await fs.writeFile(path.join(outer, 'secret.md'), '# Secret\n');
  await fs.writeFile(path.join(outer, 'loose', 'docs', 'near.md'), '# Near\n');
  const loosePath = path.join(outer, 'loose', 'x.go');
  await fs.writeFile(loosePath, looseText);
  await fs.mkdir(path.join(root, 'docs', 'architecture'), { recursive: true });
  await fs.writeFile(path.join(root, 'internal', 'app', 'docs', 'local.md'), '# Local\n\n## Section two\n');
  await fs.writeFile(path.join(root, 'docs', 'architecture', 'unit.md'), '# Unit\n\nText.\n\n#### A-UNIT-001\n\nRule.\n');
  await fs.writeFile(path.join(root, 'docs', 'architecture', 'notes.txt'), 'plain\n');
  const goPath = path.join(root, 'internal', 'app', 'x_test.go');
  const yamlPath = path.join(root, 'config.yaml');
  await fs.writeFile(goPath, goText);
  await fs.writeFile(yamlPath, yamlText);
  let selector: unknown;
  let provider: LinkProvider | undefined;
  let completion: CompletionProvider | undefined;
  let triggers: string[] = [];
  const commands: Record<string, (...args: unknown[]) => unknown> = {};
  const listeners: Record<string, (event: unknown) => unknown> = {};
  const shown: ShownEditor[] = [];
  const visible: FakeEditor[] = [];
  const config: Record<string, unknown> = {};
  const associations: Record<string, string> = {};
  const executed: unknown[][] = [];
  /** folders lists the workspace folders of the fake window; the temporary workspace folder at the start. */
  const folders = [root];
  /** stats counts the calls of the fake stat, by path. */
  const stats = new Map<string, number>();
  /** listen captures the listener of one editor event under its name. */
  const listen = (name: string) => (listener: (event: unknown) => unknown) => {
    listeners[name] = listener;
    return {
      /** The captured listener owns no actual editor registration. */
      dispose() {},
    };
  };
  const fake = {
    FileType: { File: 1, Directory: 2 },
    TextEditorRevealType: { AtTop: 3 },
    TextEditorSelectionChangeKind: { Keyboard: 1, Mouse: 2, Command: 3 },
    Position,
    Range,
    DocumentLink,
    Uri: {
      /** joinPath resolves the segments against the base path, so that ".." leaves a file name. */
      joinPath: (base: FakeUri, ...segments: string[]) => uri(path.resolve(base.fsPath, ...segments)),
      /** parse keeps a command URI as the editor API does: the path is the command, the query is decoded. */
      parse: (value: string): CommandUri => {
        const [head, query] = value.split('?');
        return { scheme: 'command', path: head.slice('command:'.length), query: decodeURIComponent(query), toString: () => value };
      },
      /** from rebuilds a file URI from its components. */
      from: (parts: { path: string }) => uri(parts.path),
    },
    commands: {
      /** Capture the registered command. */
      registerCommand: (name: string, handler: (...args: unknown[]) => unknown) => {
        commands[name] = handler;
        return {
          /** The captured command owns no actual editor registration. */
          dispose() {},
        };
      },
      /** executeCommand records the editor commands that the extension runs, with every URI as a string. */
      executeCommand: async (name: string, ...args: unknown[]) => {
        executed.push([
          name,
          ...args.map((arg) => (typeof arg === 'object' && arg !== null && 'scheme' in arg && arg.scheme ? arg.toString() : arg)),
        ]);
      },
    },
    CompletionItem,
    CompletionItemKind: { File: 16, Reference: 17, Folder: 18 },
    TextEdit,
    languages: {
      /** Capture the completion registration of the extension with its trigger characters. */
      registerCompletionItemProvider: (_value: unknown, given: CompletionProvider, ...characters: string[]) => {
        completion = given;
        triggers = characters;
        return {
          /** The captured provider owns no actual editor registration. */
          dispose() {},
        };
      },
      /** Capture the one link registration of the extension. */
      registerDocumentLinkProvider: (value: unknown, given: LinkProvider) => {
        selector = value;
        provider = given;
        return {
          /** The captured provider owns no actual editor registration. */
          dispose() {},
        };
      },
    },
    window: {
      visibleTextEditors: visible,
      activeTextEditor: undefined as FakeEditor | undefined,
      /** createTextEditorDecorationType keeps the rendering options of the hiding decoration. */
      createTextEditorDecorationType: (options: unknown) => ({
        options,
        /** The decoration type owns no actual editor registration. */
        dispose() {},
      }),
      onDidChangeVisibleTextEditors: listen('visible'),
      onDidChangeTextEditorSelection: listen('selection'),
      /** showTextDocument records the request and returns an editor that records reveals. */
      showTextDocument: async (document: OpenedDocument, options: { selection: Range }) => {
        const editor: ShownEditor = {
          document,
          options,
          reveals: [],
          revealRange: (range, type) => editor.reveals.push({ range, type }),
        };
        shown.push(editor);
        return editor;
      },
    },
    workspace: {
      /** A workspace folder and every path inside it belong to that folder; another path belongs to no workspace folder. */
      getWorkspaceFolder: (target: FakeUri) => {
        const folder = folders.find((candidate) => target.fsPath === candidate || inside(candidate, target.fsPath));
        return folder === undefined ? undefined : { uri: uri(folder) };
      },
      /** asRelativePath renders a path relative to the workspace root. */
      asRelativePath: (target: FakeUri) => path.relative(root, target.fsPath),
      /**
       * getConfiguration reads the fixture settings of the configuration
       * section of the extension, or the editor associations of the
       * workbench. Another section returns the fallback of every key.
       */
      getConfiguration: (section: string) => ({
        get: (key: string, fallback?: unknown) => {
          if (section === 'workbench') return key === 'editorAssociations' ? associations : fallback;
          return section === settingsSection && key in config ? config[key] : fallback;
        },
      }),
      onDidChangeTextDocument: listen('change'),
      onDidCloseTextDocument: listen('close'),
      onDidChangeConfiguration: listen('configuration'),
      onDidChangeWorkspaceFolders: listen('folders'),
      /** openTextDocument returns the current text of a real temporary file. */
      openTextDocument: async (target: FakeUri): Promise<OpenedDocument> => {
        const text = await fs.readFile(target.fsPath, 'utf8');
        return { uri: target, getText: () => text };
      },
      fs: {
        /** stat maps the editor file type onto the real temporary files. */
        stat: async (target: FakeUri) => {
          stats.set(target.fsPath, (stats.get(target.fsPath) ?? 0) + 1);
          const stat = await fs.stat(target.fsPath);
          return { type: stat.isDirectory() ? 2 : 1, mtime: stat.mtimeMs, size: stat.size };
        },
        /** readDirectory lists the real temporary directory with the editor file types. */
        readDirectory: async (target: FakeUri) => {
          const entries = await fs.readdir(target.fsPath, { withFileTypes: true });
          return entries.map((entry) => [entry.name, entry.isDirectory() ? 2 : 1]);
        },
      },
    },
  };
  /** Substitute the editor API only and load the real local link module. */
  vi.resetModules();
  vi.doMock('vscode', () => fake);
  const extension = await import('./extension');
  const subscriptions: unknown[] = [];
  extension.activate({ subscriptions } as unknown as Parameters<typeof extension.activate>[0]);
  /** document builds a fake text document over a fixture file. */
  const document = (filePath: string, languageId: string, text: string): FakeDocument => ({
    uri: uri(filePath),
    languageId,
    version: 1,
    /** getText returns the complete text of the fixture document. */
    getText: () => text,
    /** positionAt converts an offset into the line and character of the editor API. */
    positionAt: (offset) => {
      const before = text.slice(0, offset).split('\n');
      return new Position(before.length - 1, before[before.length - 1].length);
    },
    /** offsetAt converts a line and character of the editor API into an offset. */
    offsetAt: (position) =>
      text
        .split('\n')
        .slice(0, position.line)
        .reduce((sum, l) => sum + l.length + 1, 0) + position.character,
  });
  return {
    outer,
    root,
    stats,
    selector,
    subscriptions,
    commands,
    shown,
    config,
    associations,
    executed,
    /** activate makes an editor the active text editor of the fake window. */
    activate: (editor: FakeEditor) => {
      fake.window.activeTextEditor = editor;
    },
    /** click moves the cursor of an editor to a line as a mouse click does and runs the selection listener. */
    click: async (editor: FakeEditor, line: number) => {
      const position = new Position(line, 0);
      editor.selections = [{ start: position, end: position }];
      await listeners.selection({ textEditor: editor, selections: editor.selections, kind: 2 });
    },
    /** complete runs the registered completion provider at a line and character of a document. */
    complete: (doc: FakeDocument, line: number, character: number) =>
      completion!.provideCompletionItems(doc, new Position(line, character)),
    completionTriggers: () => triggers,
    /** links runs the registered provider over a document with a token that may be cancelled. */
    links: (doc: FakeDocument, cancelled = false) => provider!.provideDocumentLinks(doc, { isCancellationRequested: cancelled }),
    /** editor shows a document in a fake visible editor. */
    editor: (doc: FakeDocument) => {
      const editor: FakeEditor = {
        document: doc,
        selections: [],
        decorations: undefined,
        setDecorations: (_type, ranges) => {
          editor.decorations = ranges;
        },
      };
      visible.push(editor);
      return editor;
    },
    /** cursor moves the cursor of an editor to a line and runs the selection listener to completion. */
    cursor: async (editor: FakeEditor, line: number) => {
      const position = new Position(line, 0);
      editor.selections = [{ start: position, end: position }];
      await listeners.selection({ textEditor: editor, selections: editor.selections });
    },
    /** hide closes a visible editor of the fake window. */
    hide: (editor: FakeEditor) => {
      visible.splice(visible.indexOf(editor), 1);
    },
    /** setFolders replaces the workspace folders of the fake window and runs the folder listener. */
    setFolders: (paths: string[]) => {
      folders.splice(0, folders.length, ...paths);
      return listeners.folders({});
    },
    /** change gives a document a new version and text and runs the change listener, as an edit does. */
    change: (doc: FakeDocument, text: string) => {
      const changed = document(doc.uri.fsPath, doc.languageId, text);
      Object.assign(doc, { version: doc.version + 1, getText: changed.getText, positionAt: changed.positionAt, offsetAt: changed.offsetAt });
      return listeners.change({ document: doc });
    },
    go: document(goPath, 'go', goText),
    /** loose is a Go document that belongs to no workspace folder. */
    loose: document(loosePath, 'go', looseText),
    yaml: document(yamlPath, 'yaml', yamlText),
    /** markdown builds a document of a language the extension does not list. */
    markdown: document(path.join(root, 'docs', 'architecture', 'unit.md'), 'markdown', goText),
  };
}

test('links resolve relative to the file first and to the workspace folder second', async () => {
  const f = await fixture(
    [
      'package app',
      '',
      '// Local: [two](docs/local.md#section-two)',
      '// Assures: [A-UNIT-001](docs/architecture/unit.md#a-unit-001)',
      '// Plain: [notes](docs/architecture/notes.txt#ignored)',
      '// Missing: [gone](docs/architecture/gone.md)',
      '// Unknown heading: [unit](docs/architecture/unit.md#nowhere)',
      'func Test(t *testing.T) {}',
    ].join('\n'),
  );
  expect(plain(f.selector)).toStrictEqual(Object.keys(syntaxes).map((language) => ({ language })));
  expect(f.subscriptions.length).toBe(11);
  const links = await f.links(f.go);
  expect(plain(links.map((link) => [link.target.scheme, link.target.path, link.tooltip]))).toStrictEqual([
    ['command', openCommand, 'Open internal/app/docs/local.md#section-two'],
    ['command', openCommand, 'Open docs/architecture/unit.md#a-unit-001'],
    ['command', openCommand, 'Open docs/architecture/notes.txt'],
    ['command', openCommand, 'Open docs/architecture/unit.md#nowhere'],
  ]);
  expect(queryOf(links[1])).toStrictEqual([
    { scheme: 'file', authority: '', path: path.join(f.root, 'docs', 'architecture', 'unit.md') },
    'a-unit-001',
  ]);
  expect(queryOf(links[2])).toStrictEqual([
    { scheme: 'file', authority: '', path: path.join(f.root, 'docs', 'architecture', 'notes.txt') },
    '',
  ]);
  // The link sits on the label, so that it never overlaps the web-address
  // link that the Go language server places on the file name of the target.
  expect(plain(links[1].range)).toStrictEqual({
    start: { line: 3, character: 13 },
    end: { line: 3, character: 13 + 'A-UNIT-001'.length },
  });
});

test('the command opens the target with the default editor and requests the heading that the fragment names', async () => {
  const f = await fixture(
    [
      'package app',
      '// [unit](docs/architecture/unit.md#a-unit-001)',
      '// [top](docs/architecture/unit.md#nowhere)',
      '// [notes](docs/architecture/notes.txt#ignored)',
    ].join('\n'),
  );
  const links = await f.links(f.go);
  const open = (index: number) => f.commands[openCommand](...queryOf(links[index]));
  const unit = path.join(f.root, 'docs', 'architecture', 'unit.md');
  // The text editor shows the heading at the top, or the start of the document for an unknown heading.
  for (const [index, line] of [
    [0, 4],
    [1, 0],
  ]) {
    await open(index);
    const editor = f.shown[f.shown.length - 1];
    expect(editor.document.uri.fsPath).toBe(unit);
    expect(plain(editor.options.selection)).toStrictEqual({ start: { line, character: 0 }, end: { line, character: 0 } });
    expect(plain(editor.reveals)).toStrictEqual([
      { range: { start: { line, character: 0 }, end: { line, character: 0 } }, type: 3 },
    ]);
  }
  // A target without a fragment opens as the editor opens files.
  await open(2);
  expect(f.executed.at(-1)).toStrictEqual(['vscode.open', `file://${path.join(f.root, 'docs', 'architecture', 'notes.txt')}`]);
  // The Markdown preview scrolls to the fragment of its resource.
  f.associations['*.md'] = 'vscode.markdown.preview.editor';
  await open(0);
  expect(f.executed.at(-1)).toStrictEqual(['vscode.openWith', `file://${unit}#a-unit-001`, 'vscode.markdown.preview.editor']);
  // Another editor receives the line of the heading as the requested selection, or the start of the document for an
  // unknown heading, and decides itself whether it shows the line. The text editor is named by "default".
  f.associations['*.md'] = 'vscode.markdown.editor';
  for (const [index, line] of [
    [0, 4],
    [1, 0],
  ]) {
    await open(index);
    const at = { line, character: 0 };
    expect(plain(f.executed.at(-1))).toStrictEqual([
      'vscode.openWith',
      `file://${unit}`,
      'vscode.markdown.editor',
      { selection: { start: at, end: at } },
    ]);
  }
  f.associations['*.md'] = 'default';
  const shownBefore = f.shown.length;
  await open(0);
  expect(f.shown.length).toBe(shownBefore + 1);
});

test('a link opens only a file inside the workspace folder, or for a file outside the workspace also inside its folder', async () => {
  const f = await fixture(
    [
      'package app',
      '// Beside the file, up and out: [secret](../../../secret.md)',
      '// From the workspace folder, up and out: [secret](../secret.md#secret)',
      '// Inside: [unit](../../docs/architecture/unit.md)',
    ].join('\n'),
    '',
    [
      'package x',
      '// Near: [near](docs/near.md)',
      '// Up and out: [secret](../secret.md)',
      '// Into the workspace: [unit](../workspace/docs/architecture/unit.md)',
    ].join('\n'),
  );
  // Both targets name secret.md beside the workspace folder, which exists, and get no link and no stat.
  const links = await f.links(f.go);
  expect(plain(links.map((link) => link.tooltip))).toStrictEqual(['Open docs/architecture/unit.md']);
  expect(f.stats.has(path.join(f.outer, 'secret.md'))).toBe(false);
  // A file outside the folders of the workspace links inside its own folder and inside the workspace folder.
  const loose = await f.links(f.loose);
  expect(plain(loose.map((link) => queryOf(link)[0]))).toStrictEqual([
    { scheme: 'file', authority: '', path: path.join(f.outer, 'loose', 'docs', 'near.md') },
    { scheme: 'file', authority: '', path: path.join(f.root, 'docs', 'architecture', 'unit.md') },
  ]);
  // The hidden part of the link without a target stays visible.
  const editor = f.editor(f.go);
  await f.cursor(editor, 0);
  expect(plain(editor.decorations)).toHaveLength(2);
});

test('the command opens only a file that a link of the window names', async () => {
  const f = await fixture('package app\n// [unit](docs/architecture/unit.md#a-unit-001)\n');
  const open = f.commands[openCommand];
  // Before any link was resolved, and for a file that no link names, the command opens nothing.
  const unit = { scheme: 'file', authority: '', path: path.join(f.root, 'docs', 'architecture', 'unit.md') };
  await open(unit, 'a-unit-001');
  await open({ scheme: 'file', authority: '', path: path.join(f.outer, 'secret.md') }, '');
  await open('file:///etc/hostname', '');
  await open(undefined, undefined);
  expect(f.shown).toHaveLength(0);
  expect(f.executed).toHaveLength(0);
  // After the link was resolved, its file opens.
  await f.links(f.go);
  await open(unit, 'a-unit-001');
  expect(f.shown.map((editor) => editor.document.uri.fsPath)).toStrictEqual([unit.path]);
  // A fragment that is no text opens the file at its start.
  await open(unit, 42);
  expect(f.executed.at(-1)).toStrictEqual(['vscode.open', `file://${unit.path}`]);
});

test('one version of a document is resolved once, and an edit refreshes the hiding after a pause', async () => {
  const text = 'package app\n// [unit](docs/architecture/unit.md)\n';
  const f = await fixture(text);
  const editor = f.editor(f.go);
  const unit = path.join(f.root, 'docs', 'architecture', 'unit.md');
  // The provider and the hiding of the editor ask at the same time, and share one resolution.
  await Promise.all([f.links(f.go), f.links(f.go), f.cursor(editor, 0)]);
  expect(f.stats.get(path.join(f.root, 'internal', 'app', 'docs', 'architecture', 'unit.md'))).toBe(1);
  expect(f.stats.get(unit)).toBe(1);
  expect(plain(editor.decorations)).toHaveLength(2);
  // An edit that removes the link: the hiding follows after the pause, and a cursor move in the pause waits for it.
  await f.change(f.go, 'package app\n// no link\n');
  await f.cursor(editor, 0);
  expect(plain(editor.decorations)).toHaveLength(2);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(plain(editor.decorations)).toStrictEqual([]);
  // Several edits in a row resolve the last version only.
  await f.change(f.go, text);
  await f.change(f.go, text.replace('unit.md', 'unit.md#a-unit-001'));
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(f.stats.get(unit)).toBe(2);
  expect(plain(editor.decorations)).toHaveLength(2);
});

test('a refresh that started before an edit applies nothing, and a closed editor is not refreshed after the pause', async () => {
  const text = 'package app\n// [unit](docs/architecture/unit.md)\n';
  const f = await fixture(text);
  const editor = f.editor(f.go);
  const unit = path.join(f.root, 'docs', 'architecture', 'unit.md');
  // The cursor move resolves the first version; the edit comes before that resolution ends.
  const moved = f.cursor(editor, 0);
  await f.change(f.go, `package app\nXX${text.slice('package app\n'.length)}`);
  await moved;
  expect(editor.decorations).toBe(undefined);
  // After the pause, the refresh of the new text applies.
  await vi.waitFor(() => expect(plain(editor.decorations)).toHaveLength(2));
  const resolutions = f.stats.get(unit);
  // An editor that closes during the pause gets no refresh, and its document is not resolved again.
  await f.change(f.go, text);
  f.hide(editor);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(f.stats.get(unit)).toBe(resolutions);
  // The end of the extension stops the refreshes that wait for their pause.
  const other = f.editor(f.go);
  await f.change(f.go, `${text}\n`);
  for (const subscription of f.subscriptions as Array<{ dispose(): void }>) subscription.dispose();
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(f.stats.get(unit)).toBe(resolutions);
  expect(other.decorations).toBe(undefined);
});

test('a change of the workspace folders resolves every document again', async () => {
  const f = await fixture('package app\n// [unit](docs/architecture/unit.md)\n');
  const editor = f.editor(f.go);
  await f.cursor(editor, 0);
  expect(await f.links(f.go)).toHaveLength(1);
  expect(plain(editor.decorations)).toHaveLength(2);
  // Without a workspace folder, the target relative to the workspace folder counts no more.
  await f.setFolders([]);
  expect(await f.links(f.go)).toStrictEqual([]);
  expect(plain(editor.decorations)).toStrictEqual([]);
  await f.setFolders([f.root]);
  expect(await f.links(f.go)).toHaveLength(1);
});

test('a link followed after a mouse click keeps the cursor where it was before the click', async () => {
  const f = await fixture('package app\n\n// [unit](docs/architecture/unit.md#a-unit-001)\n');
  const editor = f.editor(f.go);
  await f.cursor(editor, 0);
  await f.click(editor, 2);
  expect(plain(editor.decorations)).toStrictEqual([]);
  f.activate(editor);
  const links = await f.links(f.go);
  await f.commands[openCommand](...queryOf(links[0]));
  expect(plain(editor.selections)).toStrictEqual([{ start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }]);
  // A second use of the link without a new click restores nothing.
  await f.cursor(editor, 2);
  await f.commands[openCommand](...queryOf(links[0]));
  expect(plain(editor.selections)).toStrictEqual([{ start: { line: 2, character: 0 }, end: { line: 2, character: 0 } }]);
});

test('the brackets and the target of a resolved link hide except on the lines of the cursor', async () => {
  const f = await fixture(
    [
      'package app',
      '',
      '// Assures: [A-UNIT-001](docs/architecture/unit.md#a-unit-001)',
      '// Missing: [gone](docs/architecture/gone.md)',
      'func Test(t *testing.T) {}',
    ].join('\n'),
  );
  const editor = f.editor(f.go);
  await f.cursor(editor, 0);
  const hidden = '](docs/architecture/unit.md#a-unit-001)';
  expect(plain(editor.decorations)).toStrictEqual([
    { start: { line: 2, character: 12 }, end: { line: 2, character: 13 } },
    { start: { line: 2, character: 23 }, end: { line: 2, character: 23 + hidden.length } },
  ]);
  await f.cursor(editor, 2);
  expect(plain(editor.decorations)).toStrictEqual([]);
  f.config.hideTargets = false;
  await f.cursor(editor, 0);
  expect(plain(editor.decorations)).toStrictEqual([]);
  const unlisted = f.editor(f.markdown);
  await f.cursor(unlisted, 0);
  expect(plain(unlisted.decorations)).toStrictEqual([]);
});

test('a comment of every listed language carries the link and a string literal or an unlisted language does not', async () => {
  const f = await fixture(
    ['package app\nvar s = "[a](docs/architecture/unit.md)"', '// [b](docs/architecture/unit.md)'].join('\n'),
    '# Rule: [A-UNIT-001](docs/architecture/unit.md#a-unit-001)\nurl: http://example.test/#not-a-comment\n',
  );
  expect(plain(await f.links(f.go, true))).toStrictEqual([]);
  expect((await f.links(f.go)).length).toBe(1);
  const yaml = await f.links(f.yaml);
  expect(plain(yaml.map((link) => link.tooltip))).toStrictEqual(['Open docs/architecture/unit.md#a-unit-001']);
  expect(plain(await f.links(f.markdown))).toStrictEqual([]);
});

test('a link being written completes folders, files and headings, and a web link or a string completes nothing', async () => {
  const lines = [
    'package app',
    '// start [x](',
    '// deep [x](docs/architecture/',
    '// heading [x](docs/architecture/unit.md#a',
    '// web [x](https://example.test/',
    'var s = "[x](docs/"',
  ];
  const f = await fixture(lines.join('\n'));
  expect(f.completionTriggers()).toStrictEqual(['(', '/', '#']);
  const start = (await f.complete(f.go, 1, lines[1].length))!;
  expect(plain(start.map((item) => [item.label, item.kind, item.detail]))).toStrictEqual([
    ['docs/', 18, 'beside the file'],
    ['x_test.go', 16, 'beside the file'],
    ['config.yaml', 16, 'in the workspace folder'],
    ['internal/', 18, 'in the workspace folder'],
  ]);
  expect(start[0].command!.command).toBe('editor.action.triggerSuggest');
  expect(plain(start[0].range)).toStrictEqual({ start: { line: 1, character: 13 }, end: { line: 1, character: 13 } });
  const deep = (await f.complete(f.go, 2, lines[2].length))!;
  expect(plain(deep.map((item) => item.label))).toStrictEqual(['notes.txt', 'unit.md']);
  expect(plain(deep[0].range)).toStrictEqual({ start: { line: 2, character: 30 }, end: { line: 2, character: 30 } });
  const heading = (await f.complete(f.go, 3, lines[3].length))!;
  expect(plain(heading.map((item) => [item.label, item.kind, item.detail]))).toStrictEqual([
    ['unit', 17, 'Unit'],
    ['a-unit-001', 17, 'A-UNIT-001'],
  ]);
  expect(plain(heading[0].range)).toStrictEqual({ start: { line: 3, character: 41 }, end: { line: 3, character: 42 } });
  expect(heading.map((item) => item.additionalTextEdits)).toStrictEqual([undefined, undefined]);
  expect(await f.complete(f.go, 4, lines[4].length)).toBe(undefined);
  expect(await f.complete(f.go, 5, lines[5].length - 1)).toBe(undefined);
  expect(await f.complete(f.markdown, 1, lines[1].length)).toBe(undefined);
});

test('a chosen heading fills the empty label of a link being written and keeps a written label', async () => {
  const lines = [
    'package app',
    '// Assures: [](docs/architecture/unit.md#a',
    '// Assures: [ ](docs/architecture/unit.md#',
    '// Assures: [mine](docs/architecture/unit.md#a',
  ];
  const f = await fixture(lines.join('\n'));
  const label = (line: number, end: number) => ({ start: { line, character: 13 }, end: { line, character: end } });
  const empty = (await f.complete(f.go, 1, lines[1].length))!;
  expect(plain(empty.map((item) => [item.label, item.additionalTextEdits]))).toStrictEqual([
    ['unit', [{ range: label(1, 13), newText: 'Unit' }]],
    ['a-unit-001', [{ range: label(1, 13), newText: 'A-UNIT-001' }]],
  ]);
  const blank = (await f.complete(f.go, 2, lines[2].length))!;
  expect(plain(blank.map((item) => item.additionalTextEdits))).toStrictEqual([
    [{ range: label(2, 14), newText: 'Unit' }],
    [{ range: label(2, 14), newText: 'A-UNIT-001' }],
  ]);
  const written = (await f.complete(f.go, 3, lines[3].length))!;
  expect(written.map((item) => item.additionalTextEdits)).toStrictEqual([undefined, undefined]);
});

test('a chosen file fills an empty label with its name, and a chosen heading replaces that name', async () => {
  const lines = [
    'package app',
    '// [](',
    '// [](docs/architecture/',
    '// [x](docs/architecture/',
    '// [unit.md](docs/architecture/unit.md#a',
    '// [notes.txt](docs/architecture/unit.md#a',
  ];
  const f = await fixture(lines.join('\n'));
  const label = (line: number, end: number) => ({ start: { line, character: 4 }, end: { line, character: end } });
  const start = (await f.complete(f.go, 1, lines[1].length))!;
  expect(plain(start.map((item) => [item.label, item.additionalTextEdits ?? null]))).toStrictEqual([
    ['docs/', null],
    ['x_test.go', [{ range: label(1, 4), newText: 'x_test.go' }]],
    ['config.yaml', [{ range: label(1, 4), newText: 'config.yaml' }]],
    ['internal/', null],
  ]);
  const files = (await f.complete(f.go, 2, lines[2].length))!;
  expect(plain(files.map((item) => item.additionalTextEdits))).toStrictEqual([
    [{ range: label(2, 4), newText: 'notes.txt' }],
    [{ range: label(2, 4), newText: 'unit.md' }],
  ]);
  const written = (await f.complete(f.go, 3, lines[3].length))!;
  expect(written.map((item) => item.additionalTextEdits)).toStrictEqual([undefined, undefined]);
  const named = (await f.complete(f.go, 4, lines[4].length))!;
  expect(plain(named.map((item) => item.additionalTextEdits))).toStrictEqual([
    [{ range: label(4, 11), newText: 'Unit' }],
    [{ range: label(4, 11), newText: 'A-UNIT-001' }],
  ]);
  const other = (await f.complete(f.go, 5, lines[5].length))!;
  expect(other.map((item) => item.additionalTextEdits)).toStrictEqual([undefined, undefined]);
});

test('a second chosen file corrects the name in the label, and the completion offers no name that could break the link', async () => {
  const lines = [
    'package app',
    '// [notes.txt](docs/architecture/',
    '// [ ](docs/architecture/',
    '// [beside.md](beside.md#',
    '// [](beside.md#',
  ];
  const f = await fixture(lines.join('\n'));
  for (const name of ['+++', 'my file.md', 'a(b).md', 'x-->y.md']) await fs.writeFile(path.join(f.root, 'docs', 'architecture', name), '');
  await fs.writeFile(path.join(f.root, 'internal', 'app', 'beside.md'), '# Beside\n');
  const label = (line: number, end: number) => ({ start: { line, character: 4 }, end: { line, character: end } });
  const second = (await f.complete(f.go, 1, lines[1].length))!;
  expect(plain(second.map((item) => [item.label, item.additionalTextEdits ?? null]))).toStrictEqual([
    ['+++', null],
    ['notes.txt', [{ range: label(1, 13), newText: 'notes.txt' }]],
    ['unit.md', [{ range: label(1, 13), newText: 'unit.md' }]],
  ]);
  const blank = (await f.complete(f.go, 2, lines[2].length))!;
  expect(plain(blank.map((item) => item.additionalTextEdits ?? null))).toStrictEqual([
    null,
    [{ range: label(2, 5), newText: 'notes.txt' }],
    [{ range: label(2, 5), newText: 'unit.md' }],
  ]);
  expect(plain((await f.complete(f.go, 3, lines[3].length))!.map((item) => item.additionalTextEdits))).toStrictEqual([
    [{ range: label(3, 13), newText: 'Beside' }],
  ]);
  expect(plain((await f.complete(f.go, 4, lines[4].length))!.map((item) => item.additionalTextEdits))).toStrictEqual([
    [{ range: label(4, 4), newText: 'Beside' }],
  ]);
});

test('in a block comment a chosen heading fills a label that cannot end the comment, and a heading without text fills none', async () => {
  const lines = ['package app', '/* Assures: [](docs/other.md#'];
  const f = await fixture(lines.join('\n'));
  await fs.writeFile(path.join(f.root, 'docs', 'other.md'), '# Ends */ here\n\n# <$>\n');
  const items = (await f.complete(f.go, 1, lines[1].length))!;
  expect(plain(items.map((item) => [item.detail, item.additionalTextEdits]))).toStrictEqual([
    ['Ends */ here', [{ range: { start: { line: 1, character: 13 }, end: { line: 1, character: 13 } }, newText: 'Ends / here' }]],
    ['<$>', null],
  ]);
});

test('the completion lists no folder and reads no heading outside the folders that a link may name', async () => {
  const lines = ['package app', '// out [x](../../../', '// heading [x](../../../secret.md#s', '// up [x](../../'];
  const f = await fixture(lines.join('\n'), '', ['package x', '// [x](../', '// [x](docs/'].join('\n'));
  // From internal/app, ../../../ leaves the workspace folder, also from the workspace folder itself.
  expect(await f.complete(f.go, 1, lines[1].length)).toStrictEqual([]);
  expect(await f.complete(f.go, 2, lines[2].length)).toBe(undefined);
  // ../../ is the workspace folder itself.
  expect(plain((await f.complete(f.go, 3, lines[3].length))!.map((item) => item.label))).toStrictEqual(['config.yaml', 'docs/', 'internal/']);
  // For a file outside the folders of the workspace, the folder above its own lies outside and lists nothing.
  expect(await f.complete(f.loose, 1, '// [x](../'.length)).toStrictEqual([]);
  expect(plain((await f.complete(f.loose, 2, '// [x](docs/'.length))!.map((item) => item.label))).toStrictEqual(['near.md']);
});

test('the manifest activates the extension for every listed language and contributes the hiding setting', async () => {
  const manifest = await readManifest();
  expect(manifest.activationEvents).toStrictEqual(Object.keys(syntaxes).map((language) => `onLanguage:${language}`));
  const setting = manifest.contributes.configuration.properties[`${settingsSection}.hideTargets`];
  expect(setting.type).toBe('boolean');
  expect(setting.default).toBe(true);
});

// esbuild.mjs bundles src/extension.ts and every local module that it imports
// into dist/extension.js and leaves out only the editor API. The package
// therefore needs the bundle only, which .vscodeignore keeps.
test('the package includes the entry point and every local module that it requires', async () => {
  const manifest = await readManifest();
  expect(manifest.main).toBe('./dist/extension.js');
  expect(manifest.files, 'the package lists its files in .vscodeignore').toBe(undefined);
  const ignore = (await fs.readFile(path.join(repository, '.vscodeignore'), 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  expect(ignore[0], '.vscodeignore ignores everything first').toBe('**');
  for (const file of ['dist/extension.js', 'resources/icon.png', 'package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'SUPPORT.md']) {
    expect(ignore, `${file} is missing from the files of the package`).toContain(`!${file}`);
  }
  const pending = ['src/extension.ts'];
  const required = new Set<string>();
  const packages = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (required.has(file)) continue;
    required.add(file);
    const source = await fs.readFile(path.join(repository, file), 'utf8');
    for (const match of source.matchAll(/^import [^;]*? from '([^']+)';$/gm)) {
      if (match[1].startsWith('./')) pending.push(path.posix.join(path.posix.dirname(file), `${match[1]}.ts`));
      else packages.add(match[1]);
    }
  }
  expect(required.has('src/links.ts'), 'the scan finds the modules that the entry point requires').toBe(true);
  expect([...packages], 'the bundle leaves out the editor API only').toStrictEqual(['vscode']);
});

// The package keeps the Markdown links of its documents unchanged, so that the
// examples in code show relative targets. A relative link outside code would
// therefore break on the Marketplace page.
test('the documents of the package link outside code to web addresses or fragments only', async () => {
  for (const name of ['README.md', 'CHANGELOG.md', 'SUPPORT.md']) {
    const text = (await fs.readFile(path.join(repository, name), 'utf8'))
      .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, '')
      .replace(/`[^`\n]*`/g, '');
    for (const match of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      expect(match[1], `${name} links to the relative target ${match[1]}`).toMatch(/^(https:\/\/|#)/);
    }
  }
});

// The Marketplace shows no SVG image, and the package keeps a relative image
// address unchanged, so the README shows the GIF and PNG files of docs/images/
// through their full addresses on the branch main. vsce does not check them,
// because --no-rewrite-relative-links also turns off its checks of images.
test('the images of the README are GIF or PNG files of docs/images/ on the branch main', async () => {
  const base = 'https://raw.githubusercontent.com/nimblescape/nimblescape-commentlinks/main/';
  const signatures = { gif: 'GIF8', png: '\x89PNG' };
  const readme = (await fs.readFile(path.join(repository, 'README.md'), 'utf8'))
    .replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '');
  expect(readme, 'the README shows its images with Markdown only').not.toMatch(/<img\b/i);
  expect(readme, 'the README shows its images with inline links only').not.toMatch(/!\[[^\]]*\]\[/);
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\)/g)].map((match) => match[1]);
  expect(images.length, 'the README shows an image').toBeGreaterThan(0);
  for (const image of images) {
    const match = /^https:\/\/raw\.githubusercontent\.com\/nimblescape\/nimblescape-commentlinks\/main\/docs\/images\/[\w-]+\.(gif|png)$/.exec(image);
    expect(match, image).not.toBe(null);
    const file = await fs.readFile(path.join(repository, image.slice(base.length)));
    expect(file.subarray(0, 4).toString('latin1'), `${image} is not a ${match![1]} file`).toBe(signatures[match![1] as 'gif' | 'png']);
  }
});

test('the README names every setting that the manifest contributes', async () => {
  const manifest = await readManifest();
  const readme = await fs.readFile(path.join(repository, 'README.md'), 'utf8');
  const settings = Object.keys(manifest.contributes.configuration.properties);
  expect(settings.length > 0, 'the manifest contributes settings').toBe(true);
  for (const setting of settings) expect(readme.includes(`\`${setting}\``), `README.md does not name ${setting}`).toBe(true);
});
