"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, CopyIcon, Loader2Icon } from "lucide-react";
import type { Provider } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Stepper } from "@/components/shared/stepper";
import {
  beginConnection,
  countRawEvents,
  fetchSampleAction,
  finalizeConnection,
  getSheetsOptions,
  saveConfig,
} from "../../actions";

type Meta = {
  provider: Provider;
  label: string;
  authMethod: "api_key" | "oauth" | "none";
  credentialsHelpUrl: string | null;
};

type Resume = { connectionId: string; hasAuth: boolean; webhookUrl?: string } | null;

function stepsFor(meta: Meta): string[] {
  if (meta.provider === "webhook") return ["Your endpoint", "Configure", "Test & preview", "Finish"];
  if (meta.authMethod === "oauth") return ["Google account", "Pick spreadsheet", "Preview", "Finish"];
  if (meta.provider === "calendly") return ["Credentials", "Configure", "Preview", "Finish"];
  return ["Credentials", "Preview", "Finish"];
}

export function ConnectWizard({
  meta,
  resume,
  oauthError,
}: {
  meta: Meta;
  resume: Resume;
  oauthError: string | null;
}) {
  const router = useRouter();
  const steps = stepsFor(meta);
  const [step, setStep] = React.useState(() => {
    if (!resume) return 0;
    // Returning from Google OAuth with tokens → land on the picker.
    if (meta.authMethod === "oauth") return resume.hasAuth ? 1 : 0;
    return meta.provider === "webhook" ? 1 : 0;
  });
  const [connectionId, setConnectionId] = React.useState<string | null>(resume?.connectionId ?? null);
  const [webhookUrl, setWebhookUrl] = React.useState<string | null>(() =>
    resume?.webhookUrl
      ? typeof window === "undefined"
        ? resume.webhookUrl
        : new URL(resume.webhookUrl, window.location.origin).toString()
      : null,
  );
  const [error, setError] = React.useState<string | null>(oauthError);
  const [busy, setBusy] = React.useState(false);

  const next = () => {
    setError(null);
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  return (
    <Card>
      <CardContent className="p-8">
        <Stepper steps={steps} current={step}>
          {error ? (
            <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {steps[step] === "Credentials" && (
            <CredentialsStep
              meta={meta}
              busy={busy}
              onSubmit={async (apiKey) => {
                setBusy(true);
                setError(null);
                const res = await beginConnection({ provider: meta.provider, apiKey });
                setBusy(false);
                if (!res.ok) return setError(res.error);
                setConnectionId(res.data.connectionId);
                next();
              }}
            />
          )}

          {steps[step] === "Google account" && (
            <GoogleStep
              busy={busy}
              onConnect={async () => {
                setBusy(true);
                setError(null);
                const res = await beginConnection({ provider: meta.provider });
                if (!res.ok) {
                  setBusy(false);
                  return setError(res.error);
                }
                window.location.href = res.data.oauthUrl!;
              }}
            />
          )}

          {steps[step] === "Your endpoint" && (
            <EndpointStep
              busy={busy}
              webhookUrl={webhookUrl}
              onCreate={async () => {
                setBusy(true);
                setError(null);
                const res = await beginConnection({ provider: "webhook" });
                setBusy(false);
                if (!res.ok) return setError(res.error);
                setConnectionId(res.data.connectionId);
                setWebhookUrl(res.data.webhookUrl!);
              }}
              onContinue={next}
            />
          )}

          {steps[step] === "Configure" && meta.provider === "webhook" && connectionId && (
            <WebhookConfigStep
              busy={busy}
              onSubmit={async (config) => {
                setBusy(true);
                setError(null);
                const res = await saveConfig(connectionId, config);
                setBusy(false);
                if (!res.ok) return setError(res.error);
                next();
              }}
            />
          )}

          {steps[step] === "Configure" && meta.provider === "calendly" && connectionId && (
            <CalendlyConfigStep
              busy={busy}
              onSubmit={async (events) => {
                setBusy(true);
                setError(null);
                const res = await saveConfig(connectionId, { events });
                setBusy(false);
                if (!res.ok) return setError(res.error);
                next();
              }}
            />
          )}

          {steps[step] === "Pick spreadsheet" && connectionId && (
            <SheetsPickerStep
              connectionId={connectionId}
              busy={busy}
              onSubmit={async (config) => {
                setBusy(true);
                setError(null);
                const res = await saveConfig(connectionId, config);
                setBusy(false);
                if (!res.ok) return setError(res.error);
                next();
              }}
            />
          )}

          {(steps[step] === "Preview" || steps[step] === "Test & preview") && connectionId && (
            <PreviewStep
              connectionId={connectionId}
              waitForWebhook={meta.provider === "webhook"}
              onContinue={next}
            />
          )}

          {steps[step] === "Finish" && connectionId && (
            <FinishStep
              defaultName={meta.label}
              busy={busy}
              onSubmit={async (name) => {
                setBusy(true);
                setError(null);
                const res = await finalizeConnection(connectionId, name);
                setBusy(false);
                if (!res.ok) return setError(res.error);
                toast.success("Connected", { description: `${name} is live — data flows in automatically.` });
                router.push(`/integrations/${connectionId}`);
              }}
            />
          )}
        </Stepper>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function CredentialsStep({
  meta,
  busy,
  onSubmit,
}: {
  meta: Meta;
  busy: boolean;
  onSubmit: (apiKey: string) => void;
}) {
  const [apiKey, setApiKey] = React.useState("");
  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="apiKey">{meta.label} API key</Label>
        <Input
          id="apiKey"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your API key"
        />
        {meta.credentialsHelpUrl ? (
          <p className="text-xs text-muted-foreground">
            Find it here:{" "}
            <a href={meta.credentialsHelpUrl} target="_blank" rel="noreferrer" className="underline">
              {meta.credentialsHelpUrl}
            </a>
          </p>
        ) : null}
      </div>
      <Button onClick={() => onSubmit(apiKey)} disabled={busy || !apiKey.trim()}>
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        {busy ? "Testing connection…" : "Test & continue"}
      </Button>
    </div>
  );
}

function GoogleStep({ busy, onConnect }: { busy: boolean; onConnect: () => void }) {
  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-muted-foreground">
        Namzi asks for <strong>read-only</strong> access to your spreadsheets. You pick exactly one
        spreadsheet in the next step — nothing else is read.
      </p>
      <Button onClick={onConnect} disabled={busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        Connect Google account
      </Button>
    </div>
  );
}

function EndpointStep({
  busy,
  webhookUrl,
  onCreate,
  onContinue,
}: {
  busy: boolean;
  webhookUrl: string | null;
  onCreate: () => void;
  onContinue: () => void;
}) {
  if (!webhookUrl) {
    return (
      <div className="max-w-md space-y-4">
        <p className="text-sm text-muted-foreground">
          You&apos;ll get a unique URL. Point any tool&apos;s webhook at it and every request
          becomes an event on your dashboard.
        </p>
        <Button onClick={onCreate} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          Create my endpoint
        </Button>
      </div>
    );
  }
  return (
    <div className="max-w-xl space-y-4">
      <Label>Your webhook URL</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-md border bg-secondary px-3 py-2 text-xs">
          {webhookUrl}
        </code>
        <Button
          variant="outline"
          size="icon"
          onClick={() => {
            navigator.clipboard.writeText(webhookUrl);
            toast.success("Copied");
          }}
        >
          <CopyIcon />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Send JSON via POST. Keep this URL secret — it identifies your connection.
      </p>
      <Button onClick={onContinue}>Continue</Button>
    </div>
  );
}

function WebhookConfigStep({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (config: Record<string, unknown>) => void;
}) {
  const [eventType, setEventType] = React.useState("webhook_event");
  const [secret, setSecret] = React.useState("");
  const [emailPath, setEmailPath] = React.useState("");
  const [occurredAtPath, setOccurredAtPath] = React.useState("");
  const [amountPath, setAmountPath] = React.useState("");
  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="eventType">What should these events be called?</Label>
        <Input id="eventType" value={eventType} onChange={(e) => setEventType(e.target.value)} />
        <p className="text-xs text-muted-foreground">e.g. lead_created, order_paid, form_submitted</p>
      </div>
      <details className="space-y-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Optional: field mapping & shared secret
        </summary>
        <div className="mt-3 space-y-3">
          {(
            [
              ["Email field path", emailPath, setEmailPath, "e.g. customer.email (auto-detected if empty)"],
              ["Timestamp field path", occurredAtPath, setOccurredAtPath, "e.g. created_at (received time if empty)"],
              ["Amount field path", amountPath, setAmountPath, "e.g. order.total"],
            ] as const
          ).map(([label, value, set, hint]) => (
            <div key={label} className="space-y-1">
              <Label>{label}</Label>
              <Input value={value} onChange={(e) => set(e.target.value)} placeholder={hint} />
            </div>
          ))}
          <div className="space-y-1">
            <Label>Shared secret</Label>
            <Input value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Sent as x-namzi-secret header" />
            <p className="text-xs text-muted-foreground">
              If set, requests without a matching <code>x-namzi-secret</code> header are rejected.
            </p>
          </div>
        </div>
      </details>
      <Button
        onClick={() =>
          onSubmit({
            eventType,
            ...(emailPath.trim() ? { emailPath: emailPath.trim() } : {}),
            ...(occurredAtPath.trim() ? { occurredAtPath: occurredAtPath.trim() } : {}),
            ...(amountPath.trim() ? { amountPath: amountPath.trim() } : {}),
            ...(secret.trim() ? { secret: secret.trim() } : {}),
          })
        }
        disabled={busy || !eventType.trim()}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        Continue
      </Button>
    </div>
  );
}

function CalendlyConfigStep({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (events: string[]) => void;
}) {
  const [created, setCreated] = React.useState(true);
  const [canceled, setCanceled] = React.useState(true);
  const events = [
    ...(created ? ["invitee.created"] : []),
    ...(canceled ? ["invitee.canceled"] : []),
  ];
  return (
    <div className="max-w-md space-y-4">
      <Label>Which events do you want to track?</Label>
      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={created} onChange={(e) => setCreated(e.target.checked)} />
          New bookings (booking_created)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={canceled} onChange={(e) => setCanceled(e.target.checked)} />
          Cancellations (booking_canceled)
        </label>
      </div>
      <Button onClick={() => onSubmit(events)} disabled={busy || events.length === 0}>
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        Continue
      </Button>
    </div>
  );
}

function SheetsPickerStep({
  connectionId,
  busy,
  onSubmit,
}: {
  connectionId: string;
  busy: boolean;
  onSubmit: (config: Record<string, unknown>) => void;
}) {
  const [spreadsheets, setSpreadsheets] = React.useState<{ id: string; name: string }[] | null>(null);
  const [tabs, setTabs] = React.useState<string[] | null>(null);
  const [header, setHeader] = React.useState<string[] | null>(null);
  const [spreadsheet, setSpreadsheet] = React.useState<{ id: string; name: string } | null>(null);
  const [tab, setTab] = React.useState<string>("");
  const [timestampColumn, setTimestampColumn] = React.useState("");
  const [emailColumn, setEmailColumn] = React.useState("");
  const [amountColumn, setAmountColumn] = React.useState("");
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getSheetsOptions(connectionId).then((res) =>
      res.ok ? setSpreadsheets(res.data.spreadsheets ?? []) : setLoadError(res.error),
    );
  }, [connectionId]);

  const selectSpreadsheet = async (id: string) => {
    const chosen = spreadsheets?.find((s) => s.id === id) ?? null;
    setSpreadsheet(chosen);
    setTabs(null);
    setTab("");
    setHeader(null);
    if (!chosen) return;
    const res = await getSheetsOptions(connectionId, chosen.id);
    if (res.ok) setTabs(res.data.tabs ?? []);
    else setLoadError(res.error);
  };

  const selectTab = async (title: string) => {
    setTab(title);
    setHeader(null);
    if (!title || !spreadsheet) return;
    const res = await getSheetsOptions(connectionId, spreadsheet.id, title);
    if (res.ok) setHeader(res.data.headerRow ?? []);
    else setLoadError(res.error);
  };

  const selectCls = "h-9 w-full rounded-md border border-input bg-card px-3 text-sm";

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!spreadsheets) return <p className="text-sm text-muted-foreground">Loading your spreadsheets…</p>;

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-1">
        <Label>Spreadsheet</Label>
        <select className={selectCls} value={spreadsheet?.id ?? ""} onChange={(e) => selectSpreadsheet(e.target.value)}>
          <option value="">Choose a spreadsheet…</option>
          {spreadsheets.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {tabs ? (
        <div className="space-y-1">
          <Label>Sheet tab</Label>
          <select className={selectCls} value={tab} onChange={(e) => selectTab(e.target.value)}>
            <option value="">Choose a tab…</option>
            {tabs.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      ) : null}
      {header && header.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">
            Header row detected: {header.filter(Boolean).join(", ").slice(0, 140)}
          </p>
          {(
            [
              ["Timestamp column (optional)", timestampColumn, setTimestampColumn],
              ["Email column (optional)", emailColumn, setEmailColumn],
              ["Amount column (optional)", amountColumn, setAmountColumn],
            ] as const
          ).map(([label, value, set]) => (
            <div key={label} className="space-y-1">
              <Label>{label}</Label>
              <select className={selectCls} value={value} onChange={(e) => set(e.target.value)}>
                <option value="">None</option>
                {header.filter(Boolean).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </>
      ) : null}
      <Button
        onClick={() =>
          onSubmit({
            spreadsheetId: spreadsheet!.id,
            spreadsheetName: spreadsheet!.name,
            sheetTitle: tab,
            headerRow: header ?? [],
            ...(timestampColumn ? { timestampColumn } : {}),
            ...(emailColumn ? { emailColumn } : {}),
            ...(amountColumn ? { amountColumn } : {}),
          })
        }
        disabled={busy || !spreadsheet || !tab || header === null}
      >
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        Continue
      </Button>
    </div>
  );
}

function PreviewStep({
  connectionId,
  waitForWebhook,
  onContinue,
}: {
  connectionId: string;
  waitForWebhook: boolean;
  onContinue: () => void;
}) {
  const [records, setRecords] = React.useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetchSampleAction(connectionId).then((res) =>
      res.ok ? setRecords(res.data) : setError(res.error),
    );
  }, [connectionId]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Webhook mode: live-poll until the user's test request arrives.
  React.useEffect(() => {
    if (!waitForWebhook) return;
    const timer = setInterval(async () => {
      const res = await countRawEvents(connectionId);
      if (res.ok && res.data > 0) {
        load();
        clearInterval(timer);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [waitForWebhook, connectionId, load]);

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {records === null && !error ? (
        <p className="text-sm text-muted-foreground">Fetching your latest records…</p>
      ) : null}
      {records && records.length === 0 ? (
        waitForWebhook ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Waiting for your first request… send one to the URL from the previous step (curl works).
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No records yet — that&apos;s fine. New activity will appear automatically once connected.
          </p>
        )
      ) : null}
      {records && records.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CheckCircle2Icon className="size-4 text-primary" />
            Your latest {records.length === 1 ? "record" : `${records.length} records`} — this is real data from your account
          </p>
          {records.map((r, i) => (
            <pre key={i} className="max-h-40 overflow-auto rounded-md border bg-secondary p-3 text-xs">
              {JSON.stringify(r, null, 2).slice(0, 1500)}
            </pre>
          ))}
        </div>
      ) : null}
      <Button onClick={onContinue} disabled={records === null && !error}>
        Continue
      </Button>
    </div>
  );
}

function FinishStep({
  defaultName,
  busy,
  onSubmit,
}: {
  defaultName: string;
  busy: boolean;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = React.useState(defaultName);
  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="connName">Name this connection</Label>
        <Input id="connName" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button onClick={() => onSubmit(name)} disabled={busy || !name.trim()}>
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        {busy ? "Finishing setup…" : "Finish & activate"}
      </Button>
    </div>
  );
}
