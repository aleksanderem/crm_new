# Database Schema Reference

The source of truth for the application schema is `convex/schema.ts`.

This file exists as a stable landing page for generated schema documentation and should eventually be refreshed from the actual Convex schema rather than edited manually.

Current manual pointers:

- Platform and organization tables: auth, organizations, memberships, permissions, subscriptions, notifications, audit log.
- CRM tables: contacts, companies, leads, documents, pipelines, emails, notes, custom fields, relationships.
- Gabinet tables: patients, appointments, employees, schedules, packages, loyalty, reminders, documents, portal sessions.
- SMS pilot additions: durable appointment SMS event records and inbound-routing indexes in SMS config.
