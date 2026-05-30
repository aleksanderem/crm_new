import type { DataSourceDefinition } from "../documentDataSources";
import { createSupabaseDb } from "../_helpers/supabaseDb";

const contactSource: DataSourceDefinition = {
  key: "contact",
  label: "Kontakt",
  module: "crm",
  fields: [
    { key: "firstName", label: "Imię", type: "text" },
    { key: "lastName", label: "Nazwisko", type: "text" },
    { key: "fullName", label: "Imię i nazwisko", type: "text" },
    { key: "email", label: "E-mail", type: "email" },
    { key: "phone", label: "Telefon", type: "phone" },
    { key: "title", label: "Stanowisko", type: "text" },
  ],
  resolve: async (_ctx, contactId): Promise<Record<string, string>> => {
    if (!contactId) return {};
    // contacts live in Supabase as UUIDs — ctx.db.get fails with
    // "Unable to decode ID". Read from Supabase instead; same fix pattern
    // as #1125.
    const contact = (await createSupabaseDb().get(
      "contacts",
      String(contactId),
    )) as any;
    if (!contact) return {};
    return {
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      fullName: [contact.firstName, contact.lastName].filter(Boolean).join(" "),
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      title: contact.title ?? "",
    };
  },
};

const companySource: DataSourceDefinition = {
  key: "company",
  label: "Firma",
  module: "crm",
  fields: [
    { key: "name", label: "Nazwa firmy", type: "text" },
    { key: "domain", label: "Domena", type: "text" },
    { key: "industry", label: "Branża", type: "text" },
    { key: "phone", label: "Telefon", type: "phone" },
    { key: "website", label: "Strona www", type: "text" },
    { key: "address", label: "Adres", type: "text" },
  ],
  resolve: async (_ctx, companyId): Promise<Record<string, string>> => {
    if (!companyId) return {};
    // companies live in Supabase as UUIDs — ctx.db.get fails with
    // "Unable to decode ID". Read from Supabase instead; same fix pattern
    // as #1125.
    const company = (await createSupabaseDb().get(
      "companies",
      String(companyId),
    )) as any;
    if (!company) return {};
    return {
      name: company.name ?? "",
      domain: company.domain ?? "",
      industry: company.industry ?? "",
      phone: company.phone ?? "",
      website: company.website ?? "",
      address: [company.address?.street, company.address?.zip, company.address?.city, company.address?.country]
        .filter(Boolean)
        .join(", "),
    };
  },
};

const leadSource: DataSourceDefinition = {
  key: "lead",
  label: "Deal",
  module: "crm",
  fields: [
    { key: "title", label: "Tytuł", type: "text" },
    { key: "value", label: "Wartość", type: "currency" },
    { key: "status", label: "Status", type: "text" },
    { key: "source", label: "Źródło", type: "text" },
    { key: "expectedCloseDate", label: "Oczekiwana data zamknięcia", type: "date" },
  ],
  resolve: async (_ctx, leadId): Promise<Record<string, string>> => {
    if (!leadId) return {};
    // leads live in Supabase as UUIDs — ctx.db.get fails with
    // "Unable to decode ID". Read from Supabase instead; same fix pattern
    // as #1125.
    const lead = (await createSupabaseDb().get(
      "leads",
      String(leadId),
    )) as any;
    if (!lead) return {};
    return {
      title: lead.title ?? "",
      value: lead.value != null ? lead.value.toString() : "",
      status: lead.status ?? "",
      source: lead.source ?? "",
      expectedCloseDate: lead.expectedCloseDate
        ? new Date(lead.expectedCloseDate).toISOString().split("T")[0]
        : "",
    };
  },
};

export const CRM_DATA_SOURCES: DataSourceDefinition[] = [
  contactSource,
  companySource,
  leadSource,
];
