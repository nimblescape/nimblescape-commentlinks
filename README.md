# nimblescape Markdown Comment Links

Makes the Markdown links in code comments clickable. A comment shows only the
label of a link, and a click opens the target at the heading that the link
names. While you write a link, the extension completes its paths and
headings.

```go
// Assures: [A-UNIT-001](docs/architecture/unit.md#a-unit-001)
```

The comment above shows `// Assures: A-UNIT-001`, and a click on
`A-UNIT-001` opens `unit.md` at the heading `A-UNIT-001`. The lines of the
cursor show the whole link, so that it can be edited.

## What the extension does on your computer

- It reads the text of the open files of the [listed languages](#files) and
  finds the links in their comments.
- For each link, it asks VS Code whether the target file exists. It reads a
  Markdown target when you follow a link to a heading or complete a heading,
  and it lists a folder when you complete a path.
- A link opens only a file inside a folder of the workspace. In a file that
  is not inside a folder of the workspace, a link opens only a file inside
  the folder of that file.
- It changes no file and no setting, starts no process, makes no network
  connection and collects no telemetry.
- It also runs in Restricted Mode, because it only reads files. It does not
  run in VS Code for the Web.

## Link resolution

The extension reads links of the form `[label](target)` in comments. It
resolves a relative target in this order, and the first existing file wins:

1. Relative to the folder of the file that holds the comment.
2. Relative to the workspace folder.

A target outside the folders of the workspace counts as no file, for example
`../../../outside.md` from a file two folders below the workspace folder. In
a file that is not inside a folder of the workspace, only a target inside the
folder of that file counts.

A click opens the target with the editor that VS Code uses for its file type.
A fragment such as `#a-unit-001` opens a Markdown file at the heading with
that anchor. The anchor is the heading text in lower case, without
punctuation and with hyphens for spaces. The extension adds no link to a web
address, an absolute path, a bare fragment or a target without a file, and
such a link stays fully visible.

## Files

The extension reads the comments of these files. Text in a string is no
comment.

| Files | Comments |
| --- | --- |
| Go | `//` and `/* */` |
| Go module files (`go.mod`) | `//` |
| JavaScript, TypeScript, JSX and TSX | `//` and `/* */` |
| JSON and JSON with Comments | `//` and `/* */` |
| CSS | `/* */` |
| SCSS and Less | `//` and `/* */` |
| HTML and XML | `<!-- -->` |
| YAML, GitHub Actions workflows, shell scripts, Dockerfiles, ignore files, Makefiles and TOML | `#` |
| Properties and INI files | `#` and `;` |
| SQL | `--` and `/* */` |

A `#` or a `;` starts a comment only at the start of a line or after white
space. Markdown files keep the link handling of VS Code.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| `nimblescape.markdownCommentLinks.hideTargets` | `true` | Shows only the label of a resolved link. The value `false` shows every link completely. |

## Earlier IDs

The extension was published earlier under two other IDs:
`nimblescape.comment-markdown-links` and
`nimblescape.nimblescape-comment-markdown-links`. It is the same extension.
The earlier IDs are no longer used, and the extension gets no other ID: its
only ID is `nimblescape.nimblescape-markdown-comment-links`.

---

[Change log](https://github.com/nimblescape/nimblescape-markdown-comment-links/blob/main/CHANGELOG.md) · [Contributing](https://github.com/nimblescape/nimblescape-markdown-comment-links/blob/main/CONTRIBUTING.md) · [Issues](https://github.com/nimblescape/nimblescape-markdown-comment-links/issues) · [Source](https://github.com/nimblescape/nimblescape-markdown-comment-links)

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](https://github.com/nimblescape/nimblescape-markdown-comment-links/blob/main/LICENSE).
