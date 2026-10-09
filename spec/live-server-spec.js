const fs = require("fs");
const os = require("os");
const path = require("path");
const { findOnPath } = require("./helpers/server-resolver");
const { LiveLspClient, fileUri } = require("./helpers/live-lsp-client");

const serverPath = process.env.TEXLAB_PATH || findOnPath("texlab");
const liveSuite = serverPath ? describe : () => {};

liveSuite("ide-texlab official server", () => {
  let adapter, client, disposable, rootPath, main;
  let originalTimeout;

  beforeEach(async () => {
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.returnValue(Promise.resolve());
    spyOn(lumine.application, "openWindow").and.returnValue(Promise.resolve());
    jasmine.useRealClock();
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;
    rootPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ide-texlab-live-")));
    main = (await lumine.packages.activatePackage("ide-texlab")).mainModule;
    lumine.config.set("ide-texlab.serverPath", serverPath);
    lumine.config.set("ide-texlab.diagnosticsDelay", 0);
    lumine.config.set("ide-texlab.latexFormatter", "none");
    disposable = main.consumeIde({
      registerAdapter(registered) {
        adapter = registered;
        return { dispose() {} };
      },
      reportMissingServer() {},
    });
    client = new LiveLspClient(adapter, rootPath);
  });

  afterEach(async () => {
    await client.stop();
    disposable.dispose();
    for (const key of [
      "serverPath",
      "diagnosticsDelay",
      "latexFormatter",
      "diagnostics.allowedPatterns",
      "symbols.ignoredPatterns",
    ])
      lumine.config.unset(`ide-texlab.${key}`);
    await lumine.packages.deactivatePackage("ide-texlab");
    const relative = path.relative(fs.realpathSync(os.tmpdir()), fs.realpathSync(rootPath));
    if (
      !relative ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      throw new Error("Texlab fixture cleanup must remain inside its owned temporary directory.");
    fs.rmSync(rootPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  it("serves diagnostics, completion, formatting and document structure", async () => {
    const { capabilities, serverInfo } = await client.start();
    expect(serverInfo.name).toBe("TexLab");
    if (process.env.TEXLAB_VERSION) expect(serverInfo.version).toBe(process.env.TEXLAB_VERSION);
    else expect(serverInfo.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(capabilities.completionProvider.resolveProvider).toBe(true);
    expect(capabilities.documentFormattingProvider).toBe(true);
    expect(capabilities.inlayHintProvider).toBe(true);

    const texUri = fileUri(path.join(rootPath, "main.tex"));
    client.open(
      texUri,
      "latex",
      "\\documentclass{article}\n\\begin{document}\n\\section{Intro}\n\\label{dup}\n\\label{dup}\n\\ref{missing}\n\\sec\n\\end{document}\n",
    );
    const diagnostics = await client.waitFor(
      () =>
        client
          .messages("textDocument/publishDiagnostics")
          .find(({ params }) =>
            params.diagnostics.some(({ message }) => message === "Duplicate label"),
          )?.params.diagnostics,
      "duplicate-label diagnostics",
    );
    expect(diagnostics.some(({ message }) => message === "Undefined reference")).toBe(true);

    const completion = await client.request("textDocument/completion", {
      textDocument: { uri: texUri },
      position: { line: 6, character: 4 },
    });
    expect(completion.items.map(({ label }) => label)).toContain("sec");
    const symbols = await client.request("textDocument/documentSymbol", {
      textDocument: { uri: texUri },
    });
    expect(symbols.map(({ name }) => name)).toContain("Intro");

    const bibUri = fileUri(path.join(rootPath, "references.bib"));
    client.open(bibUri, "bibtex", "@article{key,title={Title},author={Name}}\n");
    const edits = await client.request("textDocument/formatting", {
      textDocument: { uri: bibUri },
      options: { tabSize: 2, insertSpaces: true },
    });
    expect(edits[0].newText).toContain("title = {Title}");
  });

  it("uses Rust flags, verbose comments and dotted capture names in server filters", async () => {
    lumine.config.set("ide-texlab.diagnostics.allowedPatterns", ["(?x)^Duplicate\\x20#(\nlabel$"]);
    lumine.config.set("ide-texlab.symbols.ignoredPatterns", ["(?i)(?P<name.part>^intro$)"]);
    await client.start();
    const uri = fileUri(path.join(rootPath, "filters.tex"));
    client.open(
      uri,
      "latex",
      "\\documentclass{article}\n\\begin{document}\n\\section{Intro}\n\\label{dup}\n\\label{dup}\n\\ref{missing}\n\\section{Keep}\n\\end{document}\n",
    );
    const diagnostics = await client.waitFor(
      () =>
        client
          .messages("textDocument/publishDiagnostics")
          .find(({ params }) =>
            params.diagnostics.some(({ message }) => message === "Duplicate label"),
          )?.params.diagnostics,
      "Rust-filtered duplicate-label diagnostics",
    );
    expect(diagnostics.every(({ message }) => message === "Duplicate label")).toBeTrue();
    const symbols = await client.request("textDocument/documentSymbol", {
      textDocument: { uri },
    });
    expect(symbols.map(({ name }) => name)).toEqual(["Keep"]);
  });
});
