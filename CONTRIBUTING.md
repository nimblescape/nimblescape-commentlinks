# Contributing

This guide explains the files, the development, the tests and the release of
the extension. The [README](README.md) describes the use in short, and the
section [How the extension works](#how-the-extension-works) keeps the details.

## Files

| File | Purpose |
| --- | --- |
| `src/extension.ts` | The editor wiring: the link provider, the command that opens a target, the choice of the editor, the hiding of targets and the completion. |
| `src/links.ts` | The text functions: the comment syntaxes, the comment scanner, the link finder and the heading lookup. They use no editor API and no file system. |
| `src/extension.test.ts`, `src/links.test.ts` | The tests of the two modules, with vitest. The extension test loads `src/extension.ts` with a fake editor API and also checks the manifest, `.vscodeignore` and the documents. |
| `dist/` | The bundle `dist/extension.js`, built by `esbuild.mjs` and kept out of Git. |
| `resources/icon.png`, `resources/icon.svg` | The Marketplace icon (256 × 256 PNG, because the Marketplace takes no SVG icon) and its source: a comment bubble with a link on the tile of the nimblescape extensions. |
| `esbuild.mjs` | Bundles `src/extension.ts` and the modules that it imports into `dist/extension.js`. The editor API stays outside the bundle. A production build (`--production`) is minified and has no source map. |
| `tsconfig.json` | The TypeScript settings of the type check: strict, and no output, because esbuild builds the bundle. |
| `vitest.config.mts` | The settings of the tests: the files `src/**/*.test.ts` on Node. |
| `package.json` | The extension manifest. The section [Manifest](#manifest) explains it. |
| `package-lock.json` | The locked development tools. npm writes this file, and nobody edits it by hand. |
| `.node-version` | The Node release of the development tools. `actions/setup-node` in the workflows and local Node version managers read it. |
| `.vscodeignore` | Lists the files of the package: `dist/extension.js`, `resources/icon.png`, `package.json`, `README.md`, `CHANGELOG.md` and `LICENSE`. |
| `.github/workflows/ci.yml` | Checks the types, tests and packages every push to `main`, every pull request and the commit of every release. |
| `.github/workflows/release.yml` | Releases a version on a manual start: commits the version, tests and packages it with `ci.yml`, creates its tag and GitHub release and publishes it to the Marketplace. The section [Release](#release) explains it. |
| `.github/workflows/marketplace-identity.yml` | Prints the Marketplace member ID of the publishing identity, to check the setup of the repository. |
| `.github/dependabot.yml` | Proposes weekly updates of the development tools and of the pinned actions. |
| `scripts/marketplace-setup.sh` | Sets up the Marketplace publishing of the repository. The section [Setup of a repository](#setup-of-a-repository) explains it. |
| `.vscode/launch.json`, `.vscode/tasks.json` | Build the bundle and start a VS Code window that loads the extension from this folder. |

## Development

The extension uses VS Code APIs and has no npm runtime dependency. The
development tools are TypeScript, esbuild, vitest and
[`@vscode/vsce`](https://github.com/microsoft/vscode-vsce), the Microsoft tool
that packages and publishes extensions. Everything runs on Node.js 24: the
release in `.node-version` for the tools and CI, and the runtime of VS Code
1.125 and later (`engines.vscode`) for the extension.

| Command | Effect |
| --- | --- |
| `npm ci --ignore-scripts` | Installs the locked development tools and runs no install script of a dependency. |
| `npm run typecheck` | Checks the types with `tsc`. esbuild does not check them. |
| `npm test` | Runs the tests with vitest. The tests touch no installed editor. |
| `npm run build` | Bundles `dist/extension.js` with a source map. |
| `npm run package` | Builds `nimblescape-markdown-comment-links-<version>.vsix` with vsce, which first runs the production build (`vscode:prepublish`). vsce also validates the manifest and the README. |
| `code --install-extension nimblescape-markdown-comment-links-<version>.vsix` | Installs the built package. Reload the window after an update of an active extension. |

The launch configuration "Run the extension" builds the bundle and starts a
second VS Code window that loads the extension from this folder, so that a
change can be tried without a package.

## Manifest

`package.json` is the extension manifest. It has these parts:

- The name and the publisher define the extension ID `nimblescape.nimblescape-markdown-comment-links`; the section [Naming](#naming) explains the name.
- The version is the only source of the package version, and the tag of a release names it.
- The engine range defines the compatible VS Code versions. `@types/vscode` stays at the lowest version of that range.
- `main` selects the bundle `dist/extension.js`. A test checks it.
- `.vscodeignore` lists the files of the package, not a `files` field: it ignores everything and keeps the bundle, the icon, `package.json`, `README.md`, `CHANGELOG.md` and `LICENSE`. A test checks the list and that the bundle leaves out the editor API only.
- `extensionKind` selects the workspace host.
- The activation events activate the extension when a document of a listed language opens. A test keeps them equal to the language table of `src/links.ts`.
- The configuration contribution declares the setting that turns the hiding of targets off.
- The untrusted-workspace and virtual-workspace capabilities state that the extension only reads.
- The development dependencies are the build, test and packaging tools. The manifest declares no runtime dependency.

The file table of the README follows the language table of `src/links.ts`,
and the settings table of the README follows the configuration
contribution. A test checks that the README names every setting.

`README.md` is the page of the Marketplace and `CHANGELOG.md` its tab
"Changelog". vsce does not rewrite relative links
(`--no-rewrite-relative-links`), so both use full `https://github.com/…`
links outside code. A test checks it.

## How the extension works

### Links on the label

The extension registers one document link provider for the listed
languages. The editor link covers the label of `[label](target)`, as in
rendered Markdown, for one more reason. The Go language server takes the file
name of a target such as `unit.md#a-unit-001` for a web address, because
`.md` is also a top-level domain, and links it to `https://unit.md`. The
editor keeps only one of two links that overlap: the link of the provider
that registered later. The Go language server registers its provider after
this extension and again after every restart, so a link on the target would
disappear behind that web-address link, and the extension cannot remove it.
The extension hides the target instead, so that the web-address link shows
no underline.

### Hidden targets

An editor decoration hides the brackets and the target of every resolved
link. The text stays in the file. The lines that a cursor or a selection
touches show the whole link. A link whose target resolves nowhere stays
visible, so that a broken citation is seen. The editor offers no interface
for hidden text, so the decoration uses the `display` style through its text
decoration, as other extensions do.

### Opening a target

Every link opens through a command of the extension. The command opens the
target with the editor that the window associates with it, as the setting
`workbench.editorAssociations` and the menu "Set Default for '*.md'" record
it. A Markdown target with a fragment opens at the heading the fragment names
where that editor can show one:

| Default editor | Opens at |
| --- | --- |
| Text Editor | the heading, at the top of the view |
| Markdown Preview | the heading, through the fragment of the resource |
| Markdown Editor, or another editor | the start of the document, with the line of the heading as the requested selection |

For every editor other than the Markdown Preview, the command reads the
current text of the target and looks for the first heading whose anchor
equals the fragment. Headings inside fenced code blocks do not count. The
Markdown Editor ignores the requested selection, because VS Code passes no
selection to a custom editor, as
[microsoft/vscode#289785](https://github.com/microsoft/vscode/issues/289785)
records. A fragment without a heading requests the start of the document. A
target without a fragment opens as the editor opens files.

The editor moves the cursor to a mouse click before it follows a link. The
command puts the cursor of the source editor back to where it was before the
click, so that following a link with the mouse moves no cursor and reveals no
hidden target.

### Completion

While a Markdown link to a local file is written in a comment, the extension
completes its target. Before a number sign it offers the folders and files of
the directory that the target names, resolved like a link: the entries beside
the file first, then the entries of the workspace folder. A folder inserts
its name with a slash and opens the next completion. After the number sign of
a Markdown target it offers the anchors of the headings of that document,
with the heading text as the detail. The completion opens on `(`, `/` and
`#`, and on the completion key of the editor. A link to a web address, an
absolute path or a bare fragment gets no completion.

### Scope and limits

The extension reads files through the workspace file system, changes no
file, runs no process and needs no opt-in. It supports untrusted and virtual
workspaces, because it only reads. It runs in the workspace host
(`extensionKind: workspace`), so it resolves links on a remote host, for
example in a Codespace.

The extension recognizes links in comments only. It resolves no link in a
string literal, in a generated documentation view, in a Markdown file or in a
language outside the table of the README. A script or style block inside an
HTML document follows the markup syntax, so the comment markers of the script
or style language are not recognized there.

## Naming

Every extension of the publisher `nimblescape` uses one name,
`nimblescape-<name>`, for the repository, the package and the extension:

| What | Form | This extension |
| --- | --- | --- |
| Repository | `nimblescape/nimblescape-<name>` | `nimblescape/nimblescape-markdown-comment-links` |
| `name` in `package.json` | `nimblescape-<name>` | `nimblescape-markdown-comment-links` |
| Extension ID | `nimblescape.nimblescape-<name>` | `nimblescape.nimblescape-markdown-comment-links` |
| Package file | `nimblescape-<name>-<version>.vsix` | `nimblescape-markdown-comment-links-<version>.vsix` |
| Display name | `nimblescape <Title>` | `nimblescape Markdown Comment Links` |

The prefix keeps the name apart from the names of other publishers, because
the Marketplace accepts a `name` only once. The Marketplace cannot rename an
extension ID: another `name` publishes a new extension, and the old one stays
with its installations. An extension that is no longer wanted is unpublished
(More Actions, Unpublish, which can be undone), never removed: the Marketplace
keeps the `name` of a removed extension reserved for good, also for its own
publisher.

## Release

A released version is a tag `v<version>` whose `<version>` equals the version
in `package.json`. The workflow "Release" creates the version, its tag, its
GitHub release and its Marketplace version in one run. To release a version,
follow these steps:

1. Optional: add a section `## <version>` to `CHANGELOG.md` on `main`.
2. In the tab "Actions", choose the workflow "Release", then "Run workflow" on the branch `main`. Enter the version, for example `0.1.6`. When `CHANGELOG.md` has no section for the version, enter its notes too: they become the section. The GitHub website starts a workflow also in the browser of a phone.

The run has four jobs:

1. "Version commit" checks that the run starts from `main`, that the version has the form `<major>.<minor>.<patch>`, that it is not lower than the version in `package.json` and that its tag does not exist. It sets the version in `package.json` and `package-lock.json`, adds the section of the notes to `CHANGELOG.md` when the file has none, commits the change as "Release `<version>`" and pushes it to `main`. When `main` holds the version and its section already, it commits nothing. When `main` changed during the run, the push fails and the run changes nothing. The job pushes with the token of the workflow, so a rule of `main` that blocks direct pushes stops it.
2. "CI" runs the workflow `ci.yml` for the commit of the version, because a push with the token of a workflow starts no other workflow. The VSIX that this job tests and builds is the VSIX of the release, so the release repeats no test and no build.
3. "Tag and GitHub release" creates the tag `v<version>` on the commit and the release of the tag with the GitHub CLI `gh`. The section of the version in `CHANGELOG.md` becomes the notes, and the VSIX becomes the file of the release. A release that exists keeps its notes and receives the VSIX only when it holds none.
4. "Publish to the Visual Studio Marketplace" downloads the VSIX of the GitHub release, signs in to Microsoft Entra ID with the official [`azure/login`](https://github.com/Azure/login) action and publishes the VSIX with `vsce publish --azure-credential`.

When a job fails, remove the cause and choose "Re-run failed jobs" on the
run. A re-run keeps the tag and the VSIX that the GitHub release already
holds, and the Marketplace skips a version that it already holds, so a re-run
never publishes a version twice. When the tests fail, fix the code on `main`
and start a new run with the same version: `main` holds the version already,
so the run tests and releases the fix.

The workflows `release.yml` and `marketplace-identity.yml` and this section
are the same in every extension repository of nimblescape. A change to them
goes into every repository.

## Marketplace setup

The workflow publishes with a Microsoft Entra ID token, as the
[Microsoft publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
recommends. It uses no personal access token, because Azure DevOps retires
the global personal access tokens that the Marketplace needs on
1 December 2026. The publishing identity is an app registration with a
federated credential for each repository: GitHub Actions proves the identity
of the job with an OpenID Connect token, so no secret is stored. An app
registration needs no Azure subscription. One app registration publishes
every extension of the publisher `nimblescape`, because the Marketplace
grants the role of a member for the whole publisher.

### What exists

| Part | Where | Value |
| --- | --- | --- |
| Publisher | [Marketplace publisher management](https://marketplace.visualstudio.com/manage) | `nimblescape`, the `publisher` in `package.json` |
| App registration | [Microsoft Entra admin center](https://entra.microsoft.com), "App registrations" | `vscode-marketplace-publisher`, a member of the publisher `nimblescape` with the role "Contributor" |
| Organization variables | GitHub organization `nimblescape`, "Secrets and variables", "Actions", "Variables" | `AZURE_CLIENT_ID` (the application ID of the app) and `AZURE_TENANT_ID` (its directory ID); identifiers, not secrets |
| Federated credential | the app, "Certificates & secrets", "Federated credentials" | one for each repository, named after it |
| Environment | the settings of each repository, "Environments" | `marketplace`, reachable from the tags `v*` and the branch `main` only |

### Setup of a repository

A new extension repository needs its federated credential and its
environment. The script `scripts/marketplace-setup.sh` sets both up for the
GitHub repository of the remote `origin` of the clone, whose name must be the
`name` of `package.json`; it needs the Azure CLI, the GitHub CLI and Node.js,
the two CLIs signed in with an account that may change the app registration
and the settings of the repository. It shows what it sets up and
asks before it changes anything. It changes nothing that already exists, so it
can run again:

```sh
az login --allow-no-subscriptions
gh auth login
scripts/marketplace-setup.sh
```

Then run the workflow "Marketplace identity" in the tab "Actions" of the
repository: it signs in like the publish job and prints the member ID of the
app, which shows that the setup works.

The script gives the credential these values. For this repository:

| Field of the federated credential | Value |
| --- | --- |
| Issuer | `https://token.actions.githubusercontent.com` |
| Subject | `repo:nimblescape@156021698/nimblescape-markdown-comment-links@1415771729:environment:marketplace` |
| Audience | `api://AzureADTokenExchange` |

GitHub puts the owner ID and the repository ID into the subject of every
repository created after 15 July 2026, so a new owner of a reused name gets no
token. The subject also holds the name of the repository: after a rename of
the repository, run the script again and delete the credential of the old
name. One app accepts at most 20 federated credentials.

### Setup from scratch

Only when the publisher, the app or the variables are lost:

1. Create the publisher `nimblescape` on the publisher management page, signed in with the Microsoft account of nimblescape e.U.
2. Register the app `vscode-marketplace-publisher` in the Entra admin center: "New registration", "Single tenant", no API permission, no secret.
3. Set the organization variables `AZURE_CLIENT_ID` and `AZURE_TENANT_ID` to the application ID and the directory ID of the app. Organization variables reach private repositories only on a paid GitHub plan.
4. Set up a repository with the script, and run its workflow "Marketplace identity".
5. On the publisher management page, open the publisher `nimblescape`, then "Members", and add the member ID that the workflow printed with the role "Contributor".

---

© 2026 Hannes Stauss (scalarion@nimblescape.com) · [MIT License](LICENSE).
