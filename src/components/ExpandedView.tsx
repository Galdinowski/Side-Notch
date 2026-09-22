import { SourcePanel } from "./SourcePanel";
import type { SourceSnapshot } from "../../shared/types";

interface ExpandedViewProps {
  sources: SourceSnapshot[];
  onCollapse: () => void;
  onOpenAgent: (agent: SourceSnapshot["agents"][number]) => void;
}

export function ExpandedView({ sources, onCollapse, onOpenAgent }: ExpandedViewProps) {
  return (
    <SourcePanel
      sources={sources}
      variant="expanded"
      emptyLabel="Nada em uso agora"
      hint="Recolher"
      onHintClick={onCollapse}
      onOpenAgent={onOpenAgent}
    />
  );
}
