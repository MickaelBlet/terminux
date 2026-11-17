import { describe, expect, it } from "vitest";
import { PROFILE_FIELDS, ROOT_FIELDS } from "../config-schema";
import { freshId, freshName, profileGroups, rootGroups } from "./pages";

describe("settings pages", () => {
  it("groups every visible root key once", () => {
    const keys = rootGroups().flatMap((g) => g.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("default_profile");
    expect(keys).toContain("screen_reader");
    expect(keys).not.toContain("word_delimiters"); // alias
    expect(keys).not.toContain("toolbar");
    expect(keys.length).toBe(Object.keys(ROOT_FIELDS).length - 3);
    expect(rootGroups().find((g) => g.id === "startup")?.keys[0]).toBe("launch_mode");
  });

  it("splits profile fields", () => {
    const groups = profileGroups(false);
    const keys = groups.flatMap((g) => g.keys);
    expect(keys).not.toContain("starting_directory");
    expect(keys.length).toBe(Object.keys(PROFILE_FIELDS).length - 1);
    expect(profileGroups(true)[0].keys).not.toContain("id");
  });

  it("fresh ids and names", () => {
    expect(freshId("My Shell!", ["my-shell"])).toBe("my-shell-2");
    expect(freshId("", [])).toBe("profile");
    expect(freshName("Bash", ["Bash", "Bash (2)"])).toBe("Bash (3)");
  });
});
