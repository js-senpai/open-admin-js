import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "OpenAdminJS Web",
    template: "%s | OpenAdminJS Web"
  },
  description: "Public frontend layer powered by OpenAdminJS resources."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
