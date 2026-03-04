import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import { useOrganization } from "@/components/org-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type LeaveType = "vacation" | "sick" | "personal";

const LEAVE_TYPES: { value: LeaveType; labelKey: string }[] = [
  { value: "vacation", labelKey: "schedule.leaveTypes.vacation" },
  { value: "sick", labelKey: "schedule.leaveTypes.sick" },
  { value: "personal", labelKey: "schedule.leaveTypes.personal" },
];

export interface LeaveFormData {
  userId: Id<"users">;
  type: LeaveType;
  leaveTypeId?: Id<"gabinetLeaveTypes">;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

interface LeaveFormProps {
  onSubmit: (data: LeaveFormData) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function LeaveForm({
  onSubmit,
  onCancel,
  isSubmitting = false,
}: LeaveFormProps) {
  const { t } = useTranslation();
  const { organizationId } = useOrganization();

  const { data: employees } = useQuery(
    convexQuery(api.gabinet.employees.listAll, { organizationId, activeOnly: true })
  );

  const { data: leaveTypes } = useQuery(
    convexQuery(api.gabinet.leaveTypes.list, { organizationId })
  );

  const [userId, setUserId] = useState<string>("");
  const [type, setType] = useState<LeaveType>("vacation");
  const [leaveTypeId, setLeaveTypeId] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");
  const [isPartialDay, setIsPartialDay] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !startDate || !endDate) return;

    onSubmit({
      userId: userId as Id<"users">,
      type,
      leaveTypeId: leaveTypeId ? (leaveTypeId as Id<"gabinetLeaveTypes">) : undefined,
      startDate,
      endDate,
      startTime: isPartialDay ? startTime || undefined : undefined,
      endTime: isPartialDay ? endTime || undefined : undefined,
      reason: reason.trim() || undefined,
    });
  };

  // Auto-set end date to start date when start changes
  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (!endDate || endDate < value) {
      setEndDate(value);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label>
          {t("schedule.employee")} <span className="text-destructive">*</span>
        </Label>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger>
            <SelectValue placeholder={t("schedule.selectEmployee")} />
          </SelectTrigger>
          <SelectContent>
            {employees?.map((emp) => (
              <SelectItem key={emp.userId} value={emp.userId}>
                {emp.firstName || emp.lastName
                  ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim()
                  : emp.specialization ?? emp.role}
              </SelectItem>
            ))}
            {(!employees || employees.length === 0) && (
              <SelectItem value="_none" disabled>
                {t("schedule.noEmployees")}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            {t("schedule.type")} <span className="text-destructive">*</span>
          </Label>
          <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAVE_TYPES.map((lt) => (
                <SelectItem key={lt.value} value={lt.value}>
                  {t(lt.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {leaveTypes && leaveTypes.length > 0 && (
          <div className="space-y-1.5">
            <Label>{t("schedule.leaveCategory")}</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger>
                <SelectValue placeholder={t("schedule.selectLeaveType")} />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((lt) => (
                  <SelectItem key={lt._id} value={lt._id}>
                    {lt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            {t("schedule.startDate")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label>
            {t("schedule.endDate")} <span className="text-destructive">*</span>
          </Label>
          <Input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Partial day toggle */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="partialDay"
          checked={isPartialDay}
          onChange={(e) => setIsPartialDay(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <Label htmlFor="partialDay" className="cursor-pointer text-sm font-normal">
          {t("schedule.partialDay")}
        </Label>
      </div>

      {isPartialDay && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t("schedule.startTime")}</Label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("schedule.endTime")}</Label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>{t("schedule.reason")}</Label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={t("schedule.reasonPlaceholder")}
        />
      </div>

      <div className="rounded-lg border bg-muted/30 p-3">
        <p className="text-sm text-muted-foreground">
          {t("schedule.leaveApprovalInfo")}
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button
          type="submit"
          disabled={!userId || !startDate || !endDate || isSubmitting}
        >
          {isSubmitting ? t("common.saving") : t("schedule.createLeave")}
        </Button>
      </div>
    </form>
  );
}
