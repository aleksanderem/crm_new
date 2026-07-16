import type { AnalysisKind } from "./documentAnalyzer";
import { invoiceKind } from "./kinds/invoice";
import { formTemplateKind } from "./kinds/formTemplate";

const KINDS: Record<string, AnalysisKind<unknown>> = {
  [invoiceKind.id]: invoiceKind as AnalysisKind<unknown>,
  [formTemplateKind.id]: formTemplateKind as AnalysisKind<unknown>,
};

export function getAnalysisKind(id: string): AnalysisKind<unknown> | null {
  return KINDS[id] ?? null;
}
