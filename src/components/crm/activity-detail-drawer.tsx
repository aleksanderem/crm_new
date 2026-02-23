import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CustomFieldFormSection } from "@/components/custom-fields/custom-field-form-section";
import {
  Pencil,
  Trash2,
  Calendar,
  Clock,
  User,
  CheckCircle2,
  Circle,
  FileText,
  type EzIconType as LucideIcon,
} from "@/lib/ez-icons";
import { cn } from "@/lib/utils";
import { getActivityIcon } from "@/lib/activity-icon-registry";

interface ActivityData {
  _id: string;
  title: string;
  activityType: string;
  dueDate: number;
  endDate?: number;
  isCompleted: boolean;
  completedAt?: number;
  description?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  createdAt: number;
  updatedAt: number;
}

interface ActivityTypeDef {
  key: string;
  name: string;
  icon: string;
  color?: string;
}

interface CustomFieldDef {
  _id: string;
  name: string;
  fieldKey: string;
  fieldType: string;
  activityTypeKey?: string;
  options?: string[];
  isRequired?: boolean;
  group?: string;
}

interface ActivityDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: ActivityData | null;
  activityTypeDefs?: ActivityTypeDef[];
  customFieldDefs?: CustomFieldDef[];
  customFieldValues?: Record<string, unknown>;
  onUpdate: (data: {
    activityId: string;
    title?: string;
    activityType?: string;
    dueDate?: number;
    endDate?: number;
    description?: string;
  }) => Promise<void>;
  onDelete: (activityId: string) => Promise<void>;
  onToggleComplete: (activityId: string, isCompleted: boolean) => Promise<void>;
  onSaveCustomFields?: (activityId: string, values: Record<string, unknown>) => Promise<void>;
  isSubmitting?: boolean;
}

