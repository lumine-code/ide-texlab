const { Disposable } = require("lumine");

describe("Texlab regex character class configuration", () => {
  let adapter, lease;
  beforeEach(async () => {
    const main = (await lumine.packages.activatePackage("ide-texlab")).mainModule;
    lease = main.consumeIde({
      registerAdapter(value) {
        adapter = value;
        return new Disposable();
      },
    });
    spyOn(lumine.notifications, "addWarning");
  });
  afterEach(async () => {
    lease.dispose();
    for (const field of [
      "diagnostics.allowedPatterns",
      "diagnostics.ignoredPatterns",
      "symbols.allowedPatterns",
      "symbols.ignoredPatterns",
    ])
      lumine.config.unset(`ide-texlab.${field}`);
    await lumine.packages.deactivatePackage("ide-texlab");
  });
  it("forwards literal class characters without mistaking them for lookaround", () => {
    const values = ["[(?=)]", "[(!)]", "[\\[?=]", "plain(abc)"];
    for (const field of [
      "diagnostics.allowedPatterns",
      "diagnostics.ignoredPatterns",
      "symbols.allowedPatterns",
      "symbols.ignoredPatterns",
    ])
      lumine.config.set(`ide-texlab.${field}`, values);
    const { texlab } = adapter.getSettings();
    for (const group of [texlab.diagnostics, texlab.symbols]) {
      expect(group.allowedPatterns).toEqual(values);
      expect(group.ignoredPatterns).toEqual(values);
    }
    expect(lumine.notifications.addWarning).not.toHaveBeenCalled();
  });
  it("keeps rejecting actual lookaround, backreferences and malformed patterns", () => {
    lumine.config.set("ide-texlab.diagnostics.allowedPatterns", ["(?=x)", "(a)\\1", "["]);
    expect(adapter.getSettings().texlab.diagnostics.allowedPatterns).toEqual([]);
    expect(lumine.notifications.addWarning).toHaveBeenCalledTimes(3);
  });
});
