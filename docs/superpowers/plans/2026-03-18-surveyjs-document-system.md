# Plan: SurveyJS Document Generation System

## Context

Replace ALL existing document systems with a unified SurveyJS-based form builder + renderer + PDF export + signature system. The current codebase has THREE overlapping document systems that all need to go:

1. **Old Gabinet** (`gabinetDocumentTemplates` + `gabinetDocuments`) — HTML string templates with `{{placeholder}}` regex replacement. 4 statuses (draft/pending_signature/signed/archived). Only linked to patients/appointments.
2. **New CRM** (`documentTemplates` + `documentTemplateFields` + `documentInstances`) — Field-based system with HTML content, source bindings, signature slots, verification methods. 6 statuses. More sophisticated but still HTML-based, never properly integrated.
3. **CRM Documents module** (`documents` table) — file uploads with categories. Separate from templates entirely.

All three are being replaced by ONE system powered by SurveyJS.

## SurveyJS Libraries

| Package | Purpose | License | Cost |
|---------|---------|---------|------|
| `survey-core` | Core form engine, JSON schema processing | MIT | Free |
| `survey-react-ui` | React rendering components | MIT | Free |
| `survey-creator-core` | Form builder engine (3-column editor) | Commercial | $499 Basic |
| `survey-creator-react` | React form builder UI | Commercial | (included in Basic) |
| `survey-pdf` | PDF export from filled forms | MIT | Free |

**License needed: Basic ($499/developer, one-time).** Includes Survey Creator + Form Library + PDF Generator. SaaS-compatible, white-labeled, unlimited forms/creators.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    TEMPLATE BUILDER                       │
│  (Survey Creator — 3-column drag-drop editor)            │
│  Admin builds form templates with:                       │
│  - Standard fields (text, date, checkbox, dropdown...)   │
│  - Custom variables bound to entity data                 │
│  - Conditional logic (show X if treatment = Y)           │
│  - Signature field (built-in SurveyJS e-Signature)       │
│  - Multi-page support                                    │
│  Output: JSON schema stored in Convex                    │
└──────────────────────┬──────────────────────────────────┘
                       │ JSON schema
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   DOCUMENT GENERATION                     │
│  User clicks "Generate" on any entity (appointment,      │
│  lead, contact, company, patient, treatment)             │
│                                                           │
│  1. Load template JSON schema                            │
│  2. Resolve scope variables:                             │
│     - Entity in scope → auto-fill its fields             │
│     - Related entities → auto-fill (patient→contact,     │
│       appointment→patient+employee+treatment)            │
│     - Missing data → leave as form inputs                │
│  3. Render SurveyJS form with pre-filled data            │
│  4. User fills remaining fields                          │
│  5. Save response data to Convex                         │
└──────────────────────┬──────────────────────────────────┘
                       │ filled form data
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   SIGNATURE FLOW                          │
│                                                           │
│  If template requires signature:                         │
│  1. Document saved with status "pending_signature"       │
│  2. Email sent to signer (patient/client) via Resend     │
│  3. Signer opens link → public signing page              │
│  4. Verification: click / SMS OTP / email OTP            │
│  5. Signs with SurveyJS e-Signature or our SignaturePad  │
│  6. Status → "signed", signature data stored             │
│  7. Activity logged, notification to creator             │
│                                                           │
│  No signature required:                                  │
│  → Status immediately "completed"                        │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    PDF EXPORT                              │
│  survey-pdf renders filled form as PDF                   │
│  - Branded header (org logo, name)                       │
│  - All filled fields rendered                            │
│  - Signature image embedded                              │
│  - Stored in Convex file storage                         │
│  - Available for download/print from any entity detail   │
└─────────────────────────────────────────────────────────┘
```

## Database Schema (replaces all 5 existing tables)

### Table: `formTemplates` (replaces `gabinetDocumentTemplates` + `documentTemplates`)

```
formTemplates: defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  description: v.optional(v.string()),
  category: v.union(
    v.literal("consent"),
    v.literal("medical_record"),
    v.literal("prescription"),
    v.literal("referral"),
    v.literal("contract"),
    v.literal("invoice"),
    v.literal("protocol"),
    v.literal("intake"),
    v.literal("custom"),
  ),
  // SurveyJS JSON schema — the entire form definition
  formJson: v.string(),       // JSON.stringify of SurveyJS model
  // Theme/styling
  themeJson: v.optional(v.string()),
  // Which modules can use this template
  modules: v.array(v.string()),  // ["crm", "gabinet", "platform"]
  // Which entity types this template applies to
  entityTypes: v.array(v.string()),  // ["appointment", "lead", "contact", ...]
  // Variable bindings: map SurveyJS question names → entity field paths
  // e.g. { "patientName": "patient.firstName", "pesel": "patient.pesel" }
  variableBindings: v.optional(v.string()), // JSON map
  // Signature config
  requiresSignature: v.boolean(),
  signatureConfig: v.optional(v.object({
    method: v.union(v.literal("click"), v.literal("sms"), v.literal("email_otp"), v.literal("draw")),
    signerRole: v.union(v.literal("client"), v.literal("patient"), v.literal("employee"), v.literal("external")),
    reminderEnabled: v.optional(v.boolean()),
    reminderIntervalHours: v.optional(v.number()),
  })),
  // Access control
  accessRoles: v.optional(v.array(v.string())),
  // Versioning
  version: v.number(),
  isActive: v.boolean(),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_orgAndCategory", ["organizationId", "category"])
  .index("by_orgAndModule", ["organizationId", "modules"])
  .searchIndex("search_templates", {
    searchField: "name",
    filterFields: ["organizationId"],
  }),
