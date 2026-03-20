# Gabinet Locations & Equipment Management

Date: 2026-03-20
Status: Draft
Module: Gabinet

## Overview

Two interconnected features for the Gabinet module: multi-location support (physical branches with rooms) and equipment inventory management. Locations are the foundation — equipment depends on them. The system enables a clinic to operate across multiple physical addresses, assign employees to locations via schedules, track equipment per location, and validate equipment availability when booking appointments.

## Requirements Summary

From brainstorming:

- Location = physical address/branch (e.g., "Klinika Mokotów, ul. Puławska 100")
- Rooms/cabinets within each location (one room = one concurrent appointment)
- Employees assigned to locations via their schedule (Mon at Mokotów, Tue at Ursynów)
- Equipment has a current location but can be transferred between locations
- Treatments reference required equipment; system verifies availability at the appointment's location
- Room collision detection (no two appointments in same room at same time)

## Data Model

### New Tables

#### `gabinetLocations`

Physical branch/facility of the clinic.

```typescript
gabinetLocations: defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  address: v.optional(v.object({
    street: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    country: v.optional(v.string()),
  })),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  color: v.optional(v.string()),     // calendar color coding
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
})
  .index("by_org", ["organizationId"])
  .searchIndex("search_name", {
    searchField: "name",
    filterFields: ["organizationId"],
  })
```

#### `gabinetRooms`

Physical room/cabinet within a location. One room = one appointment at a time.

```typescript
gabinetRooms: defineTable({
  organizationId: v.id("organizations"),
  locationId: v.id("gabinetLocations"),
  name: v.string(),
  description: v.optional(v.string()),
  floor: v.optional(v.string()),
  isActive: v.boolean(),
  createdAt: v.number(),
})
  .index("by_org", ["organizationId"])
  .index("by_location", ["locationId"])
```

#### `gabinetEquipment`

Equipment inventory with current location tracking.

```typescript
gabinetEquipment: defineTable({
  organizationId: v.id("organizations"),
  name: v.string(),
  description: v.optional(v.string()),
  serialNumber: v.optional(v.string()),
  currentLocationId: v.optional(v.id("gabinetLocations")),
  currentRoomId: v.optional(v.id("gabinetRooms")),
  status: v.union(
    v.literal("available"),
    v.literal("in_use"),
    v.literal("maintenance"),
    v.literal("retired"),
  ),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
})
  .index("by_org", ["organizationId"])
  .index("by_location", ["organizationId", "currentLocationId"])
  .searchIndex("search_name", {
    searchField: "name",
    filterFields: ["organizationId"],
  })
```

#### `gabinetEquipmentTransfers`

Audit log for equipment moves between locations.

```typescript
gabinetEquipmentTransfers: defineTable({
  organizationId: v.id("organizations"),
  equipmentId: v.id("gabinetEquipment"),
  fromLocationId: v.optional(v.id("gabinetLocations")),
  toLocationId: v.id("gabinetLocations"),
  toRoomId: v.optional(v.id("gabinetRooms")),
  transferredBy: v.id("users"),
  transferredAt: v.number(),
  notes: v.optional(v.string()),
})
  .index("by_equipment", ["equipmentId"])
  .index("by_org", ["organizationId"])
```

### Modified Tables

#### `gabinetEmployeeSchedules` — add locationId

```typescript
// Add field:
locationId: v.optional(v.id("gabinetLocations")),
```

When set, this schedule entry means the employee works at that location on that day. When absent, backward compatible (location-unaware scheduling). The existing index `by_orgUserAndDay` remains; no new index needed since location is resolved after fetching the schedule.

#### `gabinetAppointments` — add locationId + roomId

```typescript
// Add fields:
locationId: v.optional(v.id("gabinetLocations")),
roomId: v.optional(v.id("gabinetRooms")),
```

Add new index for room conflict detection:
```typescript
.index("by_orgAndRoomAndDate", ["organizationId", "roomId", "date"])
```

When creating an appointment, locationId is auto-resolved from the employee's schedule for that day. Can be overridden manually. roomId is optional — if set, the system checks for room conflicts.

#### `gabinetTreatments` — requiredEquipment becomes references

```typescript
// Change from:
requiredEquipment: v.optional(v.array(v.string())),
// Change to:
requiredEquipmentIds: v.optional(v.array(v.id("gabinetEquipment"))),
```

