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
exports.resolveServer = async (context, configuredPath = "") => {
  const selection = await context.resolver.select({
    kind: "executable",
    configuredPath,
    managed: () => {
      const installed = context.getManagedServer();
      return installed ? { path: installed.binaryPath, version: installed.version } : null;
    },
    env: context.env,
    cwd: context.rootPath,
    names: ["texlab"],
    signal: context.signal,
  });
  return selection
    ? context.resolver.launch(selection, { signal: context.signal, args: [] })
    : null;
};
