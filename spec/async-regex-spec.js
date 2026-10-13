const { Disposable } = require("lumine");

describe("Texlab asynchronous Rust regex initialization", () => {
  let adapter, lease, runtime, main;
  const fields = [
    "diagnostics.allowedPatterns",
    "diagnostics.ignoredPatterns",
    "symbols.allowedPatterns",
    "symbols.ignoredPatterns",
  ];

  const deferred = () => {
    let resolve;
    const promise = new Promise((complete) => {
      resolve = complete;
    });
    return { promise, resolve };
  };

  beforeEach(async () => {
    jasmine.useRealClock();
    main = (await lumine.packages.activatePackage("ide-texlab")).mainModule;
    runtime = require("../lib/regex-runtime");
    lease = main.consumeIde({
      registerAdapter(value) {
        adapter = value;
        return new Disposable();
      },
    });
    for (const field of fields) lumine.config.set(`ide-texlab.${field}`, []);
  });

  afterEach(async () => {
    lease.dispose();
    for (const field of fields) lumine.config.unset(`ide-texlab.${field}`);
    lumine.config.unset("ide-texlab.build.executable");
    await lumine.packages.deactivatePackage("ide-texlab");
  });

  it("does not initialize WASM for settings without regex filters", async () => {
    const loading = spyOn(runtime, "load");
    expect((await adapter.getSettings()).texlab.diagnostics.allowedPatterns).toEqual([]);
    expect(loading).not.toHaveBeenCalled();
  });

  it("shares the native ESM import and its asynchronously initialized WASM", async () => {
    const first = runtime.load();
    expect(runtime.load()).toBe(first);
    const namespace = await first;
    expect(typeof namespace.RRegex).toBe("function");
    expect(namespace.__wasm.memory instanceof WebAssembly.Memory).toBe(true);
    const expression = new namespace.RRegex("(?i)warning");
    expect(expression.isMatch("WARNING")).toBe(true);
    expression.free();
  });

  it("does not validate or warn after the adapter lease is retired during import", async () => {
    const pending = deferred();
    const constructor = jasmine.createSpy("compile Rust regex");
    spyOn(runtime, "load").and.returnValue(pending.promise);
    const warning = spyOn(lumine.notifications, "addWarning");
    lumine.config.set("ide-texlab.diagnostics.allowedPatterns", ["["]);
    const request = adapter.getSettings();
    lease.dispose();
    pending.resolve({ RRegex: constructor });
    expect(await request).toEqual({});
    expect(constructor).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it("keeps one settings snapshot while the regex engine is loading", async () => {
    const native = await runtime.load();
    const pending = deferred();
    spyOn(runtime, "load").and.returnValue(pending.promise);
    lumine.config.set("ide-texlab.build.executable", "first-build");
    lumine.config.set("ide-texlab.diagnostics.allowedPatterns", ["^first$"]);
    const request = adapter.getSettings();
    lumine.config.set("ide-texlab.build.executable", "later-build");
    lumine.config.set("ide-texlab.diagnostics.allowedPatterns", ["^later$"]);
    pending.resolve(native);
    const settings = (await request).texlab;
    expect(settings.build.executable).toBe("first-build");
    expect(settings.diagnostics.allowedPatterns).toEqual(["^first$"]);
  });

  it("reports initialization errors without rejecting valid filters and can retry", async () => {
    const actualLoad = runtime.load.bind(runtime);
    let first = true;
    spyOn(runtime, "load").and.callFake(() => {
      if (first) {
        first = false;
        return Promise.reject(new Error("Cannot initialize Rust regex"));
      }
      return actualLoad();
    });
    const warning = spyOn(lumine.notifications, "addWarning");
    lumine.config.set("ide-texlab.diagnostics.allowedPatterns", ["(?i)warning"]);
    await expectAsync(adapter.getSettings()).toBeRejectedWithError("Cannot initialize Rust regex");
    expect((await adapter.getSettings()).texlab.diagnostics.allowedPatterns).toEqual([
      "(?i)warning",
    ]);
    expect(warning).not.toHaveBeenCalled();
  });
});
