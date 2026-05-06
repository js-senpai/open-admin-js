import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PublicFields } from "../../../components/public-fields";
import { getPublicRecord, getPublicResource, listPublicRecords } from "../../../lib/openadmin-client";
import { metadataForRecord } from "../../../lib/seo";

export async function generateStaticParams() {
  const posts = await listPublicRecords("posts");
  return posts.map((post) => ({ slug: String(post.slug ?? post.id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const resource = getPublicResource("posts");
  const post = await getPublicRecord("posts", slug);
  if (!post) return {};
  return metadataForRecord(resource, post);
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resource = getPublicResource("posts");
  const post = await getPublicRecord("posts", slug);
  if (!post) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <article>
        <p className="text-sm font-semibold uppercase text-emerald-700">{resource.label}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal">{String(post.title)}</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">{String(post.excerpt)}</p>
        <div className="mt-10">
          <PublicFields resource={resource} record={post} />
        </div>
      </article>
    </main>
  );
}
