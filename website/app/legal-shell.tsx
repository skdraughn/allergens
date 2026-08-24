import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function LegalShell({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return <main>
    <header className="site-header shell"><Link className="brand" href="/"><Image src="/app-icon.png" alt="" width={42} height={42} /><span>MySafeMenu</span></Link><nav><Link href="/">Home</Link><Link href="/support">Support</Link></nav></header>
    <section className="legal-page shell"><div className="eyebrow">MySafeMenu</div><h1>{title}</h1><p className="updated">{updated ?? "Effective August 12, 2026"}</p><div className="legal-body">{children}</div></section>
    <footer><div className="shell copyright">© {new Date().getFullYear()} DNA Development LLC. <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <Link href="/delete-account">Delete Account</Link></div></footer>
  </main>;
}
