import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Delete Account", description: "Request deletion of your MySafeMenu account and associated data." };

export default function DeleteAccountPage() {
  return <LegalShell title="Delete Account">
    <p>You can permanently delete your MySafeMenu account and associated personal information directly inside the app at any time.</p>
    <div className="legal-callout"><strong>Delete your account in MySafeMenu:</strong><ol><li>Open MySafeMenu and select the profile button.</li><li>Open Account settings.</li><li>Select “Delete Account” and confirm the deletion.</li></ol></div>
    <h2>What will be deleted</h2>
    <p>Deletion removes your account record, allergy profiles, restaurant requests, reports, reviews, and blocked-user list. Content or records that we are legally required to retain may be de-identified or retained only for the required period.</p>
    <h2>Timing</h2>
    <p>The in-app process begins immediately. If a temporary service issue prevents completion, the app will leave your account active and tell you to try again.</p>
    <h2>Need help?</h2>
    <p>If you cannot access the app, contact <a href="mailto:mysafeplate@dnatechgroup.com">mysafeplate@dnatechgroup.com</a> for assistance. Support is not required when the in-app deletion control is available.</p>
  </LegalShell>;
}
