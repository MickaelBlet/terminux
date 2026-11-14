// Audible bell: a short tone, or a user sound file (random pick from a list).
import { invoke } from "@tauri-apps/api/core";

let ctx: AudioContext | null = null;
const urls = new Map<string, Promise<string | null>>();
let last = 0;

function tone() {
  ctx ??= new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.15);
}

/** Blob URL of a user file read through the backend (cached). */
export function fileUrl(path: string, type = ""): Promise<string | null> {
  let u = urls.get(path);
  if (!u) {
    u = invoke<ArrayBuffer>("read_binary", { path })
      .then((buf) => URL.createObjectURL(new Blob([buf], type ? { type } : {})))
      .catch((e) => {
        console.warn(e);
        urls.delete(path);
        return null;
      });
    urls.set(path, u);
  }
  return u;
}

export async function playBell(sounds: string[]) {
  // Bursts of BEL (e.g. tab completion) play once.
  const now = Date.now();
  if (now - last < 150) return;
  last = now;
  const path = sounds.length ? sounds[Math.floor(Math.random() * sounds.length)] : null;
  const url = path ? await fileUrl(path) : null;
  if (!url) return tone();
  new Audio(url).play().catch(() => tone());
}
