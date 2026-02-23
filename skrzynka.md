# Plan: Email Inbox + Full Admin Panel

## Context

CRM is missing two critical SaaS features: (1) an email inbox for sending/receiving emails linked to CRM entities, and (2) a full admin panel for multi-tenant organization management. The sidebar already has an "Inbox" link (placeholder), the header has a non-functional Bell icon, and the Team settings page only lists members without management capabilities. Backend has Resend integration, role-based auth (owner/admin/member/viewer), and invitation mutations that require existing userIds.

---

## Phase E: Email Inbox

### E.1 Schema (`convex/schema.ts`)

**New `emails` table:**
- `organizationId`, `threadId` (string, groups conversations), `messageId` (Resend/SMTP ID), `inReplyTo?`
- `direction`: "inbound" | "outbound"
- `from` (string), `to` (string[]), `cc?`, `bcc?`
- `subject`, `bodyHtml?`, `bodyText?`, `snippet?` (first ~200 chars for list preview)
- `isRead` (boolean), `isStarred?` (boolean)
- `contactId?`, `companyId?`, `leadId?` — auto-linked entities
- `sentBy?` (user ID, null for inbound), `sentAt`, `createdAt`, `updatedAt`
- Indexes: `by_org`, `by_thread`, `by_contact`, `by_company`, `by_lead`, `by_messageId`
- Search index on `subject` filtered by `organizationId`, `direction`

**New `emailAccounts` table:**
- `organizationId`, `fromName`, `fromEmail`, `isDefault`, `createdAt`, `updatedAt`
- Index: `by_org`

**Extend `activityActionValidator`:** add `"email_sent"`, `"email_received"`

### E.2 Backend (`convex/emails.ts`, `convex/emailAccounts.ts`)

Queries:
- `emails.listInbox` — paginated, ordered by sentAt desc, optional search/direction/isRead filters
- `emails.getThread` — all messages in a thread by threadId
- `emails.getById` — single email
- `emails.listByEntity` — emails linked to contact/company/lead (for entity detail tabs)
- `emails.getUnreadCount` — for bell badge

Mutations:
- `emails.send` — compose + send via Resend, store record, logActivity, auto-thread
- `emails.markRead` / `emails.markUnread` / `emails.toggleStar`
- `emails.linkToEntity` — attach email to contact/company/lead

Email accounts:
- `emailAccounts.list` / `emailAccounts.upsert` (admin only)

### E.3 Inbound Webhook (`convex/http.ts`)

New route: `POST /resend/inbound`
- Parse Resend inbound payload (from, to, subject, html, text, headers)
- Match `to` address → `emailAccounts` → organizationId
- Match `from` address → contacts by email → auto-link contactId
- Find existing thread via `In-Reply-To` header → `by_messageId` index
- Store email record with direction: "inbound"

### E.4 Frontend — Inbox Page

**New route:** `src/routes/_app/_auth/dashboard/_layout.inbox.index.tsx`

Two-pane layout (not standard DataTable — email-specific UI):
- Left pane: email list with search, filter tabs (All/Unread/Sent/Starred), thread preview cards
- Right pane: thread view when selected — messages chronologically, reply inline

**New components:**
- `src/components/email/inbox-list.tsx` — thread list with filters
- `src/components/email/thread-view.tsx` — conversation renderer
- `src/components/email/compose-dialog.tsx` — modal for composing (To autocomplete from contacts, CC, Subject, Body)
- `src/components/email/email-entity-tab.tsx` — reusable tab for entity detail pages

**Entity detail integration:**
- Replace `emailTab.comingSoon` placeholder in contacts/companies/leads detail pages with `email-entity-tab` component

**Header integration:**
- Bell icon → `emails.getUnreadCount` → badge number → click navigates to `/dashboard/inbox`

**QuickCreate:** add Email option → opens compose dialog

### E.5 Email Settings

**New route:** `src/routes/_app/_auth/dashboard/_layout.settings.email.tsx`
- Configure sender name + email (emailAccounts.upsert)
- Add to settings sidebar nav

---

## Phase F: Full Admin Panel

### F.1 Schema (`convex/schema.ts`)

**New `invitations` table:**
- `organizationId`, `email`, `role` (orgRoleValidator)
- `token` (unique string for accept link), `status`: "pending" | "accepted" | "declined" | "expired"
- `invitedBy` (user ID), `expiresAt` (7 days), `acceptedAt?`
- `createdAt`, `updatedAt`
- Indexes: `by_org`, `by_token`, `by_email` (email + orgId)

**Extend `orgSettings`:** add `timezone?: string`

### F.2 Backend — Invitations (`convex/invitations.ts`)

Mutations:
- `invitations.create` — requireOrgAdmin, check duplicates, generate token, send invitation email, store record
- `invitations.accept` — requireUser, verify token + email match + not expired, create teamMemberships entry, update status
- `invitations.decline` — set status to "declined"
- `invitations.cancel` — admin only, mark expired
- `invitations.resend` — admin only, resend email + reset expiresAt

Queries:
- `invitations.listPending` — all pending for org
- `invitations.getByToken` — public query for accept page (returns org name, role, inviter)

