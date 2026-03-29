# Email System Overhaul & Account Settings Cleanup

Date: 2026-03-26
Status: Reviewed
Scope: F1 (Email Template System), F2 (Mail Accounts & Inboxes), F3 (Account Settings Cleanup)

---

## Context

The platform currently has fragmented email infrastructure: two separate editors (TipTap for documents, GrapesJS for emails), two settings pages for email config (settings/email for "From" addresses, settings/integrations for Google OAuth), and account settings with known avatar inconsistencies. This design unifies the email system around a single editor, a single mail configuration page, and cleaned-up account settings.

## F1: Email Template System

### Problem

Email templates use GrapesJS Studio SDK with MJML, a completely different editing experience from the document template system that uses TipTap with variable mentions. This creates two codebases to maintain, two variable systems, and inconsistent UX. The user wants the document editing experience applied to emails.

### Design

#### Architecture: TipTap + Programmatic Shell

The email template system has three layers:

1. Email Brand Config (per org) controls the visual shell: logo, colors, footer text, social links. This is NOT editable in the template editor, only in a dedicated brand settings section. The shell is a single table-based HTML template (600px, battle-tested across email clients) generated programmatically from the brand config.

2. Template Content (per template) is the editable body inside the shell. Edited with the same TipTap editor and variable mention system used for document templates. Stored as TipTap JSON in `contentJson` AND pre-rendered HTML in `renderedHtml`. The subject line also supports `{{variable}}` syntax.

3. Template Registry defines all ~60 system templates with categories, modules, event types, and default content in PL/EN. Created automatically during org onboarding via batched internal mutations. System templates cannot be deleted (only content edited). Tenants can create custom templates on top.

#### Schema Changes

Replace `emailLayouts` with `emailBrandConfig`:

```
emailBrandConfig {
  organizationId: Id<"organizations">
  logoStorageId: optional Id<"_storage">
  logoUrl: optional string              // cached URL
  companyName: optional string
  primaryColor: string                  // buttons, links (default: #2563eb)
  backgroundColor: string              // outer bg (default: #f3f4f6)
  contentBackgroundColor: string        // inner bg (default: #ffffff)
  textColor: string                     // body text (default: #1f2937)
  secondaryTextColor: string            // footer, muted (default: #6b7280)
  accentColor: string                   // highlights, accents (default: #7c3aed)
  footerText: optional string           // e.g. "ul. Przykładowa 1, 00-001 Warszawa"
  socialLinks: optional {               // v.optional(v.object({ website: v.optional(v.string()), ... }))
    website?: string
    facebook?: string
    instagram?: string
    linkedin?: string
  }
  createdBy: Id<"users">
  createdAt: number
  updatedBy: Id<"users">
  updatedAt: number
}
```

Index: `by_org: ["organizationId"]` (one record per org)

Extend `emailTemplates`:

```
emailTemplates {
  // existing fields kept:
  organizationId, name, subject, isActive, createdBy, createdAt, updatedAt

  // CHANGED:
  body: string                          // kept for backward compat during migration, then deprecated
  contentJson: optional string          // TipTap JSON (new primary storage)
  renderedHtml: optional string         // pre-rendered HTML from TipTap JSON (updated on every editor save)

  // NEW:
  slug: string                          // machine identifier e.g. "gabinet.appointment.confirmation"
  category: string                      // enum: "auth", "crm_contacts", "crm_leads", "crm_activities",
                                        //   "crm_documents", "crm_marketing", "gabinet_patients",
                                        //   "gabinet_appointments", "gabinet_treatments", "gabinet_packages",
                                        //   "gabinet_loyalty", "gabinet_payments", "gabinet_operational"
  module: string                        // "platform" | "crm" | "gabinet"
  eventType: optional string            // for event-driven sending
  isSystem: boolean                     // true = pre-defined, cannot delete
  locale: string                        // "pl" | "en" — one template per locale
  requiredSources: string[]             // data source keys needed (e.g. ["patient", "appointment", "org"])

  // DEPRECATED (migrated to requiredSources):
  variables: array                      // kept during transition, extract unique source values to requiredSources
}
```

Indexes:
- `by_org_slug_locale: ["organizationId", "slug", "locale"]` — for template lookup by machine ID
- Existing indexes retained: `by_org`, `by_org_active`, `by_org_module`

