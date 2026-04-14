import { query, mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { v, type GenericId } from "convex/values";
import { verifyOrgAccess, requireOrgAdmin } from "../_helpers/auth";
import {
  componentCategoryValidator,
} from "../schema/documents";

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * List all components available to the current user:
 * system-scope + org-scope + user-scope (filtered by createdBy).
 */
export const list = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);

    // System components (no orgId)
    const system = await ctx.db
      .query("documentComponents")
      .withIndex("by_scope", (q) => q.eq("scope", "system"))
      .collect();

    // Org components
    const org = await ctx.db
      .query("documentComponents")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Filter org-scope and user-scope from the org query
    const orgScoped = org.filter((c) => c.scope === "org" && c.isActive);
    const userScoped = org.filter(
      (c) => c.scope === "user" && c.createdBy === user._id && c.isActive,
    );

    return [
      ...system.filter((c) => c.isActive),
      ...orgScoped,
      ...userScoped,
    ];
  },
});

export const getById = query({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.id("documentComponents"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const comp = await ctx.db.get(args.componentId);
    if (!comp) throw new Error("Component not found");

    // Access check: system components are always accessible,
    // org components need matching orgId, user components need matching creator
    if (comp.scope === "org" && comp.organizationId !== args.organizationId) {
      throw new Error("Component not found");
    }
    if (comp.scope === "user" && comp.createdBy !== user._id) {
      throw new Error("Component not found");
    }
    return comp;
  },
});

/**
 * Lightweight query returning just contentJson for a component.
 * Used by the ComponentBlock node for live rendering in the editor.
 */
