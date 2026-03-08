import { useTranslation } from "react-i18next";

interface PrintAppointment {
  startTime: string;
  endTime: string;
  patientName: string;
  treatmentName: string;
  employeeName: string;
  status: string;
}

interface PrintScheduleProps {
  date: string;
  appointments: PrintAppointment[];
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Zaplanowana",
  confirmed: "Potwierdzona",
  in_progress: "W trakcie",
  completed: "Zakonczona",
  cancelled: "Anulowana",
  no_show: "Nieobecnosc",
};

export function PrintSchedule({ date, appointments }: PrintScheduleProps) {
  const { t } = useTranslation();

  const sorted = [...appointments].sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );

  const formattedDate = new Date(date + "T00:00:00").toLocaleDateString("pl-PL", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="print-schedule hidden print:block">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-bold">
          {t("gabinet.calendar.scheduleTitle", "Harmonogram wizyt")}
        </h1>
        <p className="text-sm text-gray-600">{formattedDate}</p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-gray-500">
          {t("gabinet.calendar.noAppointments", "Brak wizyt na ten dzien")}
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="px-2 py-1 text-left">{t("gabinet.calendar.printTime", "Godzina")}</th>
              <th className="px-2 py-1 text-left">{t("gabinet.calendar.printPatient", "Pacjent")}</th>
              <th className="px-2 py-1 text-left">{t("gabinet.calendar.printTreatment", "Zabieg")}</th>
              <th className="px-2 py-1 text-left">{t("gabinet.calendar.printEmployee", "Pracownik")}</th>
              <th className="px-2 py-1 text-left">{t("gabinet.calendar.printStatus", "Status")}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((appt, i) => (
              <tr key={i} className="border-b border-gray-300">
                <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                  {appt.startTime} - {appt.endTime}
                </td>
                <td className="px-2 py-1.5">{appt.patientName}</td>
                <td className="px-2 py-1.5">{appt.treatmentName}</td>
                <td className="px-2 py-1.5">{appt.employeeName}</td>
                <td className="px-2 py-1.5">{STATUS_LABELS[appt.status] ?? appt.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6 text-center text-xs text-gray-400">
        {t("gabinet.calendar.printFooter", "Wydrukowano")}: {new Date().toLocaleString("pl-PL")}
      </div>
    </div>
  );
}
