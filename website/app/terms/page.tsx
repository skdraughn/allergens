import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Terms of Service", description: "MySafeMenu terms of service." };

export default function TermsPage() {
  return <LegalShell title="Terms of Service">
    <p>These Terms govern your use of MySafeMenu, operated by DNA Development LLC. By using the service, you agree to these Terms.</p>
    <div className="legal-callout"><strong>Important food-allergy notice:</strong> MySafeMenu is an informational guide, not medical advice or a guarantee that any food, menu item, kitchen, or restaurant is safe for you. Ingredients and preparation practices can change. Always communicate your allergies directly to restaurant staff and make your own dining decisions.</div>
    <h2>Using MySafeMenu</h2>
    <p>You may use the service only lawfully and in a way that does not harm others, interfere with the service, attempt unauthorized access, scrape or redistribute protected data, or submit false, abusive, or infringing content.</p>
    <h2>Accounts and contributions</h2>
    <p>You are responsible for your account activity and for keeping credentials secure. Restaurant requests, reviews, reports, and other submissions must be accurate to the best of your knowledge. We may moderate or remove content and restrict accounts to protect the community and service.</p>
    <h2>Restaurant and allergen information</h2>
    <p>Information may come from restaurants, vendors, public sources, community submissions, or analytical tools. We aim to show source types and uncertainty clearly, but information may be incomplete, outdated, inaccurate, or location-specific.</p>
    <h2>Ownership</h2>
    <p>MySafeMenu and its original software, design, and content are owned by DNA Development LLC or its licensors. Restaurant names and trademarks belong to their respective owners.</p>
    <h2>Disclaimers and limitation of liability</h2>
    <p>The service is provided “as is” and “as available” without warranties to the fullest extent permitted by law. To the fullest extent permitted by law, DNA Development LLC will not be liable for indirect, incidental, special, consequential, or punitive damages arising from use of the service or dining decisions.</p>
    <h2>Changes and termination</h2>
    <p>We may change, suspend, or discontinue features and may update these Terms. We may suspend access for violations. You may stop using the service or request account deletion at any time.</p>
    <h2>Contact</h2>
    <p>Questions about these Terms can be sent to <a href="mailto:mysafeplate@dnatechgroup.com">mysafeplate@dnatechgroup.com</a>.</p>
  </LegalShell>;
}
