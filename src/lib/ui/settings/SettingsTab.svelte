<script lang="ts">
  // The settings tab (or pane): settings UI or TOML editor, both on the same config.toml draft.
  import ConfigEditor from "../ConfigEditor.svelte";
  import SettingsView from "./SettingsView.svelte";
  import { settingsDoc } from "../../settings/doc.svelte";

  let { paneId }: { paneId?: string } = $props();
</script>

{#if settingsDoc.view === "ui"}
  <SettingsView {paneId} />
{:else}
  <ConfigEditor {paneId} />
{/if}