### F.3 Backend — Usage Stats (`convex/organizations.ts`)

New query: `organizations.getUsageStats`
- Args: `{ organizationId }`
- Returns: `{ memberCount, contactCount, companyCount, leadCount, documentCount, productCount, emailCount }`
- Admin only via `requireOrgAdmin`

### F.4 Frontend — Team Management

**Rewrite:** `src/routes/_app/_auth/dashboard/_layout.settings.team.tsx`

Section 1 — Members table:
- Columns: Avatar, Name, Email, Role, Joined date
- Row actions dropdown (hidden for owner): Change Role (select admin/member/viewer), Remove (confirmation dialog)
- Owner row distinguished, no actions

Section 2 — Pending Invitations:
- Table: Email, Role, Invited by, Sent date
- Row actions: Cancel, Resend
- "Invite Member" button → dialog with Email input + Role select + Send

### F.5 Frontend — Organization Settings

**New route:** `src/routes/_app/_auth/dashboard/_layout.settings.organization.tsx`
- Org name, website, logo upload (reuse avatar upload pattern)
- Default currency select, timezone select
- Usage stats card grid (member count, entity counts)

### F.6 Frontend — Invitation Accept Page

**New route:** `src/routes/_app/_auth/invite.$token.tsx`
- Calls `invitations.getByToken`
- Shows org name, inviter, role
- If logged in + email matches → Accept/Decline buttons
- If not logged in → "Sign in first" with redirect back
- Handle expired/used/mismatch states

### F.7 Invitation Email Template

**New file:** `convex/email/templates/invitationEmail.tsx`
- Uses `@react-email/components` pattern (like existing subscriptionEmail)
- Content: "You've been invited to join {orgName}", role, accept link

### F.8 Settings Nav Updates (`_layout.settings.tsx`)

Add entries: "Email" → `/dashboard/settings/email`, "Organization" → `/dashboard/settings/organization`

---

## i18n Keys (both en + pl)

- `inbox.*` — title, compose, reply, filters, thread, search, entity linking
- `team.*` — members, invitations, invite dialog, roles, actions
- `orgSettings.*` — title, org name/website/logo/timezone/currency, usage stats
- `invite.*` — accept page: title, description, accept/decline, expired/mismatch states
- `settings.email`, `settings.organization` — new nav labels

---

## Implementation Order

1. **Schema + extend validators** (emails, emailAccounts, invitations tables + activityAction extensions)
2. **Email backend** (convex/emails.ts, convex/emailAccounts.ts, inbound webhook in http.ts)
3. **Admin backend** (convex/invitations.ts, organizations.getUsageStats, orgSettings extend)
4. **Invitation email template** (convex/email/templates/invitationEmail.tsx)
5. **i18n keys** (all new keys in en + pl)
6. **Email frontend** (inbox page, compose dialog, thread view, entity tab, bell badge)
7. **Admin frontend** (team rewrite, org settings page, invite accept page, settings nav)
8. **Polish & test** (e2e flows, edge cases, i18n review)

---

## Verification

### Email
- Send email from contact detail → appears in inbox + contact's email tab
- Configure inbound webhook → receive email → auto-linked to contact
- Reply to inbound → same threadId maintained
- Bell badge shows unread count
- Search works on subjects

### Admin
- Invite by email → invitation email received with accept link
- Accept link → new member appears in team list
- Change role → persists, reflected in UI
- Remove member → no longer in list, loses org access
- Non-admin users cannot see invite/role/remove actions
- Org settings edits (name/currency/timezone) persist
- Usage stats match actual entity counts

---

## Critical Files

| File | Change |
|------|--------|
| `convex/schema.ts` | Add emails, emailAccounts, invitations tables; extend activityActionValidator |
| `convex/http.ts` | Add /resend/inbound webhook route |
| `convex/emails.ts` | NEW — all email queries/mutations |
| `convex/emailAccounts.ts` | NEW — sender account management |
| `convex/invitations.ts` | NEW — invitation CRUD + accept flow |
| `convex/organizations.ts` | Add getUsageStats query |
| `convex/orgSettings.ts` | Extend upsert with timezone |
| `convex/email/templates/invitationEmail.tsx` | NEW — invitation email template |
| `src/routes/.../\_layout.inbox.index.tsx` | NEW — inbox page |
| `src/routes/.../\_layout.settings.team.tsx` | REWRITE — full member management |
| `src/routes/.../\_layout.settings.organization.tsx` | NEW — org settings + usage |
| `src/routes/.../\_layout.settings.email.tsx` | NEW — email account config |
| `src/routes/\_app/\_auth/invite.$token.tsx` | NEW — invitation accept page |
| `src/components/email/*.tsx` | NEW — inbox-list, thread-view, compose-dialog, email-entity-tab |
| `src/routes/.../\_layout.settings.tsx` | Add Email + Organization nav entries |
| `src/routes/.../\_layout.tsx` | Wire bell icon to unread count |
| `public/locales/en/translation.json` | Add inbox, team, orgSettings, invite keys |
| `public/locales/pl/translation.json` | Add inbox, team, orgSettings, invite keys |