Old string-based `requiredEquipment` field kept temporarily for migration, then removed. The migration creates equipment records from unique string values and updates treatment references.

#### `gabinetWorkingHours` — add optional locationId

```typescript
// Add field:
locationId: v.optional(v.id("gabinetLocations")),
```

Add index:
```typescript
.index("by_orgAndLocation", ["organizationId", "locationId"])
```

Allows per-location working hours. When absent, represents org-wide defaults (backward compatible).

## Backend Logic

### Location CRUD — `convex/gabinet/locations.ts`

Standard CRUD with org access verification:

- `listLocations(orgId)` — all locations for org, sorted by name
- `getLocation(orgId, locationId)` — single location with room count
- `saveLocation(orgId, data)` — create or update (upsert pattern matching existing `saveTreatment` etc.)
- `deleteLocation(orgId, locationId)` — soft delete (set isActive=false); block if active appointments reference it

### Room CRUD — within `convex/gabinet/locations.ts`

- `listRooms(orgId, locationId)` — rooms for a location
- `saveRoom(orgId, locationId, data)` — create or update
- `deleteRoom(orgId, roomId)` — soft delete; block if active appointments use it

### Equipment CRUD — `convex/gabinet/equipment.ts`

- `listEquipment(orgId, filters?)` — all equipment, filterable by locationId, status
- `getEquipment(orgId, equipmentId)` — single item with location/room details
- `saveEquipment(orgId, data)` — create or update
- `transferEquipment(orgId, equipmentId, toLocationId, toRoomId?, notes?)` — moves equipment, creates transfer log entry, updates currentLocationId/currentRoomId
- `listTransfers(orgId, equipmentId)` — transfer history for audit
- `deleteEquipment(orgId, equipmentId)` — set status=retired

### Availability Changes — `convex/gabinet/_availability.ts`

#### `checkConflict()` — extend with room conflict

Current logic checks employee time conflicts. Add:

1. If `roomId` is provided, query `by_orgAndRoomAndDate` index
2. Check for overlapping appointments in the same room
3. Return conflict if found (separate from employee conflict — both must pass)

#### `checkEquipmentAvailability()` — new function

Given a treatment's `requiredEquipmentIds` and a target `locationId`:

1. For each required equipment ID, fetch the equipment record
2. Verify `currentLocationId === targetLocationId`
3. Verify `status === "available"`
4. Return `{ available: boolean, missing: EquipmentInfo[] }` with details of what's missing/elsewhere

This is a read-time check, not a reservation. Equipment doesn't get "locked" to an appointment — it's location-based. If the laser is at Mokotów, any appointment at Mokotów can use it.

#### `resolveAppointmentLocation()` — new helper

Given employeeId and date:

1. Fetch employee's schedule for that day of week via `by_orgUserAndDay`
2. If schedule has `locationId`, return it
3. If no schedule or no locationId, return null (location-unaware, backward compat)

### Appointment Creation Changes — `convex/gabinet/appointments.ts`

Update the `create` mutation (line ~619):

1. After employee qualification check, call `resolveAppointmentLocation(employeeId, date)`
2. If locationId resolved (or manually provided), run `checkEquipmentAvailability(treatmentId, locationId)`
3. If roomId provided, run room conflict check via extended `checkConflict()`
4. Store locationId and roomId on the appointment record

The locationId can be auto-resolved from employee schedule or explicitly passed. If both exist, explicit takes precedence. If treatment requires equipment not at the location, return a validation error with details of missing equipment.

### Working Hours per Location

`getAvailableSlots()` in `_availability.ts` currently resolves clinic hours from `gabinetWorkingHours`. Update to:

1. If locationId is known, first try `by_orgAndLocation` index with that locationId
2. Fall back to org-wide working hours (locationId === undefined)
3. Employee schedule overrides still take precedence over location hours

## Frontend

### Settings: Locations Management

New route: `_layout.gabinet.settings.locations.tsx`

Page structure following existing gabinet settings patterns (e.g., leaves settings):

- List of locations with name, address, room count, active toggle
- Click to expand/edit a location: name, address fields, phone, email, color picker
- Rooms sub-section within each location: list of rooms with name, floor, active toggle
- Add location / Add room buttons

