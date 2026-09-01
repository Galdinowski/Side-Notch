import { SourcePanel } from "./SourcePanel";
import type { SourceSnapshot } from "../../shared/types";

interface PreviewViewProps {
  sources: SourceSnapshot[];
}

export function PreviewView({ sources }: PreviewViewProps) {
  return (
    <SourcePanel
      sources={sources}
      variant="preview"
      emptyLabel="Nada em uso agora"
    />
  );
}
