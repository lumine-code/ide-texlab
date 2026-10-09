describe("Texlab Rust pattern settings through the IDE service", () => {
  let adapter;

  const fields = [
    "diagnostics.allowedPatterns",
    "diagnostics.ignoredPatterns",
    "symbols.allowedPatterns",
    "symbols.ignoredPatterns",
  ];

  beforeEach(async () => {
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      spyOn(lumine.shell, method).and.returnValue(Promise.resolve());
    spyOn(lumine.application, "openWindow").and.returnValue(Promise.resolve());
    const ide = (await lumine.packages.activatePackage("ide")).mainModule;
    await lumine.packages.activatePackage("ide-texlab");
    adapter = ide.manager.adapters.get("ide-texlab");
    expect(adapter).toBeDefined();
    spyOn(lumine.notifications, "addWarning");
  });

  afterEach(async () => {
    for (const field of fields) lumine.config.unset(`ide-texlab.${field}`);
    for (const name of ["ide-texlab", "ide"]) {
      await lumine.packages.deactivatePackage(name);
      if (lumine.packages.getLoadedPackage(name)) await lumine.packages.unloadPackage(name);
    }
  });

  it("forwards Rust inline flags and Python-style named captures unchanged", () => {
    const patterns = [
      "(?i)warning",
      "(?im:^warning$)",
      "(?P<label>warning)",
      "(?i)warn(?-i)ING",
      "(?U:a.*)",
      "(?x)#(",
      "(?P<name.part>warn)",
      "\\(\\?i\\)",
      "[(?i)]",
      "^ordinary$",
    ];
    for (const field of fields) lumine.config.set(`ide-texlab.${field}`, patterns);
    const { texlab } = adapter.getSettings();
    for (const group of [texlab.diagnostics, texlab.symbols]) {
      expect(group.allowedPatterns).toEqual(patterns);
      expect(group.ignoredPatterns).toEqual(patterns);
    }
    expect(lumine.notifications.addWarning).not.toHaveBeenCalled();
  });

  it("still rejects malformed groups, unsupported flags, lookaround and backreferences", () => {
    const patterns = [
      "(?i:unbalanced",
      "(?g)unknown",
      "(?=lookahead)",
      "(capture)\\1",
      "(?i)*",
      "[",
    ];
    lumine.config.set("ide-texlab.diagnostics.allowedPatterns", patterns);
    expect(adapter.getSettings().texlab.diagnostics.allowedPatterns).toEqual([]);
    expect(lumine.notifications.addWarning).toHaveBeenCalledTimes(patterns.length);
  });
});
