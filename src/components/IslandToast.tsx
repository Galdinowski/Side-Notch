import type { NotchNotification, NotchToast } from "../../shared/types";

interface IslandToastProps {
  toast: NotchToast;
}

const PRIORITY: Record<NotchNotification["kind"], number> = {
  action: 0,
  error: 1,
  completed: 2,
};

function icon(kind: NotchNotification["kind"]): string {
  if (kind === "completed") return "OK";
  if (kind === "action") return "!";
  return "X";
}

export function IslandToast({ toast }: IslandToastProps) {
  const events = [...toast.events]
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.createdAt - b.createdAt)
    .slice(0, 4);
  const remaining = toast.events.length - events.length;

  return (
    <div className="island-toast">
      <header className="island-toast__header">
        <span className="island-toast__eyebrow">ATIVIDADE</span>
        <span className="island-toast__count">
          {toast.events.length} evento{toast.events.length === 1 ? "" : "s"}
        </span>
      </header>
      <div className="island-toast__events">
        {events.map((event) => (
          <article key={event.id} className={`island-toast__event island-toast__event--${event.kind}`}>
            <span className="island-toast__icon" aria-hidden="true">
              {icon(event.kind)}
            </span>
            <div className="island-toast__copy">
              <p className="island-toast__title">{event.title}</p>
              <p className="island-toast__body">{event.body}</p>
            </div>
          </article>
        ))}
      </div>
      {remaining > 0 ? <p className="island-toast__more">+{remaining} eventos</p> : null}
    </div>
  );
}
