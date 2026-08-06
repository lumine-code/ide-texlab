const { CompositeDisposable } = require("atom");
const { resolveServer } = require("./server");

let missingReported = false;

const setting = (key) => atom.config.get(`ide-texlab.${key}`);
// An empty setting means "no opinion", so it is left out and Texlab keeps its
// own default rather than being told to use nothing.
const text = (key) => setting(key) || undefined;
const list = (key) => {
  const value = setting(key);
  return value?.length ? value : undefined;
};
const positive = (key) => {
  const value = setting(key);
  return value > 0 ? value : undefined;
};

// Texlab unwraps the result of parsing the configuration it pulled, so one
// pattern it cannot compile takes down the thread that read it — with no
// message, and no way for the user to tell that a typo is why their filters
// stopped working. A pattern this engine rejects is reported and dropped
// instead. It is not the same engine, so this catches the ordinary typo rather
// than every disagreement: Rust's `regex` has no lookaround, and a pattern
// using it passes here and still fails there.
const patterns = (key) => {
  const kept = [];
  for (const pattern of setting(key) || []) {
    try {
      new RegExp(pattern);
      kept.push(pattern);
    } catch (error) {
      atom.notifications.addWarning(`Ignoring an invalid pattern in ide-texlab.${key}`, {
        detail: `${pattern}\n${error.message}`,
        dismissable: true,
      });
    }
  }
  return kept;
};

// The shape Texlab deserializes. It pulls this from the client whenever the
// client advertises `workspace/configuration` — which ours does — so this, not
// the push, is what actually configures the server.
const texlabOptions = () => ({
  build: {
    executable: text("build.executable"),
    args: list("build.args"),
    onSave: setting("build.onSave"),
    forwardSearchAfter: setting("build.forwardSearchAfter"),
    auxDirectory: text("build.auxDirectory"),
    logDirectory: text("build.logDirectory"),
    pdfDirectory: text("build.pdfDirectory"),
    filename: text("build.filename"),
  },
  forwardSearch: {
    executable: text("forwardSearch.executable"),
    args: list("forwardSearch.args"),
  },
  chktex: {
    onOpenAndSave: setting("chktex.onOpenAndSave"),
    onEdit: setting("chktex.onEdit"),
    additionalArgs: list("chktex.additionalArgs"),
  },
  latexFormatter: setting("latexFormatter"),
  bibtexFormatter: setting("bibtexFormatter"),
  formatterLineLength: positive("formatterLineLength"),
  latexindent: {
    local: text("latexindent.local"),
    modifyLineBreaks: setting("latexindent.modifyLineBreaks"),
    replacement: text("latexindent.replacement"),
  },
  diagnosticsDelay: positive("diagnosticsDelay"),
  diagnostics: {
    allowedPatterns: patterns("diagnostics.allowedPatterns"),
    ignoredPatterns: patterns("diagnostics.ignoredPatterns"),
  },
  symbols: {
    allowedPatterns: patterns("symbols.allowedPatterns"),
    ignoredPatterns: patterns("symbols.ignoredPatterns"),
  },
  inlayHints: {
    labelDefinitions: setting("inlayHints.labelDefinitions"),
    labelReferences: setting("inlayHints.labelReferences"),
    maxLength: positive("inlayHints.maxLength"),
  },
  completion: { matcher: setting("completion.matcher") },
  hover: { symbols: setting("hover.symbols") },
  experimental: {
    followPackageLinks: setting("experimental.followPackageLinks"),
    mathEnvironments: setting("experimental.mathEnvironments") || [],
    enumEnvironments: setting("experimental.enumEnvironments") || [],
    verbatimEnvironments: setting("experimental.verbatimEnvironments") || [],
    citationCommands: setting("experimental.citationCommands") || [],
    glossaryReferenceCommands: setting("experimental.glossaryReferenceCommands") || [],
    labelDefinitionCommands: setting("experimental.labelDefinitionCommands") || [],
    labelReferenceCommands: setting("experimental.labelReferenceCommands") || [],
    labelReferenceRangeCommands: setting("experimental.labelReferenceRangeCommands") || [],
  },
});

module.exports = {
  consumeIdeClient(service) {
    const adapter = {
      id: "ide-texlab",
      displayName: "Texlab Language Server",
      grammarScopes: [
        "text.tex.latex",
        "text.tex.latex.beamer",
        "text.tex.latex.memoir",
        "text.bibtex",
      ],
      sessionScope: "project-root",
      settingsKeyPaths: ["ide-texlab"],
      async resolveServer(context) {
        const launch = await resolveServer(setting("serverPath"));
        if (!launch) {
          if (!missingReported) {
            missingReported = true;
            atom.notifications.addError("Unable to find texlab", {
              description:
                "Install [texlab](https://github.com/latex-lsp/texlab) and make sure it is on your PATH, or set its location in the ide-texlab settings.",
              dismissable: true,
            });
          }
          return null;
        }
        return { ...launch, cwd: context.rootPath, transport: "stdio" };
      },
      getSettings() {
        return { texlab: texlabOptions() };
      },
      // Texlab asks for the `texlab` section and parses the answer as its
      // options directly, so this returns them unwrapped.
      getWorkspaceConfiguration(section) {
        if (section === "texlab") return texlabOptions();
        return section ? atom.config.get(section) : { texlab: texlabOptions() };
      },
    };

    const subscriptions = new CompositeDisposable(service.registerAdapter(adapter));
    // Everything else is re-pulled on didChangeConfiguration; which executable
    // is running is settled when it starts.
    subscriptions.add(
      atom.config.onDidChange("ide-texlab.serverPath", () => {
        for (const session of service.getSessions()) {
          if (session.adapter !== adapter || ["stopping", "stopped"].includes(session.state))
            continue;
          service.restart(session).catch((error) => {
            atom.notifications.addError("Unable to restart Texlab Language Server", {
              detail: error.message,
              dismissable: true,
            });
          });
        }
      }),
    );
    return subscriptions;
  },
};
