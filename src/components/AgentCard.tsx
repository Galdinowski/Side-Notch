import type { MouseEvent, ReactNode } from "react";
import type { AgentSnapshot } from "../../shared/types";
import { ContextMeter } from "./ContextMeter";

interface AgentCardProps {
  agent: AgentSnapshot;
  subagents?: AgentSnapshot[];
  variant?: "default" | "preview";
  onOpen?: (agent: AgentSnapshot) => void;
}

function shortPath(fullPath: string | null): string {
  if (!fullPath) return "Sem workspace";
  const parts = fullPath.split(/[\\/]/);
  return parts[parts.length - 1] || fullPath;
}

function openLabel(agent: AgentSnapshot): string {
  if (agent.source === "claude") return `Abrir sessão ${agent.name} no Claude Code`;
  if (agent.source === "cursor") return `Abrir o chat ${agent.name} no Cursor`;
  return `Abrir pasta de ${agent.name}`;
}

function Openable({
  className,
  onOpen,
  label,
  children,
}: {
  className: string;
  onOpen?: () => void;
  label?: string;
  children: ReactNode;
}) {
  if (!onOpen) return <article className={className}>{children}</article>;
  return (
    <button
      type="button"
      className={className}
      data-no-drag
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onOpen();
      }}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}

export function AgentCard({
  agent,
  subagents = [],
  variant = "default",
  onOpen,
}: AgentCardProps) {
  const percent = agent.contextUsagePercent;
  const isPreview = variant === "preview";
  const rounded = percent != null ? Math.round(percent) : null;
  const open = onOpen ? () => onOpen(agent) : undefined;
  const label = onOpen ? openLabel(agent) : undefined;

  if (isPreview) {
    return (
      <Openable
        className={`task-row${onOpen ? " task-row--open" : ""}`}
        onOpen={open}
        label={label}
      >
        <div className="task-row__header">
          <span
            className={`status-indicator status-indicator--${
              agent.hasBlockingPendingActions
                ? "warning"
                : agent.isRunning
                  ? "processing"
                  : "idle"
            } status-indicator--inline`}
            aria-hidden="true"
          />
          <span className="task-row__name">{agent.name}</span>
          <span className="task-row__percent">
            {rounded != null ? `${rounded}%` : agent.hasBlockingPendingActions ? "ação" : "ao vivo"}
          </span>
        </div>
        {percent != null ? <ContextMeter percent={percent} /> : null}
      </Openable>
    );
  }

  return (
    <Openable
      className={`agent-card${onOpen ? " agent-card--open" : ""}`}
      onOpen={open}
      label={label}
    >
      <div className="agent-card__header">
        <div className="agent-card__title-row">
          <span
            className={`status-indicator status-indicator--${
              agent.hasBlockingPendingActions
                ? "warning"
                : agent.isRunning
                  ? "processing"
                  : "idle"
            } status-indicator--inline`}
            aria-hidden="true"
          />
          <span className="agent-card__title">{agent.name}</span>
        </div>
        <span className="agent-card__workspace" title={agent.workspacePath ?? undefined}>
          {shortPath(agent.workspacePath)}
        </span>
      </div>

      {agent.subtitle ? <p className="agent-card__subtitle">{agent.subtitle}</p> : null}

      {percent != null ? <ContextMeter percent={percent} showLabels /> : null}

      <div className="agent-card__meta">
        {agent.linesAdded > 0 || agent.linesRemoved > 0 ? (
          <span>
            +{agent.linesAdded} / -{agent.linesRemoved}
          </span>
        ) : null}
        {agent.filesChanged > 0 ? <span>{agent.filesChanged} arquivos</span> : null}
        {agent.hasBlockingPendingActions ? (
          <span className="agent-card__blocking">Aguardando ação</span>
        ) : null}
      </div>

      {subagents.length > 0 ? (
        <div className="agent-card__subagents">
          {subagents.map((sub) => (
            <div key={sub.composerId} className="subagent-row">
              <span className="subagent-row__name">{sub.name}</span>
              <span className="subagent-row__percent">
                {sub.contextUsagePercent != null
                  ? `${Math.round(sub.contextUsagePercent)}%`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Openable>
  );
}
