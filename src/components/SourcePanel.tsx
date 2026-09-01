import type { ReactNode } from "react";
import type { SourceSnapshot } from "../../shared/types";
import { SOURCE_LABEL, SOURCE_TICK } from "../../shared/types";
import { AgentCard } from "./AgentCard";
import {
  groupAgents,
  healthDetail,
  sourceStatus,
  type GroupedAgent,
} from "../lib/source-model";
import type { WidgetStatus } from "../lib/source-model";

interface SourceBlockProps {
  source: SourceSnapshot;
  maxItems: number;
  variant: "preview" | "expanded";
}

function SourceBody({ source, maxItems, variant }: SourceBlockProps) {
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
          />
        ))}
      </div>
      {rest > 0 ? <p className="preview-view__more">+{rest} mais</p> : null}
    </>
  );
}

export function SourceBlock({ source, maxItems, variant }: SourceBlockProps) {
  const status: WidgetStatus = sourceStatus(source);
  const countLabel =
    source.source === "codex" && source.agents.length === 0
      ? `${source.liveProcessCount} ao vivo`
      : source.agents.length === 1
        ? "1 tarefa"
        : `${source.agents.length} tarefas`;

  return (
    <section className={`source-block source-block--${source.source} source-block--${variant}`}>
      <header className="source-block__header">
        <span className={`status-indicator status-indicator--${status}`} aria-hidden="true" />
        <span className="source-block__tick">{SOURCE_TICK[source.source]}</span>
        <span className="source-block__name">{SOURCE_LABEL[source.source]}</span>
        <span className="source-block__meta">{countLabel}</span>
      </header>
      <SourceBody source={source} maxItems={maxItems} variant={variant} />
    </section>
  );
}

interface PanelViewProps {
  sources: SourceSnapshot[];
  variant: "preview" | "expanded";
  hint?: string;
  emptyLabel: string;
}

export function SourcePanel({ sources, variant, hint, emptyLabel }: PanelViewProps): ReactNode {
  if (sources.length === 0) {
    return (
      <div className={`${variant}-view ${variant}-view--empty`}>
        <p className="panel-message panel-message--short">{emptyLabel}</p>
        {hint ? <footer className="expanded-view__hint">{hint}</footer> : null}
      </div>
    );
  }

  return (
    <div className={`${variant}-view`}>
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
          />
        ))}
      </div>
      {hint ? <footer className="expanded-view__hint">{hint}</footer> : null}
    </div>
  );
}
