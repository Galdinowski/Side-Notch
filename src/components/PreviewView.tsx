import { SourcePanel } from "./SourcePanel";
import type { SourceSnapshot } from "../../shared/types";

interface PreviewViewProps {
  sources: SourceSnapshot[];
  onExpand: () => void;
  onCollapse: () => void;
}

export function PreviewView({ sources, onExpand, onCollapse }: PreviewViewProps) {
  return (
    <SourcePanel
      sources={sources}
      variant="preview"
      emptyLabel="Nada em uso agora"
      hint="Expandir lista"
      onHintClick={onExpand}
      collapseHint="Recolher"
      onCollapse={onCollapse}
    />
  );
}
