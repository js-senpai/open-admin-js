import Link from "next/link";
import { listPublicRecords } from "../lib/openadmin-client";

export default async function HomePage() {
  const posts = await listPublicRecords("posts");

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <section className="max-w-3xl">
        <p className="text-sm font-semibold uppercase text-emerald-700">OpenAdminJS Web Layer</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal">Public frontend powered by resources</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          This side is part of generated applications. Use it to build public pages, SEO landing pages, catalogs, blogs or custom frontend flows on top of the same API and resource metadata.
        </p>
      </section>

      <section className="mt-10 grid gap-4">
        {posts.map((post) => (
          <Link key={post.id} href={`/posts/${post.slug}`} className="rounded-md border border-slate-200 bg-white p-5 hover:border-emerald-300">
            <h2 className="font-semibold">{String(post.title)}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{String(post.excerpt)}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
