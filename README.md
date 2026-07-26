# ide-texlab

Texlab language-server adapter for LaTeX.

Registers the [texlab](https://github.com/latex-lsp/texlab) language server with the bundled `ide-client` package, providing completions, diagnostics, navigation, and formatting for LaTeX and BibTeX documents.

## Features

- **PATH discovery**: finds `texlab` on your PATH, or uses the Server Path setting.
- **LaTeX and BibTeX**: serves the LaTeX grammars (including Beamer and memoir) and BibTeX files.
- **Project sessions**: one server per project root, started lazily with the first matching editor.

## Installation

To install `ide-texlab` search for _ide-texlab_ in the Install pane of the Lumine settings or run `lumine --install lumine-code/ide-texlab`. The `texlab` binary itself is installed separately — most TeX distributions and package managers ship it.

## Services

- **ide-client** (`^1.0.0`): consumed to register the Texlab adapter with the editor's language-server client.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
