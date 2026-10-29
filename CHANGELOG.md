# Change log

Each section lists the changes of one released version. The release workflow
takes the section of a version as the notes of its GitHub release.

## 0.2.0

- When the label of a link is empty or holds only spaces, as in `[](`, the
  file or the heading that you choose in the completion also becomes the
  label. A file gives its name, for example
  `[requirements.md](docs/requirements.md)`, and a heading then gives its text
  in place of that name, for example
  `[R-ORDER-003](docs/requirements.md#r-order-003)`. The label keeps only the
  letters (also with accents), digits, spaces and the characters
  `. , ( ) _ / + -`. A label with other text stays as it is, and a name or a
  heading without letters or digits fills no label.
- A second chosen file or heading corrects the label: it replaces the name of
  another file of the list or the text of another heading of the file, as the
  completion wrote it.
- The completion offers only names of letters, digits and the characters
  `. , _ + -`. A file or a folder with a space, a parenthesis, `#`, `--` or a
  hyphen at the end of its name is no longer offered, because such a name
  ends the path of the target or can break the comment.

## 0.1.0

The first version.

- Makes the Markdown links in code comments clickable, for example
  `// Assures: [A-UNIT-001](docs/architecture/unit.md#a-unit-001)`. A click
  opens the target with the editor that VS Code uses for its file type, and
  a fragment such as `#a-unit-001` opens a Markdown file at the heading with
  that anchor.
- Shows only the label of a resolved link: the brackets and the target are
  hidden, and the lines of the cursor show the whole link. A link whose
  target resolves to no file stays fully visible. The setting
  `nimblescape.commentlinks.hideTargets` turns the hiding off.
- Completes the paths and the headings of a link while you write it.
- Reads the comments of Go, Go module, JavaScript, TypeScript, JSX, TSX,
  JSON, CSS, SCSS, Less, HTML, XML, YAML, GitHub Actions workflow, shell
  script, Dockerfile, ignore, Makefile, TOML, properties, INI and SQL files.
- A link opens only a file inside a folder of the workspace. A file that is
  not inside a folder of the workspace can also link to the files inside its
  own folder and its subfolders.
- The extension changes no file and no setting, starts no process, makes no
  network connection and collects no telemetry. It also runs in Restricted
  Mode and in virtual workspaces. It does not run in VS Code for the Web.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/commentlinks-vscode/blob/main/LICENSE).
