# Concord CRM - Complete Feature Analysis

Research conducted: 2026-02-11
Source: https://demo.concordcrm.com

---

## 1. GLOBAL LAYOUT & NAVIGATION

### Sidebar (Left, Fixed ~200px)
- Logo at top
- User avatar + name + email (dropdown for account)
- Navigation items with icons:
  - Deals
  - Activities
  - Inbox (Email)
  - Documents
  - Contacts
  - Companies
  - Insights (Dashboard/Analytics)
  - Products
  - Calls
  - Settings
- Footer indicators:
  - "Today's Activities (6)" with orange dot
  - "Open Deals (45)" with blue dot

### Top Bar (Fixed)
- Page title (uppercase, e.g., "DEALS", "CONTACTS")
- Global search bar with Ctrl+K shortcut
- Dark/light mode toggle
- Notifications bell
- Quick add "+" button (creates new records from anywhere)
- Context-specific primary action button (e.g., "+ Create Deal")

### Shared UI Patterns
- Every list page has: mini charts at top, saved views tabs, search/filter bar, data table, bulk actions
- Pagination with Previous/Next and page numbers
- Row counts displayed (e.g., "110 calls", "5 products")
- Row-level "..." action menus
- Checkbox selection for bulk operations
- Column-level sort (click header)
- Gear icon for column settings/customization
- Global resource search sidebar (right panel listing Activities, Companies, Contacts, Deals, Documents, Email Messages, Products with counts)

---

## 2. INSIGHTS / DASHBOARD

### Layout
- Full-width scrollable page with configurable widget cards
- Each card has: title, time range selector (dropdown), optional pipeline selector

### Widgets/Cards Available
1. **My Activities** - table: Title, Due Date, Activity Type (paginated, 15 per page)
2. **Upcoming Activities** - table: Title, Due Date
3. **Activities Created by Sales Agent** - chart with agent breakdown
4. **Product Performance** - table: Name, Interest In Product, Total Sold, Sold Amount (tax excl.)
5. **Logged Calls by Day** - line/bar chart
6. **Total Logged Calls by Sales Agent** - chart
7. **Logged Calls** - table: Call, Outcome
8. **Call Outcome Overview** - chart
9. **Companies by Day** - line chart
10. **Companies by Source** - chart
11. **Contacts by Day** - line chart
12. **Contacts by Source** - chart
13. **Recently Created Contacts** - table: Contact, E-Mail Address, Created At
14. **Closing Deals** - table: Deal Name, Expected Close Date
15. **Deals by Stage** - bar chart (pipeline selector)
16. **Lost Deals Stage** - chart (pipeline selector)
17. **Won Deals Stage** - chart (pipeline selector)
18. **Won Deals by Day** - line chart
19. **Won Deals by Month** - chart
20. **Recently Created Deals** - table: Deal Name, Stage, Created At
21. **Recently Modified Deals** - table: Deal Name, Stage, Updated At
22. **Won Deals Revenue by Month** - chart
23. **Created Deals by Sales Agent** - table: Sales Agent, Total Created, Forecast Amount, Closed Amount
24. **Deals Assigned by Sales Agent** - table: Sales Agent, Total Assigned, Forecast Amount, Closed Amount

### Time Range Options
- Last 7 Days, Last 30 Days, This Month, Last 3 Months, All

---

## 3. DEALS

### List/Board View
- Default view is TABLE (not Kanban, despite URL saying "board")
- Table columns: Deal Name, Stage, Amount, Expected Close Date, Status, Owner, actions (...)
- Mini charts above table: "Deals by stage" (bar), "Won deals by day" (line)
- Pipeline selector dropdown (e.g., "Sales Pipeline")

### Saved Views (Tabs)
- All Deals (default)
- My Deals
- My Recently Assigned Deals
- Deals Created This Month
- Won Deals
- "+ Add View (5/5)" - users can create custom saved views, max 5

### Filters
- Quick filters as dropdown chips: Status, Owner, Created At
- "Advanced Filters" button for complex queries

