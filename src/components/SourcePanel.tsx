import type { ReactNode } from "react";
import type { SourceSnapshot } from "../../shared/types";
import { SOURCE_LABEL } from "../../shared/types";
import { AgentCard } from "./AgentCard";
import { QuotaStrip } from "./QuotaStrip";
import {
  groupAgents,
  healthDetail,
  sourceStatus,
  type GroupedAgent,
  type WidgetStatus,
} from "../lib/source-model";

interface SourceBlockProps {
  source: SourceSnapshot;
  maxItems: number;
  variant: "preview" | "expanded";
  onOpenAgent?: (agent: SourceSnapshot["agents"][number]) => void;
}

function SourceBody({ source, maxItems, variant, onOpenAgent }: SourceBlockProps) {
  if (source.health.status !== "ok") {
    return (
      <p className={`panel-message ${source.health.status === "error" ? "panel-message--error" : ""}`}>
        {healthDetail(source.health)}
      </p>
    );
  }

  const grouped = groupAgents(source.agents);
  if (grouped.length === 0) {
    return <p className="panel-message panel-message--short">Sem tarefas ativas</p>;
  }

  const visible = grouped.slice(0, maxItems);
  const rest = grouped.length - visible.length;

  return (
    <>
      <div
        className={variant === "preview" ? "preview-view__tasks" : "expanded-view__cards"}
        data-no-drag
      >
        {visible.map(({ parent, children }: GroupedAgent) => (
          <AgentCard
            key={parent.id}
            agent={parent}
            subagents={children}
            variant={variant === "preview" ? "preview" : "default"}
            onOpen={onOpenAgent}
          />
        ))}
      </div>
      {rest > 0 ? <p className="preview-view__more">+{rest} mais</p> : null}
    </>
  );
}

export function SourceBlock({ source, maxItems, variant, onOpenAgent }: SourceBlockProps) {
  const status: WidgetStatus = sourceStatus(source);
  const countLabel =
    source.health.status !== "ok"
      ? healthDetail(source.health)
      : source.agents.length === 1
          ? "1 tarefa"
          : `${source.agents.length} tarefas`;

  return (
    <section className={`source-block source-block--${source.source} source-block--${variant}`}>
      <header className="source-block__header">
        <div className="source-block__title-row">
          <span className={`status-indicator status-indicator--${status}`} aria-hidden="true" />
          <span className="source-block__name">{SOURCE_LABEL[source.source]}</span>
          <span className="source-block__meta">{countLabel}</span>
        </div>
        {source.source === "cursor" || source.source === "claude" ? (
          <QuotaStrip quota={source.quota} tone={source.source} />
        ) : null}
      </header>
      <SourceBody source={source} maxItems={maxItems} variant={variant} onOpenAgent={onOpenAgent} />
    </section>
  );
}

interface PanelViewProps {
  sources: SourceSnapshot[];
  variant: "preview" | "expanded";
  hint?: string;
  onHintClick?: () => void;
  collapseHint?: string;
  onCollapse?: () => void;
  onOpenAgent?: (agent: SourceSnapshot["agents"][number]) => void;
  emptyLabel: string;
}

export function SourcePanel({
  sources,
  variant,
  hint,
  onHintClick,
  collapseHint,
  onCollapse,
  onOpenAgent,
  emptyLabel,
}: PanelViewProps): ReactNode {
  const hasActions = Boolean(hint || collapseHint);
  return (
    <div className={`${variant}-view${sources.length === 0 ? ` ${variant}-view--empty` : ""}`}>
      {sources.length === 0 ? (
        <p className="panel-message panel-message--short">{emptyLabel}</p>
      ) : (
        <div
          className={variant === "expanded" ? "expanded-view__list" : "preview-view__stack"}
          data-no-drag
        >
          {sources.map((source) => (
            <SourceBlock
              key={source.source}
              source={source}
              maxItems={variant === "preview" ? 2 : 8}
              variant={variant}
              onOpenAgent={onOpenAgent}
            />
          ))}
        </div>
      )}
      {hasActions ? (
        <div
          className={`expanded-view__actions${
            hint && collapseHint ? " expanded-view__actions--split" : ""
          }`}
          data-no-drag
        >
          {collapseHint ? (
            <button
              type="button"
              className="expanded-view__hint"
              onClick={(event) => {
                event.stopPropagation();
                onCollapse?.();
              }}
            >
              {collapseHint}
            </button>
          ) : null}
          {hint ? (
            <button
              type="button"
              className="expanded-view__hint"
              onClick={(event) => {
                event.stopPropagation();
                onHintClick?.();
              }}
            >
              {hint}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
