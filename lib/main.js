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
  let escaped = false;
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (escaped) {
      if (/[1-9]/.test(character) || (character === "k" && pattern[index + 1] === "<"))
        return "backreferences are not supported by Texlab's Rust regex engine";
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character !== "(" || pattern[index + 1] !== "?") continue;
    const operator = pattern.slice(index + 2, index + 4);
    if (["=", "!", "<=", "<!"].some((prefix) => operator.startsWith(prefix)))
      return "look-around is not supported by Texlab's Rust regex engine";
  }
  return null;
};

// Texlab unwraps the result of parsing the configuration it pulled, so one
// pattern it cannot compile takes down the thread that read it — with no
// message, and no way for the user to tell that a typo is why their filters
// stopped working. A pattern this engine rejects is reported and dropped
// instead. JavaScript and Rust use different engines, so the compatibility
// check below also rejects JavaScript's look-around and backreferences.
const patterns = (key) => {
  const kept = [];
  for (const pattern of setting(key) || []) {
    try {
      new RegExp(pattern);
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

module.exports.unsupportedRustRegex = unsupportedRustRegex;
