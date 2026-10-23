import type { Metadata } from "next";
import { LegalPage } from "@/components/public-site/legal-page";

export const metadata: Metadata = { title: "Terms", description: "Terms for using the OpenNotebook Studio research workspace.", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return <LegalPage title="Terms of use" summary="A plain-language draft for the current research workspace. The service operator must review and complete it before public launch.">
    <section><h2>Using the service</h2><p>OpenNotebook Studio provides notebooks for organizing source material, asking questions about it, and generating study aids. Use an account you control, keep your credentials secure, and only upload or share material you are allowed to use.</p></section>
    <section><h2>Your material and generated content</h2><p>You remain responsible for the material you add and for deciding how to use generated answers and study materials. Generated content can be incomplete or incorrect. Check the cited source passages and apply your own judgment before relying on an answer, especially for legal, medical, financial, safety-critical, or other high-impact decisions.</p></section>
    <section><h2>Third-party services</h2><p>Some features depend on external language-model, search, transcript, email, and storage providers configured for the deployment. Their services may have separate terms, privacy practices, availability, and charges. The operator has not published a complete provider list for a production deployment.</p></section>
    <section><h2>Sharing</h2><p>If you create a share link, people who obtain that link may read the shared notebook while the link is active. Do not share material unless you have permission to make it available to those readers. Revoke links when they are no longer needed.</p></section>
    <section><h2>Availability and changes</h2><p>The current application has no paid plan or service-level commitment. Features can be changed or unavailable while the project is operated and maintained. The public operator identity, governing law, dispute process, and any required consumer terms need to be supplied and reviewed before launch.</p></section>
    <section><h2>Contact</h2><p>There is no verified support address configured yet. The operator must add one and make it available on the <a href="/contact">contact page</a> before public launch.</p></section>
  </LegalPage>;
}
