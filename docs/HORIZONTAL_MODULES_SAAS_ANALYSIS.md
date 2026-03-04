# CRM_NEW — analiza architektury pod kątem Horizontal Modules (SaaS)

## 1) Co to znaczy „horizontal modules” w tym projekcie

Horizontal module = warstwa wspólna, używana przez wiele domen (tu: `crm` + `gabinet`), niezależnie od konkretnego verticala.

To nie są feature pages typu „Leady” albo „Pacjenci”, tylko capabilities platformowe.

## 2) Obecne horizontale (już istniejące)

Na podstawie kodu (`convex/*`, `src/routes/*`, rejestry `crm/_registry`, `gabinet/_registry`):

1. **Identity & Access**
   - auth, users, organizations, invitations, permissions
   - role/org model i członkostwa

2. **Tenant Core (multi-tenant)**
   - organization-centric model w tabelach i zapytaniach
   - wspólna izolacja danych per org

3. **Custom Data Model Layer**
   - custom fields (wspólne dla wielu encji)
   - dynamiczne rozszerzanie modeli bez migracji UI per vertical

4. **Activity & Timeline Layer**
   - activities/scheduledActivities/calls/notes
   - wspólny log operacyjny i planowanie zadań

5. **Document Layer**
   - documents + storage + powiązania encji

6. **Communication Layer**
   - emails, inbox, google gmail/calendar integracje

7. **Search Layer**
   - global search (`convex/search.ts`), wielo-encjowe indeksowanie

8. **Analytics/Reporting Layer**
   - dashboard queries, KPI, mini-charty

9. **Configuration Layer**
   - org settings, sources, lost reasons, activity types, pipelines

10. **Audit/Observability Layer**
   - audit log, event tracking

11. **Billing/Entitlements Layer**
   - stripe/payments/productSubscriptions/products

12. **Module Registry Layer**
   - `crm/_registry.ts`, `gabinet/_registry.ts`
   - wzorzec pluginowy (nawigacja + entity/activity contracts)

## 3) Ocena dojrzałości architektury

- Projekt jest już **blisko platformy modułowej**, nie tylko „jednego CRM-a”.
- Największa wartość: istniejące registry + wspólne horizontale + dwa verticale (`crm`, `gabinet`).
- Największe ryzyko: brak formalnego contractu runtime dla modułów i brak „done gate” CI dla całej platformy.

## 4) Najważniejsze luki do domknięcia

1. **Build/Type Safety Gate**
   - lokalnie `npm run typecheck` failuje (api generation + błędy TS).
   - Bez zielonego gate’a trudno skalować modułowość.

2. **Module Contract Formalization**
   - registry jest, ale potrzeba spójnego interfejsu: capabilities, nav, entity bindings, feature flags.

3. **Entitlements per module**
   - billing jest, ale trzeba jasno zmapować „produkt -> capability set” dla `crm` i `gabinet`.

4. **Cross-module UX consistency**
   - wspólne list/detail patterns i action patterns powinny być 100% spójne (table, filters, side panels, activity forms).

5. **Operational CI/E2E baseline**
   - minimalny smoke E2E dla obu verticali po każdej zmianie horizontali.

## 5) Proponowany model docelowy (krótko)

- **Platform Core (horizontal)**
  - auth/org/permissions
  - custom fields
  - activities/documents/search/notifications
  - billing/entitlements
  - audit

- **Vertical Modules**
  - CRM
  - Gabinet
  - kolejne verticale przez ten sam registry contract

- **Capability Matrix**
  - każda funkcja oznaczona capability key
  - mapa capability ↔ plan ↔ module
