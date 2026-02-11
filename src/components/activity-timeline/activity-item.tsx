import {
  Plus,
  Pencil,
  Trash2,
  StickyNote,
  ArrowRight,
  UserCheck,
  Link,
  Unlink,
  Upload,
  RefreshCw,
  Mail,
  MailOpen,
} from "lucide-react";
import type { ActivityAction } from "@cvx/schema";

const actionIcons: Record<ActivityAction, typeof Plus> = {
  created: Plus,
  updated: Pencil,
  deleted: Trash2,
  note_added: StickyNote,
  stage_changed: ArrowRight,
  assigned: UserCheck,
  relationship_added: Link,
  relationship_removed: Unlink,
  document_uploaded: Upload,
  status_changed: RefreshCw,
  email_sent: Mail,
  email_received: MailOpen,
};

const actionColors: Record<ActivityAction, string> = {
  created: "bg-green-100 text-green-700",
  updated: "bg-blue-100 text-blue-700",
  deleted: "bg-red-100 text-red-700",
  note_added: "bg-yellow-100 text-yellow-700",
  stage_changed: "bg-purple-100 text-purple-700",
  assigned: "bg-indigo-100 text-indigo-700",
  relationship_added: "bg-cyan-100 text-cyan-700",
  relationship_removed: "bg-orange-100 text-orange-700",
  document_uploaded: "bg-teal-100 text-teal-700",
  status_changed: "bg-pink-100 text-pink-700",
  email_sent: "bg-sky-100 text-sky-700",
  email_received: "bg-emerald-100 text-emerald-700",
};

export interface Activity {
  _id: string;
  action: ActivityAction;
  description: string;
  performedByName?: string;
  createdAt: number;
}

interface ActivityItemProps {
  activity: Activity;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function ActivityItem({ activity }: ActivityItemProps) {
  const Icon = actionIcons[activity.action] ?? Pencil;
  const colorClass = actionColors[activity.action] ?? "bg-muted text-muted-foreground";

  return (
    <div className="relative flex gap-3 pb-4">
      <div
        className={`absolute -left-6 flex h-6 w-6 items-center justify-center rounded-full ${colorClass}`}
      >
        <Icon className="h-3 w-3" />
      </div>
      <div className="min-w-0 flex-1 pl-2">
        <p className="text-sm">{activity.description}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {activity.performedByName && (
            <span>{activity.performedByName}</span>
          )}
          <span>{timeAgo(activity.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}
