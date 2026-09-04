# ide-texlab

Texlab language-server adapter for LaTeX.

Registers the [texlab](https://github.com/latex-lsp/texlab) language server with `ide-client`, providing completions, diagnostics, navigation, and formatting for LaTeX and BibTeX documents.

## Features

- **Server discovery**: uses the Server Path setting, a copy the editor installed for you, or `texlab` on your PATH, in that order.
- **Managed install**: downloads texlab from its GitHub releases and keeps it current.
- **LaTeX and BibTeX**: serves the LaTeX grammars (including Beamer and memoir) and BibTeX files.
- **Formatting**: chooses between the built-in formatter, `latexindent` and `tex-fmt` for `.tex` and `.bib` separately, with the line length and latexindent's own options alongside.
- **ChkTeX**: runs the style checker on open, on save, or as you type, with your own arguments.
- **Building**: compiles with `latexmk` or another program, can use the generated file list for project detection, and jumps a viewer to the cursor, off by default because the `latex-tools` package already does this.
- **Custom macros**: teaches the server your own symbol environments and citation, label, prefix, and glossary commands so it treats them like the standard ones.
- **Feature switches**: any of the ten capabilities Texlab serves can be turned off, which hands it to another server on the same file.
- **Project sessions**: one server per project root, started lazily with the first matching editor.

## Installation

Install `ide-client` first, then search for `ide-texlab` in the Install pane of the Lumine settings, or run `lumine --install lumine-code/ide-texlab`. You can provide the `texlab` binary from a TeX distribution or package manager, or let the editor fetch it from Manage Servers.

## Services

- `ide-client`: consumed to register the Texlab adapter with the editor's language-server client.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
