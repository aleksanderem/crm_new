import type { DataSourceDefinition } from "../documentDataSources";

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
  resolve: async (ctx, contactId) => {
    if (!contactId) return {};
    const contact = await ctx.db.get(contactId as any);
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
  resolve: async (ctx, companyId) => {
    if (!companyId) return {};
    const company = await ctx.db.get(companyId as any);
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
  resolve: async (ctx, leadId) => {
    if (!leadId) return {};
    const lead = await ctx.db.get(leadId as any);
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
