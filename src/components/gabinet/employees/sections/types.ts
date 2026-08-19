export const EMPLOYMENT_TYPES = ["umowa_o_prace", "umowa_zlecenie", "b2b", "staz"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export type EmployeeFormData = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  pesel: string;
  addressStreet: string;
  addressCity: string;
  addressPostalCode: string;
  employmentType: string;
  hireDate: string;
  endDate: string;
  position: string;
  department: string;
  role: string;
  notes: string;
  specialization: string;
  licenseNumber: string;
  skills: string;
  yearsOfExperience: string;
  baseSalary: string;
  commissionPercent: string;
  bankAccount: string;
  bio: string;
};