### Create Deal Form (Side Panel/Modal)
Fields:
- *Deal Name (required, text)
- *Pipeline (required, searchable select - e.g., "Sales Pipeline")
- *Stage (required, searchable select - changes based on pipeline, e.g., "Qualified To Buy")
- Amount (currency input with USD prefix, placeholder "--")
- "+ Add products" link (attach products to deal)
- Expected Close Date (date picker, pre-filled)
- Tags (multi-select/tags input)
- Owner (searchable select, defaults to current user "Admin")
- Contacts (type-to-search relationship, "+ Create Contact" inline)
- Companies (type-to-search relationship, "+ Create Company" inline)
- Cancel / Create buttons

### Pipeline Stages (from settings)
- Sales Pipeline with stages (customizable in settings)
- Stages are ordered, drag-and-drop reorderable

### Deal Statuses
- Open, Won, Lost

### Lost Reasons
- Configurable list (e.g., "Client went silent", "Didn't have the budget", etc.)
- Settings toggle: "Allow sales agents to enter custom lost reason"
- Settings toggle: "Lost reason is required"

---

## 4. CONTACTS

### List View
- Table columns: Contact (avatar + full name), E-Mail Address, Phone, Owner, Source, actions
- Mini charts: "Contacts by day" (line), "Contacts by source" (bar)
- 30 contacts shown as total count

### Saved Views
- All Contacts
- My Contacts
- My Recently Assigned Contacts
- "+ Add View (3/5)"

### Filters
- Owner, Tags, Created At (dropdown chips)
- Advanced Filters

### Create Contact Form (Side Panel)
Fields:
- *First Name (required, text)
- Last Name (text)
- E-Mail Address (email)
- Phone (with type selector: Mobile/Work/Other, country prefix like "+1")
- "+ Add another" for multiple phone numbers
- Tags (multi-select)
- Owner (searchable select, default: Admin)
- Source (searchable select)
- Companies (type-to-search, "+ Create Company")
- Deals (type-to-search, "+ Create Deal")
- Cancel / Create buttons

### Contact Sources (from data)
- Web Form, Referrals, Other Campaigns, etc.

---

## 5. COMPANIES

### List View
- Table columns: Name, E-Mail Address, Phone, Source, Owner, actions
- Mini charts: "Companies by day" (line), "Companies by source" (bar)

### Saved Views
- All Companies
- My Companies
- My Recently Assigned Companies
- "+ Add View (3/5)"

### Filters
- Owner, Tags, Created At
- Advanced Filters

---

## 6. ACTIVITIES

### List View
- Table columns: Title, Activity Type, Due Date, Owner, actions
- Multiple pre-built views:
  - All Activities
  - Open Activities
  - Activities Due Today
  - Activities Due This Week
  - Overdue Activities
  - + Add View (5/5)

### Filters
- Owner, Activity Type, Due Date, Created At
- Advanced Filters

### Activity Types (from data)
- Meeting, Call, Email, Task (with color-coded icons)
- Each activity has: Title, Activity Type, Due Date, Owner
- Activities are linked to Deals, Contacts, Companies

### Activity Statuses
- Open (with Deadline indicator)
- Completed

---

## 7. CALLS

### List View
- Table columns: Outcome, Call Date, Note, Created By, Contacts, actions
- 110 calls in demo data

### Call Fields
- Outcome (Busy, Left voice message, Moved conversation forward, Wrong Number, etc.)
- Call Date (datetime)
- Note (rich text, can be long)
- Created By (user)
- Contacts (linked contacts)

### Saved Views
- All Calls
- + Add View (1/5)

### Filters
- Outcome, Call Date
- Advanced Filters

---

## 8. DOCUMENTS

### List View
- Table columns: Document Title, Document Type, Status, Owner, Amount, actions
- Mini charts: "Sent documents by day" (line), "Documents by status" (bar)

### Document Types
- Proposal (badge with icon)
- Others TBD

