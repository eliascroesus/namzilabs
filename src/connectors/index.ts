import type { Provider } from "@/db/schema";
import type { Connector } from "@/connectors/types";
import { webhookConnector } from "@/connectors/webhook";
import { calendlyConnector } from "@/connectors/calendly";
import { brevoConnector } from "@/connectors/brevo";
import { closeConnector } from "@/connectors/close";
import { googleSheetsConnector } from "@/connectors/google-sheets";
import { instantlyConnector } from "@/connectors/instantly";

const REGISTRY: Record<Provider, Connector> = {
  webhook: webhookConnector,
  calendly: calendlyConnector,
  brevo: brevoConnector,
  close: closeConnector,
  google_sheets: googleSheetsConnector,
  instantly: instantlyConnector,
};

export function getConnector(provider: Provider): Connector {
  const connector = REGISTRY[provider];
  if (!connector) throw new Error(`Unknown provider: ${provider}`);
  return connector;
}

/** Catalog order for the Integrations page. */
export const ALL_CONNECTORS: Connector[] = [
  webhookConnector,
  calendlyConnector,
  brevoConnector,
  closeConnector,
  googleSheetsConnector,
  instantlyConnector,
];

/** Providers ingested by the 5-minute poll cron. */
export const POLLING_PROVIDERS: Provider[] = ["google_sheets"];
