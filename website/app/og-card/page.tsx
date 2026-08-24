import Image from "next/image";

export const metadata = {
  title: "MySafeMenu social card",
  robots: { index: false, follow: false },
};

export default function OpenGraphCardPage() {
  return (
    <main className="og-card" aria-label="MySafeMenu social sharing card">
      <section className="og-copy">
        <div className="og-brand">
          <Image src="/app-icon.png" alt="" width={64} height={64} priority />
          <span>MySafeMenu</span>
        </div>
        <div>
          <h1>Know more before you order.</h1>
          <p>Restaurant allergy menus, trusted sources, and community experience.</p>
        </div>
        <span className="og-label">Made for dining with food allergies</span>
      </section>

      <section className="og-product" aria-label="MySafeMenu app preview">
        <div className="og-phone">
          <Image
            src="/app-screen.jpg"
            alt="MySafeMenu restaurant menu"
            width={590}
            height={1280}
            priority
          />
        </div>
      </section>
    </main>
  );
}
