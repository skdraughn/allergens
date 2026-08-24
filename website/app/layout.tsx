import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.mysafemenu.com"),
  title: { default: "MySafeMenu — Know more before you order", template: "%s | MySafeMenu" },
  description: "Explore restaurant menus through your allergy profile, understand the source of allergen information, and learn from allergy-specific restaurant reviews.",
  icons: { icon: "/app-icon.png", apple: "/app-icon.png" },
  openGraph: {
    title: "MySafeMenu",
    description: "Restaurant allergy menus, sources, and community reviews in one place.",
    url: "https://www.mysafemenu.com",
    siteName: "MySafeMenu",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "MySafeMenu — Know more before you order." }],
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "MySafeMenu", description: "Restaurant allergy menus, sources, and community reviews in one place.", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={geist.variable}>{children}</body></html>;
}
