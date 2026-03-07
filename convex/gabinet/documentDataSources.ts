import type { DataSourceDefinition } from "../documentDataSources";

const patientSource: DataSourceDefinition = {
  key: "patient",
  label: "Pacjent",
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
    const patient = await ctx.db.get(patientId as any) as any;
    if (!patient) return {};
    return {
      firstName: patient.firstName ?? "",
      lastName: patient.lastName ?? "",
      fullName: [patient.firstName, patient.lastName].filter(Boolean).join(" "),
      pesel: patient.pesel ?? "",
      dateOfBirth: patient.dateOfBirth ?? "",
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      address: [patient.address?.street, patient.address?.postalCode, patient.address?.city]
        .filter(Boolean)
        .join(", "),
      allergies: patient.allergies ?? "",
      bloodType: patient.bloodType ?? "",
      emergencyContact: [patient.emergencyContactName, patient.emergencyContactPhone]
        .filter(Boolean)
        .join(" — "),
    };
  },
};

const employeeSource: DataSourceDefinition = {
  key: "gabinet_employee",
  label: "Pracownik (Gabinet)",
  module: "gabinet",
  fields: [
    { key: "name", label: "Imię i nazwisko", type: "text" },
    { key: "role", label: "Rola", type: "text" },
    { key: "specialization", label: "Specjalizacja", type: "text" },
    { key: "email", label: "E-mail", type: "email" },
    { key: "phone", label: "Telefon", type: "phone" },
  ],
  resolve: async (ctx, employeeId): Promise<Record<string, string>> => {
    if (!employeeId) return {};
    const emp = await ctx.db.get(employeeId as any) as any;
    if (!emp) return {};
    const user = emp.userId ? await ctx.db.get(emp.userId as any) as any : null;
    return {
      name: [emp.firstName, emp.lastName].filter(Boolean).join(" "),
      role: emp.role ?? "",
      specialization: Array.isArray(emp.specializations) ? emp.specializations.join(", ") : "",
      email: user?.email ?? "",
      phone: emp.phone ?? "",
    };
  },
};

const appointmentSource: DataSourceDefinition = {
  key: "appointment",
  label: "Wizyta",
  module: "gabinet",
  fields: [
    { key: "date", label: "Data wizyty", type: "date" },
    { key: "time", label: "Godzina", type: "text" },
    { key: "treatment", label: "Zabieg", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "notes", label: "Notatki", type: "textarea" },
  ],
  resolve: async (ctx, appointmentId): Promise<Record<string, string>> => {
    if (!appointmentId) return {};
    const appt = await ctx.db.get(appointmentId as any) as any;
    if (!appt) return {};
    const treatment = appt.treatmentId ? await ctx.db.get(appt.treatmentId as any) as any : null;
    const startDate = appt.startTime ? new Date(appt.startTime) : null;
    return {
      date: startDate ? startDate.toISOString().split("T")[0] : "",
      time: startDate ? startDate.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : "",
      treatment: treatment?.name ?? "",
      status: appt.status ?? "",
      notes: appt.notes ?? "",
    };
  },
};

export const GABINET_DATA_SOURCES: DataSourceDefinition[] = [
  patientSource,
  employeeSource,
  appointmentSource,
];
