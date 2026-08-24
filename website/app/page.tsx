import Image from "next/image";
import Link from "next/link";

const features = [
  {
    title: "Your allergy profile",
    text: "Choose the allergens that matter to you and see restaurant menus through that context.",
  },
  {
    title: "Sources you can understand",
    text: "See when information comes from a restaurant, Ingredient Intelligence, or remains unknown.",
  },
  {
    title: "Restaurant allergy reviews",
    text: "Learn from diners managing similar allergies and share what your own experience was like.",
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header shell">
        <Link className="brand" href="/" aria-label="MySafeMenu home">
          <Image src="/app-icon.png" alt="" width={42} height={42} priority />
          <span>MySafeMenu</span>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <Link href="/support">Support</Link>
        </nav>
      </header>

      <section className="hero shell">
        <div className="hero-copy">
          <p className="eyebrow">Restaurant allergy menus and reviews</p>
          <h1>Know more before you order.</h1>
          <p className="hero-lede">
            Explore restaurant menus around your allergy profile, understand where allergen
            information comes from, and learn from other diners managing food allergies.
          </p>
          <div className="hero-actions">
            <span className="availability">Coming soon to the App Store</span>
            <a className="text-link" href="#how-it-works">See how it works</a>
          </div>
        </div>

        <div className="product-preview" aria-label="MySafeMenu restaurant discovery and allergen menu screens">
          <div className="phone-display">
            <div className="phone-frame phone-frame-restaurants">
              <Image
                src="/app-screen-restaurants.jpg"
                alt="MySafeMenu restaurant list showing menu compatibility for a personal allergy profile"
                width={1320}
                height={2868}
                priority
              />
            </div>
            <div className="phone-frame phone-frame-menu">
            <Image
              src="/app-screen-menu.jpg"
              alt="MySafeMenu showing official allergen guidance for menu items at McDonald's"
              width={1320}
              height={2868}
              priority
            />
            </div>
          </div>
        </div>
      </section>

      <section className="how shell" id="how-it-works">
        <div className="section-heading">
          <p className="eyebrow">How it works</p>
          <h2>Menus, sources, and shared experience.</h2>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="disclaimer shell">
        <h2>More than a guide. Never a guarantee.</h2>
        <p>
          Ingredients, recipes, preparation, and cross-contact conditions can change. MySafeMenu
          organizes available information and community experience, but always confirm your needs
          directly with restaurant staff before ordering.
        </p>
      </section>

      <footer>
        <div className="shell footer-grid">
          <div>
            <Link className="brand footer-brand" href="/">
              <Image src="/app-icon.png" alt="" width={38} height={38} />
              <span>MySafeMenu</span>
            </Link>
            <p>Know more before you order.</p>
          </div>
          <div className="footer-links">
            <Link href="/support">Support</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/delete-account">Delete Account</Link>
          </div>
        </div>
        <div className="shell copyright">
          © {new Date().getFullYear()} DNA Development LLC. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
