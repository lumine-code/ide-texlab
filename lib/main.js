const { resolveServer, managedServer } = require("./server");

const setting = (key) => lumine.config.get(`ide-texlab.${key}`);
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
      lumine.notifications.addWarning(`Ignoring an invalid pattern in ide-texlab.${key}`, {
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
      restartKeyPaths: ["ide-texlab.serverPath"],
      managedServer,
      async resolveServer(context) {
        const launch = await resolveServer(setting("serverPath"), context.managedServer);
        if (!launch) {
          // The hub owns the wording, the once-per-window dedupe, the Install
          // button and the opt-out, so every adapter says this the same way.
          service.reportMissingServer("ide-texlab", {
            description:
              "Install [texlab](https://github.com/latex-lsp/texlab) and make sure it is on your PATH, or set its location in the ide-texlab settings. The editor can also fetch it for you.",
          });
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
        return section ? lumine.config.get(section) : { texlab: texlabOptions() };
      },
    };

    return service.registerAdapter(adapter);
  },
};
