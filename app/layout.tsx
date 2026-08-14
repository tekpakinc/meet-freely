import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meet Freely — No match required",
  description: "A dating room for verified people. No swipe queue, hidden likes, paid boosts, or precise locations.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Meet Freely — No match required",
    description: "A dating room for verified people. Look around and say hello.",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "Meet Freely — Meet freely. No match required." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Meet Freely — No match required",
    description: "A dating room for verified people. Look around and say hello.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
