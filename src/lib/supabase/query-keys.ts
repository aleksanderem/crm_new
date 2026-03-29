/**
 * React Query Key Factory for Supabase Queries
 *
 * Hierarchical key structure so invalidation can target broad or narrow scopes:
 *   supabaseKeys.all                        → ["supabase"]
 *   supabaseKeys.contacts.all               → ["supabase", "contacts"]
 *   supabaseKeys.contacts.list(orgId)        → ["supabase", "contacts", "list", orgId]
 *   supabaseKeys.contacts.detail(orgId, id)  → ["supabase", "contacts", "detail", orgId, id]
 */

export const supabaseKeys = {
  /** Root key — invalidate everything from Supabase. */
  all: ["supabase"] as const,

  contacts: {
    /** All contact queries. */
    all: ["supabase", "contacts"] as const,

    /** Contacts list for a specific organization. */
    list: (orgId: string) =>
      ["supabase", "contacts", "list", orgId] as const,

    /** Single contact detail. */
    detail: (orgId: string, contactId: string) =>
      ["supabase", "contacts", "detail", orgId, contactId] as const,
  },
} as const;
