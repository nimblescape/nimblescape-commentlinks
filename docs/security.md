# Security model

This document describes what the extension does on your computer, what it
protects, how, and where its protection ends. The [README](../README.md)
describes the use; how the extension works is in
[CONTRIBUTING.md](../CONTRIBUTING.md#how-the-extension-works).

## What the extension does on your computer

The README and the Marketplace page list these behaviors at the top. Each
item links to its details.

- **When it works.** The extension starts when a file of a listed language
  opens in VS Code, for example a Go or a YAML file. It also runs in
  Restricted Mode and in virtual workspaces. It does not run in VS Code for
  the Web. See [Workspace trust](#workspace-trust).
- **Files that it reads.** It reads the text of the open files of the listed
  languages and finds the Markdown links in their comments. For each link, it
  asks VS Code whether the target file exists. It reads a Markdown target
  when you follow a link to a heading or complete a heading, and it lists a
  folder when you complete a path. It reads and lists nothing outside the
  folders that a link may name. See
  [Which files a link opens](#which-files-a-link-opens).
- **Hidden targets.** A comment shows only the label of a resolved link. The
  target stays in the file, and the lines of the cursor show the whole link.
  See [Hidden targets](#hidden-targets).
- **Files and data.** It changes no file and no setting, and it writes
  nothing to the disk. It keeps the resolved links in memory while VS Code
  runs. See [Stored data](#stored-data).
- **Network.** It makes no network connection, starts no process and collects
  no telemetry. It adds no link to a web address.

## The trust model

**A link in a comment is text of the file that holds it.** Anyone who can
write a file of your workspace can write a link with any label, for example
the author of a repository that you clone. The label can name another file
than the target. Because the extension hides the target, it limits what a
link can open:

- A link opens only a file inside a folder of the workspace. A file that is
  not inside a folder of the workspace can also link to the files inside its
  own folder.
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
- The tooltip of a link names the file that it opens, for example
  `Open docs/architecture/unit.md#a-unit-001`.
- A link whose target resolves to no file stays fully visible, so that a
  broken link is seen.
- A link to a web address, to an absolute path or to a bare fragment is no
  link of the extension, and it stays fully visible. This also holds for any
  other target with a scheme, such as `command:` or `file:`.
- The setting `nimblescape.markdownCommentLinks.hideTargets` with the value
  `false` shows every link completely.

## Which files a link opens

The extension resolves a relative target first relative to the folder of the
file that holds the comment, and then relative to the workspace folder. A
target counts only when it lies inside a folder of the workspace. For a file
that is not inside a folder of the workspace, a target inside the folder of
that file, or inside one of its subfolders, counts too. Every other target
counts as no file: it gets no link, and it stays fully visible. An example is
`../../../etc/hostname`.

Before version 0.2.0, such a target could open any file of the computer,
while the label hid the target. The
[change log](../CHANGELOG.md#020) describes the fix.

- **The command.** Every link opens through the command
  `nimblescape.markdownCommentLinks.open`. The command opens only a file that
  a link of the window names: the extension records the file of each link
  that it resolves, and the command does nothing for other arguments. So
  another extension, or a `command:` link of another source, cannot open any
  other file through it.
- **The completion.** While you write a link, the completion lists folders
  and reads Markdown files only inside the same folders.
- **The editor.** The command opens the target with the editor that the
  window associates with its file type (the setting
  `workbench.editorAssociations`). For a fragment, the command reads the text
  of the Markdown target to find the line of the heading.

## Workspace trust

The extension declares `untrustedWorkspaces` as supported in its manifest,
because it only reads files. So it also runs in Restricted Mode, in the same
way as in a trusted workspace. The settings of a workspace
(`.vscode/settings.json`) can turn the hiding of targets on or off, and they
can choose the editor of a file type. They cannot make a link open a file
outside the folders of [Which files a link opens](#which-files-a-link-opens).

The extension also supports virtual workspaces: it reads files only through
the file system of VS Code. It runs in the workspace extension host
(`extensionKind: workspace`), so on a remote host it reads the files of that
host.

## Stored data

| Data | Where | How long |
| --- | --- | --- |
| The resolved links of each open file | The memory of the extension host | Until the file changes or closes |
| The files that the links of the window name | The memory of the extension host | Until the window closes |
| The setting `nimblescape.markdownCommentLinks.hideTargets` | The settings of VS Code (`settings.json`), when you change it | Until you change it |

The extension writes no file, uses neither `globalState` nor `workspaceState`
of VS Code, stores no secret, and sends nothing to any address.

## Known limits

- The label of a link is text of the file, and it can say anything. Before
  you follow a link from a file that you do not trust, read its tooltip, or
  put the cursor on its line to show the whole link.
- The check compares paths. A symbolic link inside a folder of the workspace
  counts as a part of that folder, also when it points to a file or a folder
  elsewhere on the computer. VS Code then opens the file that the symbolic
  link points to, as it does from the Explorer.
- In a workspace with several folders, a link can open a file of every
  folder of the workspace.
- A file that is not inside a folder of the workspace, for example a file in
  the downloads folder, can link to every file in its own folder and in its
  subfolders.

## Security problems

Do not report a security problem in a public issue. Write an e-mail to
scalarion@nimblescape.com instead.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](../LICENSE).
