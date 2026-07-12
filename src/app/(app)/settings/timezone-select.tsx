"use client";

import * as React from "react";
import { toast } from "sonner";
import { updateTimezone } from "./actions";

export function TimezoneSelect({ current }: { current: string }) {
  const [value, setValue] = React.useState(current);
  const zones = React.useMemo(() => {
    const list = Intl.supportedValuesOf("timeZone") as string[];
    return list.includes("UTC") ? list : ["UTC", ...list];
  }, []);

  return (
    <select
      className="h-9 w-full max-w-xs rounded-md border border-input bg-card px-2 text-sm"
      value={value}
      onChange={async (e) => {
        const tz = e.target.value;
        setValue(tz);
        const res = await updateTimezone(tz);
        if (res.ok) toast.success(`Metrics now bucket in ${tz}`);
        else toast.error(res.error);
      }}
    >
      {zones.map((z) => (
        <option key={z} value={z}>
          {z}
        </option>
      ))}
    </select>
  );
}
