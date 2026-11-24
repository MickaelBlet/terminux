// Run git for a pane: locally, on its ssh host or in its WSL distro (see src-tauri/src/git.rs).
import { invoke } from "@tauri-apps/api/core";
import { sessions } from "../../term/session";

export interface GitOut {
  code: number;
  stdout: string;
  stderr: string;
}

/** Where git runs: pty `id` selects the ssh host / WSL distro, `dir` is the working directory. */
export interface GitHost {
  /** Terminal pane providing the host. */
  paneId: string;
  id: number | null;
  dir: string;
}

/** Host and directory of terminal pane `paneId` (remote directory in ssh). */
export async function hostOf(paneId: string): Promise<GitHost | null> {
  const s = sessions.get(paneId);
  if (!s) return null;
  if (s.ptyId != null && (await s.isSsh())) return { paneId, id: s.ptyId, dir: s.reportedCwd ?? "~" };
  const dir = await s.cwdNow();
  return dir ? { paneId, id: s.ptyId ?? null, dir } : null;
}

export async function git(h: Pick<GitHost, "id" | "dir">, args: string[], stdin?: string): Promise<GitOut> {
  try {
    return await invoke<GitOut>("git_run", { id: h.id, dir: h.dir, args, stdin: stdin ?? null });
  } catch (e) {
    return { code: -1, stdout: "", stderr: String(e) };
  }
}
