# CRM Module — module context

This file gives any agent enough context to work on CRM code.

## What CRM users do

Sales teams managing contacts, companies, leads/deals through a pipeline. Daily workflow: check dashboard for KPIs and upcoming tasks, work leads through pipeline stages, log calls/emails/notes, create and send documents for signing, import/export data.

## Ownership

CRM owns: contacts, companies, leads/deals, pipelines, products, calls, email inbox, CSV import/export, saved views, sources, lost reasons, deal products.

## Key files

Backend:
- convex/contacts.ts, convex/companies.ts, convex/leads.ts — entity CRUD
- convex/pipelines.ts, convex/pipelineStages.ts — pipeline configuration
- convex/products.ts, convex/dealProducts.ts — product catalog and deal line items
- convex/calls.ts — call logging
- convex/emails.ts, convex/emailAccounts.ts — email sync
- convex/crm/documentDataSources.ts — CRM data sources for document templates (contact, company, lead, deal)
- convex/savedViews.ts — saved filter/sort presets

Frontend:
- src/routes/_app/_auth/dashboard/_layout.contacts.* — contact pages
- src/routes/_app/_auth/dashboard/_layout.companies.* — company pages
- src/routes/_app/_auth/dashboard/_layout.leads.* — lead pages
- src/routes/_app/_auth/dashboard/_layout.pipelines.* — pipeline/kanban
- src/routes/_app/_auth/dashboard/_layout.documents.* — document pages
- src/routes/_app/_auth/dashboard/_layout.inbox.* — email inbox
- src/routes/_app/_auth/dashboard/_layout.activities.* — activity list
- src/routes/_app/_auth/dashboard/_layout.calls.* — call list
- src/components/crm/ — CRM shared components (data table, side panel, kanban, filters, saved views)

## Entity detail pattern

All entity detail pages (contact, company, lead) follow the same structure: left sidebar with inline-editable fields, main area with tabs (All, Activities, Emails, Documents, Calls, Notes). The Documents tab uses DocumentInstanceTable with entity-specific source context.

## Current gaps (from user perspective)

1. No email templates for outreach sequences
2. No lead scoring or qualification criteria
3. No deal value forecasting or pipeline velocity metrics
4. Call logging is basic — no VoIP integration
5. No automated task creation from pipeline stage transitions
6. Bulk actions framework exists but limited action set
7. No advanced reporting beyond dashboard KPIs
8. Document signing works but send-for-signing UX is preliminary

## Integration points with platform

- Documents: CRM entities (contact, company, lead) register as data sources. Documents tab on entity detail uses documentInstances filtered by resolvedSources.
- Activities: CRM actions logged to activities table with entity type/id.
- Search: contacts, companies, leads, documents, products all indexed in global search.
- Custom fields: contacts, companies, leads, products support custom field definitions.
- Notifications: document workflow events generate notifications.
