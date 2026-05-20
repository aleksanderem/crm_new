import type { DataSourceDefinition } from "../documentDataSources";

const patientSource: DataSourceDefinition = {
  key: "patient",
  label: "Klient",
  module: "gabinet",
  fields: [
    { key: "firstName", label: "Imię", type: "text" },
    { key: "lastName", label: "Nazwisko", type: "text" },
    { key: "fullName", label: "Imię i nazwisko", type: "text" },
    { key: "pesel", label: "PESEL", type: "pesel" },
    { key: "dateOfBirth", label: "Data urodzenia", type: "date" },
    { key: "phone", label: "Telefon", type: "phone" },
    { key: "email", label: "E-mail", type: "email" },
    { key: "address", label: "Adres", type: "text" },
    { key: "allergies", label: "Alergie", type: "textarea" },
    { key: "bloodType", label: "Grupa krwi", type: "text" },
    { key: "emergencyContact", label: "Kontakt awaryjny", type: "text" },
  ],
  resolve: async (ctx, patientId): Promise<Record<string, string>> => {
    if (!patientId) return {};
    const patient = (await ctx.db.get(patientId as any)) as any;
    if (!patient) return {};
    return {
      firstName: patient.firstName ?? "",
      lastName: patient.lastName ?? "",
      fullName: [patient.firstName, patient.lastName].filter(Boolean).join(" "),
      pesel: patient.pesel ?? "",
      dateOfBirth: patient.dateOfBirth ?? "",
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      address: [
        patient.address?.street,
        patient.address?.postalCode,
        patient.address?.city,
      ]
        .filter(Boolean)
        .join(", "),
      allergies: patient.allergies ?? "",
      bloodType: patient.bloodType ?? "",
      emergencyContact: [
        patient.emergencyContactName,
        patient.emergencyContactPhone,
      ]
        .filter(Boolean)
        .join(" — "),
    };
  },
};

export const GABINET_DATA_SOURCES: DataSourceDefinition[] = [patientSource];