export const getContent = query({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.id("documentComponents"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const comp = await ctx.db.get(args.componentId);
    if (!comp) return null;

    if (comp.scope === "org" && comp.organizationId !== args.organizationId) {
      return null;
    }
    if (comp.scope === "user" && comp.createdBy !== user._id) {
      return null;
    }
    return {
      contentJson: comp.contentJson,
      version: comp.version,
      name: comp.name,
      category: comp.category,
      protected: comp.protected,
      positionConstraint: comp.positionConstraint,
    };
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    scope: v.union(v.literal("org"), v.literal("user")),
    name: v.string(),
    description: v.optional(v.string()),
    category: componentCategoryValidator,
    contentJson: v.string(),
    positionConstraint: v.optional(
      v.union(v.literal("start"), v.literal("end")),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = args.scope === "org"
      ? await requireOrgAdmin(ctx, args.organizationId)
      : await verifyOrgAccess(ctx, args.organizationId);

    const now = Date.now();
    return await ctx.db.insert("documentComponents", {
      organizationId: args.organizationId,
      scope: args.scope,
      createdBy: user._id,
      name: args.name,
      description: args.description,
      category: args.category,
      contentJson: args.contentJson,
      protected: false,
      positionConstraint: args.positionConstraint,
      version: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.id("documentComponents"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(componentCategoryValidator),
    contentJson: v.optional(v.string()),
    positionConstraint: v.optional(
      v.union(v.literal("start"), v.literal("end")),
    ),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const comp = await ctx.db.get(args.componentId);
    if (!comp) throw new Error("Component not found");

    // Cannot edit system components
    if (comp.scope === "system") {
      throw new Error("Cannot edit system components");
    }
    // Org components require admin
    if (comp.scope === "org") {
      await requireOrgAdmin(ctx, args.organizationId);
      if (comp.organizationId !== args.organizationId) {
        throw new Error("Component not found");
      }
    }
    // User components require matching creator
    if (comp.scope === "user" && comp.createdBy !== user._id) {
      throw new Error("Cannot edit another user's component");
    }

    const { organizationId: _orgId, componentId, ...updates } = args;
    const contentChanged =
      updates.contentJson && updates.contentJson !== comp.contentJson;
    const newVersion = contentChanged ? comp.version + 1 : comp.version;

    await ctx.db.patch(componentId, {
      ...updates,
      version: newVersion,
      updatedAt: Date.now(),
    });
    return componentId;
  },
});

export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.id("documentComponents"),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const comp = await ctx.db.get(args.componentId);
    if (!comp) throw new Error("Component not found");

    if (comp.scope === "system") {
      throw new Error("Cannot delete system components");
    }
    if (comp.protected) {
      throw new Error("Cannot delete protected components");
    }
    if (comp.scope === "org") {
      await requireOrgAdmin(ctx, args.organizationId);
    }
    if (comp.scope === "user" && comp.createdBy !== user._id) {
      throw new Error("Cannot delete another user's component");
    }

    await ctx.db.patch(args.componentId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

export const duplicate = mutation({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.id("documentComponents"),
    scope: v.optional(v.union(v.literal("org"), v.literal("user"))),
  },
  handler: async (ctx, args) => {
    const { user } = await verifyOrgAccess(ctx, args.organizationId);
    const source = await ctx.db.get(args.componentId);
    if (!source) throw new Error("Component not found");

    const targetScope = args.scope ?? (source.scope === "system" ? "org" : source.scope);
    if (targetScope === "org") {
      await requireOrgAdmin(ctx, args.organizationId);
    }

    const now = Date.now();
    const newId = await ctx.db.insert("documentComponents", {
      organizationId: args.organizationId,
      scope: targetScope as "org" | "user",
      createdBy: user._id,
      name: `${source.name} (Kopia)`,
      description: source.description,
      category: source.category,
      contentJson: source.contentJson,
      protected: false,
      positionConstraint: source.positionConstraint,
      version: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Auto-relink: when copying a system component to org, update all
    // org templates that reference the source component to point to the copy.
    if (source.scope === "system") {
      await relinkTemplateComponents(
        ctx,
        args.organizationId,
        args.componentId,
        newId,
      );
    }

    return newId;
  },
});

/**
 * Scan all org templates and replace componentBlock references
 * from `oldComponentId` to `newComponentId`.
 */
async function relinkTemplateComponents(
  ctx: MutationCtx,
  organizationId: GenericId<"organizations">,
  oldComponentId: GenericId<"documentComponents">,
  newComponentId: GenericId<"documentComponents">,
) {
  const templates = await ctx.db
    .query("formTemplates")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .collect();

  const oldIdStr = oldComponentId as string;
  const newIdStr = newComponentId as string;

  for (const tmpl of templates) {
    if (!tmpl.contentJson || !tmpl.contentJson.includes(oldIdStr)) continue;

    try {
      const doc = JSON.parse(tmpl.contentJson);
      let changed = false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function walkAndReplace(node: any) {
        if (!node) return;
        if (node.type === "componentBlock" && node.attrs?.componentId === oldIdStr) {
          node.attrs.componentId = newIdStr;
          node.attrs.componentVersion = 1;
          changed = true;
        }
        if (Array.isArray(node.content)) {
          for (const child of node.content) walkAndReplace(child);
        }
      }

      walkAndReplace(doc);

      if (changed) {
        await ctx.db.patch(tmpl._id, {
          contentJson: JSON.stringify(doc),
          updatedAt: Date.now(),
        });
      }
    } catch {
      // Malformed JSON — skip
    }
  }
}

// ── Internal: Seed system components ─────────────────────────────────────────

export const seedSystemComponents = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Check if system components already exist
    const existing = await ctx.db
      .query("documentComponents")
      .withIndex("by_scope", (q) => q.eq("scope", "system"))
      .collect();
    if (existing.length > 0) {
      return { skipped: true, count: 0, message: "System components already seeded" };
    }

    const now = Date.now();
    const components = buildSystemComponents();
    let count = 0;
    for (const comp of components) {
      await ctx.db.insert("documentComponents", {
        ...comp,
        createdBy: args.userId,
        createdAt: now,
        updatedAt: now,
      });
      count++;
    }
    return { skipped: false, count, message: `Seeded ${count} system components` };
  },
});

// ---------------------------------------------------------------------------
// System component definitions
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

const txt = (text: string, marks?: Array<{ type: string }>): any =>
  ({ type: "text", text, ...(marks?.length ? { marks } : {}) });
const bold = (text: string): any => txt(text, [{ type: "bold" }]);
const italic = (text: string): any => txt(text, [{ type: "italic" }]);
const p = (...content: any[]): any =>
  ({ type: "paragraph", ...(content.length ? { content } : {}) });
const pCenter = (...content: any[]): any =>
  ({ type: "paragraph", attrs: { textAlign: "center" }, ...(content.length ? { content } : {}) });
const h3 = (text: string): any => ({
  type: "heading", attrs: { level: 3 }, content: [{ type: "text", text }],
});
const mention = (path: string): any => ({
  type: "variableMentionCurly", attrs: { id: path, label: path },
});
const hr = (): any => ({ type: "horizontalRule" });

/* eslint-enable @typescript-eslint/no-explicit-any */

export type SystemComponent = {
  scope: "system";
  organizationId: undefined;
  name: string;
  description: string;
  category: "header" | "footer" | "patient_data" | "treatment_data" | "signature" | "table" | "legal" | "custom";
  contentJson: string;
  protected: boolean;
  positionConstraint?: "start" | "end";
  version: number;
  isActive: boolean;
};

export function buildSystemComponents(): SystemComponent[] {
  return [
    // 1. Header
    {
      scope: "system",
      organizationId: undefined,
      name: "Nagłówek dokumentu",
      description: "Standardowy nagłówek z nazwą organizacji i linią separatora",
      category: "header",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          pCenter(mention("organization.name")),
          pCenter(italic("Salon kosmetyczny")),
          hr(),
          p(),
        ],
      }),
      protected: false,
      positionConstraint: "start",
      version: 1,
      isActive: true,
    },
    // 2. Patient Data Block
    {
      scope: "system",
      organizationId: undefined,
      name: "Dane pacjenta",
      description: "Blok z danymi klienta/pacjenta: imię, nazwisko, PESEL, data urodzenia, telefon, adres",
      category: "patient_data",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          h3("Dane klienta"),
          p(bold("Imię i nazwisko: "), mention("patient.firstName"), txt(" "), mention("patient.lastName")),
          p(bold("PESEL: "), mention("patient.pesel")),
          p(bold("Data urodzenia: "), mention("patient.dateOfBirth")),
          p(bold("Telefon: "), mention("patient.phone")),
          p(bold("Adres: "), mention("patient.address.street"), txt(", "), mention("patient.address.postalCode"), txt(" "), mention("patient.address.city")),
          p(),
        ],
      }),
      protected: false,
      version: 1,
      isActive: true,
    },
    // 3. Treatment Data Block
    {
      scope: "system",
      organizationId: undefined,
      name: "Dane zabiegu",
      description: "Blok z informacjami o zabiegu: nazwa, opis, czas trwania, cena, data wizyty, specjalista",
      category: "treatment_data",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          h3("Dane zabiegu"),
          p(bold("Nazwa zabiegu: "), mention("treatment.name")),
          p(bold("Opis: "), mention("treatment.description")),
          p(bold("Czas trwania: "), mention("treatment.duration"), txt(" min")),
          p(bold("Cena: "), mention("treatment.price"), txt(" PLN")),
          p(bold("Data wizyty: "), mention("appointment.date"), txt(", godz. "), mention("appointment.startTime")),
          p(bold("Specjalista: "), mention("employee.firstName"), txt(" "), mention("employee.lastName"), txt(" — "), mention("employee.specialization")),
          p(),
        ],
      }),
      protected: false,
      version: 1,
      isActive: true,
    },
    // 4. Dual Signature Block
    {
      scope: "system",
      organizationId: undefined,
      name: "Podpis — klient i specjalista",
      description: "Blok z dwoma liniami podpisu: klient i osoba wykonująca",
      category: "signature",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          p(),
          hr(),
          p(bold("Miejscowość i data: "), mention("patient.address.city"), txt(", "), mention("system.date_pl")),
          p(),
          p(),
          p(txt("........................................          ........................................")),
          p(txt("         Podpis klienta                                    Podpis osoby wykonującej")),
        ],
      }),
      protected: false,
      version: 1,
      isActive: true,
    },
    // 5. Client Signature Block
    {
      scope: "system",
      organizationId: undefined,
      name: "Podpis — klient",
      description: "Blok z jedną linią podpisu klienta",
      category: "signature",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          p(),
          hr(),
          p(bold("Miejscowość i data: "), mention("patient.address.city"), txt(", "), mention("system.date_pl")),
          p(),
          p(),
          p(txt("........................................")),
          p(txt("         Podpis klienta")),
        ],
      }),
      protected: false,
      version: 1,
      isActive: true,
    },
    // 6. QUERA Footer (protected)
    {
      scope: "system",
      organizationId: undefined,
      name: "Stopka QUERA",
      description: "Chroniona stopka platformy QUERA — automatycznie dodawana na końcu każdego dokumentu",
      category: "footer",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          hr(),
          pCenter(
            txt("Dokument wygenerowany w systemie ", [{ type: "italic" }]),
            bold("QUERA"),
            txt(" — ", [{ type: "italic" }]),
            italic("platforma zarządzania gabinetem"),
          ),
        ],
      }),
      protected: true,
      positionConstraint: "end",
      version: 1,
      isActive: true,
    },
    // 7. Form-style Data Table
    {
      scope: "system",
      organizationId: undefined,
      name: "Tabela danych (formularz)",
      description: "Tabela klucz-wartość do prezentacji danych strukturalnych",
      category: "table",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  { type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [p(bold("Pole"))] },
                  { type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [p(bold("Wartość"))] },
                ],
              },
              {
                type: "tableRow",
                content: [
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(txt("Nazwa"))] },
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(txt("..."))] },
                ],
              },
              {
                type: "tableRow",
                content: [
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(txt("Wartość"))] },
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(txt("..."))] },
                ],
              },
            ],
          },
        ],
      }),
      protected: false,
      version: 1,
      isActive: true,
    },
    // 8. Report-style Data Table
    {
      scope: "system",
      organizationId: undefined,
      name: "Tabela danych (raport)",
      description: "Wielokolumnowa tabela z nagłówkami do listowania pozycji/usług/produktów",
      category: "table",
      contentJson: JSON.stringify({
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  { type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [p(bold("Lp."))] },
                  { type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [p(bold("Nazwa"))] },
                  { type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [p(bold("Ilość"))] },
                  { type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [p(bold("Cena"))] },
                  { type: "tableHeader", attrs: { colspan: 1, rowspan: 1 }, content: [p(bold("Suma"))] },
                ],
              },
              {
                type: "tableRow",
                content: [
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(txt("1"))] },
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(txt("..."))] },
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(txt("..."))] },
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(txt("..."))] },
                  { type: "tableCell", attrs: { colspan: 1, rowspan: 1 }, content: [p(txt("..."))] },
                ],
              },
            ],
          },
        ],
      }),
      protected: false,
      version: 1,
      isActive: true,
    },
  ];
}
