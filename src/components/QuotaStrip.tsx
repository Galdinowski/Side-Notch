import type { SourceQuota } from "../../shared/types";
import { formatResetIn, hasQuota, quotaLevel } from "../lib/quota";

interface QuotaStripProps {
  quota?: SourceQuota | null;
  tone: "cursor" | "claude";
}

export function QuotaStrip({ quota, tone }: QuotaStripProps) {
  if (!hasQuota(quota)) return null;

  return (
    <div className={`quota-strip quota-strip--${tone}`} data-no-drag>
      {quota.windows.map((window) => {
        const used = Math.min(100, Math.max(0, window.usedPercent));
        const reset = formatResetIn(window.resetsAt);
        const level = quotaLevel(used);
        return (
          <div
            key={window.id}
            className={`quota-chip quota-chip--${level}`}
            title={reset ? `${window.label} ${used.toFixed(0)}% · reinicia em ${reset}` : `${window.label} ${used.toFixed(0)}%`}
          >
            <div className="quota-chip__meta">
              <span className="quota-chip__label">{window.label}</span>
              <span className="quota-chip__value">{Math.round(used)}%</span>
            </div>
            <span className="quota-chip__track" aria-hidden="true">
              <span className="quota-chip__fill" style={{ width: `${used}%` }} />
            </span>
            <span className="quota-chip__reset">{reset ? `reinicia ${reset}` : "limite do plano"}</span>
          </div>
        );
      })}
    </div>
  );
}