export function ActivityDetailDrawer({
  open,
  onOpenChange,
  activity,
  activityTypeDefs = [],
  customFieldDefs = [],
  customFieldValues = {},
  onUpdate,
  onDelete,
  onToggleComplete,
  onSaveCustomFields,
  isSubmitting = false,
}: ActivityDetailDrawerProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit state
  const [editTitle, setEditTitle] = useState("");
  const [editType, setEditType] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editDueTime, setEditDueTime] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCfValues, setEditCfValues] = useState<Record<string, unknown>>({});

  if (!activity) return null;

  const typeDef = activityTypeDefs.find((td) => td.key === activity.activityType);
  const typeLabel = typeDef?.name ?? activity.activityType;
  const TypeIcon: LucideIcon | undefined = typeDef
    ? getActivityIcon(typeDef.icon)
    : undefined;

  // Filter custom field defs relevant to this activity's type
  const relevantDefs = customFieldDefs.filter(
    (d) => !d.activityTypeKey || d.activityTypeKey === activity.activityType
  );

  // For edit mode: filter by the type being edited
  const editRelevantDefs = customFieldDefs.filter(
    (d) => !d.activityTypeKey || d.activityTypeKey === editType
  );

  function startEditing() {
    const due = new Date(activity!.dueDate);
    setEditTitle(activity!.title);
    setEditType(activity!.activityType);
    setEditDueDate(due.toISOString().slice(0, 10));
    setEditDueTime(due.toTimeString().slice(0, 5));
    if (activity!.endDate) {
      const end = new Date(activity!.endDate);
      setEditEndDate(end.toISOString().slice(0, 10));
      setEditEndTime(end.toTimeString().slice(0, 5));
    } else {
      setEditEndDate("");
      setEditEndTime("");
    }
    setEditDescription(activity!.description ?? "");
    setEditCfValues({ ...customFieldValues });
    setIsEditing(true);
    setConfirmDelete(false);
  }

  async function handleSave() {
    const dueDateMs = new Date(
      `${editDueDate}T${editDueTime || "00:00"}`
    ).getTime();
    let endDateMs: number | undefined;
    if (editEndDate && editEndTime) {
      endDateMs = new Date(`${editEndDate}T${editEndTime}`).getTime();
    }

    await onUpdate({
      activityId: activity!._id,
      title: editTitle.trim(),
      activityType: editType,
      dueDate: dueDateMs,
      endDate: endDateMs,
      description: editDescription.trim() || undefined,
    });

    if (onSaveCustomFields) {
      await onSaveCustomFields(activity!._id, editCfValues);
    }

    setIsEditing(false);
  }

  async function handleDelete() {
    await onDelete(activity!._id);
    onOpenChange(false);
    setConfirmDelete(false);
    setIsEditing(false);
  }

  function handleClose(open: boolean) {
    if (!open) {
      setIsEditing(false);
      setConfirmDelete(false);
    }
    onOpenChange(open);
  }

  const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString("pl-PL", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  const formatTime = (ms: number) =>
    new Date(ms).toLocaleTimeString("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
    });

  function renderCustomFieldValue(def: CustomFieldDef, val: unknown): React.ReactNode {
    if (val === undefined || val === null || val === "") return null;
    if (typeof val === "boolean") return val ? t('activityDetail.booleanYes') : t('activityDetail.booleanNo');
    if (Array.isArray(val)) return val.join(", ");
    if (def.fieldType === "date" && typeof val === "number") {
      return new Date(val).toLocaleDateString("pl-PL");
    }
    return String(val);
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="flex flex-col sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {TypeIcon && <TypeIcon className="h-5 w-5 text-primary" />}
            <span className="truncate">
              {isEditing ? t('activityDetail.editTitle') : activity.title}
            </span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6">
          {isEditing ? (
            /* ── Edit Mode ── */
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>
                  <span className="text-destructive">*</span> {t('activityDetail.title')}
                </Label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              {/* Activity type selector */}
              {activityTypeDefs.length > 0 && (
                <div className="space-y-1.5">
                  <Label>{t('activityDetail.activityType')}</Label>
                  <div className="flex gap-1 flex-wrap">
                    {activityTypeDefs.map((td) => {
                      const Icon = getActivityIcon(td.icon);
                      return (
                        <button
                          key={td.key}
                          type="button"
                          className={cn(
                            "flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors",
                            editType === td.key
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-muted bg-muted/50 text-muted-foreground hover:border-primary/40"
                          )}
                          onClick={() => setEditType(td.key)}
                        >
                          {Icon && <Icon className="h-3.5 w-3.5" />}
                          {td.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>{t('activityDetail.startDate')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    className="w-auto flex-1"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                  <Input
                    type="time"
                    className="w-auto"
                    value={editDueTime}
                    onChange={(e) => setEditDueTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t('activityDetail.endDate')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    className="w-auto flex-1"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                  />
                  <Input
                    type="time"
                    className="w-auto"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>{t('activityDetail.description')}</Label>
                <Textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder={t('activityDetail.descriptionPlaceholder')}
                  rows={4}
                />
              </div>

              {/* Custom fields in edit mode */}
              {editRelevantDefs.length > 0 && (
                <CustomFieldFormSection
                  definitions={editRelevantDefs as any}
                  values={editCfValues}
                  onChange={(fieldKey, value) =>
                    setEditCfValues((prev) => ({ ...prev, [fieldKey]: value }))
                  }
                />
              )}
            </div>
          ) : (
            /* ── View Mode ── */
            <div className="space-y-5">
              {/* Status */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  {activity.isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-orange-400" />
                  )}
                  <span className="text-sm font-medium">
                    {activity.isCompleted ? t('activityDetail.completed') : t('activityDetail.inProgress')}
                  </span>
                </div>
                <Switch
                  checked={activity.isCompleted}
                  onCheckedChange={() =>
                    onToggleComplete(activity._id, !activity.isCompleted)
                  }
                  disabled={isSubmitting}
                />
              </div>

              {/* Type */}
              <DetailRow
                icon={TypeIcon ?? Calendar}
                label={t('activityDetail.type')}
                value={
                  <Badge variant="secondary" className="font-normal">
                    {typeLabel}
                  </Badge>
                }
              />

              {/* Due date */}
              <DetailRow
                icon={Calendar}
                label={t('activityDetail.date')}
                value={
                  <span>
                    {formatDate(activity.dueDate)},{" "}
                    {formatTime(activity.dueDate)}
                    {activity.endDate && (
                      <>
                        {" "}
                        &ndash; {formatDate(activity.endDate)},{" "}
                        {formatTime(activity.endDate)}
                      </>
                    )}
                  </span>
                }
              />

              {/* Created at */}
              <DetailRow
                icon={Clock}
                label={t('activityDetail.created')}
                value={formatDate(activity.createdAt)}
              />

              {/* Description */}
              {activity.description && (
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs">{t('activityDetail.description')}</Label>
                  <p className="text-sm whitespace-pre-wrap rounded-lg border p-3">
                    {activity.description}
                  </p>
                </div>
              )}

              {activity.completedAt && (
                <DetailRow
                  icon={CheckCircle2}
                  label={t('activityDetail.completedAt')}
                  value={formatDate(activity.completedAt)}
                />
              )}

              {/* Custom fields in view mode */}
              {relevantDefs.map((def) => {
                const val = customFieldValues[def.fieldKey];
                const rendered = renderCustomFieldValue(def, val);
                if (!rendered) return null;
                return (
                  <DetailRow
                    key={def._id}
                    icon={FileText}
                    label={def.name}
                    value={rendered}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t pt-4 space-y-3">
          {confirmDelete && (
            <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <span className="text-sm">{t('activityDetail.confirmDelete')}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('activityDetail.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                >
                  {t('activityDetail.delete')}
                </Button>
              </div>
            </div>
          )}

          {isEditing ? (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                disabled={isSubmitting}
              >
                {t('activityDetail.cancel')}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!editTitle.trim() || !editDueDate || isSubmitting}
              >
                {isSubmitting ? t('activityDetail.saving') : t('activityDetail.save')}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
                disabled={isSubmitting}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t('activityDetail.delete')}
              </Button>
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Pencil className="h-4 w-4 mr-1" />
                {t('activityDetail.edit')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm">{value}</div>
      </div>
    </div>
  );
}
