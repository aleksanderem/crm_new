import type { Template } from "@pdfme/common";

export interface PdfmeTemplateConfig {
  template: Template;
  variableBindings?: Record<string, string>;
  signatureConfig?: {
    method: "click" | "sms" | "email_otp" | "draw";
    signerRole: "client" | "patient" | "employee" | "external";
    reminderEnabled?: boolean;
    reminderIntervalHours?: number;
  };
}
