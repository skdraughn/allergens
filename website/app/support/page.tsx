import Link from "next/link";

import { LegalShell } from "../legal-shell";

export const metadata = {
  title: "Support",
  description: "Get help with MySafeMenu, report an issue, or share feedback.",
};

export default function SupportPage() {
  return (
    <LegalShell title="Support" updated="We’re here to help with MySafeMenu.">
      <h2>Contact support</h2>
      <p>
        For app issues, account help, restaurant corrections, or general feedback, email us at{" "}
        <a href="mailto:mysafeplate@dnatechgroup.com">mysafeplate@dnatechgroup.com</a>.
      </p>

      <div className="legal-callout support-callout">
        <strong>To help us respond quickly</strong>
        <p>
          Include the restaurant or screen involved, what you expected to happen, and your iPhone
          model and iOS version when relevant. Please do not email sensitive medical information.
        </p>
        <a className="button primary" href="mailto:mysafeplate@dnatechgroup.com?subject=MySafeMenu%20Support">
          Email MySafeMenu Support
        </a>
      </div>

      <h2>Account deletion</h2>
      <p>
        You can delete your account from inside MySafeMenu. If you cannot access the app, see our{" "}
        <Link href="/delete-account">account deletion instructions</Link>.
      </p>

      <h2>Safety reminder</h2>
      <p>
        MySafeMenu cannot guarantee that a menu item is safe. Restaurant ingredients and kitchen
        procedures can change. Always confirm ingredients and cross-contact needs directly with
        restaurant staff before ordering.
      </p>
    </LegalShell>
  );
}