### Document Statuses
- Draft (badge)
- Sent, Accepted, Lost (TBD)

### Saved Views
- All Documents
- My Documents
- + Add View (2/5)

### Filters
- Type, Status, Owner, Created At
- Advanced Filters

---

## 9. PRODUCTS

### List View
- Table columns: Name, SKU, Unit Price, Tax Rate, Active (green dot = active), actions
- Simple data model

### Saved Views
- All Products
- Active Products
- + Add View (2/5)

### Filters
- Created At
- Advanced Filters

### Product Fields
- Name
- SKU (auto-generated code like "GSZXXO")
- Unit Price (currency)
- Tax Rate (percentage)
- Active (boolean toggle)

---

## 10. INBOX (EMAIL)

### Email Accounts Setup
- Supports Shared and Personal email accounts
- Integration via IMAP, Gmail, Outlook
- Features advertised:
  - 2-way email sync
  - Predefined templates
  - Compose with placeholders
  - Customized signatures
  - Associate emails to Contacts, Companies, Deals
  - Connect via IMAP, Gmail, or Outlook

---

## 11. SETTINGS

### Settings Sidebar Navigation
- **General** - Logo upload (dark/light), Currency, System Email Account, Allowed upload extensions, Date format, Time format, Phone prefix, Company Information (name, country), Privacy Policy (rich text editor)
- **Fields** - Per-entity field customization:
  - Company fields
  - Contact fields
  - Deal fields
  - Product fields
- **Integrations** - Pusher, Microsoft, Google, Zapier, Twilio
- **Activities** - Activity type configuration
- **Deals** - Pipeline management, Deal settings, Lost Reasons
- **Products** - Product settings
- **Documents** - Document settings
- **Companies** - Company settings
- **Calls** - Call settings
- **Web Forms** - Embeddable forms for lead capture
- **Workflows** - Automation rules (create activities, send emails, HTTP requests, etc.)
- **Users** - User management with tabs: Users, Roles, Teams
- **Brands** - Brand management
- **Mail Templates** - Email template editor
- **Modules** - Module toggling
- **Security** - General security, reCaptcha
- **System** - Update, Tools, System Info, Logs
- **Theme Style** - UI customization
- **Translator** - i18n management

### Pipeline Management (Settings > Deals)
- CRUD for pipelines (table: ID, Pipeline name, actions)
- Each pipeline has ordered stages
- "+ Create Pipeline" button

### Lost Reasons (Settings > Deals)
- CRUD table: ID, Label, actions
- Toggles: "Allow custom lost reason", "Lost reason is required"

### User Management (Settings > Users)
- Three tabs: Users, Roles, Teams
- User table: Name, ID, E-Mail Address, Super Admin (green dot)
- Actions: Invite User, Create User

### Workflows (Settings > Workflows)
- Automation builder
- Can automate: creating activities, sending emails, triggering HTTP requests
- "+ Create Workflow" button

---

## 12. KEY UI/UX PATTERNS

### Saved Views System
- Each entity page (Deals, Contacts, Companies, etc.) has a tab bar with saved views
- Pre-built default views (All, My, Recently Assigned, etc.)
- Users can add custom views (max 5 per entity)
- Views save filter state and column configuration

### Mini Charts/Metrics
- Placed above each list view
- Show trends (line charts) and breakdowns (bar charts)
- Contextual to the entity (deals show pipeline metrics, contacts show source distribution)
- Each chart has its own time range selector

### Advanced Filtering
- Quick filter chips for common fields (Owner, Status, Tags, Created At)
- "Advanced Filters" button for complex queries
- Filters affect both table data and mini charts

### Bulk Actions
- Checkbox selection on rows
- Action selector dropdown (appears when items selected)
- "Select Action (N records)" placeholder

### Relationship Linking
- Type-to-search inputs for linking entities (Contacts <-> Companies <-> Deals)
- "+ Create [Entity]" quick-create inline links in relationship fields
- Cross-entity navigation

