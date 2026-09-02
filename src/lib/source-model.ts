import type { SourceHealth, SourceId, SourceSnapshot } from "../../shared/types";
import { SOURCE_LABEL, SOURCE_ORDER, groupAgents, isSourceVisible } from "../../shared/types";

export type { GroupedAgent } from "../../shared/types";
export { groupAgents };

export type WidgetStatus = "idle" | "processing" | "warning" | "error";

export interface CompactSlot {
  source: SourceId;
  label: string;
  status: WidgetStatus;
  kind: "meter" | "count" | "presence";
  percent: number | null;
  count: number;
  live: boolean;
  liveCount: number;
  detail: string;
}

export function sourceStatus(source: SourceSnapshot): WidgetStatus {
  if (source.health.status === "error" || source.health.status === "missing") return "error";
  if (source.health.status === "outdated") return "warning";
  if (source.agents.some((agent) => agent.hasBlockingPendingActions)) return "warning";
  if (source.agents.some((agent) => agent.isRunning) || source.liveProcessCount > 0) {
    return "processing";
  }
  return "idle";
}

export function healthDetail(health: SourceHealth): string {
  if (health.status === "ok") return "ok";
  if (health.detail) return health.detail;
  if (health.status === "missing") return "não encontrado";
  if (health.status === "outdated") return "atualize o CLI";
  return "falha na leitura";
}

function slotFromSource(source: SourceSnapshot): CompactSlot {
  const status = sourceStatus(source);
  const percents = source.agents
    .map((agent) => agent.contextUsagePercent)
    .filter((value): value is number => value != null);
  const percent = percents.length > 0 ? Math.max(...percents) : null;
  const healthBad = source.health.status !== "ok";

  let kind: CompactSlot["kind"] = "count";
  if (percent != null && !healthBad) kind = "meter";
  else if (source.source === "codex" && !healthBad) kind = "presence";

  const liveCount = source.liveProcessCount;
  let detail: string;
  if (healthBad) {
    detail = healthDetail(source.health);
  } else if (source.source === "codex" && source.agents.length === 0) {
    detail = `${liveCount} ao vivo`;
  } else {
    detail = `${source.agents.length} ativa${source.agents.length === 1 ? "" : "s"}`;
  }

  return {
    source: source.source,
    label: SOURCE_LABEL[source.source],
    status,
    kind,
    percent,
    count: source.agents.length,
    live: liveCount > 0,
    liveCount,
    detail,
  };
}

export function toCompactSlots(sources: SourceSnapshot[]): CompactSlot[] {
  return SOURCE_ORDER.map((id) => sources.find((item) => item.source === id))
    .filter((source): source is SourceSnapshot => Boolean(source && isSourceVisible(source)))
    .map(slotFromSource);
}

export function overallStatus(slots: CompactSlot[]): WidgetStatus {
  if (slots.some((slot) => slot.status === "error")) return "error";
  if (slots.some((slot) => slot.status === "warning")) return "warning";
  if (slots.some((slot) => slot.status === "processing")) return "processing";
  return "idle";
}
