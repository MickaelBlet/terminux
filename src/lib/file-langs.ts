// Syntax mode of the built-in file editor, from the file name.

export type LangId =
  | "javascript" | "typescript" | "json" | "python" | "rust" | "shell" | "toml" | "yaml" | "go"
  | "c" | "cpp" | "java" | "csharp" | "kotlin" | "css" | "html" | "xml" | "sql" | "lua" | "ruby"
  | "perl" | "diff" | "dockerfile" | "properties" | "powershell" | "swift" | "haskell" | "cmake" | "nginx";

const BY_EXT: Record<string, LangId> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript", svelte: "html", vue: "html",
  json: "json", jsonc: "json", json5: "json",
  py: "python", pyi: "python",
  rs: "rust",
  sh: "shell", bash: "shell", zsh: "shell", ksh: "shell",
  toml: "toml",
  yml: "yaml", yaml: "yaml",
  go: "go",
  c: "c", h: "c",
  cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp",
  java: "java", cs: "csharp", kt: "kotlin", kts: "kotlin",
  css: "css", scss: "css", less: "css",
  html: "html", htm: "html",
  xml: "xml", svg: "xml", xaml: "xml", csproj: "xml", plist: "xml",
  sql: "sql", lua: "lua", rb: "ruby", pl: "perl", pm: "perl",
  diff: "diff", patch: "diff",
  ini: "properties", cfg: "properties", conf: "properties", properties: "properties", env: "properties",
  ps1: "powershell", psm1: "powershell", psd1: "powershell",
  swift: "swift", hs: "haskell", cmake: "cmake",
};

const BY_NAME: Record<string, LangId> = {
  dockerfile: "dockerfile", containerfile: "dockerfile", "cmakelists.txt": "cmake", "nginx.conf": "nginx",
  ".bashrc": "shell", ".zshrc": "shell", ".profile": "shell", ".bash_profile": "shell", ".gitconfig": "properties",
  ".editorconfig": "properties",
};

export function langOf(path: string): LangId | null {
  const name = path.split(/[\\/]/).pop()!.toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  if (name.startsWith("dockerfile.") || name.endsWith(".dockerfile")) return "dockerfile";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? (BY_EXT[name.slice(dot + 1)] ?? null) : null;
}

/** File name shown as the pane title. */
export const baseName = (path: string) => path.split(/[\\/]/).pop() || path;