### Global Search (Ctrl+K)
- Searches across all entities
- Command palette style

### Quick Create "+" Button
- In top-right header area
- Creates new records from any page

### Record Actions
- "..." three-dot menu on each row
- Actions vary by entity type

### Responsive Status Indicators
- Color-coded badges (Draft = gray, Proposal = green, etc.)
- Activity type icons with colors
- Active/inactive green dots for boolean fields

---

## 13. DATA MODEL RELATIONSHIPS

```
Organizations
  |-- Users (team memberships, roles)
  |-- Contacts
  |     |-- Phones (multiple, typed: Mobile/Work/Other)
  |     |-- Email addresses
  |     |-- Tags
  |     |-- Source
  |     |-- Owner (User)
  |     |-- linked Companies (many-to-many)
  |     |-- linked Deals (many-to-many)
  |     |-- Activities
  |     |-- Calls
  |     |-- Documents
  |     |-- Notes
  |
  |-- Companies
  |     |-- Email, Phone
  |     |-- Source
  |     |-- Owner (User)
  |     |-- linked Contacts
  |     |-- linked Deals
  |     |-- Activities
  |
  |-- Deals
  |     |-- Pipeline -> Stage (ordered)
  |     |-- Amount (currency)
  |     |-- Expected Close Date
  |     |-- Status (Open/Won/Lost)
  |     |-- Lost Reason (when Lost)
  |     |-- Tags
  |     |-- Owner (User)
  |     |-- linked Products (with quantity/pricing)
  |     |-- linked Contacts
  |     |-- linked Companies
  |     |-- Activities
  |
  |-- Activities
  |     |-- Title, Type (Meeting/Call/Email/Task)
  |     |-- Due Date, Status (Open/Completed)
  |     |-- Owner
  |     |-- linked to Deals/Contacts/Companies
  |
  |-- Calls
  |     |-- Outcome, Call Date, Note
  |     |-- Created By, linked Contacts
  |
  |-- Documents
  |     |-- Title, Type (Proposal, etc.), Status (Draft/Sent/Accepted/Lost)
  |     |-- Owner, Amount
  |
  |-- Products
  |     |-- Name, SKU, Unit Price, Tax Rate, Active
  |
  |-- Email (Inbox)
        |-- 2-way sync via IMAP/Gmail/Outlook
        |-- linked to Contacts/Companies/Deals
```

---

## 14. FEATURES MISSING IN OUR CRM (GAP ANALYSIS)

Comparing Concord CRM to our current implementation:

### We HAVE (basic):
- Contacts (CRUD, list, detail)
- Companies (CRUD, list, detail)
- Deals/Leads (CRUD, list, Kanban)
- Pipelines with stages
- Dashboard with basic KPIs
- Activity timeline
- Documents (CRUD)
- Custom fields
- Organization/team model

### We're MISSING:
1. **Saved Views system** - tabs with custom filter presets per entity
2. **Mini charts/metrics above each list** - contextual analytics per page
3. **Activities module** - dedicated activities with types (Meeting/Call/Email/Task)
4. **Calls module** - call logging with outcomes
5. **Products module** - product catalog with SKU/pricing/tax
6. **Inbox/Email integration** - 2-way email sync
7. **Global search (Ctrl+K)** - command palette style search
8. **Quick create "+" button** - create any entity from anywhere
9. **Advanced filtering system** - complex filter builder
10. **Bulk actions** - multi-select and batch operations
11. **Source tracking** - lead/contact sources
12. **Tags system** - taggable entities
13. **Lost reasons** - configurable reasons for lost deals
14. **Document types & statuses** - Proposal/Draft/Sent/Accepted workflow
15. **Workflows/Automation** - trigger-based automation
16. **Web Forms** - embeddable lead capture forms
17. **Column customization** - gear icon to show/hide columns
18. **User roles & teams** - beyond simple owner assignment
19. **Relationship linking in forms** - type-to-search + inline create
20. **Rich text notes/call notes** - per-entity notes with formatting

---

