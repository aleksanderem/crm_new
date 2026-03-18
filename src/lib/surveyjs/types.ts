export interface FormTemplateConfig {
  formJson: string;
  variableBindings?: Record<string, string>;
  signatureConfig?: {
    method: "click" | "sms" | "email_otp" | "draw";
    signerRole: "client" | "patient" | "employee" | "external";
    reminderEnabled?: boolean;
    reminderIntervalHours?: number;
  };
}

export interface ScopeData {
  [entityType: string]: Record<string, unknown>;
}

export interface GenerateDocumentParams {
  templateId: string;
  entityType: string;
  entityId: string;
  organizationId: string;
}
