const path = require("path");
const { resolveServer, findOnPath, assetFor, managedServer } = require("../lib/server");
const main = require("../lib/main");

const registerAdapter = () => {
  let adapter;
  const disposable = main.consumeIdeClient({
    registerAdapter(registered) {
      adapter = registered;
      return { dispose() {} };
    },
    getSessions: () => [],
    restart: async () => {},
  });
  return { adapter, disposable };
};

describe("ide-texlab server resolution", () => {
  it("prefers the configured path", async () => {
    const launch = await resolveServer(process.execPath);
    expect(launch.command).toBe(process.execPath);
  });
  it("finds executables on a synthetic PATH", () => {
    const dir = path.dirname(process.execPath);
    const name = path.basename(process.execPath, path.extname(process.execPath));
    expect(findOnPath(name, { PATH: dir, PATHEXT: ".EXE" })).toBeTruthy();
    expect(findOnPath("definitely-not-a-real-binary", { PATH: dir })).toBeNull();
  });
  it("prefers a managed install over PATH, and the configured path over both", async () => {
    const managed = { binaryPath: "/managed/texlab", version: "5.26.0" };
    const launch = await resolveServer("", managed);
    expect(launch.command).toBe("/managed/texlab");
    expect(launch.version).toBe("5.26.0");
    expect((await resolveServer(process.execPath, managed)).command).toBe(process.execPath);
  });
  it("names the exact release asset for each platform it supports", () => {
    // Texlab names assets by architecture and system, not by Rust target.
    expect(assetFor({ platform: "win32", arch: "x64" })).toBe("texlab-x86_64-windows.zip");
    expect(assetFor({ platform: "darwin", arch: "arm64" })).toBe("texlab-aarch64-macos.tar.gz");
    expect(assetFor({ platform: "linux", arch: "x64" })).toBe("texlab-x86_64-linux.tar.gz");
    expect(assetFor({ platform: "aix", arch: "ppc64" })).toBeNull();
  });
  it("records that the source publishes no checksums", () => {
    // Texlab attaches no .sha256 sidecar to its releases. Stating it keeps the
    // gap visible rather than letting the installer skip a step by accident.
    expect(managedServer.checksum).toBe("none");
  });
});