## 15. KANBAN / PIPELINE BOARD VIEW (Deep Dive)

### How It Works
The Deals page has TWO view modes, toggled via icons in the top-right header (next to "+ Create Deal" button):
- **Table view** (grid icon) - standard data table
- **Board/Kanban view** (columns icon) - pipeline board

URL pattern: `/deals/board?view_id=1`

### Board Layout
- Full-height board: `h-[calc(100vh - navbar - board-top)]` fills the viewport below the toolbar
- Horizontally scrollable container with columns (`overflow-x-scroll`)
- Each column = one pipeline stage
- Pipeline selector dropdown at top (e.g., "Sales Pipeline")
- Saved View tabs still visible above the board (All Deals, My Deals, etc.)

### Column Structure
Each column has:
- **Header**: Stage name + total amount + deal count (e.g., "Qualified To Buy — $78,976.00 — 13 deals")
- **Body**: Vertically scrollable card list (`overflow-y-auto overflow-x-hidden`)
- Column IDs: `boardColumn1`, `boardColumn2`, etc.

### Deal Cards on Board
Each card shows:
- Deal name (bold, clickable link to `/deals/{id}`)
- Activity count badge (e.g., "1 Activity")
- Amount (e.g., "$8,862.00")
- Expected close date (e.g., "March 6, 2026")

### Drag-and-Drop
Cards are draggable between columns to change stage. At the bottom of the screen, a fixed "dropper bar" appears with three drop zones:
- **Won** (green border-top, `border-success-500`) — marks deal as Won
- **Lost** (red border-top, `border-danger-500`) — marks deal as Lost
- **Delete** (dark border-top, `border-neutral-800`) — deletes deal

These droppers are `position: fixed` at the bottom, spanning the full width, each taking ~1/3 width on mobile or ~1/5 on desktop.

### Pipeline Stages (Demo Data)
1. Qualified To Buy
2. Contact Made
3. Presentation Scheduled
4. Proposal Made
5. Appointment Scheduled

---

## 16. ENTITY DETAIL PAGES & ASSOCIATIONS (Deep Dive)

### Navigation Pattern
Concord does NOT use SlideOver/Drawer panels for viewing records. Clicking a record name in any table navigates to a **full-page detail view** (e.g., `/contacts/1`, `/deals/1`, `/companies/1`). The page title in the top bar shows the record name in uppercase (e.g., "RUSSEL INC", "LESLIE MARVIN").

### Detail Page Layout (Two-Column)

**Left sidebar** (~280px, scrollable):
1. **Entity Header** — avatar/icon, name (H1), subtitle (e.g., job title + company for contacts), primary action button ("+ Add Deal" green btn), Owner selector dropdown, "Actions" dropdown
2. **Details section** — labeled fields (E-Mail, Phone, Source, etc.) with edit icon and "6 more fields" / "7 more fields" toggle to expand additional fields. Fields display inline with the label on the left and value on the right.
3. **Association sections** — one per related entity type, each with:
   - Section header: entity type + count + "+" button (e.g., "Deals (1) +", "Companies (1) +")
   - List of linked records with key info (deal name, stage badge, amount for deals; company name + domain link for companies)
   - Each linked record has a "View" button
   - "+" button opens an inline search/select popover to add new associations
4. **Attachments section** — file upload area

**Right content area** (flexible width):
1. **Tab bar**: All | Activities {n} | Emails {n} | Documents {n} | Calls {n} | Notes {n}
   - Each tab shows a count badge
   - Tabs use a horizontal scrolling snap layout
2. **Filter bar**: "Filter by: All" dropdown
3. **Activity Timeline** — chronological list of all events:
   - Each entry: timestamp + description + "Pin on top" link
   - Activity types: Document Created, Admin associated [Contact], Admin associated [Company], New call has been logged, Notes, etc.
   - Expandable content: "Show Less" / "Show More" for long text
   - "Add comment" link on timeline entries
   - Document cards inline: showing Draft/Sent status, amount, "Edit" / "Send Document" buttons
   - Call entries: show outcome badge (e.g., "Moved conversation forward") + "Associated with N records" link

