import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getConnector } from "@/connectors";
import { decryptJson } from "@/lib/crypto";
import { incrementRejectedCount, insertRawEvents, pickHeaders } from "@/lib/ingest";
import { inngest } from "@/inngest/client";

/**
 * Universal webhook intake. Does the minimum and acknowledges fast:
 * verify signature → store raw payload → emit Inngest event → 200.
 * All parsing/normalization happens in the Inngest processor with retries.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ webhookToken: string }> },
) {
  const { webhookToken } = await params;

  // Token is a 128-bit random value; the unique-index lookup is the auth.
  const [conn] = await db()
    .select()
    .from(schema.connections)
    .where(eq(schema.connections.webhookToken, webhookToken));
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Paused connections acknowledge and drop — no ingestion while paused.
  if (conn.status === "paused") return NextResponse.json({ ok: true, ignored: true });

  const rawBody = await request.text();

  const connector = getConnector(conn.provider);
  if (connector.verifyRequest) {
    let webhookSecret: string | null = null;
    if (conn.authData) {
      const auth = decryptJson<Record<string, unknown>>(conn.authData);
      webhookSecret = typeof auth.webhookSecret === "string" ? auth.webhookSecret : null;
    }
    const valid = connector.verifyRequest(
      { headers: request.headers, rawBody },
      {
        id: conn.id,
        provider: conn.provider,
        config: conn.config,
        webhookToken: conn.webhookToken,
        webhookSecret,
      },
    );
    if (!valid) {
      await incrementRejectedCount(conn.id);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const [rawEventId] = await insertRawEvents(
    conn.id,
    [payload as Record<string, unknown>],
    pickHeaders(request.headers),
  );
  await inngest.send({
    name: "ingest/raw_event.received",
    data: { rawEventId, connectionId: conn.id },
  });

  return NextResponse.json({ ok: true });
}
