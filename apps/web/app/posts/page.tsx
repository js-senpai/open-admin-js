import Link from "next/link";
import { listPublicRecords } from "../../lib/openadmin-client";

export default async function PostsPage() {
  const posts = await listPublicRecords("posts");

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-normal">Posts</h1>
      <div className="mt-8 grid gap-4">
        {posts.map((post) => (
          <Link key={post.id} href={`/posts/${post.slug}`} className="rounded-md border border-slate-200 bg-white p-5">
            <h2 className="font-semibold">{String(post.title)}</h2>
            <p className="mt-2 text-sm text-slate-600">{String(post.excerpt)}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
