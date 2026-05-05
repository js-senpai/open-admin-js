import { absoluteUrl } from "../../lib/seo";

export function GET() {
  return new Response(`User-agent: *\nAllow: /\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`, {
    headers: {
      "content-type": "text/plain"
    }
  });
}
