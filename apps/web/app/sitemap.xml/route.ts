import { listPublicRecords } from "../../lib/openadmin-client";
import { absoluteUrl, sitemapXml } from "../../lib/seo";

export async function GET() {
  const posts = await listPublicRecords("posts");
  const urls = [
    { loc: absoluteUrl("/") },
    { loc: absoluteUrl("/posts") },
    ...posts.map((post) => ({
      loc: absoluteUrl(`/posts/${post.slug ?? post.id}`),
      lastmod: post.updatedAt
    }))
  ];

  return new Response(sitemapXml(urls), {
    headers: {
      "content-type": "application/xml"
    }
  });
}
