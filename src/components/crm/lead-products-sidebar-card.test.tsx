import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LeadProductsSidebarCard, LeadProductsDialogBody } from "./lead-products-sidebar-card";

describe("LeadProductsSidebarCard", () => {
  it("renders an add-product entry point in the empty state", () => {
    const markup = renderToStaticMarkup(
      <LeadProductsSidebarCard
        title="Products"
        emptyText="No linked products."
        totalLabel="Total"
        addLabel="Add product"
        products={[]}
        onAddProduct={() => {}}
        onRemoveProduct={() => {}}
      />,
    );

    expect(markup).toContain("Add product");
    expect(markup).toContain("No linked products.");
  });

  it("renders the product dialog body with a 3-character search hint", () => {
    const markup = renderToStaticMarkup(
      <LeadProductsDialogBody
        searchValue="ab"
        onSearchChange={() => {}}
        searchResults={[]}
        isSearching={false}
        selectedProductId={null}
        selectedProduct={null}
        onSelectProduct={() => {}}
        quantity="1"
        onQuantityChange={() => {}}
        unitPrice=""
        onUnitPriceChange={() => {}}
        discount=""
        onDiscountChange={() => {}}
        searchPlaceholder="Search products"
        searchLoadingLabel="Searching..."
        noResultsLabel="No results"
        minimumSearchLabel="Min. 3 znaki"
        quantityLabel="Quantity"
        unitPriceLabel="Unit price"
        discountLabel="Discount"
        formatCurrency={(value) => `${value} PLN`}
      />,
    );

    expect(markup).toContain("Search products");
    expect(markup).toContain("Min. 3 znaki");
    expect(markup).toContain("Quantity");
  });

  it("renders search results and selected product summary inside the dialog body", () => {
    const markup = renderToStaticMarkup(
      <LeadProductsDialogBody
        searchValue="prod"
        onSearchChange={() => {}}
        searchResults={[{ _id: "prod_1", name: "Produkt katalogowy", unitPrice: 123 }]}
        isSearching={false}
        selectedProductId="prod_1"
        selectedProduct={{ _id: "prod_1", name: "Produkt katalogowy", unitPrice: 123 }}
        onSelectProduct={() => {}}
        quantity="2"
        onQuantityChange={() => {}}
        unitPrice="123"
        onUnitPriceChange={() => {}}
        discount=""
        onDiscountChange={() => {}}
        searchPlaceholder="Search products"
        searchLoadingLabel="Searching..."
        noResultsLabel="No results"
        minimumSearchLabel="Min. 3 znaki"
        quantityLabel="Quantity"
        unitPriceLabel="Unit price"
        discountLabel="Discount"
        formatCurrency={(value) => `${value} PLN`}
      />,
    );

    expect(markup).toContain("Produkt katalogowy");
    expect(markup).toContain("123 PLN");
    expect(markup).toContain("Quantity");
  });
});
