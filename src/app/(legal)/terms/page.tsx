export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Effective date: July 11, 2026</p>
      <p>
        These terms govern your use of Namzi, the data dashboard service operated at namzilabs.co
        (&quot;the Service&quot;). By using the Service you agree to these terms.
      </p>

      <h2>The Service</h2>
      <p>
        Namzi lets you connect third-party tools (such as Calendly, Brevo, Instantly, Close CRM,
        and Google Sheets) and view their event data as unified metrics and dashboards. You are
        responsible for having the right to connect the accounts and data you connect.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Keep your access credentials confidential.</li>
        <li>You are responsible for activity that occurs under your account.</li>
        <li>You must not use the Service for unlawful purposes or to process data you have no right to process.</li>
      </ul>

      <h2>Your data</h2>
      <p>
        You retain all rights to the data you connect. You grant us the limited rights needed to
        ingest, store, process, and display that data for you — that is the product. Our handling
        of personal data is described in the{" "}
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>
        .
      </p>

      <h2>Third-party services</h2>
      <p>
        Connected tools are governed by their own terms and policies. Their availability, rate
        limits, and plan restrictions (for example, which plans allow webhooks) are outside our
        control.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We aim for high availability but the Service is provided &quot;as is&quot; without
        warranties of any kind. We may change or discontinue features, and we may update these
        terms — continued use after an update constitutes acceptance.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Namzi is not liable for indirect, incidental,
        special, or consequential damages, or for loss of profits, revenue, or data, arising from
        your use of the Service.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the Service and request deletion of your data at any time. We may
        suspend or terminate accounts that violate these terms.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <strong>support@namzilabs.co</strong>
      </p>
    </>
  );
}
