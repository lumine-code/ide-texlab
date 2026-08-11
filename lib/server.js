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

// Texlab names its release assets by architecture and operating system rather
// than by Rust target, so this table looks nothing like ruff's or tinymist's.
const ARCHITECTURES = { x64: "x86_64", arm64: "aarch64" };
const SYSTEMS = { win32: "windows", darwin: "macos", linux: "linux" };

exports.assetFor = ({ platform, arch }) => {
  const architecture = ARCHITECTURES[arch];
  const system = SYSTEMS[platform];
  if (!architecture || !system) return null;
  return `texlab-${architecture}-${system}.${platform === "win32" ? "zip" : "tar.gz"}`;
};

// Where the editor can fetch texlab itself.
//
// Texlab publishes no checksums alongside its archives — no `.sha256` sidecar
// and no `sha256.sum`. `none` records that deliberately: the download cannot be
// verified, and saying so here keeps the gap visible instead of letting the
// hub quietly skip a step it would otherwise take.
exports.managedServer = {
  source: "github-release",
  displayName: "Texlab",
  repository: "latex-lsp/texlab",
  assetFor: exports.assetFor,
  checksum: "none",
  binary: process.platform === "win32" ? "texlab.exe" : "texlab",
};

// The configured path wins because it is the only setting that says which copy
// to use. A managed install comes next — it exists only because the user asked
// for one — and PATH last, which is also where uninstalling lands.
exports.resolveServer = async (configuredPath, managed = null) => {
  if (configuredPath) {
    await fs.promises.access(configuredPath, fs.constants.X_OK);
    return { command: configuredPath, args: [] };
  }
  if (managed?.binaryPath) {
    return { command: managed.binaryPath, args: [], version: managed.version };
  }
  const command = exports.findOnPath("texlab");
  return command ? { command, args: [] } : null;
};
