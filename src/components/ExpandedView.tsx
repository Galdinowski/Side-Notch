import { SourcePanel } from "./SourcePanel";
import type { SourceSnapshot } from "../../shared/types";

interface ExpandedViewProps {
  sources: SourceSnapshot[];
  onCollapse: () => void;
}

export function ExpandedView({ sources, onCollapse }: ExpandedViewProps) {
  return (
    <SourcePanel
      sources={sources}
      variant="expanded"
      emptyLabel="Nada em uso agora"
      hint="Recolher"
      onHintClick={onCollapse}
    />
  );
}
