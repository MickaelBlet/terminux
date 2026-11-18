import { describe, expect, it } from "vitest";
import { baseName, langOf, langOfFence } from "./file-langs";

describe("langOf", () => {
  it("maps extensions and names", () => {
    expect(langOf("/a/b.ts")).toBe("typescript");
    expect(langOf("C:\\x\\Main.RS")).toBe("rust");
    expect(langOf("src/Dockerfile")).toBe("dockerfile");
    expect(langOf("CMakeLists.txt")).toBe("cmake");
    expect(langOf("~/.zshrc")).toBe("shell");
    expect(langOf(".env")).toBe("properties");
    expect(langOf("README.md")).toBe("markdown");
    expect(langOf("index.php")).toBe("php");
    expect(langOf("Gemfile")).toBe("ruby");
  });
  it("returns null for unknown files", () => {
    expect(langOf("README")).toBeNull();
    expect(langOf("notes.txt")).toBeNull();
  });
});

describe("langOfFence", () => {
  it("maps ids, aliases and extensions", () => {
    expect(langOfFence("typescript")).toBe("typescript");
    expect(langOfFence("ts")).toBe("typescript");
    expect(langOfFence("bash")).toBe("shell");
    expect(langOfFence("C++")).toBe("cpp");
    expect(langOfFence("python {.numberLines}")).toBe("python");
    expect(langOfFence(" .rs")).toBe("rust");
  });
  it("returns null for unknown or empty info", () => {
    expect(langOfFence("")).toBeNull();
    expect(langOfFence("mermaid")).toBeNull();
  });
});

describe("baseName", () => {
  it("keeps the last segment", () => {
    expect(baseName("/a/b.ts")).toBe("b.ts");
    expect(baseName("C:\\a\\b.ts")).toBe("b.ts");
  });
});
