import { loadPluginsFromManifestSync } from "./plugin-loader";

/** Runs after core `resource-hooks.install` so plugin hooks stack after built-ins. */
loadPluginsFromManifestSync();
