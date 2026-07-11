/**
 * Raw webhook/poll payloads are kept for reprocessing and debugging, then
 * eligible for deletion after this window. Enforcement will be an Inngest
 * cron in a later phase — the constant lives here so the policy is explicit
 * from day one.
 */
export const RAW_EVENT_RETENTION_DAYS = 30;

/** How many known row fingerprints a Google Sheets cursor keeps (bounded). */
export const SHEETS_MAX_FINGERPRINTS = 5000;
