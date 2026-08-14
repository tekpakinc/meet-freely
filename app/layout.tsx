import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://meetfreely.app"),
  title: { default: "Meet Freely — Dating Without Swiping", template: "%s | Meet Freely" },
  description: "Meet verified adults in interest-based dating rooms. Browse freely, post open invitations, and say hello without swiping, hidden likes, or paid boosts.",
  applicationName: "Meet Freely",
  keywords: ["dating app", "dating without swiping", "meet local singles", "interest based dating", "verified dating app"],
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }], apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }] },
  appleWebApp: { capable: true, title: "Meet Freely", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  openGraph: { title: "Meet Freely — Dating Without Swiping", description: "Walk into a dating room, look around, and say hello. No match required.", url: "/", siteName: "Meet Freely", type: "website", images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Meet Freely — Meet freely. No match required." }] },
  twitter: { card: "summary_large_image", title: "Meet Freely — Dating Without Swiping", description: "Walk into a dating room, look around, and say hello. No match required.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><meta name="theme-color" content="#17231e" /></head><body>{children}</body></html>;
}
