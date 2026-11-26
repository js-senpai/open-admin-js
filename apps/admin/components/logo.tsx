export function Logo({ compact = false }: { compact?: boolean }) {
  return <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-slate-900 dark:text-white" aria-label="OpenAdminJS">
    <svg viewBox="0 0 64 64" aria-hidden="true" className={compact ? "h-7 w-7 shrink-0" : "h-8 w-8 shrink-0"}><rect width="64" height="64" rx="13" fill="#101820"/><path fill="#B9F56D" d="M29 13a19 19 0 1 0 0 38h9l11-23 7 15H45l-4 8h18L42 13h-8L21 42a11 11 0 1 1 8-21l3-7z"/></svg>
    <span className={compact ? "text-sm" : "text-lg"}>OpenAdmin<span className="text-[#537b20] dark:text-[#B9F56D]">JS</span></span>
  </span>;
}