describe("ide-texlab adapter", () => {
  let adapter;
  let disposable;

  beforeEach(async () => {
    // Applies the configSchema, so the defaults the adapter reads are the ones
    // the manifest declares rather than undefined.
    await lumine.packages.activatePackage("ide-texlab");
    ({ adapter, disposable } = registerAdapter());
  });
  afterEach(async () => {
    disposable.dispose();
    await lumine.packages.deactivatePackage("ide-texlab");
  });

  it("registers with the language-server service", () => {
    expect(adapter.id).toBe("ide-texlab");
    expect(adapter.grammarScopes).toContain("text.tex.latex");
    expect(adapter.grammarScopes).toContain("text.bibtex");
    expect(adapter.settingsKeyPaths).toEqual(["ide-texlab"]);
    expect(adapter.restartKeyPaths).toEqual(["ide-texlab.serverPath"]);
  });

  it("answers the texlab section with the options unwrapped", () => {
    // Texlab pulls `texlab` and parses the answer as its options directly, so
    // wrapping them would leave every setting at its default — which is what
    // reading a Lumine namespace called `texlab` used to do.
    lumine.config.set("ide-texlab.latexFormatter", "tex-fmt");
    lumine.config.set("ide-texlab.build.executable", "tectonic");
    lumine.config.set("ide-texlab.chktex.onEdit", true);

    const options = adapter.getWorkspaceConfiguration("texlab");
    expect(options.latexFormatter).toBe("tex-fmt");
    expect(options.build.executable).toBe("tectonic");
    expect(options.chktex.onEdit).toBe(true);
    expect(options.texlab).toBeUndefined();
    // The push carries the same options, under the section name.
    expect(adapter.getSettings().texlab.build.executable).toBe("tectonic");
  });

  it("passes the build and formatter defaults through", () => {
    const options = adapter.getWorkspaceConfiguration("texlab");
    expect(options.build.executable).toBe("latexmk");
    expect(options.build.args).toEqual(["-pdf", "-interaction=nonstopmode", "-synctex=1", "%f"]);
    // latex-tools already compiles on save; both on would compile twice.
    expect(options.build.onSave).toBe(false);
    expect(options.build.useFileList).toBe(false);
    expect(options.latexFormatter).toBe("latexindent");
    expect(options.bibtexFormatter).toBe("texlab");
    expect(options.formatterLineLength).toBe(80);
    expect(options.completion.matcher).toBe("fuzzy-ignore-case");
    expect(options.hover.symbols).toBe("image");
  });

  it("omits an unset value rather than sending an empty one", () => {
    const options = adapter.getWorkspaceConfiguration("texlab");
    expect(options.forwardSearch.executable).toBeUndefined();
    expect(options.forwardSearch.args).toBeUndefined();
    expect(options.latexindent.local).toBeUndefined();
    expect(options.build.filename).toBeUndefined();
  });

  it("passes zero-valued limits and delays through to Texlab", () => {
    // Texlab treats zero as the explicit "no limit" value for inlay hints.
    expect(adapter.getWorkspaceConfiguration("texlab").inlayHints.maxLength).toBe(0);
    lumine.config.set("ide-texlab.formatterLineLength", 0);
    lumine.config.set("ide-texlab.diagnosticsDelay", 0);
    expect(adapter.getWorkspaceConfiguration("texlab").formatterLineLength).toBe(0);
    expect(adapter.getWorkspaceConfiguration("texlab").diagnosticsDelay).toBe(0);
  });

  it("drops a pattern that will not compile", () => {
    // Texlab unwraps the parse of the configuration it pulled, so one bad
    // pattern takes down the thread that read it — silently, leaving every
    // filter apparently ignored.
    spyOn(lumine.notifications, "addWarning");
    lumine.config.set("ide-texlab.symbols.ignoredPatterns", ["^ok$", "(unbalanced"]);

    const options = adapter.getWorkspaceConfiguration("texlab");
    expect(options.symbols.ignoredPatterns).toEqual(["^ok$"]);
    expect(lumine.notifications.addWarning).toHaveBeenCalled();
    expect(lumine.notifications.addWarning.calls.mostRecent().args[0]).toContain(
      "ide-texlab.symbols.ignoredPatterns",
    );
  });

  it("drops look-around and backreferences that Texlab's Rust regex cannot compile", () => {
    spyOn(lumine.notifications, "addWarning");
    lumine.config.set("ide-texlab.diagnostics.allowedPatterns", [
      "^plain$",
      "(?=lookahead)lookahead",
      "(capture)\\1",
    ]);

    expect(adapter.getWorkspaceConfiguration("texlab").diagnostics.allowedPatterns).toEqual([
      "^plain$",
    ]);
    expect(lumine.notifications.addWarning).toHaveBeenCalledTimes(2);
  });

  it("maps current project-detection, symbol and label-prefix settings", () => {
    const { configSchema } = require("../package.json");
    expect(configSchema.symbols.properties.customEnvironments).toBeDefined();
    expect(configSchema.diagnostics.properties.customEnvironments).toBeUndefined();

    lumine.config.set("ide-texlab.build.useFileList", true);
    lumine.config.set("ide-texlab.symbols.customEnvironments", [
      { name: "theorem", displayName: "Theorem", label: true },
    ]);
    lumine.config.set("ide-texlab.experimental.labelDefinitionPrefixes", [["thm", "thm:"]]);
    lumine.config.set("ide-texlab.experimental.labelReferencePrefixes", [["thmref", "thm:"]]);

    const options = adapter.getWorkspaceConfiguration("texlab");
    expect(options.build.useFileList).toBe(true);
    expect(options.symbols.customEnvironments).toEqual([
      { name: "theorem", displayName: "Theorem", label: true },
    ]);
    expect(options.experimental.labelDefinitionPrefixes).toEqual([["thm", "thm:"]]);
    expect(options.experimental.labelReferencePrefixes).toEqual([["thmref", "thm:"]]);
  });

  it("offers a switch only for what Texlab advertises", () => {
    // Read from the server's own capability declaration: Texlab has no
    // signature help, code actions, code lens or semantic tokens, so a switch
    // for one would be a control that does nothing.
    const { configSchema } = require("../package.json");
    expect(Object.keys(configSchema.features.properties)).toEqual([
      "diagnostics",
      "autocomplete",
      "hover",
      "definition",
      "references",
      "symbols",
      "format",
      "rename",
      "inlayHints",
    ]);
  });
});
