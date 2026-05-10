import type { CustomerStatus } from "@/lib/types";

const standardFlow: CustomerStatus[] = ["New", "Investigating", "Waiting", "Resolved", "Closed"];
const majorFlow: CustomerStatus[] = ["New", "Declared", "Investigating", "Identified", "Mitigated", "Monitoring", "Closed"];

export function StatusProgress({
  status,
  progress,
  major = false
}: {
  status: CustomerStatus;
  progress: number;
  major?: boolean;
}) {
  const flow = major ? majorFlow : standardFlow;

  return (
    <div>
      <div className="progress-track" aria-label={`Ticket progress: ${progress}%`}>
        <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
      </div>
      <div className="progress-steps">
        {flow.map((step) => (
          <span key={step} aria-current={step === status ? "step" : undefined}>
            {step}
          </span>
        ))}
      </div>
    </div>
  );
}
