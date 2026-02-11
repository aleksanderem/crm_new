import { query } from "./_generated/server";
import { v } from "convex/values";

export const globalSearch = query({
  args: {
    organizationId: v.id("organizations"),
    query: v.string(),
  },
  handler: async (ctx, { organizationId, query: searchQuery }) => {
    if (!searchQuery.trim()) return [];

    const [contacts, companies, leads, documents, products] =
      await Promise.all([
        ctx.db
          .query("contacts")
          .withSearchIndex("search_contacts", (q) =>
            q.search("firstName", searchQuery).eq("organizationId", organizationId)
          )
          .take(5),
        ctx.db
          .query("companies")
          .withSearchIndex("search_companies", (q) =>
            q.search("name", searchQuery).eq("organizationId", organizationId)
          )
          .take(5),
        ctx.db
          .query("leads")
          .withSearchIndex("search_leads", (q) =>
            q.search("title", searchQuery).eq("organizationId", organizationId)
          )
          .take(5),
        ctx.db
          .query("documents")
          .withSearchIndex("search_documents", (q) =>
            q.search("name", searchQuery).eq("organizationId", organizationId)
          )
          .take(5),
        ctx.db
          .query("products")
          .withSearchIndex("search_products", (q) =>
            q.search("name", searchQuery).eq("organizationId", organizationId)
          )
          .take(5),
      ]);

    type SearchGroup = {
      type: string;
      results: {
        id: string;
        title: string;
        subtitle?: string;
        href: string;
      }[];
    };

    const groups: SearchGroup[] = [];

    if (contacts.length > 0) {
      groups.push({
        type: "contact",
        results: contacts.map((c) => ({
          id: c._id,
          title: [c.firstName, c.lastName].filter(Boolean).join(" "),
          subtitle: c.email ?? c.title ?? undefined,
          href: `/dashboard/contacts/${c._id}`,
        })),
      });
    }

    if (companies.length > 0) {
      groups.push({
        type: "company",
        results: companies.map((c) => ({
          id: c._id,
          title: c.name,
          subtitle: c.industry ?? c.domain ?? undefined,
          href: `/dashboard/companies/${c._id}`,
        })),
      });
    }

    if (leads.length > 0) {
      groups.push({
        type: "lead",
        results: leads.map((l) => ({
          id: l._id,
          title: l.title,
          subtitle: l.value
            ? `${l.status} \u00b7 ${l.value} PLN`
            : l.status,
          href: `/dashboard/leads/${l._id}`,
        })),
      });
    }

    if (documents.length > 0) {
      groups.push({
        type: "document",
        results: documents.map((d) => ({
          id: d._id,
          title: d.name,
          subtitle: d.status ?? undefined,
          href: `/dashboard/documents`,
        })),
      });
    }

    if (products.length > 0) {
      groups.push({
        type: "product",
        results: products.map((p) => ({
          id: p._id,
          title: p.name,
          subtitle: p.unitPrice ? `${p.unitPrice} PLN` : undefined,
          href: `/dashboard/products`,
        })),
      });
    }

    return groups;
  },
});
