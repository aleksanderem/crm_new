import { ChevronsUpDown, CircleCheckIcon, MapPin } from "@/lib/ez-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveLocation } from "@/contexts/gabinet-location-context";

export function GabinetLocationSwitcher() {
  const { locations, activeLocationId, setActiveLocationId, isLoading } = useActiveLocation();

  if (isLoading || locations.length === 0) return null;

  const current = locations.find((l) => l._id === activeLocationId) ?? locations[0];

  if (locations.length === 1) {
    return (
      <div className="bg-secondary flex w-full items-center gap-2.5 rounded-lg px-3 py-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MapPin className="size-3.5" variant="stroke" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col leading-none">
          <span className="text-muted-foreground text-[10px]">Lokalizacja</span>
          <span className="truncate text-xs font-medium">{current.name}</span>
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="bg-secondary flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left outline-none">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <MapPin className="size-3.5" variant="stroke" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col leading-none">
          <span className="text-muted-foreground text-[10px]">Lokalizacja</span>
          <span className="truncate text-xs font-medium">{current.name}</span>
        </div>
        <ChevronsUpDown className="text-muted-foreground ml-auto size-3.5 shrink-0" variant="stroke" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {locations.map((location) => (
          <DropdownMenuItem
            key={location._id}
            onClick={() => setActiveLocationId(location._id)}
          >
            <span className="flex-1 truncate">{location.name}</span>
            {location._id === activeLocationId && (
              <CircleCheckIcon className="text-primary ml-2 size-4 shrink-0" variant="stroke" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
