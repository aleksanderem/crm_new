import { action, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { createSupabaseDb } from "../_helpers/supabaseDb";
import { resolveComponentsInContent } from "./resolveComponents";
import {
  componentCategoryValidator,
} from "../schema/documents";

// Dual-write refs removed — Supabase is now primary for component writes

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * List all components available to the current user:
 * system-scope + org-scope + user-scope (filtered by createdBy).
 */
export const list = action({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<Array<Record<string, unknown>>> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const db = createSupabaseDb();
    const orgIdStr = String(args.organizationId);
    const userIdStr = String(authResult.userId);

    const [system, org] = await Promise.all([
      db.query("documentComponents").eq("scope", "system").collect(),
      db.query("documentComponents").eq("organizationId", orgIdStr).collect(),
    ]);

    const orgScoped = (org as any[]).filter((c) => c.scope === "org" && c.isActive);
    const userScoped = (org as any[]).filter(
      (c) => c.scope === "user" && String(c.createdBy) === userIdStr && c.isActive,
    );

    return [
      ...(system as any[]).filter((c) => c.isActive),
      ...orgScoped,
      ...userScoped,
    ] as Array<Record<string, unknown>>;
  },
});

export const getById = action({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.string(),
  },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const db = createSupabaseDb();
    const comp = await db.get("documentComponents", args.componentId);
    if (!comp) throw new Error("Component not found");

    if (comp.scope === "org" && String(comp.organizationId) !== String(args.organizationId)) {
      throw new Error("Component not found");
    }
    if (comp.scope === "user" && String(comp.createdBy) !== String(authResult.userId)) {
      throw new Error("Component not found");
    }
    return comp;
  },
});

/**
 * Lightweight query returning just contentJson for a component.
 */
export const getContent = action({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.string(),
  },
  handler: async (ctx, args): Promise<{
    contentJson: string;
    version: number;
    name: string;
    category: string;
    protected: boolean;
    positionConstraint: string | null;
  } | null> => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const db = createSupabaseDb();
    const comp = await db.get("documentComponents", args.componentId);
    if (!comp) return null;

    if (comp.scope === "org" && String(comp.organizationId) !== String(args.organizationId)) {
      return null;
    }
    if (comp.scope === "user" && String(comp.createdBy) !== String(authResult.userId)) {
      return null;
    }
    return {
      contentJson: comp.contentJson as string,
      version: (comp.version as number) ?? 1,
      name: comp.name as string,
      category: comp.category as string,
      protected: Boolean(comp.protected),
      positionConstraint: (comp.positionConstraint as string | null) ?? null,
    };
  },
});

/**
 * Resolve componentBlock nodes inside an arbitrary TipTap contentJson string.
 * Returns the contentJson with each componentBlock replaced by the referenced
 * component's actual nodes. Used by render-time contexts that hold contentJson
 * in memory (template editor preview, document viewer fallback) and need
 * resolved content before calling generateHTML — otherwise componentBlock's
 * renderHTML emits the literal placeholder "[Komponent: <id>]" (#1915).
 */
export const resolveContentJson = action({
  args: {
    organizationId: v.id("organizations"),
    contentJson: v.string(),
  },
  handler: async (ctx, args): Promise<string> => {
    await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    const db = createSupabaseDb();
    const resolved = await resolveComponentsInContent(db, args.contentJson);
    return resolved ?? args.contentJson;
  },
});

// ── Actions (Supabase-primary) ─────────────────────────────────────────────

export const create = action({
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
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );
    // Org-scoped components require admin
    if (args.scope === "org") {
      if (authResult.role !== "owner" && authResult.role !== "admin") {
        throw new Error("Admin access required");
      }
    }

    const now = Date.now();
    const db = createSupabaseDb();

    const componentId = await db.insert("documentComponents", {
      organizationId: String(args.organizationId),
      scope: args.scope,
      createdBy: String(authResult.userId),
      name: args.name,
      description: args.description ?? null,
      category: args.category,
      contentJson: args.contentJson,
      protected: false,
      positionConstraint: args.positionConstraint ?? null,
      version: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return componentId;
  },
});

