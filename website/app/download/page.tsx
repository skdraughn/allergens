import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Download",
  description: "Download MySafeMenu for iPhone.",
};

export default function DownloadPage() {
  return (
    <div className="app-link-page">
      <header className="site-header shell">
        <Link className="brand" href="/" aria-label="MySafeMenu home">
          <Image src="/app-icon.png" alt="" width={46} height={46} priority />
          <span>MySafeMenu</span>
        </Link>
      </header>
      <main className="app-link-main shell">
        <section className="app-link-card">
          <Image src="/app-icon.png" alt="MySafeMenu" width={88} height={88} priority />
          <div className="eyebrow"><span /> MySafeMenu for iPhone</div>
          <h1>Get MySafeMenu</h1>
          <p>The App Store release is coming soon. Join early access and we’ll send you the current iPhone download.</p>
          <div className="app-link-actions">
            <a className="button primary" href="mailto:mysafeplate@dnatechgroup.com?subject=MySafeMenu%20iPhone%20Early%20Access">Get iPhone access <span aria-hidden="true">↗</span></a>
            <Link className="button secondary" href="/">Learn more</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