### Contact Detail Specifics
- Header: Avatar (circle, ~60px), Full Name (H1), Job Title + "at" + Company Name (subtitle)
- Details sidebar: E-Mail Address (clickable), Phone (with country prefix), Source
- Associations: Deals (with stage badge + amount), Companies (with domain link)
- Primary action: "+ Add Deal" green button

### Deal Detail Specifics
- Header: Deal Name (H1), beneath it: "0 products" link, "Sales Pipeline > Presentation Scheduled" breadcrumb button
- **Pipeline stage progress bar**: Horizontal bar with all stage names as clickable links, current stage highlighted. Stages: Qualified To Buy → Contact Made → Presentation Scheduled → Proposal Made → Appointment Scheduled
- Quick status buttons: "Won" (green) and "Lost" (red) buttons next to the stage bar
- Details sidebar: Amount ($8,000.00), Expected Close Date
- Associations: Contacts (with avatar + name link), Companies

### Company Detail Specifics
- Header: Company Name (H1), domain link (e.g., "graham.info" with external link icon)
- Details sidebar: Domain Name, E-Mail Address, Phone
- Associations: Deals (with stage badge + amount), Contacts (with job title)

### How Associations Are Added
1. Click the "+" button next to the association section header (e.g., "Deals (1) +")
2. An inline search popover appears — type to search existing records
3. Select a record to link it, OR click "+ Create [Entity]" at the bottom to create-and-link in one step
4. Association appears immediately in the sidebar list

### How Associations Are Removed
- Each linked record in the association list has a "View" button and presumably an unlink action (via "..." menu or similar)

---

## 17. DATA TABLE FEATURES (Deep Dive)

### Table Structure
- Standard HTML `<table>` with `<thead>` and `<tbody>`
- First column (entity name) is "sticky" with a left border shadow effect (`shadow-[1px_0px_10px]`) — stays fixed while horizontally scrolling
- Row count displayed below table (e.g., "30 contacts")

### Column Headers
- Clickable for sort (ascending/descending toggle)
- Column reordering likely supported (not confirmed via Playwright)

### Cell Behavior
- Each cell has a hover-revealed action button (`hidden group-hover/td:block`) positioned absolutely at the right edge of the cell — this appears to be an inline edit trigger (pencil icon or similar)
- Entity name cells contain clickable links that navigate to the full detail page
- Email and phone cells display the value as plain text with the hover-edit button

### Row Actions ("..." Menu)
Three-dot menu appears on each row in the last column. Actions found:
- **Create Email** — compose email to the contact/company
- **Copy** — duplicate the record
- **Open In App** — open full detail page

### Bulk Selection & Actions
1. **Checkbox column**: Leftmost column has checkboxes per row
2. **Select all**: Header checkbox selects all visible rows
3. **Selection indicator**: When rows are selected, a "Select Action (N records)" dropdown appears in the toolbar replacing the normal filter bar
4. **Bulk action dropdown options**:
   - **Bulk Edit** — edit fields across all selected records at once
   - **Delete** — delete all selected records

### Filtering System
- **Quick filter chips**: Dropdown buttons in the toolbar for common fields (Owner, Tags, Created At, etc.)
- **"Advanced Filters" button**: Opens a complex filter builder for creating compound queries
- Filters affect both the table data and the mini charts above

### Pagination
- Bottom bar with: Previous/Next buttons, page number buttons
- Configurable rows per page (implied, not directly observed)

### Mini Charts Above Table
- Two small chart cards placed above the table, below the saved view tabs
- Left chart: trend line (e.g., "Contacts by day")
- Right chart: bar breakdown (e.g., "Contacts by source")
- Each chart has its own time range selector dropdown (e.g., "Last 7 Days", "Last 30 Days", "All")
- Charts are contextual: contacts page shows contact metrics, deals page shows deal metrics, etc.

