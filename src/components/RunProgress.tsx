import type { StepName } from "../../shared/types.ts";
import { STEP_LABELS, WHO_LABELS } from "../labels.ts";

export type StepState = { status: "pending" | "running" | "done"; detail?: string };

export function RunProgress({
  steps,
  order,
}: {
  steps: Record<string, StepState>;
  order: StepName[];
}) {
  return (
    <div className="center-column">
      <div className="card steps">
        {order.map((step) => {
          const meta = STEP_LABELS[step];
          const state = steps[step] ?? { status: "pending" as const };
          return (
            <div className="step" key={step} data-state={state.status}>
              <span className="marker" />
              <span>
                <span className={`who who-${meta.who}`} style={{ marginRight: 8 }}>
                  {WHO_LABELS[meta.who]}
                </span>
                {meta.name}
              </span>
              <span className="muted mono" style={{ fontSize: 12 }}>
                {state.detail ?? ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
