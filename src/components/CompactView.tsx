import type { WidgetDock } from "../../shared/types";
import type { CompactSlot } from "../lib/source-model";
import { SnakePet } from "./SnakePet";

interface ChannelSlotProps {
  slot: CompactSlot;
  layout: "island" | "side";
}

/**
 * A reading or a state word. Only the reading earns extra size where space is
 * tight, since a word already carries its own weight and would overflow.
 */
function valueLabel(slot: CompactSlot): { text: string; numeric: boolean } {
  if (slot.status === "error") return { text: "erro", numeric: false };
  if (slot.status === "warning" && slot.kind !== "meter") {
    return { text: "atenção", numeric: false };
  }
  if (slot.kind === "meter" && slot.percent != null) {
    return { text: `${Math.round(slot.percent)}%`, numeric: true };
  }
  if (slot.kind === "presence") {
    return { text: slot.liveCount > 0 ? String(slot.liveCount) : "0", numeric: true };
  }
  return { text: String(slot.count), numeric: true };
}

export function ChannelSlot({ slot, layout }: ChannelSlotProps) {
  const value = valueLabel(slot);
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
      <span
        className={`channel-slot__value${
          value.numeric ? " channel-slot__value--numeric" : ""
        }`}
      >
        {value.text}
      </span>
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
  petVisible?: boolean;
  wrapping?: boolean;
}

export function CompactView({
  slots,
  layout,
  tooltip,
  dock,
  petVisible,
  wrapping = false,
}: CompactViewProps) {
  const dormant = slots.length === 0;
  const showPet = petVisible ?? dormant;

  return (
    <div
      className={`compact-view compact-view--${layout}${
        dormant ? " compact-view--dormant" : ""
      }${wrapping ? " compact-view--pet-wrapping" : ""}`}
      title={tooltip}
      aria-label={tooltip}
    >
      {showPet ? <SnakePet mood="idle" orientation={dock} wrapping={wrapping} /> : null}
      {slots.map((slot) => (
        <ChannelSlot key={slot.source} slot={slot} layout={layout} />
      ))}
    </div>
  );
}
