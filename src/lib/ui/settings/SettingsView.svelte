<script lang="ts">
  // Settings UI: forms over the config.toml draft (shared with the TOML view).
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import Fields from "./Fields.svelte";
  import ProfileEditor from "./ProfileEditor.svelte";
  import KeysEditor from "./KeysEditor.svelte";
  import SchemesEditor from "./SchemesEditor.svelte";
  import UiThemesEditor from "./UiThemesEditor.svelte";
  import ActionsEditor from "./ActionsEditor.svelte";
  import MenuEntries from "./MenuEntries.svelte";
  import ToolbarEditor from "./ToolbarEditor.svelte";
  import Field from "./Field.svelte";
  import Icon from "../Icon.svelte";
  import { trackActiveTab } from "../tab-baseline";
  import { app } from "../../state.svelte";
  import { FONT_FAMILIES } from "../../config";
  import { ROOT_FIELDS, THEME_KEY_PAIRS, defaultColor } from "../../config-schema";
  import { BUILTIN_SCHEMES } from "../../schemes";
  import { BUILTIN_UI_THEMES } from "../../ui-theme";
  import { settingsDoc } from "../../settings/doc.svelte";
  import { freshId, freshName, rootGroups, profileGroups, UNIQUE_PROFILE_KEYS } from "../../settings/pages";
  import { exampleDefaults, isTable, matchesQuery, set, type Json, type PatchOp, type Seg } from "../../settings/value";

  /** `paneId`: shown as a pane (else as the settings tab). */
  let { paneId }: { paneId?: string } = $props();

  let root: HTMLDivElement;
  let asideEl = $state<HTMLElement>();
  let navEl = $state<HTMLElement>();
  let query = $state("");
  let examples = $state<{ root: Json; defaults: Json }>({ root: {}, defaults: {} });

  const groups = rootGroups();
  const json = $derived(settingsDoc.json ?? {});
  const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).filter(isTable) : []);
  const profiles = $derived(arr(json.profile));
  const generated = $derived(app.config.profiles.filter((p) => p.source));
  const generatedIds = $derived(new Set(generated.map((p) => p.id)));
  const userProfiles = $derived(profiles.map((p, i) => ({ p, i })).filter(({ p }) => !generatedIds.has(String(p.id))));
  const defaults = $derived(isTable(json.defaults) ? json.defaults : undefined);

  function merge(a: Json, b: Json | undefined): Json {
    const out: Json = { ...a };
    for (const [k, v] of Object.entries(b ?? {})) out[k] = isTable(v) && isTable(out[k]) ? merge(out[k] as Json, v) : v;
    return out;
  }
  const profileFallback = $derived(merge(examples.defaults, defaults));

  const options = $derived<Record<string, string[]>>({
    color_scheme: [...new Set([...Object.keys(BUILTIN_SCHEMES), ...arr(json.scheme).map((s) => String(s.name ?? ""))])].filter(Boolean),
    default_profile: [...new Set([...app.config.profiles.map((p) => p.id), ...profiles.map((p) => String(p.id ?? ""))])].filter(Boolean),
    app_theme: [...new Set([...(ROOT_FIELDS.app_theme.values ?? []), ...BUILTIN_UI_THEMES.map((t) => t.name), ...arr(json.ui_theme).map((t) => String(t.name ?? ""))])],
    face: FONT_FAMILIES,
  });
  /** default_profile: a select showing profile names. */
  const labels = $derived<Record<string, Record<string, string>>>({
    default_profile: Object.fromEntries([
      ...app.config.profiles.map((p) => [p.id, p.name || p.id]),
      ...profiles.filter((p) => p.id).map((p) => [String(p.id), String(p.name ?? p.id)]),
    ]),
  });

  const patch = (ops: PatchOp[]) => void settingsDoc.patch(ops);
  const writeAt = (base: Seg[]) => (rel: Seg[], v: unknown) => patch([set([...base, ...rel], v)]);

  // ---- profiles ----
  async function addProfile(base?: Json) {
    const name = freshName(String(base?.name ?? "New profile"), profiles.map((p) => String(p.name ?? "")));
    const table: Json = { ...(base ?? { cmd: "$SHELL" }) };
    for (const k of [...UNIQUE_PROFILE_KEYS, "name"]) delete table[k];
    const at = profiles.length;
    await settingsDoc.patch([{ op: "insert", path: ["profile"], value: { id: freshId(name, options.default_profile), name, ...table } }]);
    settingsDoc.page = `profile:${at}`;
  }

  function removeProfile(i: number) {
    patch([{ op: "remove", path: ["profile", i] }]);
    settingsDoc.page = "defaults";
  }

  function moveProfile(i: number, d: number) {
    const to = userProfiles[userProfiles.findIndex((u) => u.i === i) + d]?.i;
    if (to === undefined) return;
    patch([{ op: "move", path: ["profile"], from: i, to }]);
    settingsDoc.page = `profile:${to}`;
  }

  /** A generated profile is edited through a [[profile]] with the same id, created on first change. */
  function writeGenerated(id: string) {
    return (rel: Seg[], v: unknown) => {
      const i = profiles.findIndex((p) => p.id === id);
      if (i >= 0) return patch([set(["profile", i, ...rel], v)]);
      if (v === undefined) return;
      patch([{ op: "insert", path: ["profile"], value: { id } }, set(["profile", profiles.length, ...rel], v)]);
    };
  }

  // ---- new tab menu ----
  const menu = $derived(Array.isArray(json.new_tab_menu) ? arr(json.new_tab_menu) : null);
  const actionIds = $derived(arr(json.action).map((a) => a.id).filter((id): id is string => typeof id === "string" && !!id));

  // ---- resizable sidebar ----
  const WIDTH_KEY = "terminux.settingsNavWidth";
  const clampWidth = (w: number) => Math.round(Math.max(150, Math.min(480, w)));
  let navWidth = $state(storedWidth());
  function storedWidth() {
    try {
      return clampWidth(Number(localStorage.getItem(WIDTH_KEY)) || 220);
    } catch {
      return 220;
    }
  }
  function startResize(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = navWidth;
    const onMove = (ev: PointerEvent) => (navWidth = clampWidth(w0 + ev.clientX - x0));
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      try {
        localStorage.setItem(WIDTH_KEY, String(navWidth));
      } catch {
        /* private mode */
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  // ---- search ----
  const rootMatches = (keys: string[]) => keys.filter((k) => matchesQuery(query, k, ROOT_FIELDS[k]?.doc));
  const defaultsMatch = $derived(!!query && profileGroups(true).some((g) => g.keys.some((k) => matchesQuery(query, k))));

  function onKeyDown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void settingsDoc.save();
    }
  }

  // Same look as vertical tabs: the active item joins the page through a gap in the accent edge line.
  $effect(() => {
    void settingsDoc.page;
    void query;
    void userProfiles.length;
    void generated.length;
    if (!asideEl || !navEl) return;
    return trackActiveTab(asideEl, navEl, "y");
  });

  onMount(() => {
    void settingsDoc.load().then(() => {
      if (!settingsDoc.json) void settingsDoc.reparse();
    });
    invoke<string>("default_config")
      .then((t) => (examples = exampleDefaults(t)))
      .catch(console.error);
    const focus = () => root?.querySelector<HTMLElement>("input, select, button")?.focus();
    if (paneId) {
      app.paneEditors.set(paneId, { focus, goto: () => {} });
      if (app.activePane === paneId) queueMicrotask(focus);
      return () => app.paneEditors.delete(paneId);
    }
    app.editors.set("config", focus);
    if (app.tab?.kind === "config") queueMicrotask(focus);
    return () => app.editors.delete("config");
  });

  const profileLabel = (p: Json) => String(p.name ?? p.id ?? "Profile");
  const nav = (id: string) => {
    settingsDoc.page = id;
    query = "";
  };
