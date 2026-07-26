const path = require("path");
const { resolveServer, findOnPath } = require("../lib/server");
const main = require("../lib/main");

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
});

describe("ide-texlab adapter", () => {
  it("registers with the language-server service", () => {
    let adapter;
    const disposable = main.consumeLanguageServer({
      registerAdapter(registered) {
        adapter = registered;
        return { dispose() {} };
      },
    });
    expect(adapter.id).toBe("ide-texlab");
    expect(adapter.grammarScopes).toContain("text.tex.latex");
    expect(adapter.grammarScopes).toContain("text.bibtex");
    disposable.dispose();
  });
});
