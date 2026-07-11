import type { Provider } from "@/db/schema";

/** Decrypted per-connection credentials (shape varies by provider). */
export type AuthData = Record<string, unknown>;
/** Per-connection user configuration (connections.config jsonb). */
export type Config = Record<string, unknown>;
/** Polling position (sync_state.cursor jsonb). */
export type Cursor = Record<string, unknown>;

/** One raw record as delivered by the provider (webhook body or poll result). */
export type RawRecord = Record<string, unknown>;

/** Maps 1:1 to the events table. */
export type NormalizedEvent = {
  eventType: string;
  /**
   * The provider's stable ID for the underlying object (invitee URI,
   * message ID, event-log ID, row fingerprint). NEVER a timestamp or a
   * random value — this is the idempotency key.
   */
  externalId: string;
  occurredAt: Date;
  contactEmail?: string;
  contactName?: string;
  amount?: string;
  /** Only fields useful for filtering in the metric builder — keep lean. */
  metadata: Record<string, unknown>;
};

/** The connection row fields connectors need at ingest time. */
export type ConnectionCtx = {
  id: string;
  provider: Provider;
  config: Config;
  webhookToken: string;
};

export interface Connector {
  provider: Provider;
  authMethod: "api_key" | "oauth" | "none";
  /** Human-facing catalog copy. */
  label: string;
  description: string;
  /** Where the user finds their API key (help link for the wizard). */
  credentialsHelpUrl?: string;

  // -- Setup-time -----------------------------------------------------------
  testConnection(auth: AuthData, config: Config): Promise<{ ok: boolean; error?: string }>;
  /** Latest 2–3 real records for the wizard preview. */
  fetchSample(auth: AuthData, config: Config): Promise<RawRecord[]>;

  // -- Ingestion ------------------------------------------------------------
  registerWebhook?(
    auth: AuthData,
    config: Config,
    callbackUrl: string,
  ): Promise<{ externalId: string; secret?: string }>;
  unregisterWebhook?(auth: AuthData, externalId: string): Promise<void>;
  /** Provider signature check against the raw body. Runs before any parsing. */
  verifyRequest?(
    req: { headers: Headers; rawBody: string },
    conn: ConnectionCtx & { webhookSecret: string | null },
  ): boolean;
  poll?(
    auth: AuthData,
    config: Config,
    cursor: Cursor,
  ): Promise<{ records: RawRecord[]; nextCursor: Cursor }>;

  // -- Normalization (pure; unit-tested against captured payloads) -----------
  /** Return [] to skip an event type we don't track. */
  normalize(raw: RawRecord, conn: ConnectionCtx): NormalizedEvent[];
}
