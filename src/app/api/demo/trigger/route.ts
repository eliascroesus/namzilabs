import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/inngest/client";

/** Fires the Milestone 1.4 retry-proof function. Signed-in users only. */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await inngest.send({
    name: "demo/process.event",
    data: { requestedBy: session.user.email ?? session.user.id },
  });
  return NextResponse.json({ ok: true });
}
