import { useTranslation } from "react-i18next";
import { ClipboardList, ChevronDown, Download, ShoppingCart, Upload } from "@/lib/ez-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSidebarActions } from "@/components/layout/sidebar-context";

export function ProductsActionsDropdown() {
  const { t } = useTranslation();
  const { dispatch } = useSidebarActions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 text-xs max-sm:h-8 max-sm:gap-0 max-sm:px-2"
        >
          <span>{t("nav.actions.actionsMenu", "Akcje")}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52 p-2" side="top" align="end" sideOffset={8}>
        <DropdownMenuItem className="px-3 py-2.5 text-sm" onSelect={() => dispatch("openShoppingList")}>
          <ShoppingCart className="text-foreground size-5 shrink-0" />
          {t("nav.actions.openShoppingList", "Lista zakupowa")}
        </DropdownMenuItem>
        <DropdownMenuItem className="px-3 py-2.5 text-sm" onSelect={() => dispatch("openInventory")}>
          <ClipboardList className="text-foreground size-5 shrink-0" />
          {t("nav.actions.startInventory", "Inwentaryzacja")}
        </DropdownMenuItem>
        <DropdownMenuItem className="px-3 py-2.5 text-sm" onSelect={() => dispatch("importCsv")}>
          <Upload className="text-foreground size-5 shrink-0" />
          {t("nav.actions.importCsvProducts", "Dodaj produkty z pliku CSV")}
        </DropdownMenuItem>
        <DropdownMenuItem className="px-3 py-2.5 text-sm" onSelect={() => dispatch("exportCsv")}>
          <Download className="text-foreground size-5 shrink-0" />
          {t("nav.actions.exportCsvProducts", "Pobierz produkty do pliku CSV")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
