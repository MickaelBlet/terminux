// Syntax mode of the built-in file editor, from the file name or a Markdown fence info string.

export type LangId =
  | "javascript" | "typescript" | "json" | "python" | "rust" | "shell" | "toml" | "yaml" | "go"
  | "c" | "cpp" | "java" | "csharp" | "kotlin" | "scala" | "dart" | "objectivec" | "css" | "sass"
  | "html" | "xml" | "sql" | "lua" | "ruby" | "perl" | "php" | "diff" | "dockerfile" | "properties"
  | "powershell" | "swift" | "haskell" | "cmake" | "nginx" | "markdown" | "r" | "julia" | "erlang"
  | "clojure" | "groovy" | "elm" | "ocaml" | "fsharp" | "protobuf" | "latex" | "fortran" | "pascal"
  | "d" | "crystal" | "coffeescript" | "verilog" | "vhdl" | "vb" | "tcl" | "gherkin" | "jinja2"
  | "pug" | "scheme" | "commonlisp" | "octave" | "http";

const BY_EXT: Record<string, LangId> = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "javascript",
  ts: "typescript", mts: "typescript", cts: "typescript", tsx: "typescript", svelte: "html", vue: "html",
  json: "json", jsonc: "json", json5: "json", geojson: "json", ipynb: "json",
  py: "python", pyi: "python", pyw: "python",
  rs: "rust",
  sh: "shell", bash: "shell", zsh: "shell", ksh: "shell", fish: "shell",
  toml: "toml",
  yml: "yaml", yaml: "yaml",
  go: "go",
  c: "c", h: "c",
  cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hh: "cpp", hxx: "cpp", ino: "cpp",
  java: "java", cs: "csharp", kt: "kotlin", kts: "kotlin", scala: "scala", sc: "scala", dart: "dart",
  m: "objectivec", mm: "objectivec",
  css: "css", scss: "css", less: "css", sass: "sass",
  html: "html", htm: "html", xhtml: "html",
  xml: "xml", svg: "xml", xaml: "xml", csproj: "xml", vcxproj: "xml", plist: "xml", xsd: "xml", xsl: "xml",
  sql: "sql", lua: "lua", rb: "ruby", rake: "ruby", gemspec: "ruby", pl: "perl", pm: "perl",
  php: "php", phtml: "php",
  diff: "diff", patch: "diff",
  ini: "properties", cfg: "properties", conf: "properties", properties: "properties", env: "properties",
  ps1: "powershell", psm1: "powershell", psd1: "powershell",
  swift: "swift", hs: "haskell", cmake: "cmake",
  md: "markdown", markdown: "markdown", mdx: "markdown", mkd: "markdown",
  r: "r", jl: "julia", erl: "erlang", hrl: "erlang",
  clj: "clojure", cljs: "clojure", cljc: "clojure", edn: "clojure",
  groovy: "groovy", gradle: "groovy", elm: "elm",
  ml: "ocaml", mli: "ocaml", fs: "fsharp", fsi: "fsharp", fsx: "fsharp",
  proto: "protobuf", tex: "latex", sty: "latex", cls: "latex",
  f: "fortran", f90: "fortran", f95: "fortran", f03: "fortran", for: "fortran",
  pas: "pascal", pp: "pascal", d: "d", cr: "crystal", coffee: "coffeescript",
  v: "verilog", sv: "verilog", svh: "verilog", vhd: "vhdl", vhdl: "vhdl",
  vb: "vb", vbs: "vb", bas: "vb", tcl: "tcl", feature: "gherkin",
  j2: "jinja2", jinja: "jinja2", jinja2: "jinja2", pug: "pug", jade: "pug",
  scm: "scheme", ss: "scheme", rkt: "scheme", lisp: "commonlisp", lsp: "commonlisp", el: "commonlisp",
  http: "http",
};

const BY_NAME: Record<string, LangId> = {
  dockerfile: "dockerfile", containerfile: "dockerfile", "cmakelists.txt": "cmake", "nginx.conf": "nginx",
  ".bashrc": "shell", ".zshrc": "shell", ".profile": "shell", ".bash_profile": "shell", ".zprofile": "shell",
  ".bash_aliases": "shell", ".zshenv": "shell", pkgbuild: "shell",
  ".gitconfig": "properties", ".editorconfig": "properties", ".npmrc": "properties",
  gemfile: "ruby", rakefile: "ruby", vagrantfile: "ruby", jenkinsfile: "groovy",
};

/** Fence names that are neither an extension nor a LangId. */
const ALIASES: Record<string, LangId> = {
  sh: "shell", console: "shell", shellsession: "shell", zsh: "shell", bash: "shell",
  golang: "go", "c++": "cpp", "c#": "csharp", "f#": "fsharp", "objective-c": "objectivec", objc: "objectivec",
  py3: "python", python3: "python", node: "javascript", ecmascript: "javascript",
  ini: "properties", docker: "dockerfile", ps: "powershell", pwsh: "powershell",
  postgres: "sql", postgresql: "sql", mysql: "sql", sqlite: "sql",
  patch: "diff", tex: "latex", lisp: "commonlisp", elisp: "commonlisp", racket: "scheme",
  matlab: "octave", visualbasic: "vb", vbnet: "vb", cucumber: "gherkin", jinja: "jinja2",
  svg: "xml", vue: "html", svelte: "html",
};

const LANG_IDS = new Set<string>(Object.values(BY_EXT).concat(Object.values(BY_NAME)));

export function langOf(path: string): LangId | null {
  const name = path.split(/[\\/]/).pop()!.toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  if (name.startsWith("dockerfile.") || name.endsWith(".dockerfile")) return "dockerfile";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? (BY_EXT[name.slice(dot + 1)] ?? null) : null;
}

/** Language of a Markdown fenced code block from its info string ("ts", "python {.x}", "C++"…). */
export function langOfFence(info: string): LangId | null {
  const word = info.trim().split(/[\s{,]/)[0].toLowerCase().replace(/^\./, "");
  if (!word) return null;
  if (ALIASES[word]) return ALIASES[word];
  if (LANG_IDS.has(word)) return word as LangId;
  return BY_EXT[word] ?? null;
}

/** File name shown as the pane title. */
export const baseName = (path: string) => path.split(/[\\/]/).pop() || path;
