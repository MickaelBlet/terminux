// Lazy-loaded syntax modes of the built-in file editor (legacy stream modes, Markdown, PHP).
import { LanguageDescription, LanguageSupport, StreamLanguage, type StreamParser } from "@codemirror/language";
import { langOfFence, type LangId } from "../file-langs";

const legacy = <T>(parser: Promise<StreamParser<T>>) =>
  parser.then((p) => new LanguageSupport(StreamLanguage.define(p)));

const LOADERS: Record<LangId, () => Promise<LanguageSupport>> = {
  javascript: () => legacy(import("@codemirror/legacy-modes/mode/javascript").then((m) => m.javascript)),
  typescript: () => legacy(import("@codemirror/legacy-modes/mode/javascript").then((m) => m.typescript)),
  json: () => legacy(import("@codemirror/legacy-modes/mode/javascript").then((m) => m.json)),
  python: () => legacy(import("@codemirror/legacy-modes/mode/python").then((m) => m.python)),
  rust: () => legacy(import("@codemirror/legacy-modes/mode/rust").then((m) => m.rust)),
  shell: () => legacy(import("@codemirror/legacy-modes/mode/shell").then((m) => m.shell)),
  toml: () => legacy(import("@codemirror/legacy-modes/mode/toml").then((m) => m.toml)),
  yaml: () => legacy(import("@codemirror/legacy-modes/mode/yaml").then((m) => m.yaml)),
  go: () => legacy(import("@codemirror/legacy-modes/mode/go").then((m) => m.go)),
  c: () => legacy(import("@codemirror/legacy-modes/mode/clike").then((m) => m.c)),
  cpp: () => legacy(import("@codemirror/legacy-modes/mode/clike").then((m) => m.cpp)),
  java: () => legacy(import("@codemirror/legacy-modes/mode/clike").then((m) => m.java)),
  csharp: () => legacy(import("@codemirror/legacy-modes/mode/clike").then((m) => m.csharp)),
  kotlin: () => legacy(import("@codemirror/legacy-modes/mode/clike").then((m) => m.kotlin)),
  scala: () => legacy(import("@codemirror/legacy-modes/mode/clike").then((m) => m.scala)),
  dart: () => legacy(import("@codemirror/legacy-modes/mode/clike").then((m) => m.dart)),
  objectivec: () => legacy(import("@codemirror/legacy-modes/mode/clike").then((m) => m.objectiveC)),
  css: () => legacy(import("@codemirror/legacy-modes/mode/css").then((m) => m.css)),
  sass: () => legacy(import("@codemirror/legacy-modes/mode/sass").then((m) => m.sass)),
  html: () => legacy(import("@codemirror/legacy-modes/mode/xml").then((m) => m.html)),
  xml: () => legacy(import("@codemirror/legacy-modes/mode/xml").then((m) => m.xml)),
  sql: () => legacy(import("@codemirror/legacy-modes/mode/sql").then((m) => m.standardSQL)),
  lua: () => legacy(import("@codemirror/legacy-modes/mode/lua").then((m) => m.lua)),
  ruby: () => legacy(import("@codemirror/legacy-modes/mode/ruby").then((m) => m.ruby)),
  perl: () => legacy(import("@codemirror/legacy-modes/mode/perl").then((m) => m.perl)),
  php: () => import("@codemirror/lang-php").then((m) => m.php()),
  diff: () => legacy(import("@codemirror/legacy-modes/mode/diff").then((m) => m.diff)),
  dockerfile: () => legacy(import("@codemirror/legacy-modes/mode/dockerfile").then((m) => m.dockerFile)),
  properties: () => legacy(import("@codemirror/legacy-modes/mode/properties").then((m) => m.properties)),
  powershell: () => legacy(import("@codemirror/legacy-modes/mode/powershell").then((m) => m.powerShell)),
  swift: () => legacy(import("@codemirror/legacy-modes/mode/swift").then((m) => m.swift)),
  haskell: () => legacy(import("@codemirror/legacy-modes/mode/haskell").then((m) => m.haskell)),
  cmake: () => legacy(import("@codemirror/legacy-modes/mode/cmake").then((m) => m.cmake)),
  nginx: () => legacy(import("@codemirror/legacy-modes/mode/nginx").then((m) => m.nginx)),
  markdown: () =>
    import("@codemirror/lang-markdown").then((m) =>
      m.markdown({ base: m.markdownLanguage, codeLanguages: (info) => fenceLanguage(info) }),
    ),
  r: () => legacy(import("@codemirror/legacy-modes/mode/r").then((m) => m.r)),
  julia: () => legacy(import("@codemirror/legacy-modes/mode/julia").then((m) => m.julia)),
  erlang: () => legacy(import("@codemirror/legacy-modes/mode/erlang").then((m) => m.erlang)),
  clojure: () => legacy(import("@codemirror/legacy-modes/mode/clojure").then((m) => m.clojure)),
  groovy: () => legacy(import("@codemirror/legacy-modes/mode/groovy").then((m) => m.groovy)),
  elm: () => legacy(import("@codemirror/legacy-modes/mode/elm").then((m) => m.elm)),
  ocaml: () => legacy(import("@codemirror/legacy-modes/mode/mllike").then((m) => m.oCaml)),
  fsharp: () => legacy(import("@codemirror/legacy-modes/mode/mllike").then((m) => m.fSharp)),
  protobuf: () => legacy(import("@codemirror/legacy-modes/mode/protobuf").then((m) => m.protobuf)),
  latex: () => legacy(import("@codemirror/legacy-modes/mode/stex").then((m) => m.stex)),
  fortran: () => legacy(import("@codemirror/legacy-modes/mode/fortran").then((m) => m.fortran)),
  pascal: () => legacy(import("@codemirror/legacy-modes/mode/pascal").then((m) => m.pascal)),
  d: () => legacy(import("@codemirror/legacy-modes/mode/d").then((m) => m.d)),
  crystal: () => legacy(import("@codemirror/legacy-modes/mode/crystal").then((m) => m.crystal)),
  coffeescript: () => legacy(import("@codemirror/legacy-modes/mode/coffeescript").then((m) => m.coffeeScript)),
  verilog: () => legacy(import("@codemirror/legacy-modes/mode/verilog").then((m) => m.verilog)),
  vhdl: () => legacy(import("@codemirror/legacy-modes/mode/vhdl").then((m) => m.vhdl)),
  vb: () => legacy(import("@codemirror/legacy-modes/mode/vb").then((m) => m.vb)),
  tcl: () => legacy(import("@codemirror/legacy-modes/mode/tcl").then((m) => m.tcl)),
  gherkin: () => legacy(import("@codemirror/legacy-modes/mode/gherkin").then((m) => m.gherkin)),
  jinja2: () => legacy(import("@codemirror/legacy-modes/mode/jinja2").then((m) => m.jinja2)),
  pug: () => legacy(import("@codemirror/legacy-modes/mode/pug").then((m) => m.pug)),
  scheme: () => legacy(import("@codemirror/legacy-modes/mode/scheme").then((m) => m.scheme)),
  commonlisp: () => legacy(import("@codemirror/legacy-modes/mode/commonlisp").then((m) => m.commonLisp)),
  octave: () => legacy(import("@codemirror/legacy-modes/mode/octave").then((m) => m.octave)),
  http: () => legacy(import("@codemirror/legacy-modes/mode/http").then((m) => m.http)),
};

/** One description per language: loads once, shared by files and Markdown fences. */
const descriptions = new Map<LangId, LanguageDescription>();
function description(id: LangId): LanguageDescription {
  let d = descriptions.get(id);
  if (!d) descriptions.set(id, (d = LanguageDescription.of({ name: id, load: LOADERS[id] })));
  return d;
}

function fenceLanguage(info: string): LanguageDescription | null {
  const id = langOfFence(info);
  return id ? description(id) : null;
}

/** Language support for a file editor language. */
export const loadLanguage = (id: LangId): Promise<LanguageSupport> => description(id).load();
