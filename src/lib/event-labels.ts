/** Human labels for known event types — never show raw slugs alone. */
const LABELS: Record<string, string> = {
  booking_created: "Booking created",
  booking_canceled: "Booking canceled",
  email_delivered: "Email delivered",
  email_opened: "Email opened",
  email_clicked: "Email link clicked",
  email_bounced: "Email bounced",
  email_unsubscribed: "Unsubscribed",
  email_sent: "Email sent",
  email_received: "Email received",
  reply_received: "Reply received",
  lead_created: "Lead created",
  lead_interested: "Lead marked interested",
  lead_meeting_booked: "Meeting booked",
  opportunity_created: "Opportunity created",
  opportunity_status_changed: "Opportunity status changed",
  call_logged: "Call logged",
  sms_sent: "SMS sent",
  sms_received: "SMS received",
  row_added: "Row added",
  webhook_event: "Webhook event",
  email_sent_daily: "Emails sent (daily total)",
  email_opened_daily: "Emails opened (daily total)",
  reply_received_daily: "Replies received (daily total)",
  email_clicked_daily: "Links clicked (daily total)",
};

export function eventTypeLabel(eventType: string): string {
  if (LABELS[eventType]) return LABELS[eventType];
  const pretty = eventType.replaceAll(/[_-]+/g, " ").trim();
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

/** True for daily-rollup event types whose count lives in `amount`. */
export function isDailyRollup(eventType: string): boolean {
  return eventType.endsWith("_daily");
}
