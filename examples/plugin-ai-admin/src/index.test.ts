import { describe, expect, it } from "vitest";
import { pluginAiExample } from "./index";

describe("pluginAiExample", () => {
  it("exports a plugin with stable id", () => {
    expect(pluginAiExample.plugin.id).toBe("com.example.welcome-ai");
  });

  it("includes minimal manifest capabilities", () => {
    expect(pluginAiExample.manifestEntry.capabilities).toEqual(["seo.extend", "admin.ui.extend"]);
  });

  it("contains AI enablement env keys", () => {
    expect(pluginAiExample.env.OPENADMIN_AI_ENABLED).toBe("1");
    expect(pluginAiExample.env.OPENADMIN_AI_PROVIDER).toBe("openai");
  });
});
