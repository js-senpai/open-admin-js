import { z } from "zod";

export const pluginManifestEntrySchema = z
  .object({
    id: z.string().min(1),
    enabled: z.boolean().optional().default(true),
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
