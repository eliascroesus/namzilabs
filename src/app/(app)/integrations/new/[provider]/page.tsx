import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PROVIDERS, type Provider } from "@/db/schema";
import { getConnector } from "@/connectors";
import { requireWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { ConnectWizard } from "./connect-wizard";

export default async function NewConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ cid?: string; oauth_error?: string }>;
}) {
  const { provider } = await params;
  const { cid, oauth_error } = await searchParams;
  if (!PROVIDERS.includes(provider as Provider)) notFound();
  const connector = getConnector(provider as Provider);

  // Returning from OAuth (or reloading mid-setup): resume the draft.
  let resume: { connectionId: string; hasAuth: boolean; webhookUrl?: string } | null = null;
  if (cid) {
    const [conn] = await db()
      .select()
      .from(schema.connections)
      .where(and(eq(schema.connections.id, cid), eq(schema.connections.provider, provider as Provider)));
    if (conn && conn.status !== "deleted") {
      await requireWorkspace(conn.workspaceId);
      resume = {
        connectionId: conn.id,
        hasAuth: conn.authData !== null,
        webhookUrl: provider === "webhook" ? `/api/ingest/${conn.webhookToken}` : undefined,
      };
    }
  }

  return (
    <>
      <PageHeader
        title={`Connect ${connector.label}`}
        description={connector.description}
      />
      <ConnectWizard
        meta={{
          provider: provider as Provider,
          label: connector.label,
          authMethod: connector.authMethod,
          credentialsHelpUrl: connector.credentialsHelpUrl ?? null,
        }}
        resume={resume}
        oauthError={oauth_error ?? null}
      />
    </>
  );
}
