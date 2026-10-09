const { resolveServer, managedServer } = require("./server");

const setting = (key) => lumine.config.get(`ide-texlab.${key}`);
// An empty setting means "no opinion", so it is left out and Texlab keeps its
// own default rather than being told to use nothing.
const text = (key) => setting(key) || undefined;
const list = (key) => {
  const value = setting(key);
  return value?.length ? value : undefined;
};
const nonNegative = (key) => {
  const value = setting(key);
  return typeof value === "number" && value >= 0 ? value : undefined;
};

const unsupportedRustRegex = (pattern) => {
  // Compile with the same Rust regex engine Texlab uses. JavaScript rejects
  // valid Rust flags, named groups and character classes, while accepting
  // constructs that can panic Texlab's configuration reader.
  const { RRegex } = require("rregex");
  try {
    const expression = new RRegex(pattern);
    expression.free();
    return null;
  } catch (error) {
    return error.message;
  }
};
// Texlab unwraps the result of parsing the configuration it pulled, so one
// pattern it cannot compile takes down the thread that read it — with no
// message, and no way for the user to tell that a typo is why their filters
// stopped working. A pattern this engine rejects is reported and dropped
// instead, using Rust's parser rather than a JavaScript approximation.
const patterns = (key) => {
  const kept = [];
  for (const pattern of setting(key) || []) {
    try {
      const unsupported = unsupportedRustRegex(pattern);
      if (unsupported) throw new Error(unsupported);
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
    useFileList: setting("build.useFileList"),
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
  formatterLineLength: nonNegative("formatterLineLength"),
  latexindent: {
    local: text("latexindent.local"),
    modifyLineBreaks: setting("latexindent.modifyLineBreaks"),
    replacement: text("latexindent.replacement"),
  },
  diagnosticsDelay: nonNegative("diagnosticsDelay"),
  diagnostics: {
    allowedPatterns: patterns("diagnostics.allowedPatterns"),
    ignoredPatterns: patterns("diagnostics.ignoredPatterns"),
  },
  symbols: {
    allowedPatterns: patterns("symbols.allowedPatterns"),
    ignoredPatterns: patterns("symbols.ignoredPatterns"),
    customEnvironments: setting("symbols.customEnvironments") || [],
  },
  inlayHints: {
    labelDefinitions: setting("inlayHints.labelDefinitions"),
    labelReferences: setting("inlayHints.labelReferences"),
    maxLength: nonNegative("inlayHints.maxLength"),
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
    labelDefinitionPrefixes: setting("experimental.labelDefinitionPrefixes") || [],
    labelReferencePrefixes: setting("experimental.labelReferencePrefixes") || [],
  },
});

module.exports = {
  consumeIde(service) {
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
        const launch = await resolveServer(context, setting("serverPath"));
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
    };

    return service.registerAdapter(adapter);
  },
};

module.exports.unsupportedRustRegex = unsupportedRustRegex;
