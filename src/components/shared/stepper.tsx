import * as React from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wizard container: numbered step rail + content area. Plan 2's connect
 * wizard and Plan 3's builders render inside this.
 */
export function Stepper({
  steps,
  current,
  children,
}: {
  steps: string[];
  current: number; // 0-indexed
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <ol className="flex flex-wrap items-center gap-2">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs font-medium",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "text-muted-foreground",
                )}
              >
                {done ? <CheckIcon className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active ? "font-medium" : "text-muted-foreground",
                )}
              >
                {step}
              </span>
              {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border" /> : null}
            </li>
          );
        })}
      </ol>
      <div>{children}</div>
    </div>
  );
}