Slug uniqueness: enforced at mutation level with read-then-insert pattern using the `by_org_slug_locale` index. Use `.unique()` when querying by slug+locale to surface duplicates as errors.

#### Email Shell HTML

One function `buildEmailHtml(bodyHtml: string, brandConfig: EmailBrandConfig): string` generates the full email. The function:

1. Builds the table-based 600px shell from brand config colors
2. Applies `primaryColor` to all `<a>` elements that look like buttons (have `background-color` or `class` containing "button") via regex/DOM manipulation
3. Applies `accentColor` to all other `<a>` elements (text links)
4. Wraps in the shell structure:

```
<!DOCTYPE html>
<html>
<body style="background: {backgroundColor}">
  <table width="100%" cellpadding="0">
    <tr><td align="center" style="padding: 32px 16px">
      <table width="600" style="max-width:600px; background: {contentBgColor}; border-radius: 8px">
        <!-- Header: logo or company name -->
        <tr><td style="padding: 24px; text-align: center; border-bottom: 1px solid #e5e7eb">
          {logo || companyName}
        </td></tr>
        <!-- Content: rendered body with color-applied links/buttons -->
        <tr><td style="padding: 32px 24px; color: {textColor}; font-size: 15px; line-height: 1.6">
          {bodyHtml}
        </td></tr>
        <!-- Footer: address, social links, unsubscribe -->
        <tr><td style="background: #f9fafb; padding: 24px; text-align: center; color: {secondaryTextColor}; font-size: 12px">
          {footerText}
          {socialLinks}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

#### Rendering Pipeline

Key constraint: TipTap `generateHTML()` requires browser-side TipTap extensions with DOM APIs. It cannot run in Convex serverless functions. The solution: pre-render HTML on the frontend when saving, store it alongside the JSON.

1. Editor save flow (frontend): TipTap JSON → `generateHTML()` with all extensions → save both `contentJson` and `renderedHtml` to the template via mutation
2. Send flow (backend, Convex action):
   a. Load template (`renderedHtml`, `subject`) + brand config in one query
   b. Resolve all `requiredSources` via `documentDataSources.ts` registry with entity context
   c. Replace `{{source.field}}` placeholders in `renderedHtml` and `subject` — support BOTH `{{key}}` flat syntax (backward compat) and `{{source.field}}` dot syntax via the existing `substituteVariables` helper (already handles `event.` prefix stripping)
   d. Apply brand colors to links/buttons in the substituted HTML
   e. Wrap in shell via `buildEmailHtml()`
   f. Send via mail provider (see F2)
3. Fallback: if `renderedHtml` is empty (legacy template), fall back to `body` field with existing GrapesJS HTML extraction logic

#### Template Editor UI

The email template editor page (`settings/email-templates/$id`) shows:

- Top bar: template name (editable for custom, read-only for system), category badge, module badge
- Subject line input with variable insertion button (same mention popup)
- Editor area: a visual container mimicking the email shell at 600px width with the org's brand colors, logo header and footer visible but grayed out / non-editable. Inside the container: TipTap editor instance with the same extensions as document templates (text formatting, tables, images, horizontal rules, variable mentions)
- Right sidebar: "Available Variables" panel showing data sources relevant to the template's `requiredSources`, clickable to insert
- Preview button: renders the full email with sample data in a modal

The 600px visual constraint is achieved with a wrapper `div` with `max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px` containing the brand header, editor area, and brand footer. The header/footer render from the org's `emailBrandConfig` but are visually distinct (slightly faded, non-interactive) so the user understands they edit content only.

On every save, the editor calls `generateHTML()` with its loaded extensions and sends both `contentJson` and `renderedHtml` to the backend mutation.

#### Brand Config Editor

Accessible from "Email Brand" section in mail settings (see F2). Simple form with:
- Logo upload (Convex file storage)
- Company name
- 6 color pickers (primary, background, content background, text, secondary text, accent)
- Footer text textarea
- Social links inputs (website, facebook, instagram, linkedin)
- Live preview panel showing a sample email with current settings

#### System Templates - Full Catalog (60 templates)

Templates are seeded via batched internal mutations during org onboarding to avoid Convex execution time limits. The seeding is split into batches of 15 templates each, scheduled sequentially via `ctx.scheduler.runAfter()`. Each batch creates templates for both PL and EN locales (so ~30 inserts per batch, 4 batches total). If a template with the same slug+locale already exists for the org (checked via `by_org_slug_locale` index), the insert is skipped (idempotent re-run safe).

Platform / Auth (5):
- `platform.email_verification` — Weryfikacja adresu email
- `platform.password_reset` — Reset hasła
- `platform.team_invitation` — Zaproszenie do zespołu
- `platform.welcome` — Powitanie nowego użytkownika
- `platform.account_deactivation` — Dezaktywacja konta

CRM / Contacts (6):
- `crm.contact.welcome` — Powitanie nowego kontaktu
- `crm.contact.thank_you` — Podziękowanie za współpracę
- `crm.contact.birthday` — Życzenia urodzinowe
- `crm.contact.feedback_request` — Prośba o opinię
- `crm.contact.data_update` — Aktualizacja danych
- `crm.contact.reactivation` — Reaktywacja kontaktu

CRM / Leads & Deals (6):
- `crm.lead.new_notification` — Nowy lead (wewnętrzne)
- `crm.lead.assignment` — Przypisanie leada (wewnętrzne)
- `crm.deal.proposal_sent` — Wysłanie oferty
- `crm.deal.proposal_followup` — Follow-up po ofercie
- `crm.deal.won_internal` — Deal zamknięty (wewnętrzne)
- `crm.deal.thank_you` — Podziękowanie za zakup

CRM / Activities (3):
- `crm.activity.reminder` — Przypomnienie o aktywności
- `crm.activity.assignment` — Przypisanie aktywności
- `crm.activity.overdue` — Przeterminowana aktywność

CRM / Documents (3):
- `crm.document.shared` — Udostępnienie dokumentu
- `crm.document.signature_request` — Prośba o podpis
- `crm.document.signed` — Potwierdzenie podpisu

CRM / Marketing (4):
- `crm.marketing.newsletter` — Newsletter
- `crm.marketing.promotion` — Oferta promocyjna
- `crm.marketing.seasonal` — Kampania sezonowa
- `crm.marketing.referral` — Program poleceń

Gabinet / Patients (4):
- `gabinet.patient.welcome` — Powitanie pacjenta
- `gabinet.patient.portal_access` — Dostęp do portalu
- `gabinet.patient.health_survey` — Prośba o ankietę zdrowotną
- `gabinet.patient.visit_summary` — Podsumowanie wizyt

Gabinet / Appointments (11):
- `gabinet.appointment.confirmation` — Potwierdzenie wizyty
- `gabinet.appointment.reminder_24h` — Przypomnienie 24h
- `gabinet.appointment.reminder_1h` — Przypomnienie 1h
- `gabinet.appointment.reminder_custom` — Przypomnienie custom
- `gabinet.appointment.rescheduled` — Wizyta przełożona
- `gabinet.appointment.cancelled_by_clinic` — Odwołana przez gabinet
- `gabinet.appointment.cancelled_by_patient` — Odwołana przez pacjenta
- `gabinet.appointment.followup` — Follow-up / aftercare
- `gabinet.appointment.no_show` — Nieobecność
- `gabinet.appointment.slot_available` — Termin dostępny
- `gabinet.appointment.slot_unavailable` — Brak terminu

Gabinet / Treatments (4):
- `gabinet.treatment.recommendation` — Rekomendacja zabiegu
- `gabinet.treatment.pre_instructions` — Instrukcje przed zabiegiem
- `gabinet.treatment.aftercare` — Instrukcje pozabiegowe
- `gabinet.treatment.series_progress` — Postęp serii

Gabinet / Packages (4):
- `gabinet.package.purchase_confirmation` — Potwierdzenie zakupu
- `gabinet.package.usage_update` — Aktualizacja wykorzystania
- `gabinet.package.expiring_soon` — Pakiet wygasa
- `gabinet.package.expired` — Pakiet wygasł

Gabinet / Loyalty (3):
- `gabinet.loyalty.points_earned` — Punkty naliczone
- `gabinet.loyalty.tier_upgrade` — Awans na tier
- `gabinet.loyalty.reward_available` — Nagroda do odebrania

Gabinet / Payments (3):
- `gabinet.payment.confirmation` — Potwierdzenie płatności
- `gabinet.payment.reminder` — Przypomnienie o płatności
- `gabinet.payment.invoice` — Wysłanie faktury

Gabinet / Operational (4):
- `gabinet.operational.hours_change` — Zmiana godzin pracy
- `gabinet.operational.holiday_closure` — Zamknięcie świąteczne
- `gabinet.operational.new_service` — Nowy zabieg w ofercie
- `gabinet.operational.new_specialist` — Nowy specjalista

#### Migration & Cleanup

1. Add `contentJson`, `renderedHtml`, `slug`, `isSystem`, `locale`, `requiredSources` to `emailTemplates` schema
2. Create `emailBrandConfig` table with `by_org` index, migrate data from `emailLayouts` (map colors, logo, footer)
3. Migrate existing template `variables` arrays to `requiredSources` by extracting unique `source` values from each variable entry
4. Migrate existing template `body` (GrapesJS JSON with `{projectData, html}` shape) → extract `.html` field → store in `renderedHtml`. The `contentJson` field stays empty for legacy templates (they render from `renderedHtml` directly)
5. Update `emailSending.ts` to use new rendering pipeline with fallback: if `renderedHtml` exists use it, else fall back to old `body` HTML extraction
6. Update `substituteVariables` helper to support both `{{key}}` and `{{source.field}}` syntax (it already handles `event.` prefix — extend to handle all source prefixes)
7. Migrate `emailEventBindings` to reference templates by slug (new field `templateSlug`) instead of ID, resolving locale at send time based on recipient's preferred locale or org default locale. Keep `templateId` during transition.
8. Remove GrapesJS dependencies: `@grapesjs/studio-sdk`, `grapesjs`, related components (`src/components/email-builder/`)
9. Remove `emailLayouts` table after data migrated
10. Deprecate `body` and `variables` fields (keep for rollback window, remove in next release)

---

## F2: Connected Mail Accounts & Inboxes

### Problem

Email sending configuration is split across two settings pages. Only Resend (system-level) and Google OAuth (per org) are supported. No SMTP, Microsoft Outlook, or Mailgun. Inbox only works with Gmail. Mailboxes cannot be shared between users.

### Design

#### Provider Abstraction

New `mailProviders` table replacing `emailAccounts`:

```
mailProviders {
  organizationId: Id<"organizations">
  name: string                          // display name, e.g. "Main Office Gmail"
  providerType: "google" | "microsoft" | "mailgun" | "resend"

  // Provider-specific config
  oauthTokens: optional {
    accessToken: string
    refreshToken: string
    expiresAt: number
    scope: string
    providerAccountId: string
  }
  apiConfig: optional {
    apiKey: string                      // Mailgun, Resend
    domain: string                      // Mailgun domain
    region: optional string             // EU / US for Mailgun
  }

  fromName: string
  fromEmail: string
  replyToEmail: optional string

  capabilities: {
    canSend: boolean
    canReceive: boolean
  }

  isDefault: boolean                    // default sending provider for org
  isShared: boolean                     // visible to all org members
  assignedUserIds: optional Id<"users">[]  // if not shared, which users see this

  status: "active" | "error" | "disconnected" | "pending_auth"
  statusMessage: optional string        // error details
  lastSyncedAt: optional number

  connectedBy: Id<"users">
  createdAt: number
  updatedAt: number
}
```

Indexes: `by_org: ["organizationId"]`, `by_org_default: ["organizationId", "isDefault"]`, `by_org_type: ["organizationId", "providerType"]`, `by_org_status: ["organizationId", "status"]`, `by_org_email: ["organizationId", "fromEmail"]`

SMTP note: Direct SMTP via nodemailer is not feasible in Convex's sandboxed runtime (HTTP/HTTPS only, no raw TCP sockets). SMTP support is deferred to a future phase. If needed, it would require an external HTTP-to-SMTP relay service that the Convex action calls via HTTP. The `providerType` union intentionally omits "smtp" for now.

#### Mail Adapter Interface

Backend abstraction in `convex/mail/adapter.ts`:

```typescript
interface MailAdapter {
  send(options: SendOptions): Promise<SendResult>
  fetchInbox?(options: FetchOptions): Promise<InboxResult>
  fetchThread?(threadId: string): Promise<ThreadResult>
  markRead?(messageId: string): Promise<void>
  testConnection?(): Promise<ConnectionTestResult>
}
```

Implementations:
- `convex/mail/adapters/google.ts` — Gmail API send + receive (existing code refactored from `convex/google/`)
- `convex/mail/adapters/microsoft.ts` — Microsoft Graph API send + receive (new)
- `convex/mail/adapters/mailgun.ts` — Mailgun API send (receive via webhooks, future)
- `convex/mail/adapters/resend.ts` — Resend API send (existing code refactored from `convex/emailSending.ts`)

Factory function `getAdapter(provider: Doc<"mailProviders">): MailAdapter` returns the right implementation.

#### OAuth Flows & oauthConnections Coexistence

Google and Microsoft OAuth connections use the same pattern:
1. Frontend initiates OAuth redirect via `{convexSiteUrl}/{provider}/oauth/initiate?organizationId=...&userId=...`
2. Provider redirects back with code
3. Backend exchanges code for tokens, creates/updates `mailProviders` record with `oauthTokens`
4. Token refresh handled by adapter before each API call

The `oauthConnections` table is NOT deprecated. It continues to serve non-mail OAuth scopes (Google Calendar `calendar.events` scope is used by the scheduling system). During migration, the mail-specific token data (Gmail scopes) is copied to the new `mailProviders` record. The Google OAuth flow is updated to write tokens to BOTH tables: `oauthConnections` (for calendar) and `mailProviders` (for mail). In a future iteration, the OAuth architecture may be refactored to a unified token store, but that is out of scope here.

#### Unified Mail Settings Page

Route: `_layout.settings.mail.tsx` (new file). Sidebar nav label: "Poczta" / "Mail" with Mail icon from lucide-react. Replaces `settings/email` and absorbs mail parts of `settings/integrations`.

Layout:
- Tab 1: "Dostawcy" / "Providers" — list of connected mail providers with status badges. Add provider button opens a dialog with provider type selection, then provider-specific config form. Each card shows: name, email, provider icon, status, capabilities (send/receive icons), default badge, shared badge.
- Tab 2: "Marka email" / "Email Brand" — brand config editor (from F1)
- Tab 3: "Zdarzenia i automatyzacja" / "Events & Automation" — links to event bindings and sequences (existing pages)

Provider config forms:
- Google: "Połącz z Google" OAuth button. Shows connected account after auth. Disconnect button.
- Microsoft: "Połącz z Microsoft" OAuth button. Shows connected account after auth. Disconnect button.
- Mailgun: API key, domain, region select, from name/email. "Test Connection" button.
- Resend: API key (or use system default), from name/email. "Test Connection" button.

#### Inbox Enhancements

The inbox page (`_layout.inbox.index.tsx`) gets:

1. Mailbox switcher (dropdown in top bar): lists all `mailProviders` with `canReceive: true` that the user has access to (shared or assigned). Shows unread count per mailbox. "Wszystkie skrzynki" / "All Mailboxes" option to see unified view.

2. Extended entity linking: currently links to contact/company/lead. Add linking to gabinet entities:
   - `patientId: optional Id<"gabinetPatients">`
   - `appointmentId: optional Id<"gabinetAppointments">`
   - `employeeId: optional Id<"gabinetEmployees">`

   Auto-linking logic: when email arrives, match `from` address against contacts (existing), patients (by email field), and employees (by user email). Create activity record on matched entities.

3. Compose enhancements: provider selector (which mailbox to send from), template insertion with variable resolution.

4. `emails` table schema extended:
   ```
   // ADD fields:
   mailProviderId: optional Id<"mailProviders">   // which provider sent/received this
   patientId: optional Id<"gabinetPatients">
   appointmentId: optional Id<"gabinetAppointments">
   employeeId: optional Id<"gabinetEmployees">

   // ADD indexes:
   by_patient: ["patientId", "sentAt"]
   by_appointment: ["appointmentId", "sentAt"]
   by_employee: ["employeeId", "sentAt"]
   by_org_provider: ["organizationId", "mailProviderId"]

   // provider field updated (use "google" not "gmail" for consistency with mailProviders.providerType):
   provider: "resend" | "google" | "microsoft" | "mailgun"
   ```

#### Settings Page Consolidation

Remove:
- `settings/email` page (replaced by `settings/mail` Providers tab)
- Google OAuth card from `settings/integrations` (moved to mail provider config)

Keep in `settings/integrations`:
- SMS config
- Any non-email integrations (future)
- Google Calendar connection status (reads from `oauthConnections`, not `mailProviders`)

#### Migration

1. Create `mailProviders` table with all indexes
2. Migrate `emailAccounts` records → `mailProviders` with type "resend", canSend: true, canReceive: false
3. Copy active Google `oauthConnections` mail tokens → `mailProviders` with type "google", tokens in `oauthTokens`, canSend: true, canReceive: true. Keep `oauthConnections` records intact for calendar.
4. Backfill `mailProviderId` on existing `emails` records: match by `provider` + `from` address against `mailProviders` records using `by_org_email` index. Historical emails where no match is found get `mailProviderId: undefined` (shown in "All Mailboxes" view, not in any specific mailbox filter).
5. Migrate `emails.provider` values: rename "gmail" → "google" on existing records
6. Update `emailSending.ts` to use adapter pattern via `mailProviders`
7. Update inbox sync to use adapter pattern
8. Update compose dialog to use provider selector
9. Remove old `emailAccounts` table
10. Update sidebar nav in module manifest: remove "Email" settings link, add "Poczta" / "Mail" link. Keep "Integrations" for non-mail integrations.

---

## F3: Account Settings Cleanup

### Problem

Avatar displayed inconsistently across the app. `updateUserImage()` mutation does not cache the URL while `updateProfile()` does. Gradient fallback hardcoded in 3+ places. NavAccountCard has hardcoded placeholder data. Need systematic audit of all 27 settings pages.

### Design

#### Avatar Fixes

1. Fix `updateUserImage()` in `convex/app.ts` to cache URL:
   ```typescript
   export const updateUserImage = mutation({
     args: { imageId: v.id("_storage") },
     handler: async (ctx, args) => {
       const userId = await auth.getUserId(ctx);
       if (!userId) return;
       const url = await ctx.storage.getUrl(args.imageId);
       await ctx.db.patch(userId, { imageId: args.imageId, image: url ?? undefined });
     },
   });
   ```

2. Extract avatar fallback to a shared constant/utility:
   ```typescript
   // src/lib/avatar.ts
   export const AVATAR_FALLBACK_GRADIENT = "from-lime-400 via-cyan-300 to-blue-500";
   export function getAvatarInitials(name?: string): string { ... }
   export function getAvatarColorFromName(name?: string): string { ... }  // hash-based color
   ```

3. Update all avatar rendering locations to use the shared utility:
   - `src/routes/_app/_auth/dashboard/-ui.navigation.tsx` (lines 67, 102)
   - `src/routes/_app/_auth/dashboard/_layout.settings.profile.tsx` (line 161)
   - Any other places found during implementation

4. NavAccountCard (`src/components/application/app-navigation/base-components/nav-account-card.tsx`): currently imported by `sidebar-sections-subheadings.tsx` with hardcoded placeholder data. Wire it to real user data from `useCurrentUser()` hook — display actual name, email, and avatar.

#### Settings Audit Scope

Systematically verify each settings page loads, forms submit, data persists, and UI is consistent:

User settings:
- `settings/index` — username update, account deletion
- `settings/profile` — avatar, name, language, theme, timezone

Organization settings:
- `settings/organization` — org name, logo, website
- `settings/team` — member list, roles, invitations, seat limits
- `settings/permissions` — RBAC matrix
- `settings/billing` — subscription, payment method
- `settings/audit-log` — log viewer with filters

CRM settings:
- `settings/pipelines` — pipeline CRUD, stage ordering
- `settings/sources` — lead source management
- `settings/lost-reasons` — deal lost reason management
- `settings/activity-types` — custom activity type CRUD
- `settings/custom-fields` — field definitions per entity

Communication settings (will change per F1/F2, audit current state):
- `settings/email` — from addresses
- `settings/email-templates` — template CRUD
- `settings/email-events` — event bindings
- `settings/email-sequences` — sequence management
- `settings/sms` — SMS provider config
- `settings/integrations` — Google OAuth, SMS

Automation settings:
- `settings/automations` (index, new, $ruleId) — rule CRUD

Document settings:
- `settings/form-templates` (index, new, $id) — template CRUD

For each page: verify route loads, check for console errors, test form submission, verify data round-trips to Convex. Log issues found, fix them.

---

## Implementation Order

These three features have dependencies:

1. F3 (Account Settings Cleanup) first — smallest scope, unblocks nothing but reduces tech debt before larger changes. Can be done in parallel with early F1 work.

2. F1 (Email Template System) second — creates the template infrastructure that F2's sending pipeline uses. Specifically:
   - Phase 1: Schema changes (emailBrandConfig, emailTemplates extensions)
   - Phase 2: Rendering pipeline (frontend pre-render + backend variable substitution + shell wrapping)
   - Phase 3: Template editor UI with 600px preview
   - Phase 4: System template catalog (all 60 templates with default content, batched seeding)
   - Phase 5: Brand config editor UI
   - Phase 6: GrapesJS removal and migration

3. F2 (Mail Accounts & Inboxes) third — depends on F1's rendering pipeline for sending templates. Specifically:
   - Phase 1: mailProviders schema + adapter interface
   - Phase 2: Resend adapter (refactor existing)
   - Phase 3: Google adapter (refactor existing Gmail code, dual-write to oauthConnections)
   - Phase 4: Microsoft adapter (new)
   - Phase 5: Mailgun adapter (new)
   - Phase 6: Unified settings page (`settings/mail`)
   - Phase 7: Inbox enhancements (multi-mailbox, gabinet entity linking, provider-based filtering)
   - Phase 8: Historical email backfill (mailProviderId, provider rename gmail→google)
   - Phase 9: Old table cleanup (emailAccounts removal, settings/email removal)

---

## Files to Create

```
convex/mail/adapter.ts                    — MailAdapter interface + factory
convex/mail/adapters/google.ts            — Gmail API (refactored from google/)
convex/mail/adapters/microsoft.ts         — Microsoft Graph API
convex/mail/adapters/mailgun.ts           — Mailgun API
convex/mail/adapters/resend.ts            — Resend API (refactored)
convex/emailBrandConfig.ts                — Brand config CRUD
convex/emailTemplateSeed.ts               — Batched system template seeding logic
src/lib/avatar.ts                         — Avatar utilities
src/components/email/template-editor.tsx   — TipTap email template editor with 600px shell
src/components/settings/email-brand-editor.tsx — Brand config form with preview
src/components/settings/mail-provider-card.tsx — Provider card for settings
src/components/settings/mail-provider-form.tsx — Provider config form (per type)
src/routes/_app/_auth/dashboard/_layout.settings.mail.tsx — Unified mail settings
```

## Files to Modify

```
convex/schema/crm.ts                      — emailTemplates extensions, mailProviders table, emails extensions
convex/schema/platform.ts                 — emailBrandConfig table
convex/emailTemplates.ts                  — new rendering pipeline (backend variable substitution)
convex/emailSending.ts                    — adapter-based sending, renderedHtml usage
convex/emails.ts                          — extended entity linking, provider rename
convex/app.ts                             — avatar fix (updateUserImage URL caching)
convex/google/oauth.ts                    — dual-write to oauthConnections + mailProviders
src/components/layout/app-sidebar.tsx     — settings nav updates
src/components/application/app-navigation/base-components/nav-account-card.tsx — wire to real user data
src/routes/_app/_auth/dashboard/_layout.inbox.index.tsx — multi-mailbox, provider switcher
src/components/email/compose-dialog.tsx   — provider selector, template insertion
src/components/email/inbox-list.tsx       — mailbox filter
src/routes/_app/_auth/dashboard/-ui.navigation.tsx — avatar utility usage
src/routes/_app/_auth/dashboard/_layout.settings.profile.tsx — avatar utility usage
src/routes/_app/_auth/dashboard/_layout.settings.integrations.tsx — remove Google OAuth card
```

## Files to Remove

```
src/components/email-builder/             — entire GrapesJS directory
src/routes/_app/_auth/dashboard/_layout.settings.email.tsx — replaced by settings/mail
```

## Out of Scope

- SMTP direct support (requires external relay, deferred)
- Email sequence builder UI (keep existing, works with new templates)
- Webhook-based inbound for Mailgun/Resend (future enhancement)
- Email analytics/tracking (opens, clicks) — future feature
- Custom HTML editing mode for advanced users — future feature
- IMAP protocol support — too complex, OAuth-based APIs preferred
- Unified OAuth token store refactor (oauthConnections + mailProviders merge) — future cleanup
