"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { getWorkspaceForUser } from "@/lib/workspace";
import type { ActionResult } from "../integrations/actions";

export async function updateTimezone(timezone: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in" };
  const workspace = await getWorkspaceForUser(session.user.id);
  if (!workspace) return { ok: false, error: "No workspace" };

  const valid = (Intl.supportedValuesOf("timeZone") as string[]).includes(timezone) || timezone === "UTC";
  if (!valid) return { ok: false, error: "Unknown timezone" };

  await db()
    .update(schema.workspaces)
    .set({ timezone })
    .where(eq(schema.workspaces.id, workspace.id));
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, data: undefined };
}