### Settings: Equipment Management

New route: `_layout.gabinet.settings.equipment.tsx`

- Table/list of all equipment: name, serial number, current location, status badge
- Click to edit: name, description, serial number, assign to location + room, status dropdown
- Transfer action: select target location (+ optional room), add note — creates transfer log
- Transfer history expandable per equipment item

### Treatment Form — Equipment Selection

Update `treatment-form.tsx` and treatment detail page:

- Replace the current free-text `requiredEquipment` string array input
- New: multi-select dropdown of equipment records from `gabinetEquipment`
- Show equipment name + current location as context

### Employee Schedule — Location Assignment

Update the employee schedule editor (within employee detail page):

- Each schedule row (day + hours) gets an optional location dropdown
- Populated from `gabinetLocations` for the org
- Allows: "Monday 9-17 at Klinika Mokotów", "Tuesday 9-17 at Klinika Ursynów"

### Appointment Form — Location & Room

Update `appointment-form.tsx` and appointment dialog:

- After selecting employee + date, auto-resolve location from employee schedule
- Show resolved location as a badge/chip (editable via dropdown override)
- Optional room selector: rooms at the resolved location, filtered by availability
- If treatment requires equipment: show validation status (green check / red warning per equipment item)
- Equipment warning: "Laser XYZ jest w lokalizacji Mokotów, wizyta jest na Ursynowie"

### Calendar Views

- Location filter in calendar toolbar (dropdown or tabs)
- Color-code appointments by location (using location.color field)
- Room view: a sub-view within day view showing rooms as columns (like resource view)

### Appointment Detail

- Show location name + address in appointment detail sidebar/dialog
- Show room assignment if set
- Show equipment requirements status

## Migration Strategy

### Phase 1: Schema + backward compat

1. Add new tables (gabinetLocations, gabinetRooms, gabinetEquipment, gabinetEquipmentTransfers)
2. Add optional fields to existing tables (locationId on schedules, appointments, working hours; roomId on appointments; requiredEquipmentIds on treatments)
3. All new fields are optional — existing data works without changes

### Phase 2: Equipment migration

1. Scan all treatments with non-empty `requiredEquipment` (string array)
2. For each unique equipment string, create a `gabinetEquipment` record (no location assigned)
3. Update treatment records: populate `requiredEquipmentIds` from created equipment records
4. Keep old `requiredEquipment` field until verified, then remove in Phase 3

### Phase 3: Cleanup

1. Remove `requiredEquipment` string field from schema
2. Remove migration code

## i18n Keys

Add under `gabinet.locations` and `gabinet.equipment` namespaces in both PL and EN:

### Locations (PL / EN)

| Key | PL | EN |
|-----|----|----|
| `title` | Lokalizacje | Locations |
| `addLocation` | Dodaj lokalizację | Add location |
| `editLocation` | Edytuj lokalizację | Edit location |
| `name` | Nazwa | Name |
| `address` | Adres | Address |
| `street` | Ulica | Street |
| `city` | Miasto | City |
| `postalCode` | Kod pocztowy | Postal code |
| `phone` | Telefon | Phone |
| `email` | E-mail | Email |
| `color` | Kolor | Color |
| `rooms` | Gabinety | Rooms |
| `addRoom` | Dodaj gabinet | Add room |
| `roomName` | Nazwa gabinetu | Room name |
| `floor` | Piętro | Floor |
| `noLocations` | Brak lokalizacji | No locations |
| `noRooms` | Brak gabinetów | No rooms |
| `deleteConfirm` | Usunięcie lokalizacji dezaktywuje ją. Istniejące wizyty nie zostaną zmienione. | Deleting a location will deactivate it. Existing appointments won't be affected. |

### Equipment (PL / EN)

