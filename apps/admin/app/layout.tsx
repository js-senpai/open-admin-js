import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { ApiErrorBanner } from "../components/api-error-banner";
import { AuthGuard } from "../components/auth-guard";
import { BRAND } from "../lib/brand";
import "./globals.css";

function resolveMetadataBase(): URL {
  const origin = process.env.ADMIN_ORIGIN ?? "http://localhost:3000";
  try {
    return new URL(origin);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: "OpenAdminJS Admin",
  description: "Resource-driven admin panel",
  icons: {
    icon: [
      { url: BRAND.favicon, type: "image/svg+xml" },
      { url: BRAND.faviconPng, sizes: "32x32", type: "image/png" }
    ],
    shortcut: BRAND.favicon,
    apple: BRAND.appleTouch
  },
  openGraph: {
    title: "OpenAdminJS Admin",
    description: "Resource-driven admin panel",
    images: [{ url: BRAND.ogImage, width: 1200, height: 630, alt: "OpenAdminJS" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenAdminJS Admin",
    images: [BRAND.ogImage]
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthGuard>
            <ApiErrorBanner />
            {children}
          </AuthGuard>
        </ThemeProvider>
      </body>
    </html>
  );
}
