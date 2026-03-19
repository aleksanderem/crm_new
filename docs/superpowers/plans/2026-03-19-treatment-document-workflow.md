# Treatment-Document-Appointment Workflow Plan

## Goal
When a treatment is assigned to an appointment, required documents auto-generate and gate appointment status transitions.

## Current State
- `gabinetTreatments.requiredDocumentTemplateIds` exists (points to old `gabinetDocumentTemplates`)
- `gabinetDocuments.appointmentId` exists with `by_appointment` index
- `gabinetDocuments.getByAppointment` query exists
- Appointment status transitions enforced via `VALID_TRANSITIONS` map
- `EntityDocumentsTab` + `GenerateDocumentDialog` components exist
- formTemplates + formDocuments (new PDFme system) in place

## Changes Required

### Phase 1: Schema + Treatment Config

**1.1 Add `requiredFormTemplates` to gabinetTreatments schema**
File: `convex/schema/gabinet.ts`

Add field:
```ts
requiredFormTemplates: v.optional(v.array(v.object({
  templateId: v.id("formTemplates"),
  timing: v.union(v.literal("before_start"), v.literal("after_completion")),
}))),
```
Keep old `requiredDocumentTemplateIds` for now (migration later).

**1.2 Treatment detail UI — document template assignment**
File: `_layout.gabinet.treatments.$treatmentId.tsx`

In the "Dokumenty" tab, add a section ABOVE EntityDocumentsTab:
- "Wymagane dokumenty dla tego zabiegu" header
- List of assigned templates with timing badge (Przed wizytą / Po wizycie)
- "Dodaj wymagany dokument" button → picker dialog showing formTemplates with entityType "treatment"
- Each row: template name, timing toggle (before/after), remove button
- Saves to `treatment.requiredFormTemplates`

**1.3 Treatment mutations**
File: `convex/gabinet/treatments.ts`

Add/update mutation to accept `requiredFormTemplates` array.

### Phase 2: Auto-generation on Appointment

**2.1 Auto-generate documents when appointment is created**
File: `convex/gabinet/appointments.ts`

In `create` mutation, after inserting appointment:
- Look up the treatment's `requiredFormTemplates`
- For each template, call `documents.generate.generateDocument` with:
  - `entityType: "appointment"`
  - `entityId: appointmentId`
  - `templateId: template.templateId`
  - Pre-fill scope data from appointment (patient, employee, treatment)
- Store timing metadata on the formDocument (add `timing` field to formDocuments schema)

**2.2 Add `timing` field to formDocuments schema**
File: `convex/schema/documents.ts`

```ts
timing: v.optional(v.union(v.literal("before_start"), v.literal("after_completion"))),
```

**2.3 Handle treatment change on existing appointment**
When appointment's treatmentId changes:
- Remove auto-generated documents that haven't been filled yet
- Generate new ones from new treatment's required templates

### Phase 3: Status Transition Gates

**3.1 Document completion check helper**
File: `convex/gabinet/_helpers/documentGate.ts` (new)

```ts
export async function checkDocumentGate(
  ctx: QueryCtx,
  appointmentId: Id<"gabinetAppointments">,
  timing: "before_start" | "after_completion"
): Promise<{ canProceed: boolean; missing: Array<{ title: string; documentId: Id<"formDocuments"> }> }>
```

Queries formDocuments for this appointment with matching timing.
Returns missing = documents where status !== "signed" (or "completed" if no signature required).

**3.2 Gate appointment status transitions**
File: `convex/gabinet/appointments.ts`

Modify `updateStatus` mutation:
- When transitioning to `in_progress`: call `checkDocumentGate(ctx, id, "before_start")`
  - If missing docs: throw error with list of missing document names
- When transitioning to `completed`: call `checkDocumentGate(ctx, id, "after_completion")`
  - If missing docs: throw error with list of missing document names

**3.3 Frontend: warning dialog before status change**
File: `_layout.gabinet.appointments.$appointmentId.lazy.tsx`

Before calling status mutation:
- Query `checkDocumentGate` (expose as query)
- If missing documents: show confirmation dialog
  - "Następujące dokumenty nie zostały jeszcze wypełnione:"
  - List of missing docs with "Wypełnij" buttons
  - "Kontynuuj mimo to" (soft gate) vs "Wypełnij dokumenty" (hard gate based on template config)
  - Clicking "Wypełnij" opens the document filling dialog for that specific document

### Phase 4: Appointment Detail UX

**4.1 Document checklist component**
File: `src/components/documents/appointment-document-checklist.tsx` (new)

Props: `appointmentId`, `organizationId`

Renders:
- Section "Przed wizytą" with before_start documents
- Section "Po wizycie" with after_completion documents
- Each row: checkbox icon (green if signed, red if pending), document title, status badge
- Click on row → opens document fill/sign dialog
- Progress indicator: "2/3 dokumentów wypełnionych"

**4.2 Replace EntityDocumentsTab in appointment detail**
In appointment detail, the "Dokumenty" tab shows `AppointmentDocumentChecklist` instead of generic `EntityDocumentsTab`. The checklist is more specific — shows required docs grouped by timing, with completion status and inline actions.

Keep "Wygeneruj dodatkowy dokument" button for ad-hoc docs not tied to treatment.

**4.3 Status action buttons show document status**
The "Rozpocznij wizytę" and "Zakończ wizytę" buttons show a small badge if there are unfilled required documents:
- Red dot with count: "Rozpocznij wizytę (2 dokumenty)"
- Clicking opens the gate dialog from 3.3

## Implementation Order

1. Phase 1.1 — Schema change (5 min)
2. Phase 1.3 — Treatment mutation (10 min)
3. Phase 2.2 — formDocuments timing field (5 min)
4. Phase 1.2 — Treatment detail UI for required docs (30 min)
5. Phase 2.1 — Auto-generate on appointment create (20 min)
6. Phase 3.1 — Document gate helper (15 min)
7. Phase 4.1 — Checklist component (30 min)
8. Phase 4.2 — Replace EntityDocumentsTab in appointment (15 min)
9. Phase 3.2 — Gate status transitions (15 min)
10. Phase 3.3 — Frontend warning dialog (20 min)
11. Phase 4.3 — Status button badges (10 min)

Total: ~3h work, can be parallelized in 2 streams (backend + frontend).

## Files to Create
- `convex/gabinet/_helpers/documentGate.ts`
- `src/components/documents/appointment-document-checklist.tsx`

## Files to Modify
- `convex/schema/gabinet.ts` — add requiredFormTemplates to treatments
- `convex/schema/documents.ts` — add timing to formDocuments
- `convex/gabinet/treatments.ts` — update mutation for requiredFormTemplates
- `convex/gabinet/appointments.ts` — auto-generate + gate transitions
- `convex/documents/generate.ts` — accept timing parameter
- `src/routes/_app/_auth/dashboard/_layout.gabinet.treatments.$treatmentId.tsx` — required docs UI
- `src/routes/_app/_auth/dashboard/_layout.gabinet.appointments.$appointmentId.lazy.tsx` — checklist + gate dialogs
