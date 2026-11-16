import { describe, expect, it } from "vitest";
import { baseName, langOf } from "./file-langs";

describe("langOf", () => {
  it("maps extensions and names", () => {
    expect(langOf("/a/b.ts")).toBe("typescript");
    expect(langOf("C:\\x\\Main.RS")).toBe("rust");
    expect(langOf("src/Dockerfile")).toBe("dockerfile");
    expect(langOf("CMakeLists.txt")).toBe("cmake");
    expect(langOf("~/.zshrc")).toBe("shell");
    expect(langOf(".env")).toBe("properties");
  });
  it("returns null for unknown files", () => {
    expect(langOf("README")).toBeNull();
    expect(langOf("notes.txt")).toBeNull();
  });
});

describe("baseName", () => {
  it("keeps the last segment", () => {
    expect(baseName("/a/b.ts")).toBe("b.ts");
    expect(baseName("C:\\a\\b.ts")).toBe("b.ts");
  });
});
