import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

type RestaurantLinkPageProps = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "Open restaurant",
  description: "Open this restaurant in MySafeMenu.",
};

export default async function RestaurantLinkPage({ params }: RestaurantLinkPageProps) {
  const { id } = await params;
  const appUrl = `allergyapp://restaurant/${encodeURIComponent(id)}`;

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
          <div className="eyebrow"><span /> Shared restaurant</div>
          <h1>Open in MySafeMenu</h1>
          <p>View this restaurant through your allergy profile, with source details and careful unknowns.</p>
          <div className="app-link-actions">
            <a className="button primary" href={appUrl}>Open MySafeMenu</a>
            <Link className="button secondary" href="/download">Download the app</Link>
          </div>
          <p className="app-link-note">If MySafeMenu is installed, this link normally opens the app automatically.</p>
        </section>
      </main>
    </div>
  );
}