```

### Table: `formDocuments` (replaces `gabinetDocuments` + `documentInstances`)

```
formDocuments: defineTable({
  organizationId: v.id("organizations"),
  templateId: v.id("formTemplates"),
  title: v.string(),
  // SurveyJS response data (all filled field values)
  responseData: v.string(),  // JSON.stringify of survey results
  // Rendered snapshot for PDF (optional, generated on completion)
  renderedHtml: v.optional(v.string()),
  // Entity linkage — polymorphic, any entity can own documents
  entityType: v.string(),    // "appointment", "lead", "contact", "company", "patient", "treatment"
  entityId: v.string(),      // ID of the linked entity
  // Additional scope entities that provided auto-fill data
  scopeEntities: v.optional(v.string()), // JSON: [{ type, id }]
  // Status — simplified
  status: v.union(
    v.literal("draft"),              // partially filled, saved
    v.literal("pending_signature"),  // filled, waiting for signature
    v.literal("signed"),             // signature collected
    v.literal("completed"),          // no signature needed, done
    v.literal("expired"),            // signature link expired
    v.literal("voided"),             // manually invalidated
  ),
  // Signature data
  signatureData: v.optional(v.string()),  // base64 image or click confirmation
  signedAt: v.optional(v.number()),
  signedByName: v.optional(v.string()),
  signedByEmail: v.optional(v.string()),
  signedByIp: v.optional(v.string()),
  signatureVerificationMethod: v.optional(v.string()),
  // Signing token for external signing page
  signingToken: v.optional(v.string()),
  signingTokenExpiresAt: v.optional(v.number()),
  signingEmailSentAt: v.optional(v.number()),
  signingReminderCount: v.optional(v.number()),
  // PDF
  pdfStorageId: v.optional(v.id("_storage")),
  pdfGeneratedAt: v.optional(v.number()),
  // Metadata
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_entity", ["entityType", "entityId"])
  .index("by_orgAndStatus", ["organizationId", "status"])
  .index("by_template", ["templateId"])
  .index("by_signingToken", ["signingToken"]),
```

### No `documentTemplateFields` table needed
SurveyJS stores the full form definition (questions, types, validation, logic) in the `formJson` field. No separate fields table.

## Scope Resolution Engine

When generating a document from an entity, the system resolves variable bindings by walking the entity graph:

```typescript
// convex/documents/scopeResolver.ts

type ScopeContext = {
  entityType: string;
  entityId: string;
  organizationId: string;
};

// Resolve all available data from the scope
async function resolveScope(ctx, scope: ScopeContext): Record<string, any> {
  const data: Record<string, any> = {};

  switch (scope.entityType) {
    case "appointment":
      const apt = await ctx.db.get(scope.entityId);
      data.appointment = apt;
      // Walk related entities
      if (apt.patientId) {
        const patient = await ctx.db.get(apt.patientId);
        data.patient = patient;
        // Patient → CRM contact
        if (patient.contactId) {
          data.contact = await ctx.db.get(patient.contactId);
        }
      }
      if (apt.employeeId) {
        data.employee = await resolveEmployee(ctx, apt.employeeId);
      }
      if (apt.treatmentId) {
        data.treatment = await ctx.db.get(apt.treatmentId);
      }
      break;

    case "lead":
      const lead = await ctx.db.get(scope.entityId);
      data.lead = lead;
      if (lead.contactId) data.contact = await ctx.db.get(lead.contactId);
      if (lead.companyId) data.company = await ctx.db.get(lead.companyId);
      break;

    case "contact":
      data.contact = await ctx.db.get(scope.entityId);
      break;

    case "company":
      data.company = await ctx.db.get(scope.entityId);
      break;

    case "patient":
      const patient = await ctx.db.get(scope.entityId);
      data.patient = patient;
      if (patient.contactId) data.contact = await ctx.db.get(patient.contactId);
      break;

    case "treatment":
      data.treatment = await ctx.db.get(scope.entityId);
      break;
  }

  // Always add organization data
  data.organization = await ctx.db.get(scope.organizationId);
  data.today = new Date().toISOString().split("T")[0];
  data.now = new Date().toISOString();

  return data;
}

// Apply variable bindings from template to resolved scope
function applyBindings(
  formJson: object,
  bindings: Record<string, string>,
  scopeData: Record<string, any>,
): { prefilledData: Record<string, any>; missingFields: string[] } {
  const prefilledData: Record<string, any> = {};
  const missingFields: string[] = [];

  for (const [questionName, dataPath] of Object.entries(bindings)) {
    const value = getNestedValue(scopeData, dataPath);
    if (value !== undefined && value !== null) {
      prefilledData[questionName] = value;
    } else {
      missingFields.push(questionName);
    }
  }

  return { prefilledData, missingFields };
}
```

## Implementation Phases

### Phase 1: Foundation (npm packages + schema + basic rendering)
**Files to create:**
- `convex/schema/documents.ts` — new `formTemplates` + `formDocuments` tables
- `convex/documents/templates.ts` — CRUD for formTemplates
- `convex/documents/documents.ts` — CRUD for formDocuments
- `convex/documents/scopeResolver.ts` — entity scope resolution
- `src/lib/surveyjs/` — SurveyJS configuration, theme, locale

**Files to modify:**
- `convex/schema/gabinet.ts` — add new tables alongside old (don't remove yet)
- `convex/schema.ts` — import new document tables
- `package.json` — add survey-core, survey-react-ui, survey-pdf

**Tasks:**
1. Install npm packages: `survey-core`, `survey-react-ui`, `survey-pdf`
2. Install commercial: `survey-creator-core`, `survey-creator-react` (needs license key)
3. Define `formTemplates` + `formDocuments` tables in schema
4. Create Convex CRUD mutations/queries
5. Create SurveyJS config: Polish locale, custom theme matching our CSS vars, dark mode support
6. Create basic `<SurveyFormRenderer />` component that takes formJson + data and renders
7. Create basic `<SurveyFormViewer />` component for read-only view of completed forms

### Phase 2: Template Builder (Survey Creator integration)
**Files to create:**
- `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.index.tsx` — template list
- `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.$id.tsx` — template editor
- `src/routes/_app/_auth/dashboard/_layout.settings.form-templates.new.tsx` — new template
- `src/components/documents/survey-creator-editor.tsx` — Survey Creator wrapper
- `src/components/documents/variable-binding-panel.tsx` — UI for mapping questions to entity fields
- `src/components/documents/template-preview.tsx` — preview with sample data

**Tasks:**
1. Create full-width layout variant for template editor (sidebar goes away, Survey Creator needs full 3-column space)
2. Integrate Survey Creator React component with our theme
3. Build variable binding panel: list of all questions in form → dropdown to pick entity.field path
4. Auto-detect available entity fields per module (CRM: contact, company, lead / Gabinet: patient, employee, treatment, appointment)
5. Template metadata form: name, description, category, modules, entityTypes, signature config
6. Template versioning: save creates new version, old instances keep reference to their version
7. Template list with search, filter by category/module, activate/deactivate
8. Seed templates: consent form, intake form, prescription, referral

### Phase 3: Document Generation (scope resolution + form filling)
**Files to create:**
- `src/components/documents/generate-document-dialog.tsx` — template picker + generation
- `src/components/documents/fill-document-form.tsx` — SurveyJS form with pre-filled data
- `src/components/documents/document-status-badge.tsx` — unified status display
- `src/components/documents/entity-documents-tab.tsx` — reusable tab for any entity detail
- `convex/documents/generate.ts` — server-side scope resolution + document creation

**Tasks:**
1. Build "Generate Document" dialog: pick template → resolve scope → show form with auto-filled fields
2. Scope resolver: appointment context pulls patient, employee, treatment data automatically
3. For fields not in scope → render as empty SurveyJS inputs for manual fill
4. Save filled form data to `formDocuments` with entityType + entityId linkage
5. Add "Documents" tab to EntityDetailLayout (reusable for ALL entity types)
6. Wire up to: appointments, leads, contacts, companies, patients, treatments
7. "Documents" section in entity sidebar widgets

### Phase 4: Signature Flow (email + public signing page + verification)
**Files to create:**
- `src/routes/_app/sign/$token.tsx` — public signing page (no auth required)
- `convex/documents/signing.ts` — signing mutations, token generation, verification
- `convex/documents/signingEmail.ts` — email sending for signature requests
- `src/components/documents/signature-request-dialog.tsx` — send for signing UI

**Tasks:**
1. Token generation: create unique signing URL with expiration (48h default)
2. Email sending via existing Resend integration: "You have a document to sign"
3. Public signing page at `/sign/:token`:
   - Load document by token (no auth)
   - Render SurveyJS form in read-only mode (show filled data)
   - Show signature area at bottom
   - Verification step based on config: click-to-sign / SMS OTP / email OTP
4. SMS OTP verification (if configured): send code, verify before accepting signature
5. After signing: update status, store signature data, log activity, notify creator
6. Reminder system: scheduled job sends follow-up emails if not signed within X hours
7. Expiration: auto-expire tokens, update document status to "expired"

### Phase 5: PDF Export
**Files to create:**
- `src/components/documents/pdf-export-button.tsx` — trigger PDF generation
- `convex/documents/pdf.ts` — server-side PDF generation and storage

**Tasks:**
1. Integrate `survey-pdf` for client-side PDF rendering
2. Branded PDF: organization logo in header, footer with date/page numbers
3. Include signature image in PDF if signed
4. Store generated PDF in Convex file storage
5. "Download PDF" / "Print" buttons on document view
6. Auto-generate PDF on document completion/signing

### Phase 6: Migration + Cleanup (remove old systems)
**Files to DELETE:**
- `convex/gabinet/documents.ts` — old gabinet document CRUD
- `convex/gabinet/documentTemplates.ts` — old gabinet template CRUD
- `src/components/gabinet/documents/document-viewer.tsx` — old HTML viewer
- `src/components/gabinet/documents/signature-pad.tsx` — old signature pad (replaced by SurveyJS e-Signature)
- `src/components/documents/document-edit-dialog.tsx`
- `src/components/documents/document-from-template-dialog.tsx`
- `src/components/documents/document-from-template.tsx`
- `src/components/documents/document-instance-table.tsx`
- `src/components/documents/document-instance-view.tsx`
- `src/components/documents/document-viewer.tsx`
- `src/components/documents/pdf-export.tsx`
- `src/components/documents/review-assign-dialog.tsx`
- `src/components/documents/send-for-signing-dialog.tsx`
- `src/components/documents/signature-pad.tsx`
- `src/components/documents/source-field-picker.tsx`
- `src/components/documents/source-instance-picker.tsx`
- `src/components/documents/template-editor.tsx`
- `src/components/documents/template-field-config.tsx`
- `src/components/documents/template-field-panel.tsx`
- `src/components/documents/template-picker.tsx`
- `src/components/forms/document-form.tsx`
- `src/components/forms/document-upload-form.tsx`
- All old document routes (7 gabinet + 4 CRM document routes)
- `src/components/sidebar-widgets/crm/documents-widgets.tsx`
- `src/components/sidebar-widgets/gabinet/documents-widgets.tsx`

**Files to modify:**
- `convex/schema/gabinet.ts` — remove `gabinetDocumentTemplates`, `gabinetDocuments`, `documentTemplates`, `documentTemplateFields`, `documentInstances` tables
- `convex/schema.ts` — updated imports
- `convex/gabinet/appointments.ts` — update document references to new system
- `convex/gabinet/treatments.ts` — update requiredDocuments to reference `formTemplates`
- `convex/gabinet/patientPortal.ts` — update to use `formDocuments`
- `convex/gabinet/seed.ts` — update seed data to create SurveyJS templates
- `convex/gabinet/sidebarWidgets.ts` — update document queries
- `convex/gabinet/nudges.ts` — update document status checks
- Patient portal documents route — rewrite to use SurveyJS viewer
- All entity detail routes — use new `entity-documents-tab.tsx`
- App sidebar navigation — update document links

**Tasks:**
1. Write data migration: convert existing `gabinetDocumentTemplates` HTML → SurveyJS JSON (best-effort)
2. Migrate existing `gabinetDocuments` / `documentInstances` → `formDocuments`
3. Update all references across codebase
4. Delete old files
5. Remove old schema tables
6. Update seed data
7. Full regression test

### Phase 7: Polish + Patient Portal
**Tasks:**
1. Patient portal: view and sign documents via SurveyJS viewer
2. Document list views with filters (by status, category, entity)
3. Document activity logging (generated, sent_for_signing, signed, voided)
4. Audit trail: who generated, who signed, when, IP
5. Template gallery: pre-built Polish medical templates (RODO consent, treatment consent, intake form)
6. Dark mode support for SurveyJS components
7. i18n: Polish + English labels for all SurveyJS UI

## Route Structure (final)

```
Settings:
  /settings/form-templates           — template list
  /settings/form-templates/new       — new template (Survey Creator, full-width)
  /settings/form-templates/:id       — edit template (Survey Creator, full-width)

Documents:
  /documents                         — all documents list (org-wide)
  /documents/:id                     — document detail/view

Public:
  /sign/:token                       — public signing page (no auth)

Entity detail tabs (reusable component):
  /contacts/:id  → Documents tab
  /companies/:id → Documents tab
  /leads/:id     → Documents tab
  /gabinet/appointments/:id → Documents tab (replaces current checklist)
  /gabinet/patients/:id     → Documents tab
  /gabinet/treatments/:id   → Documents tab
```

## Key Decisions

1. **SurveyJS e-Signature vs our SignaturePad**: Use SurveyJS built-in signature question type within forms. For the external signing page, keep our SignaturePad component (it works well on mobile/tablet).

2. **PDF generation location**: Client-side via `survey-pdf`. No server-side rendering needed. PDF stored in Convex file storage after generation.

3. **Template builder layout**: Full-width dedicated route. Survey Creator needs 3 columns (toolbox | canvas | property grid). Our app sidebar hides when editor is open.

4. **Variable binding UX**: Separate panel below/beside Survey Creator. Admin maps "question name in form" → "entity.field.path". We provide auto-complete with all available fields per entity type.

5. **Signing token**: UUID stored in `formDocuments.signingToken`. Public route `/sign/:token` queries by index. No auth required, token is the auth. 48h expiration default, configurable per template.

6. **Old data**: Migration script converts HTML templates to simple SurveyJS forms (one HTML question containing the old content). Not perfect but preserves data. New templates should be built from scratch using the builder.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Survey Creator license cost | $499 one-time is trivial vs building own form builder |
| SurveyJS bundle size | Tree-shake, lazy-load creator only on template editor routes |
| PDF fidelity | survey-pdf is good for form-based layouts; complex layouts may need tweaking |
| Migration complexity | Keep old tables read-only during transition, migrate incrementally |
| Dark mode | SurveyJS has built-in theme support, map to our CSS variables |

## Estimation

| Phase | Effort | Parallel? |
|-------|--------|-----------|
| Phase 1: Foundation | 4-6h | — |
| Phase 2: Template Builder | 6-8h | — |
| Phase 3: Document Generation | 6-8h | — |
| Phase 4: Signature Flow | 8-10h | after P3 |
| Phase 5: PDF Export | 3-4h | after P3 |
| Phase 6: Migration + Cleanup | 6-8h | after P1-P5 |
| Phase 7: Polish + Portal | 4-6h | after P6 |
| **Total** | **~40-50h** | |

Phases 4 and 5 can run in parallel after Phase 3 is done.
