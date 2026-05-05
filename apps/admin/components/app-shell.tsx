"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  ChevronRight,
  FileText,
  Gauge,
  History,
  Image,
  KeyRound,
  Menu,
  Moon,
  Puzzle,
  Search,
  Settings,
  Sparkles,
  Sun,
  Users,
  X
} from "lucide-react";
import { getUiLocale, setUiLocale } from "../lib/locale";
import { AiAssistantWidget } from "./ai-assistant-widget";
import { Logo } from "./logo";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: Gauge }
    ]
  },
  {
    label: "Content",
    items: [
      { href: "/resources/posts", label: "Posts", icon: FileText },
      { href: "/resources/users", label: "Users", icon: Users },
      { href: "/files", label: "Files", icon: Image }
    ]
  },
  {
    label: "System",
    items: [
      { href: "/audit-logs", label: "Audit Logs", icon: History },
      { href: "/plugins", label: "Plugins", icon: Puzzle },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/api-tokens", label: "API Tokens", icon: KeyRound },
      { href: "/settings", label: "Settings", icon: Settings }
    ]
  }
];

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onClick
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150",
        active
          ? "bg-blue-50 text-[#2454ff]"
          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#2454ff]" />
      )}
      <Icon
        className={cn(
          "h-[1.05rem] w-[1.05rem] shrink-0 transition-transform duration-150",
          active
            ? "text-[#2454ff]"
            : "text-slate-400 group-hover:scale-110 group-hover:text-slate-600"
        )}
      />
      <span className="flex-1">{label}</span>
      {active && <ChevronRight className="h-3.5 w-3.5 text-blue-300" />}
    </Link>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center border-b border-slate-100 px-5">
        <Link href="/dashboard" onClick={onClose}>
          <Logo />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <NavItem
                      key={item.href}
                      {...item}
                      active={active}
                      onClick={onClose}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Promo banner */}
      <div className="mx-3 mb-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#2454ff] to-[#0ea5a4] p-4 text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 opacity-90" />
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
            Resource-driven
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-5 opacity-75">
          API, admin and web are connected through schema metadata.
        </p>
      </div>

      {/* User footer */}
      <div className="border-t border-slate-100 p-3">
        <Link
          href="/profile"
          onClick={onClose}
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all hover:bg-slate-50"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2454ff] to-[#0ea5a4] text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(36,84,255,0.3)]">
            A
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-slate-800">Admin</p>
            <p className="truncate text-[11px] text-slate-400">openadminjs@proton.me</p>
          </div>
          <Settings className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-500" />
        </Link>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="h-9 w-9" />;
  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [locale, setLocale] = useState("en");
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setLocale(getUiLocale());
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const onLocaleChange = useCallback(
    (next: string) => {
      setUiLocale(next);
      setLocale(next);
      router.refresh();
    },
    [router]
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 dark:bg-[#0a0f1e] dark:text-slate-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 md:block">
        <Sidebar />
      </aside>

      {/* Mobile: overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile: drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white transition-transform duration-300 ease-in-out dark:border-slate-800 dark:bg-slate-950 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <Sidebar onClose={() => setMobileOpen(false)} />
        <button
          className="absolute right-3 top-4 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-4 w-4" />
        </button>
      </aside>

      {/* Content area */}
      <div className="md:pl-72">
        {/* Header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80 sm:px-6">
          {/* Mobile hamburger */}
          <button
            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          {/* Mobile logo */}
          <div className="md:hidden">
            <Logo compact />
          </div>

          {/* Search */}
          <button className="hidden min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-400 transition-all hover:border-slate-300 hover:bg-white focus-visible:outline-none md:flex">
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Search anything...</span>
            <kbd className="hidden h-5 items-center rounded border border-slate-200 bg-white px-1.5 text-[10px] font-medium text-slate-400 lg:inline-flex">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {/* Theme toggle */}
            <ThemeToggle />

            {/* Notifications */}
            <button
              className="relative rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#2454ff]" />
            </button>

            {/* User avatar */}
            <Link
              href="/profile"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2454ff] to-[#0ea5a4] text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(36,84,255,0.35)] transition-shadow hover:shadow-[0_4px_14px_rgba(36,84,255,0.45)]"
              aria-label="Profile"
            >
              A
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <AiAssistantWidget />
    </div>
  );
}
