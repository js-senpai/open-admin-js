import type { OpenAdminPlugin } from "@openadminjs/plugin-sdk";

export const imageOptimizerBundledPlugin: OpenAdminPlugin = {
  id: "io.openadminjs.image-optimizer",
  version: "0.1.0",
  displayName: "Image optimizer demo",
  register({ registerSurface }) {
    registerSurface({
      media: {
        transform(ctx) {
          if (!ctx.mimeType.startsWith("image/")) return ctx;
          const filename = ctx.filename.replace(/\.(png|jpe?g|webp)$/i, "") + ".webp";
          return {
            ...ctx,
            filename,
            mimeType: "image/webp"
          };
        }
      }
    });
  }
};
