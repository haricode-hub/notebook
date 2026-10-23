import type { Metadata } from "next";
import { LegalPage } from "@/components/public-site/legal-page";

export const metadata: Metadata = { title: "Cookie policy", description: "Cookies and browser storage used by OpenNotebook Studio.", alternates: { canonical: "/cookies" } };

export default function CookiesPage() {
  return <LegalPage title="Cookie policy" summary="The current code uses essential sign-in cookies and browser storage for interface preferences. No optional analytics or advertising tracker was found in the repository audit.">
    <section><h2>Essential authentication cookies</h2><p>Better Auth uses cookies to maintain your sign-in session and protect account flows. Without these cookies, account sign-in and protected notebook features would not work. Production cookies are configured to use secure transport when the app runs in production.</p></section>
    <section><h2>Browser storage</h2><p>The workspace stores layout preferences in local browser storage so pane sizes can be restored. Theme preferences may also be stored by the theme provider. This information stays in the browser and is not used for advertising.</p></section>
    <section><h2>Analytics and optional cookies</h2><p>The current repository audit found no analytics SDK, advertising pixel, or nonessential tracking cookie. Because the app does not currently load optional tracking, it does not display a cookie-consent banner. This must be reviewed again before any analytics, marketing tag, or third-party embed is added.</p></section>
    <section><h2>Managing browser data</h2><p>You can clear cookies and site storage in your browser settings. Clearing authentication cookies signs you out; clearing layout preferences resets the workspace layout. Browser controls may also let you block cookies, which can prevent sign-in from working.</p></section>
  </LegalPage>;
}
