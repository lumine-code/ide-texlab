const fs = require("fs");
const path = require("path");

// Locates an executable on PATH; on Windows the PATHEXT extensions are tried
// because spawn() with shell:false does not resolve .cmd/.bat shims.
exports.findOnPath = (name, env = process.env) => {
  const extensions =
    process.platform === "win32" ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  for (const dir of (env.PATH || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const extension of ["", ...extensions]) {
      const candidate = path.join(dir, name + extension);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
};

exports.resolveServer = async (configuredPath) => {
  if (configuredPath) {
    await fs.promises.access(configuredPath, fs.constants.X_OK);
    return { command: configuredPath, args: [] };
  }
  const command = exports.findOnPath("texlab");
  return command ? { command, args: [] } : null;
};