### Saved Views Tab Bar
- Horizontal tab bar above the table
- Pre-built views: All [Entities], My [Entities], My Recently Assigned [Entities], [Entity-specific views like "Won Deals"]
- "+ Add View (N/5)" button — users can create up to 5 custom views per entity
- Each tab saves the current filter state, sort order, and column configuration
- Right-click or hover on tabs likely reveals edit/rename/delete options

---

## 18. CREATE/EDIT FORMS (Deep Dive)

### Create Forms — Side Panel Pattern
New record creation uses a **slide-over side panel** (NOT a full page), appearing from the right edge of the screen. This was observed for Create Deal and Create Contact forms.

Panel characteristics:
- Overlays the current page with a semi-transparent backdrop
- ~480px wide on desktop
- Header with entity type title + Cancel/Create buttons
- Scrollable form body
- Form fields stacked vertically with labels above inputs

### Create Deal Form Fields
- Deal Name (required, text input)
- Pipeline (required, searchable select — e.g., "Sales Pipeline")
- Stage (required, searchable select — options change based on selected pipeline)
- Amount (currency input with "$" prefix)
- "+ Add products" link (opens product selector)
- Expected Close Date (date picker, pre-filled with a reasonable default)
- Tags (multi-select tag input)
- Owner (searchable select, defaults to current user)
- Contacts (type-to-search relationship field + "+ Create Contact" inline link)
- Companies (type-to-search relationship field + "+ Create Company" inline link)

### Create Contact Form Fields
- First Name (required, text input)
- Last Name (text input)
- E-Mail Address (email input)
- Phone (with type selector: Mobile/Work/Other + country prefix dropdown like "+1")
- "+ Add another" link for multiple phone numbers
- Tags (multi-select)
- Owner (searchable select, default: current user)
- Source (searchable select)
- Companies (type-to-search + "+ Create Company")
- Deals (type-to-search + "+ Create Deal")

### Edit Pattern — Inline on Detail Page
Editing existing records does NOT use a separate form/modal. Instead, fields on the detail page are **editable inline**:
- Click a field value → it becomes an editable input
- "6 more fields" / "7 more fields" expander reveals additional editable fields
- The "Actions" dropdown in the header provides additional operations (delete, etc.)

### Relationship Fields in Forms
The type-to-search association fields in create forms work as:
1. Empty input with placeholder text
2. User types → dropdown appears with matching records
3. Select to link, OR click "+ Create [Entity]" at bottom of dropdown
4. "+ Create" opens a nested create form (likely a mini modal) to create-and-link in one step
5. Multiple selections allowed (for many-to-many relationships like Contacts ↔ Companies)

---

## 19. GLOBAL UI COMPONENTS SUMMARY

### Top Header Bar
- Fixed top bar with: Page title (uppercase), Search (Ctrl+K), Dark/Light mode toggle, Notification bell, Quick "+" create button, Primary action button (e.g., "+ Create Deal")
- View mode toggles (Table/Board icons) appear for Deals page

### Sidebar Navigation
- Fixed left sidebar (~200px)
- User avatar + name + email at top (dropdown for account settings)
- Navigation items with icons: Deals, Activities, Inbox, Documents, Contacts, Companies, Insights, Products, Calls, Settings
- Footer: "Today's Activities (6)" with orange indicator, "Open Deals (45)" with blue indicator

### Global Resource Search Sidebar (Right Panel)
- Triggered by a search action (possibly from the global search)
- Lists all entity types with counts: Activities, Companies, Contacts, Deals, Documents, Email Messages, Products
- Each entry is a button to filter search results by type
- Shows "All Resources" total

### Badge/Status System
- Color-coded badges for statuses: Draft (gray), Proposal (green), Open (blue), Won (green), Lost (red)
- Activity type icons with colors: Meeting, Call, Email, Task
- Boolean indicators: green dot for "active" fields
- Stage badges in association lists (e.g., "Presentation Scheduled" badge next to a deal in a contact's sidebar)
