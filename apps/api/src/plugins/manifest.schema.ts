import { z } from "zod";

const capabilitySchema = z.enum([
  "db.read",
  "db.write",
  "resource.hooks",
  "api.hooks",
  "api.routes",
  "media.pipeline",
  "seo.extend",
  "jobs.run",
  "admin.ui.extend"
]);

export const pluginManifestEntrySchema = z
  .object({
    id: z.string().min(1),
    enabled: z.boolean().optional().default(true),
    trustMode: z.enum(["trusted", "sandboxed"]).optional().default("trusted"),
    capabilities: z.array(capabilitySchema).optional().default([]),
    bundled: z
      .string()
      .regex(/^[a-z0-9-]+$/, "bundled id must be lowercase slug")
      .optional(),
    package: z
      .string()
      .min(1)
      .regex(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i, "invalid npm package name")
      .optional(),
    config: z.record(z.string(), z.unknown()).optional().default({}),
    policy: z
      .object({
        allowedRoutes: z.array(z.string()).optional(),
        maxJobRuntimeMs: z.number().int().positive().optional()
      })
      .optional(),
    marketplace: z
      .object({
        listingUrl: z.string().optional(),
        productId: z.string().optional(),
        licenseKey: z.string().optional()
      })
      .optional()
  })
  .strict()
  .refine((e) => Number(Boolean(e.bundled)) + Number(Boolean(e.package)) === 1, {
    message: "Each plugin must set exactly one of: bundled, package"
  });

export const pluginManifestSchema = z
  .object({
    version: z.literal(1),
    plugins: z.array(pluginManifestEntrySchema)
  })
  .strict();

export type PluginManifest = z.infer<typeof pluginManifestSchema>;
export type PluginManifestEntry = z.infer<typeof pluginManifestEntrySchema>;
