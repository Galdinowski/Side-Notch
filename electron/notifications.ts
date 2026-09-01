import type {
  AgentSnapshot,
  AppSettings,
  NotchNotification,
  NotchToast,
  SourceHealthStatus,
  SourceId,
  SourceSnapshot,
} from "./types.js";
import { SOURCE_LABEL } from "./types.js";

const VISIBLE_MS = 1000;
const GONE_MS = 2000;
const GROUP_MS = 1200;

interface TrackedAgent {
  source: SourceId;
  id: string;
  name: string;
  subtitle: string;
  firstSeenAt: number;
  running: boolean;
  pending: boolean;
  completionEmitted: boolean;
}

interface NotificationHubOptions {
  visibleMs?: number;
  goneMs?: number;
  groupMs?: number;
  now?: () => number;
}

export class NotificationHub {
  private readonly visibleMs: number;
  private readonly goneMs: number;
  private readonly groupMs: number;
  private readonly now: () => number;
  private primed = false;
  private agents = new Map<string, TrackedAgent>();
  private missingSince = new Map<string, number>();
  private sourceHealth = new Map<SourceId, SourceHealthStatus>();
  private completions: NotchNotification[] = [];
  private completionTimer: NodeJS.Timeout | null = null;
  private onToast: (toast: NotchToast) => void = () => {};

  constructor(options: NotificationHubOptions = {}) {
    this.visibleMs = options.visibleMs ?? VISIBLE_MS;
    this.goneMs = options.goneMs ?? GONE_MS;
    this.groupMs = options.groupMs ?? GROUP_MS;
    this.now = options.now ?? Date.now;
  }

  setOnToast(handler: (toast: NotchToast) => void): void {
    this.onToast = handler;
  }

  reset(): void {
    this.primed = false;
    this.agents.clear();
    this.missingSince.clear();
    this.sourceHealth.clear();
    this.completions = [];
    if (this.completionTimer) clearTimeout(this.completionTimer);
    this.completionTimer = null;
  }

  ingest(sources: SourceSnapshot[], settings: AppSettings): void {
    const now = this.now();
    const live = new Map<string, TrackedAgent>();
    const healthySources = new Set(
      sources
        .filter((source) => source.health.status === "ok")
        .map((source) => source.source),
    );

    for (const source of sources) {
      if (source.health.status !== "ok") continue;
      for (const agent of source.agents) {
        const key = `${agent.source}:${agent.id}`;
        const prev = this.agents.get(key);
        live.set(key, {
          source: agent.source,
          id: agent.id,
          name: agent.name,
          subtitle: agent.subtitle,
          firstSeenAt: prev?.firstSeenAt ?? now,
          running: agent.isRunning,
          pending: agent.hasBlockingPendingActions,
          completionEmitted: prev?.completionEmitted ?? false,
        });
      }
    }

    if (!this.primed) {
      this.agents = live;
      for (const source of sources) this.sourceHealth.set(source.source, source.health.status);
      this.primed = true;
      const pending = [...live.values()]
        .filter((agent) => agent.pending && this.enabled(agent.source, settings))
        .map((agent) =>
          this.event(
            agent.source,
            "action",
            "Intervencao necessaria",
            agent.subtitle,
            agent.name,
            agent.id,
          ),
        );
      if (pending.length > 0) this.emit(pending);
      return;
    }

    for (const [key, next] of live) {
      const prev = this.agents.get(key);
      this.missingSince.delete(key);
      if (next.pending && !prev?.pending && this.enabled(next.source, settings)) {
        this.emit([
          this.event(
            next.source,
            "action",
            "Intervencao necessaria",
            next.subtitle,
            next.name,
            next.id,
          ),
        ]);
      }
      if (
        prev?.running &&
        !next.running &&
        !next.pending &&
        !prev.completionEmitted &&
        now - prev.firstSeenAt >= this.visibleMs &&
        this.enabled(next.source, settings)
      ) {
        this.queueCompletion(next);
        next.completionEmitted = true;
      }
      this.agents.set(key, next);
    }

    for (const [key, prev] of [...this.agents]) {
      if (live.has(key)) continue;
      // A failed source read is not evidence that all of its tasks completed.
      if (!healthySources.has(prev.source)) {
        this.missingSince.delete(key);
        continue;
      }

      const goneAt = this.missingSince.get(key);
      if (goneAt == null) {
        this.missingSince.set(key, now);
        continue;
      }
      const visibleFor = goneAt - prev.firstSeenAt;
      if (now - goneAt >= this.goneMs) {
        this.missingSince.delete(key);
        this.agents.delete(key);
        if (
          !prev.completionEmitted &&
          visibleFor >= this.visibleMs &&
          this.enabled(prev.source, settings)
        ) {
          this.queueCompletion(prev);
        }
      }
    }

    for (const key of [...this.missingSince.keys()]) {
      if (live.has(key)) this.missingSince.delete(key);
    }

    this.detectSourceErrors(sources, settings);
  }

  private enabled(source: SourceId, settings: AppSettings): boolean {
    if (source === "cursor") return settings.notifyCursor !== false;
    if (source === "claude") return settings.notifyClaude !== false;
    return settings.notifyCodex !== false;
  }

  private detectSourceErrors(sources: SourceSnapshot[], settings: AppSettings): void {
    for (const source of sources) {
      const previous = this.sourceHealth.get(source.source);
      this.sourceHealth.set(source.source, source.health.status);
      if (previous === source.health.status || source.health.status !== "error") continue;
      if (!this.enabled(source.source, settings)) continue;
      this.emit([
        this.event(
          source.source,
          "error",
          "Erro requer atencao",
          source.health.detail || `${SOURCE_LABEL[source.source]} nao conseguiu atualizar as tarefas`,
          undefined,
          source.source,
        ),
      ]);
    }
  }

  private queueCompletion(agent: TrackedAgent): void {
    this.completions.push(
      this.event(
        agent.source,
        "completed",
        "Tarefa concluida",
        agent.name,
        agent.name,
        agent.id,
      ),
    );
    if (this.completionTimer) return;
    this.completionTimer = setTimeout(() => {
      this.completionTimer = null;
      const events = this.completions.splice(0);
      if (events.length > 0) this.emit(events);
    }, this.groupMs);
  }

  private event(
    source: SourceId,
    kind: NotchNotification["kind"],
    title: string,
    body: string,
    taskName?: string,
    identity?: string,
  ): NotchNotification {
    return {
      id: `${source}:${kind}:${identity ?? taskName ?? body}:${this.now()}`,
      source,
      kind,
      ...(kind !== "error" && identity ? { taskId: identity } : {}),
      title,
      body,
      taskName,
      createdAt: this.now(),
    };
  }

  private emit(events: NotchNotification[]): void {
    this.onToast({
      events,
      sticky: events.some((event) => event.kind === "action" || event.kind === "error"),
    });
  }
}