export const update = action({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.string(),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(componentCategoryValidator),
    contentJson: v.optional(v.string()),
    positionConstraint: v.optional(
      v.union(v.literal("start"), v.literal("end")),
    ),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const comp = await db.get("documentComponents", args.componentId);
    if (!comp) throw new Error("Component not found");

    if (comp.scope === "system") {
      throw new Error("Cannot edit system components");
    }
    if (comp.scope === "org") {
      if (authResult.role !== "owner" && authResult.role !== "admin") {
        throw new Error("Admin access required");
      }
      if (String(comp.organizationId) !== String(args.organizationId)) {
        throw new Error("Component not found");
      }
    }
    if (comp.scope === "user" && String(comp.createdBy) !== String(authResult.userId)) {
      throw new Error("Cannot edit another user's component");
    }

    const { organizationId: _orgId, componentId, ...updates } = args;
    const contentChanged =
      updates.contentJson && updates.contentJson !== comp.contentJson;
    const newVersion = contentChanged ? (comp.version as number ?? 1) + 1 : (comp.version as number ?? 1);

    await db.patch("documentComponents", componentId, {
      ...updates,
      version: newVersion,
      updatedAt: Date.now(),
    });
    return componentId;
  },
});

export const remove = action({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.string(),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const comp = await db.get("documentComponents", args.componentId);
    if (!comp) throw new Error("Component not found");

    if (comp.scope === "system") {
      throw new Error("Cannot delete system components");
    }
    if (comp.protected) {
      throw new Error("Cannot delete protected components");
    }
    if (comp.scope === "org") {
      if (authResult.role !== "owner" && authResult.role !== "admin") {
        throw new Error("Admin access required");
      }
    }
    if (comp.scope === "user" && String(comp.createdBy) !== String(authResult.userId)) {
      throw new Error("Cannot delete another user's component");
    }

    await db.patch("documentComponents", args.componentId, {
      isActive: false,
      updatedAt: Date.now(),
    });
  },
});

export const duplicate = action({
  args: {
    organizationId: v.id("organizations"),
    componentId: v.string(),
    scope: v.optional(v.union(v.literal("org"), v.literal("user"))),
  },
  handler: async (ctx, args) => {
    const authResult = await ctx.runQuery(
      internal._helpers.authAction.verifyOrgAccess,
      { organizationId: args.organizationId },
    );

    const db = createSupabaseDb();
    const source = await db.get("documentComponents", args.componentId);
    if (!source) throw new Error("Component not found");

    const targetScope = args.scope ?? (source.scope === "system" ? "org" : source.scope as string);
    if (targetScope === "org") {
      if (authResult.role !== "owner" && authResult.role !== "admin") {
        throw new Error("Admin access required");
      }
    }

    const now = Date.now();
    const newId = await db.insert("documentComponents", {
      organizationId: String(args.organizationId),
      scope: targetScope,
      createdBy: String(authResult.userId),
      name: `${source.name} (Kopia)`,
      description: source.description ?? null,
      category: source.category,
      contentJson: source.contentJson,
      protected: false,
      positionConstraint: source.positionConstraint ?? null,
      version: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    // Auto-relink: when copying a system component to org, update templates
    if (source.scope === "system") {
      try {
        await ctx.runMutation(internal.documents.components._relinkTemplateComponents, {
          organizationId: args.organizationId,
          oldComponentId: args.componentId,
          newComponentId: newId,
        });
      } catch (e) {
        console.error("[components.duplicate] Relink side effects FAILED:", e);
      }
    }

    return newId;
  },
});

export const _relinkTemplateComponents = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    oldComponentId: v.string(),
    newComponentId: v.string(),
  },
  handler: async (ctx, args) => {
    const templates = await ctx.db
      .query("formTemplates")
      .withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    const oldIdStr = args.oldComponentId;
    const newIdStr = args.newComponentId;

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
  },
});

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
