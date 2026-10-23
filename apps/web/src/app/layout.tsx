import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const sans = Geist({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap" });
const siteOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.hariinfo.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: "OpenNotebook Studio — research with your sources", template: "%s · OpenNotebook Studio" },
  description: "Bring your reading into one notebook. Ask questions, inspect cited passages, and create study materials grounded in your sources.",
  applicationName: "OpenNotebook Studio",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "OpenNotebook Studio",
    title: "OpenNotebook Studio — research with your sources",
    description: "Bring your reading into one notebook. Ask questions, inspect cited passages, and create study materials grounded in your sources.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "OpenNotebook Studio — research with your sources",
    description: "Bring your reading into one notebook. Ask questions, inspect cited passages, and create study materials grounded in your sources.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable} ${serif.variable}`}><body className="bg-canvas font-sans text-body text-fg antialiased"><Providers>{children}</Providers></body></html>;
}
