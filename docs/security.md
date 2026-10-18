# Security model

This document describes what the extension does on your computer, what it
protects, how, and where its protection ends. The [README](../README.md)
describes the use; how the extension works is in
[CONTRIBUTING.md](../CONTRIBUTING.md#how-the-extension-works).

## What the extension does on your computer

The README and the Marketplace page list these behaviors in short at the
top. Each item links to its details.

- **When it works.** The extension starts when a file of a listed language
  opens in VS Code, for example a Go or a YAML file. It also runs in
  Restricted Mode and in virtual workspaces. It does not run in VS Code for
  the Web. See [Workspace trust](#workspace-trust).
- **Files that it reads.** It reads the text of the open files of the listed
  languages and finds the Markdown links in their comments. For each link, it
  asks VS Code whether the target file exists. It reads a Markdown target
  when you follow a link to a heading or complete a heading, and it lists a
  folder when you complete a path. It reads and lists nothing outside the
  folders that a link may name. The check compares paths: see
  [Which files a link opens](#which-files-a-link-opens) and
  [Known limits](#known-limits).
- **Hidden targets.** A comment shows only the label of a resolved link. The
  target stays in the file, and the lines of the cursor show the whole link.
  See [Hidden targets](#hidden-targets).
- **Files and data.** It changes no file and no setting, and it writes
  nothing to the disk. It keeps the resolved links in memory while the window
  is open. See [Stored data](#stored-data).
- **Network.** It makes no network connection, starts no process and collects
  no telemetry. It adds no link to a web address. In a virtual workspace, the
  provider of its file system may download the files that the extension
  reads. See [Workspace trust](#workspace-trust).

## The trust model

**A link in a comment is text of the file that holds it.** Anyone who can
write a file of your workspace can write a link with any label, for example
the author of a repository that you clone. The label can name a file other
than the target. Because the extension hides the target, it limits what a
link can open:

- A link opens only a file inside a folder of the workspace. A file that is
  not inside a folder of the workspace can also link to the files inside its
  own folder and its subfolders.
- A click opens the file in an editor of VS Code, as a click in the Explorer
  does. The extension runs no file.
- The command of the extension opens only the files that the links of the
  window name.

## Hidden targets

The extension shows a resolved link in a comment as its label, as rendered
Markdown does. An editor decoration hides the opening bracket and the part
from the closing bracket to the closing parenthesis. The text stays in the
file unchanged.

- The lines that a cursor or a selection touches show the whole link.
- The tooltip of a link names the path of the file that it opens, relative
  to its workspace folder, for example
  `Open docs/architecture/unit.md#a-unit-001`.
- A link whose target resolves to no file stays fully visible, so that a
  broken link is seen.
- A link to a web address, to an absolute path or to a bare fragment gets no
  link from the extension, and it stays fully visible. This also holds for any
  other target with a scheme, such as `command:` or `file:`.
- The setting `nimblescape.commentlinks.hideTargets` with the value
  `false` shows every link completely.

## Which files a link opens

The extension resolves a relative target first relative to the folder of the
file that holds the comment, and then relative to the workspace folder. A
target counts only when it lies inside a folder of the workspace. For a file
that is not inside a folder of the workspace, a target inside the folder of
that file, or inside one of its subfolders, counts too. Every other target
counts as no file: it gets no link, and it stays fully visible. An example is
`../../../etc/hostname`.

- **The command.** Every link opens through the command
  `nimblescape.commentlinks.open`. The command opens only a file that
  a link of the window named since the window opened: the extension records
  the file of each link that it resolves, and the command does nothing for
  other arguments. So
  another extension, or a `command:` link of another source, cannot open any
  other file through it.
- **The completion.** While you write a link, the completion lists folders
  and reads Markdown files only inside the same folders. A chosen heading
  fills only a label that is empty or holds only white space. The label
  keeps only letters, combining marks, digits, spaces and the characters
  `. , ( ) _ / + -` of the heading text. Every other character becomes a
  space, for example quotes, `#`, `@`, `:`, `$`, backticks, backslashes,
  `*`, `<`, `>` and invisible characters, such as variation selectors. A run
  of hyphens becomes one hyphen, and a heading without letters or digits
  fills no label. So the text of a Markdown file cannot end the comment
  (`*/`, `-->`, `--!>`), open a nested comment (`/*` in SQL), put `--` into
  an XML comment, start a new line, add a control of the text direction or
  form a comment that a tool reads, such as `#__PURE__`, `@ts-ignore` or a
  modeline of Vim (`vim: set …`). The extension finds comments with a simple
  scanner, so it also takes some text for a comment that is none, for
  example a line that starts with `#` in a shell here-document or in a
  single-quoted string over several lines. The kept characters cannot end
  such a string and have no special meaning in it.
- **The editor.** The command opens the target with the editor that the
  window associates with its file type (the setting
  `workbench.editorAssociations`). For a fragment, the command reads the text
  of the Markdown target to find the line of the heading, unless the
  Markdown preview is the editor of the target.

## Workspace trust

The extension declares `untrustedWorkspaces` as supported in its manifest,
because it only reads files. So it also runs in Restricted Mode, in the same
way as in a trusted workspace. The settings of a workspace
(`.vscode/settings.json`) can turn the hiding of targets on or off, and they
can choose the editor of a file type. They cannot make a link open a file
outside the folders that [Which files a link opens](#which-files-a-link-opens)
describes.

The extension also supports virtual workspaces: it reads files only through
the file system of VS Code. The provider of that file system, for example
the extension of a remote repository, may download a file when the extension
reads it. The extension runs in the workspace extension host
(`extensionKind: workspace`), so on a remote host it reads the files of that
host.

## Stored data

| Data | Where | How long |
| --- | --- | --- |
| The resolved links of each open file | The memory of the extension host | Until the file changes or closes |
| The files that the links of the window named since the window opened | The memory of the extension host | Until the window closes |
| The setting `nimblescape.commentlinks.hideTargets` | The settings of VS Code (`settings.json`), when you change it | Until you change it |

The extension writes no file, uses neither `globalState` nor `workspaceState`
of VS Code, stores no secret, and sends nothing to any address.

## Known limits

- The label of a link is text of the file, and it can say anything. Before
  you follow a link from a file that you do not trust, read its tooltip, or
  put the cursor on its line to show the whole link.
- The check compares the path of a target with the paths of the folders. It
  does not follow symbolic links. A symbolic link inside a folder of the
  workspace, for example one in a repository that you clone, can point to a
  file or a folder anywhere on the computer. A link through it opens that
  file, and its tooltip shows the path of the symbolic link, not the path of
  that file. The completion also lists such a folder and reads the headings
  of its Markdown files. The file only opens in an editor, as from the
  Explorer: the extension runs nothing and sends nothing.
- In a workspace with several folders, a link can open a file of every
  folder of the workspace, and its tooltip does not name the folder. A
  workspace file (`.code-workspace`) names these folders, and the workspace
  file of a repository can name any folder of the computer.
- A file that is not inside a folder of the workspace, for example a file in
  the downloads folder, can link to every file in its own folder and in its
  subfolders.

## Security problems

Do not report a security problem in a public issue. Write an e-mail to
scalarion@nimblescape.com instead.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](../LICENSE).
