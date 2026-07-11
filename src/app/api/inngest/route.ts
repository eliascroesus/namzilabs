import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";
import { ingestFunctions } from "@/inngest/ingest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...functions, ...ingestFunctions],
});