</script>

{#snippet setMark(isSet: boolean, reset: () => void, title: string)}
  {#if isSet}
    <span class="dot" title="Set in config file">●</span>
    <button class="reset" {title} onclick={reset}><Icon name="undo" size={12} /></button>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="settings" bind:this={root} onkeydown={onKeyDown}>
  <div class="main">
    <aside style:width={`${navWidth}px`} bind:this={asideEl}>
      <div class="search">
        <Icon name="search" size={13} />
        <input type="search" placeholder="Search settings" bind:value={query} />
      </div>
      <nav bind:this={navEl}>
        <h5>Settings</h5>
        {#each groups as g (g.id)}
          <button class="tab" class:active={settingsDoc.page === `root:${g.id}`} onclick={() => nav(`root:${g.id}`)}>{g.label}</button>
        {/each}
        <h5>Profiles</h5>
        <button class="tab" class:active={settingsDoc.page === "defaults"} onclick={() => nav("defaults")}>Defaults</button>
        {#each userProfiles as { p, i } (i)}
          <button class="tab" class:active={settingsDoc.page === `profile:${i}`} onclick={() => nav(`profile:${i}`)}>{profileLabel(p)}</button>
        {/each}
        {#each generated as g (g.id)}
          <button class="tab gen" class:active={settingsDoc.page === `gen:${g.id}`} onclick={() => nav(`gen:${g.id}`)} title="Generated ({g.source})">{g.name}</button>
        {/each}
        <button class="add" onclick={() => void addProfile()}><Icon name="plus" size={12} /> Add profile</button>
        <h5>Colors</h5>
        <button class="tab" class:active={settingsDoc.page === "schemes"} onclick={() => nav("schemes")}>Color schemes</button>
        <button class="tab" class:active={settingsDoc.page === "theme"} onclick={() => nav("theme")}>Color overrides</button>
        <button class="tab" class:active={settingsDoc.page === "ui_themes"} onclick={() => nav("ui_themes")}>UI themes</button>
        <h5>Commands</h5>
        <button class="tab" class:active={settingsDoc.page === "keys"} onclick={() => nav("keys")}>Keyboard</button>
        <button class="tab" class:active={settingsDoc.page === "actions"} onclick={() => nav("actions")}>Actions</button>
        <button class="tab" class:active={settingsDoc.page === "menu"} onclick={() => nav("menu")}>New tab menu</button>
        <button class="tab" class:active={settingsDoc.page === "toolbar"} onclick={() => nav("toolbar")}>Toolbar</button>
        <div class="foot">
          <button onclick={() => app.run("open_settings_file")}><Icon name="window-out" size={12} /> Open in external editor</button>
        </div>
      </nav>
      <div class="grip" role="separator" aria-orientation="vertical" title="Drag to resize" onpointerdown={startResize} ondblclick={() => (navWidth = 220)}></div>
    </aside>

    <section class="page">
      {#if !settingsDoc.json}
        {#if settingsDoc.parseError}
          <div class="banner">
            <p>config.toml has a syntax error; fix it in the TOML view.</p>
            <pre>{settingsDoc.parseError}</pre>
            <button onclick={() => settingsDoc.setView("toml")}>Open TOML view</button>
          </div>
        {:else}
          <p class="muted">Loading…</p>
        {/if}
      {:else if query}
        <h2>Results for “{query}”</h2>
        {#each groups as g (g.id)}
          {@const keys = rootMatches(g.keys)}
          {#if keys.length}
            <h3>{g.label}</h3>
            <Fields section="" {keys} fields={ROOT_FIELDS} values={json} fallback={examples.root} write={writeAt([])} tomlPath={[]} {options} {labels} />
          {/if}
        {/each}
        {#if defaultsMatch}
          <h3>Profiles: defaults</h3>
          <ProfileEditor defaults values={defaults} fallback={examples.defaults} write={writeAt(["defaults"])} tomlPath={["defaults"]} {options} {query} />
        {/if}
        <h3>Keyboard</h3>
        <KeysEditor {json} {query} />
      {:else if settingsDoc.page.startsWith("root:")}
        {@const g = groups.find((x) => `root:${x.id}` === settingsDoc.page) ?? groups[0]}
        <h2>{g.label}</h2>
        <Fields section="" keys={g.keys} fields={ROOT_FIELDS} values={json} fallback={examples.root} write={writeAt([])} tomlPath={[]} {options} {labels} />
      {:else if settingsDoc.page === "defaults"}
        <h2>Defaults</h2>
        <p class="muted">Applied to every profile; each profile can override them.</p>
        <ProfileEditor defaults values={defaults} fallback={examples.defaults} write={writeAt(["defaults"])} tomlPath={["defaults"]} {options} />
      {:else if settingsDoc.page.startsWith("profile:")}
        {@const i = Number(settingsDoc.page.slice(8))}
        {@const p = profiles[i]}
        {#if p}
          <div class="title">
            <h2>{profileLabel(p)}</h2>
            {#if app.config.default_profile === p.id}<span class="badge">default</span>{:else}<button onclick={() => patch([set(["default_profile"], p.id)])}>Set as default</button>{/if}
            <button title="Move up" onclick={() => moveProfile(i, -1)}><Icon name="up" size={12} /></button>
            <button title="Move down" onclick={() => moveProfile(i, 1)}><Icon name="down" size={12} /></button>
            <button onclick={() => void addProfile(p)}><Icon name="duplicate" size={12} /> Duplicate</button>
            <button class="danger" onclick={() => removeProfile(i)}><Icon name="trash" size={12} /> Delete</button>
          </div>
          {#key i}
            <ProfileEditor defaults={false} values={p} fallback={profileFallback} write={writeAt(["profile", i])} tomlPath={["profile", i]} {options} />
          {/key}
        {:else}
          <p class="muted">Profile not found.</p>
        {/if}
      {:else if settingsDoc.page.startsWith("gen:")}
        {@const id = settingsDoc.page.slice(4)}
        {@const g = generated.find((x) => x.id === id)}
        {@const i = profiles.findIndex((p) => p.id === id)}
        {#if g}
          <div class="title">
            <h2>{g.name}</h2>
            {@render setMark(i >= 0, () => removeProfile(i), "Remove overrides")}
            <span class="badge">generated: {g.source}</span>
          </div>
          <p class="muted">Changes are saved as a [[profile]] with id “{id}” that overrides the generated one.</p>
          {#key id}
            <ProfileEditor defaults={false} values={i >= 0 ? profiles[i] : undefined} fallback={merge(profileFallback, g as unknown as Json)} write={writeGenerated(id)} tomlPath={i >= 0 ? ["profile", i] : []} {options} />
          {/key}
        {/if}
      {:else if settingsDoc.page === "schemes"}
        <h2>Color schemes</h2>
        <SchemesEditor {json} />
      {:else if settingsDoc.page === "theme"}
        <h2>Color overrides</h2>
        <p class="muted">[theme]: applied on top of every color scheme.</p>
        <div class="pairs">
          {#each THEME_KEY_PAIRS.flat() as k (k)}
            <Field name={k} control={{ kind: "color" }} value={isTable(json.theme) ? json.theme[k] : undefined} fallback={defaultColor(k)} onchange={(v) => patch([set(["theme", k], v)])} />
          {/each}
        </div>
      {:else if settingsDoc.page === "ui_themes"}
        <h2>UI themes</h2>
        <UiThemesEditor {json} />
      {:else if settingsDoc.page === "keys"}
        <h2>Keyboard</h2>
        <KeysEditor {json} />
      {:else if settingsDoc.page === "actions"}
        <h2>Actions</h2>
        <ActionsEditor {json} />
      {:else if settingsDoc.page === "menu"}
        <div class="title">
          <h2>New tab menu</h2>
          {@render setMark(!!menu, () => patch([set(["new_tab_menu"], undefined)]), "Back to the default menu")}
        </div>
        {#if menu}
          <MenuEntries entries={menu} onchange={(e) => patch([set(["new_tab_menu"], e.length ? e : undefined)])} profiles={options.default_profile} actions={actionIds} />
        {:else}
          <p class="muted">The default menu lists every profile.</p>
          <button onclick={() => patch([set(["new_tab_menu"], [{ type: "remaining_profiles" }])])}>Customize</button>
        {/if}
      {:else if settingsDoc.page === "toolbar"}
        <div class="title">
          <h2>Toolbar</h2>
          {@render setMark(Array.isArray(json.toolbar), () => patch([set(["toolbar"], undefined)]), "Default buttons")}
        </div>
        <ToolbarEditor {json} {actionIds} />
      {/if}
    </section>
  </div>

  <footer>
    <span class="status" class:err={settingsDoc.statusError}>
      {#if settingsDoc.changedOnDisk}
        <span class="err">Changed on disk</span> <button onclick={() => settingsDoc.reload()}>Reload</button>
      {:else}
        {settingsDoc.status}
      {/if}
    </span>
    <label class="auto" title="Write each change to config.toml immediately">
      <input type="checkbox" checked={settingsDoc.autoSave} onchange={(e) => settingsDoc.setAutoSave(e.currentTarget.checked)} /> Auto-save
    </label>
    <button title="Edit config.toml as text" onclick={() => settingsDoc.setView("toml")}><Icon name="file" size={13} /> TOML</button>
    {#if !settingsDoc.autoSave || app.configDirty}
      <button disabled={!app.configDirty} onclick={() => settingsDoc.discard()}>Discard</button>
      <button class="primary" disabled={!app.configDirty} onclick={() => settingsDoc.save()} title="Ctrl+S">Save{app.configDirty ? " ●" : ""}</button>
    {/if}
  </footer>
</div>

<style>
  .pairs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 420px));
    column-gap: 24px;
  }
  .settings {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--term-bg);
    color: var(--fg);
    font-size: 13px;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-top: 1px solid var(--border);
    background: var(--chrome);
  }
  aside {
    position: relative;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--chrome);
    user-select: none;
    /* Inset line instead of a border: the active item paints over it and joins the page. */
    box-shadow: inset -1px 0 0 var(--border);
    --ind: var(--accent);
    --ind-bg: var(--chrome);
  }
  :global(html:not(.focused)) aside {
    background: var(--chrome-unfocused);
    --ind: var(--muted);
    --ind-bg: var(--chrome-unfocused);
  }
  aside::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 1.5px;
    pointer-events: none;
    z-index: 2;
    background: linear-gradient(
      to bottom,
      var(--ind-bg) 0,
      var(--ind) var(--a0),
      transparent var(--a0),
      transparent var(--a1),
      var(--ind) var(--a1),
      var(--ind-bg) 100%
    );
  }
  aside:not([style*="--a0"])::after {
    display: none;
  }
  .grip {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -3px;
    width: 6px;
    cursor: col-resize;
    z-index: 3;
  }
  .grip:hover,
  .grip:active {
    background: var(--accent);
    opacity: 0.5;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 6px;
    margin: 8px 8px 0;
    background: var(--term-bg);
  }
  .search:focus-within {
    border-color: var(--accent);
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    color: var(--fg);
    font: inherit;
    padding: 4px 0;
    outline: none;
  }
  .auto {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    cursor: pointer;
  }
  .auto input {
    margin: 0;
  }
  .status {
    margin-right: auto;
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .err {
    color: var(--danger);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg);
    cursor: pointer;
    font: inherit;
    padding: 3px 10px;
  }
  button:hover:not(:disabled) {
    background: var(--hover);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .primary:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent);
  }
  .danger:hover {
    color: var(--danger);
  }
  .main {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  nav {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    /* Scrollbar on the left edge; children restore ltr. */
    direction: rtl;
    padding: 6px 0;
    display: flex;
    flex-direction: column;
  }
  /* Section header: separator line + label, so groups read at a glance. */
  nav h5 {
    margin: 10px 10px 4px 14px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  nav h5:first-child {
    margin-top: 2px;
    padding-top: 0;
    border-top: none;
  }
  /* Vertical tab look (TabItem.svelte). */
  nav .tab {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    height: 32px;
    margin: 1px 0 1px 4px;
    padding: 0 10px;
    border: none;
    border-radius: 5px 0 0 5px;
    background: none;
    color: var(--muted);
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition:
      background 0.12s,
      color 0.12s;
  }
  nav .tab:hover:not(.active) {
    background: var(--hover);
    color: var(--fg);
  }
  nav .tab.active {
    background: var(--term-bg);
    color: var(--fg);
    font-weight: 500;
    z-index: 1;
  }
  /* Accent outline, open on the side facing the page. */
  nav .tab.active::before {
    content: "";
    position: absolute;
    inset: 0;
    padding: 1.5px 0 1.5px 1.5px;
    border-radius: inherit;
    pointer-events: none;
    background: var(--ind);
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask-composite: exclude;
  }
  nav .gen {
    font-style: italic;
  }
  nav .add {
    color: var(--accent);
    background: none;
    border: none;
    margin: 1px 4px;
    padding: 5px 10px;
  }
  .foot {
    margin-top: auto;
    padding: 12px 4px 0;
  }
  .foot button {
    display: inline-flex;
    background: none;
    border: none;
    color: var(--muted);
    font-size: 12px;
  }
  nav > :global(*) {
    direction: ltr;
  }
  .page {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 12px 24px 40px;
  }
  h2 {
    font-size: 18px;
    margin: 4px 0 8px;
  }
  h3 {
    font-size: 14px;
    margin: 18px 0 2px;
    color: var(--accent);
  }
  .title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .title h2 {
    margin-right: 8px;
  }
  .dot {
    color: var(--accent);
    font-size: 9px;
  }
  .badge {
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1px 8px;
    font-size: 11px;
  }
  .muted {
    color: var(--muted);
  }
  .banner {
    border: 1px solid var(--danger);
    border-radius: 6px;
    padding: 10px 14px;
  }
  .banner pre {
    white-space: pre-wrap;
    color: var(--danger);
    font-size: 12px;
  }
</style>
