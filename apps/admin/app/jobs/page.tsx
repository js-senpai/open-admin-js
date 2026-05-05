import { AppShell } from "../../components/app-shell";
import { JobsPanel } from "../../components/jobs-panel";

export default function JobsPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-[#0b8585]">Queue runtime</p>
          <h1 className="mt-1 text-3xl font-bold tracking-normal text-[#24324b]">Jobs</h1>
          <p className="text-sm text-[#637083]">Dispatch and monitor background processing through BullMQ.</p>
        </div>
        <div className="rounded-2xl border border-[#e4e8f0] bg-white p-6 shadow-[0_12px_34px_rgba(36,50,75,0.07)] dark:border-zinc-800 dark:bg-zinc-950">
          <JobsPanel />
        </div>
      </div>
    </AppShell>
  );
}
