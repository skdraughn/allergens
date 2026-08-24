import type { Metadata } from "next";
import { LegalShell } from "../legal-shell";

export const metadata: Metadata = { title: "Privacy Policy", description: "MySafeMenu privacy policy." };

export default function PrivacyPage() {
  return <LegalShell title="Privacy Policy">
    <p><strong>Last updated: August 16, 2026.</strong> This Privacy Policy explains how DNA Development LLC (“we,” “us,” or “our”) handles information when you use MySafeMenu, our website, and related services.</p>
    <h2>Information we collect</h2>
    <p>Depending on the features you use, we may collect account information, allergy profiles and notes you create, restaurant requests, reviews, reports, blocked-user choices, and basic information about how the app performs and is used. If you grant location permission, we may use your location to show nearby restaurants.</p>
    <h2>How we use information</h2>
    <p>We use information to operate and personalize MySafeMenu, provide restaurant search and community features, maintain security, respond to support requests, understand app performance, improve the service, and comply with legal obligations. We do not sell personal information or use it for third-party advertising or cross-app tracking.</p>
    <h2>How we share information</h2>
    <p>We share information only with service providers that help us operate MySafeMenu, when you direct us to share it, when required by law, or when reasonably necessary to protect users and the service. Public reviews and related profile information are visible to other users when you choose to post them.</p>
    <h2>Retention and security</h2>
    <p>We keep information only as long as reasonably necessary to provide and protect the service or meet legal obligations. We use reasonable administrative and technical safeguards, but no system can guarantee absolute security.</p>
    <h2>Your choices</h2>
    <p>You can use the catalog as a guest, change app permissions in iOS Settings, manage allergy profiles, report or block community content, sign out, and permanently delete your account from Account settings in the app. Account deletion removes associated personal information unless retention is legally required. Depending on where you live, you may have additional rights to access, correct, or delete your information.</p>
    <h2>Health information</h2>
    <p>Allergy profiles are information you choose to provide so MySafeMenu can personalize results and sync saved profiles. We do not sell allergy information or use it for advertising.</p>
    <h2>Children</h2>
    <p>MySafeMenu is not directed to children under 13, and we do not knowingly collect personal information from children under 13.</p>
    <h2>Changes and contact</h2>
    <p>We may update this policy as the service changes and will update the date above. Questions, access requests, corrections, privacy objections, or deletion assistance can be sent to <a href="mailto:mysafeplate@dnatechgroup.com">mysafeplate@dnatechgroup.com</a>.</p>
  </LegalShell>;
}
