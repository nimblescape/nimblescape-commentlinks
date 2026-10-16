# Change log

Each section lists the changes of one released version. The release workflow
takes the section of a version as the notes of its GitHub release.

Versions 0.1.1 to 0.1.8 contain the same extension as 0.1.0: they changed
only the release process and the version number, which followed nimblescape
Devspaces. From version 0.2.0 on, the extension has its own version numbers,
and a version is released only when it changes something for its users, as
the [release rules](https://github.com/nimblescape/nimblescape-markdown-comment-links/blob/main/CONTRIBUTING.md#release-rules)
require.

## 0.2.0

**Links only inside the workspace:** a link in a comment now opens only a
file inside a folder of the workspace. A file that is not inside a folder of
the workspace can also link to the files inside its own folder. Before,
a target such as `../../../etc/hostname` could open any file of the computer,
while the label hid the target. Such a link is now no link and stays fully
visible. The command behind the links opens only the files that the links of
the window name.

**Long lines:** the search for links and headings now takes linear time.
Before, a comment line with thousands of brackets, or a heading line of a
Markdown file with thousands of spaces, could stop the extension host of VS
Code for seconds.

**Fewer checks while you type:** after a change of a file, the extension
waits 150 ms without a further change before it checks the links of the file
again. The links and the hidden targets share one check of each version of a
file.

An editor association (`workbench.editorAssociations`) whose pattern is no
valid glob, for example one with an open brace, no longer stops the links to
headings.

The README now says what the extension does on your computer, and names the
earlier IDs of the extension.

## 0.1.8

Maintenance release: the version follows nimblescape Devspaces 0.1.8; the extension behaves as in 0.1.7.

## 0.1.7

Maintenance release: the version commit reaches main only after CI passed, and a dry run tests a release without a change; the extension behaves as in 0.1.6.

## 0.1.6

Maintenance release: the workflow "Release" created this version commit; the extension behaves as in 0.1.5.

## 0.1.5

Maintenance release: a manual start of the workflow "Release" sets the
version, creates the tag and publishes the release; the extension behaves as
in 0.1.3.

## 0.1.3

Maintenance release: the release publishes the package that CI tested and
built; the extension behaves as in 0.1.1.

## 0.1.1

Maintenance release: the test tool and the contribution guide changed; the
extension behaves as in 0.1.0.

## 0.1.0

Initial release. The extension was published before under the IDs
`nimblescape.comment-markdown-links` and
`nimblescape.nimblescape-comment-markdown-links`, which are no longer used.

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) ·
[MIT License](https://github.com/nimblescape/nimblescape-markdown-comment-links/blob/main/LICENSE).
