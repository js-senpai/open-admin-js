import { registerResourceHooks } from "./resource-hooks.registry";

/**
 * Side-effect module: import from `app.module` so hooks are registered at startup.
 * Add `registerResourceHooks` calls here — handlers stay on the server and never ship in JSON metadata.
 */
registerResourceHooks(
  "posts",
  {
    beforeCreate({ data }) {
      if (typeof data.title === "string") data.title = data.title.trim();
    },
    beforeUpdate({ data }) {
      if (typeof data.title === "string") data.title = data.title.trim();
    }
  },
  { source: "core" }
);
