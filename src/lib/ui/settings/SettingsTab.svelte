<script lang="ts">
  // The settings tab: settings UI or TOML editor, both on the same config.toml draft.
  import ConfigEditor from "../ConfigEditor.svelte";
  import SettingsView from "./SettingsView.svelte";
  import { settingsDoc } from "../../settings/doc.svelte";
</script>

{#if settingsDoc.view === "ui"}
  <SettingsView />
{:else}
  <ConfigEditor />
{/if}