| Key | PL | EN |
|-----|----|----|
| `title` | Sprzęt | Equipment |
| `addEquipment` | Dodaj sprzęt | Add equipment |
| `editEquipment` | Edytuj sprzęt | Edit equipment |
| `name` | Nazwa | Name |
| `serialNumber` | Numer seryjny | Serial number |
| `currentLocation` | Aktualna lokalizacja | Current location |
| `status` | Status | Status |
| `statusOptions.available` | Dostępny | Available |
| `statusOptions.in_use` | W użyciu | In use |
| `statusOptions.maintenance` | Serwis | Maintenance |
| `statusOptions.retired` | Wycofany | Retired |
| `transfer` | Przenieś | Transfer |
| `transferTo` | Przenieś do | Transfer to |
| `transferHistory` | Historia przeniesień | Transfer history |
| `transferNote` | Notatka | Note |
| `noEquipment` | Brak sprzętu | No equipment |
| `requiredEquipment` | Wymagany sprzęt | Required equipment |
| `equipmentAtLocation` | Sprzęt w lokalizacji | Equipment at location |
| `equipmentMissing` | Brak wymaganego sprzętu w tej lokalizacji | Required equipment not at this location |

### Appointment additions (PL / EN)

| Key | PL | EN |
|-----|----|----|
| `gabinet.appointment.location` | Lokalizacja | Location |
| `gabinet.appointment.room` | Gabinet | Room |
| `gabinet.appointment.autoLocation` | Lokalizacja z grafiku pracownika | Location from employee schedule |
| `gabinet.appointment.roomConflict` | Gabinet zajęty w tym terminie | Room occupied at this time |
| `gabinet.appointment.equipmentWarning` | {{name}} jest w {{location}} | {{name}} is at {{location}} |

## Files to Create

1. `convex/gabinet/locations.ts` — CRUD for locations and rooms
2. `convex/gabinet/equipment.ts` — CRUD for equipment, transfers
3. `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.locations.tsx` — locations settings page
4. `src/routes/_app/_auth/dashboard/_layout.gabinet.settings.equipment.tsx` — equipment settings page

## Files to Modify

1. `convex/schema/gabinet.ts` — new tables + field additions
2. `convex/gabinet/_availability.ts` — room conflict check, equipment availability check, location resolution
3. `convex/gabinet/appointments.ts` — location/room/equipment in create/update mutations
4. `convex/gabinet/treatments.ts` — requiredEquipmentIds field handling
5. `src/components/gabinet/appointment-form.tsx` — location/room selectors, equipment validation
6. `src/components/gabinet/appointment-dialog.tsx` — location display
7. `src/components/gabinet/calendar/appointment-detail-dialog.tsx` — location + room + equipment display
8. `src/components/gabinet/treatment-form.tsx` — equipment multi-select
9. `src/routes/_app/_auth/dashboard/_layout.gabinet.employees.$employeeId.tsx` — schedule location assignment
10. `src/components/layout/app-sidebar.tsx` — add settings nav items for locations/equipment
11. `public/locales/pl/translation.json` — PL keys
12. `public/locales/en/translation.json` — EN keys

## Implementation Sequence

1. Schema changes (new tables + field additions) — deploy with `convex dev`
2. Backend: locations + rooms CRUD
3. Backend: equipment CRUD + transfers
4. Backend: availability logic (room conflicts, equipment checks, location resolution)
5. Backend: appointment mutations (location/room/equipment integration)
6. Frontend: locations settings page
7. Frontend: equipment settings page
8. Frontend: employee schedule location assignment
9. Frontend: treatment form equipment selection
10. Frontend: appointment form location/room/equipment
11. Frontend: calendar location filter + appointment detail updates
12. i18n keys (PL + EN)
13. Migration: equipment strings → equipment records
14. Cleanup: remove old requiredEquipment string field

## Backward Compatibility

All new fields are optional. The system works in three modes:

1. No locations configured — everything works as before, location fields are null
2. Locations configured but not all employees assigned — mixed mode, location-aware appointments coexist with location-unaware ones
3. Fully configured — all employees have location schedules, rooms assigned, equipment tracked

No breaking changes to existing data. Old appointments render correctly without location/room. Old treatments with string-based requiredEquipment continue working until migration runs.

## Verification Checklist

1. Create a location with address and 2 rooms
2. Create equipment, assign to location
3. Assign employee schedule with locationId
4. Book appointment — verify location auto-resolved from schedule
5. Book appointment with room — verify room conflict detection
6. Book appointment for treatment requiring equipment — verify availability check
7. Transfer equipment to different location — verify transfer log
8. Book appointment at location where equipment is missing — verify warning
9. Old appointments without location still display correctly
10. Calendar location filter works
11. All CRUD operations respect RBAC (verifyOrgAccess + checkPermission)
