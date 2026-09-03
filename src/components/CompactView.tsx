import type { CompactSlot } from "../lib/source-model";
import type { WidgetDock } from "../../shared/types";

function peekSprite(dock: WidgetDock): string {
  if (dock === "left" || dock === "bottom-left") return "/pet/frames/00.png";
  if (dock === "right" || dock === "bottom-right") return "/pet/frames/07.png";
  return "/pet/frames/06.png";
}

interface ChannelSlotProps {
  slot: CompactSlot;
  layout: "island" | "side";
}

function valueLabel(slot: CompactSlot): string {
  if (slot.status === "error") return "erro";
  if (slot.status === "warning" && slot.kind !== "meter") return "atenção";
  if (slot.kind === "meter" && slot.percent != null) {
    return `${Math.round(slot.percent)}%`;
  }
  if (slot.kind === "presence") {
    return slot.liveCount > 0 ? String(slot.liveCount) : "0";
  }
  return String(slot.count);
}

export function ChannelSlot({ slot, layout }: ChannelSlotProps) {
  const fill =
    slot.status === "error" || slot.status === "warning"
      ? 100
      : slot.kind === "meter" && slot.percent != null
        ? Math.min(100, Math.max(0, slot.percent))
        : slot.kind === "presence" && slot.live
          ? 100
          : slot.count > 0
            ? 70
            : 8;

  return (
    <div
      className={`channel-slot channel-slot--${layout} channel-slot--${slot.source} channel-slot--${slot.status}`}
      title={`${slot.label}: ${slot.detail}`}
    >
      <span className="channel-slot__tick">{slot.label}</span>
      <span
        className={`status-indicator status-indicator--${slot.status}${
          slot.status === "idle" && slot.count > 0 ? " status-indicator--active" : ""
        }`}
        aria-hidden="true"
      />
      <span className="channel-slot__value">{valueLabel(slot)}</span>
      <span className="channel-slot__meter" aria-hidden="true">
        <span className="channel-slot__fill" style={{ width: `${fill}%` }} />
      </span>
    </div>
  );
}

interface CompactViewProps {
  slots: CompactSlot[];
  layout: "island" | "side";
  tooltip: string;
  dock: WidgetDock;
}

export function CompactView({ slots, layout, tooltip, dock }: CompactViewProps) {
  if (slots.length === 0) {
    return (
      <div
        className={`compact-view compact-view--${layout} compact-view--dormant`}
        title={tooltip}
        aria-label={tooltip}
      >
        <img src={peekSprite(dock)} alt="" draggable={false} className="pet-peek" />
      </div>
    );
  }

  return (
    <div
      className={`compact-view compact-view--${layout} compact-view--n${slots.length}`}
      title={tooltip}
      aria-label={tooltip}
    >
      {slots.map((slot) => (
        <ChannelSlot key={slot.source} slot={slot} layout={layout} />
      ))}
    </div>
  );
}
