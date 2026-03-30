/**
 * Notifications Mapper — Supabase ↔ Frontend
 */

import type { NotificationRow } from "../database.types";
import { createEntityMapper } from "./generic";

export interface MappedNotification {
  _id: string;
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  createdAt: number;
  _source: "supabase";
}

const notificationMapper = createEntityMapper<NotificationRow, MappedNotification>({});

export const mapNotificationFromSupabase = notificationMapper.mapFromSupabase;
export const mapNotificationToSupabase = notificationMapper.mapToSupabase;
