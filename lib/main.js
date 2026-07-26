const { resolveServer } = require("./server");

let missingReported = false;

module.exports = {
  consumeIdeClient(service) {
    return service.registerAdapter({
      id: "ide-texlab",
      displayName: "Texlab Language Server",
      grammarScopes: [
        "text.tex.latex",
        "text.tex.latex.beamer",
        "text.tex.latex.memoir",
        "text.bibtex",
      ],
      sessionScope: "project-root",
      async resolveServer(context) {
        const launch = await resolveServer(atom.config.get("ide-texlab.serverPath"));
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
      getWorkspaceConfiguration(section) {
        return section ? atom.config.get(section) : {};
      },
    });
  },
};
