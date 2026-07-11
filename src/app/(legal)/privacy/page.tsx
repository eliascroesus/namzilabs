export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Effective date: July 11, 2026</p>
      <p>
        Namzi (&quot;we&quot;, &quot;us&quot;), operated at namzilabs.co, is a data dashboard that
        lets you connect third-party tools and view their event data in one place. This policy
        explains what we collect, why, and how we handle it.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> Your name and email address when you create an
          account or sign in.
        </li>
        <li>
          <strong>Connected-tool data.</strong> When you connect a tool (for example Calendly,
          Brevo, Instantly, Close CRM, or Google Sheets), we receive and store the event data that
          tool sends us — such as bookings, email activity, CRM activity, or spreadsheet rows — so
          we can display it on your dashboard and compute the metrics you define.
        </li>
        <li>
          <strong>Credentials.</strong> API keys and OAuth tokens you provide to connect tools.
          These are encrypted at rest (AES-256-GCM) and are used only to operate the connection you
          configured.
        </li>
      </ul>

      <h2>Google user data</h2>
      <p>
        If you connect Google Sheets, we request read-only access to your spreadsheets
        (spreadsheets.readonly) and read-only file metadata (drive.metadata.readonly). We use this
        access solely to list the spreadsheets you choose from and to read new rows of the specific
        spreadsheet you select, so those rows can appear as events on your dashboard. We do not
        sell Google user data, do not use it for advertising, and do not allow humans to read it
        except with your explicit permission, for security purposes, or to comply with law.
      </p>
      <p>
        Namzi&apos;s use and transfer of information received from Google APIs adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="underline"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>How we use information</h2>
      <ul>
        <li>To operate the product: ingest, store, and display the data you connect.</li>
        <li>To compute the metrics and dashboards you configure.</li>
        <li>To secure the service and troubleshoot failures.</li>
      </ul>
      <p>We do not sell your data. We do not use your data for advertising.</p>

      <h2>Data retention and deletion</h2>
      <p>
        Raw payloads from connected tools are retained for up to 30 days for reliability and
        reprocessing; normalized events remain until you delete the connection or your account.
        Deleting a connection removes its credentials and stops ingestion. To delete your account
        and all associated data, contact us and we will complete the deletion within 30 days. You
        can also revoke Namzi&apos;s Google access at any time at{" "}
        <a href="https://myaccount.google.com/permissions" className="underline">
          myaccount.google.com/permissions
        </a>
        .
      </p>

      <h2>Sharing</h2>
      <p>
        We share data only with the infrastructure providers required to run the service (hosting,
        database, and background-job processing), each acting under our instructions. We do not
        share your data with any other third parties.
      </p>

      <h2>Security</h2>
      <p>
        All traffic is encrypted in transit (TLS). Integration credentials are encrypted at rest.
        Webhook endpoints use unguessable per-connection URLs and, where the provider supports it,
        cryptographic signature verification.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or deletion requests: <strong>support@namzilabs.co</strong>
      </p>

      <h2>Changes</h2>
      <p>
        We will update this page when this policy changes and revise the effective date above.
      </p>
    </>
  );
}
