export type Metadata = {
  title?: string | string[];
  description?: string;
  alternates?: { canonical?: string };
  openGraph?: { title?: string; description?: string; url?: string; type?: string };
  twitter?: { card?: string; title?: string; description?: string };
};
