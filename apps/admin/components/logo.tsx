"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { BRAND } from "../lib/brand";

export function Logo({ compact = false }: { compact?: boolean }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const sizeClass = compact
    ? "h-7 w-auto max-w-[min(11rem,42vw)] shrink-0 object-contain object-left"
    : "h-8 w-auto max-w-[min(16rem,85vw)] object-contain object-left";

  // Before hydration, render a placeholder so there's no layout shift
  if (!mounted) {
    return <span className={compact ? "inline-block h-7 w-32" : "inline-block h-8 w-40"} />;
  }

  const isDark = resolvedTheme === "dark";
  return (
    <img
      src={isDark ? BRAND.logoMonochromePng : BRAND.logoNew}
      alt="OpenAdminJS"
      className={sizeClass}
      draggable={false}
    />
  );
}
