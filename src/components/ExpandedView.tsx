import { SourcePanel } from "./SourcePanel";
import type { SourceSnapshot } from "../../shared/types";

interface ExpandedViewProps {
  sources: SourceSnapshot[];
}

export function ExpandedView({ sources }: ExpandedViewProps) {
  return (
    <SourcePanel
      sources={sources}
      variant="expanded"
      emptyLabel="Nada em uso agora"
      hint="Clique para recolher"
    />
  );
}
