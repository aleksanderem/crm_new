import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useImpersonation } from "@/components/impersonation-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatActionError } from "@/lib/format-action-error";

export const Route = createFileRoute("/_app/_auth/admin/organizations/$orgId")({
  component: AdminOrganizationDetail,
});

function AdminOrganizationDetail() {
  const { orgId } = Route.useParams();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { startImpersonation } = useImpersonation();

  // Admin gate
  const getIsPlatformAdmin = useAction(api.app.getIsPlatformAdmin);
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["isPlatformAdmin"],
    queryFn: () => getIsPlatformAdmin({}),
  });

  // Detail query
  const detailAction = useAction(api.admin.organizations.getOrganizationDetail);
  const detailQuery = useQuery({
    queryKey: ["admin", "organizations", orgId],
    queryFn: () => detailAction({ organizationId: orgId }),
    enabled: Boolean(adminStatus?.isPlatformAdmin),
  });

  // Profile form state
  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileWebsite, setProfileWebsite] = useState<string | null>(null);
  const [profileOwnerId, setProfileOwnerId] = useState<string | null>(null);

  // Seat override form state
  const [seatOverrideInput, setSeatOverrideInput] = useState<string | null>(null);

  // Suspend dialog state
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  const detail = detailQuery.data;

  // Mutations
  const updateProfileAction = useAction(api.admin.organizations.updateOrganizationProfile);
  const profileMutation = useMutation({
    mutationFn: updateProfileAction,
    onSuccess: () => {
      toast.success("Profil organizacji zaktualizowany");
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      setProfileName(null);
      setProfileWebsite(null);
      setProfileOwnerId(null);
    },
    onError: (e) =>
      toast.error(
        formatActionError(e, t, {
          key: "admin.organizations.errors.profileUpdateFailed",
          defaultValue: "Nie udało się zaktualizować profilu organizacji.",
        }),
      ),
  });

  const setStatusAction = useAction(api.admin.organizations.setOrganizationStatus);
  const statusMutation = useMutation({
    mutationFn: setStatusAction,
    onSuccess: () => {
      toast.success("Status organizacji zaktualizowany");
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations", orgId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
      setSuspendOpen(false);
      setSuspendReason("");
    },
    onError: (e) =>
      toast.error(
        formatActionError(e, t, {
          key: "admin.organizations.errors.statusUpdateFailed",
          defaultValue: "Nie udało się zaktualizować statusu organizacji.",
        }),
      ),
  });

  const mintImpersonationAction = useAction(api.supabase.jwt.mintImpersonationToken);
  const [impersonating, setImpersonating] = useState(false);

  const setSeatOverrideAction = useAction(api.admin.organizations.setSeatLimitOverride);
  const seatMutation = useMutation({
    mutationFn: setSeatOverrideAction,
    onSuccess: () => {
      toast.success("Limit miejsc zaktualizowany");
      queryClient.invalidateQueries({ queryKey: ["admin", "organizations", orgId] });
      setSeatOverrideInput(null);
    },
    onError: (e) =>
      toast.error(
        formatActionError(e, t, {
          key: "admin.organizations.errors.seatOverrideFailed",
          defaultValue: "Nie udało się zaktualizować limitu miejsc.",
        }),
      ),
  });

  if (adminLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!adminStatus?.isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>403 — Platform admin required</CardTitle>
            <CardDescription>
              This page is only accessible to platform administrators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/admin" className="text-sm underline">
              Back to admin
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Ładowanie…</div>;
  }

  if (!detail) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Card>
          <CardHeader>
            <CardTitle>Nie znaleziono organizacji</CardTitle>
          </CardHeader>
          <CardContent>
            <Link to="/admin/organizations" className="text-sm underline">
              Wróć do listy organizacji
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Resolved values: use local state if user started editing, else detail
  const currentName = profileName ?? detail.name;
  const currentWebsite = profileWebsite ?? (detail.website ?? "");
  const currentOwnerId = profileOwnerId ?? detail.ownerId;
  const currentSeatOverride =
    seatOverrideInput !== null
      ? seatOverrideInput
      : detail.seatLimitOverride !== null
        ? String(detail.seatLimitOverride)
        : "";

  function handleProfileSave() {
    const updates: {
      organizationId: string;
      name?: string;
      website?: string;
      ownerId?: string;
    } = { organizationId: orgId };
    if (profileName !== null && profileName !== detail!.name) updates.name = profileName;
    if (profileWebsite !== null && profileWebsite !== (detail!.website ?? ""))
      updates.website = profileWebsite;
    if (profileOwnerId !== null && profileOwnerId !== detail!.ownerId)
      updates.ownerId = profileOwnerId;

    profileMutation.mutate(updates as Parameters<typeof updateProfileAction>[0]);
  }

  function handleSeatSave() {
    const value = currentSeatOverride.trim();
    seatMutation.mutate({
      organizationId: orgId,
      seatLimit: value === "" ? null : Number(value),
    });
  }

  function handleSuspend() {
    statusMutation.mutate({
      organizationId: orgId,
      status: "suspended",
      reason: suspendReason.trim() || undefined,
    });
  }

  function handleReactivate() {
    statusMutation.mutate({ organizationId: orgId, status: "active" });
  }

  async function handleEnterAs() {
    if (!detail) return;
    setImpersonating(true);
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore -- TS2589: type instantiation depth in generated api types
      const result = await mintImpersonationAction({ organizationId: orgId });
      startImpersonation({ token: result.token, orgId, orgName: detail.name });
      toast.success(`Podgląd jako ${detail.name} — tryb tylko-do-odczytu`);
      void navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Nie udało się uruchomić podglądu.",
      );
    } finally {
      setImpersonating(false);
    }
  }

  const isActive = detail.status === "active";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      {/* Back link */}
      <div>
        <Link
          to="/admin/organizations"
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          ← Wróć do listy organizacji
        </Link>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{detail.name}</h1>
        <p className="text-sm text-muted-foreground">
          ID: {orgId} · Slug: {detail.slug}
        </p>
      </div>

      {/* Profil */}
      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Edytuj podstawowe dane organizacji.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Nazwa</Label>
            <Input
              id="org-name"
              value={currentName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-website">Strona www</Label>
            <Input
              id="org-website"
              value={currentWebsite}
              placeholder="https://example.com"
              onChange={(e) => setProfileWebsite(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="org-owner">Właściciel</Label>
            <Select
              value={currentOwnerId}
              onValueChange={(val) => setProfileOwnerId(val)}
            >
              <SelectTrigger id="org-owner">
                <SelectValue placeholder="Wybierz właściciela…" />
              </SelectTrigger>
              <SelectContent>
                {detail.members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.name ?? m.email ?? m.userId}
                    {m.userId === detail.ownerId ? " (aktualny)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleProfileSave}
            disabled={profileMutation.isPending}
          >
            {profileMutation.isPending ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </CardContent>
      </Card>

      {/* Podgląd operatora (impersonation) */}
      <Card>
        <CardHeader>
          <CardTitle>Podgląd jako operator</CardTitle>
          <CardDescription>
            Wejdź w tryb tylko-do-odczytu tej organizacji. Zobaczysz dane
            filtrowane przez RLS tak, jak widzi je członek tej org. Zapis
            i akcje Convex są niedostępne — to jest podgląd wsparcia, nie
            pełny dostęp.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => void handleEnterAs()}
            disabled={impersonating}
            variant="outline"
          >
            {impersonating ? "Uruchamianie podglądu…" : "Wejdź jako"}
          </Button>
        </CardContent>
      </Card>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>
            Zawieś lub reaktywuj organizację.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">Aktualny status:</span>
            {isActive ? (
              <Badge className="bg-green-600 hover:bg-green-700">Aktywna</Badge>
            ) : (
              <Badge variant="destructive">Zawieszona</Badge>
            )}
          </div>
          {!isActive && detail.suspendedReason && (
            <p className="text-sm text-muted-foreground">
              Powód zawieszenia: {detail.suspendedReason}
            </p>
          )}
          {isActive ? (
            <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" disabled={statusMutation.isPending}>
                  Zawieś
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Zawieś organizację</DialogTitle>
                  <DialogDescription>
                    Zawieszenie uniemożliwi użytkownikom dostęp do organizacji.
                    Podaj powód (opcjonalnie).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="suspend-reason">Powód zawieszenia</Label>
                  <Textarea
                    id="suspend-reason"
                    placeholder="Opcjonalny powód…"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                    rows={3}
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSuspendOpen(false);
                      setSuspendReason("");
                    }}
                  >
                    Anuluj
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleSuspend}
                    disabled={statusMutation.isPending}
                  >
                    {statusMutation.isPending ? "Zawieszanie…" : "Zawieś"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Button
              onClick={handleReactivate}
              disabled={statusMutation.isPending}
            >
              {statusMutation.isPending ? "Reaktywowanie…" : "Reaktywuj"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Miejsca (seats) */}
      <Card>
        <CardHeader>
          <CardTitle>Miejsca</CardTitle>
          <CardDescription>
            Zarządzaj limitem miejsc dla organizacji.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            Zajęte:{" "}
            <span className="font-medium">{detail.seatUsage.currentSeats}</span>
            {" / "}
            <span className="font-medium">{detail.seatUsage.effectiveSeatLimit}</span>
            {" miejsc"}
          </p>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="seat-override">Limit miejsc (nadpisanie)</Label>
              <Input
                id="seat-override"
                type="number"
                min={0}
                placeholder="brak (domyślny)"
                value={currentSeatOverride}
                onChange={(e) => setSeatOverrideInput(e.target.value)}
                className="w-48"
              />
            </div>
            <Button
              onClick={handleSeatSave}
              disabled={seatMutation.isPending}
            >
              {seatMutation.isPending ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </div>
          {detail.seatLimitOverride !== null && (
            <p className="text-xs text-muted-foreground">
              Aktywne nadpisanie: {detail.seatLimitOverride} miejsc
            </p>
          )}
        </CardContent>
      </Card>

      {/* Członkowie */}
      <Card>
        <CardHeader>
          <CardTitle>Członkowie</CardTitle>
          <CardDescription>
            {detail.members.length} członków w organizacji.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Imię i nazwisko</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Rola</TableHead>
                <TableHead>Dołączył(a)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.members.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    Brak członków.
                  </TableCell>
                </TableRow>
              ) : (
                detail.members.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell className="font-medium">
                      {m.name ?? <span className="text-muted-foreground">—</span>}
                      {m.userId === detail.ownerId && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          Właściciel
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{m.role}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {m.joinedAt
                        ? new Date(m.joinedAt).toLocaleDateString("pl-PL")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Uprawnienia */}
      <Card>
        <CardHeader>
          <CardTitle>Uprawnienia (moduły)</CardTitle>
          <CardDescription>
            Aktywne moduły dla tej organizacji. Zarządzaj nimi przez konsolę
            uprawnień.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-20 text-sm">CRM:</span>
            {detail.entitlements.crm === "active" ? (
              <Badge className="bg-green-600 hover:bg-green-700">aktywny</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                nieaktywny
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="w-20 text-sm">Gabinet:</span>
            {detail.entitlements.gabinet === "active" ? (
              <Badge className="bg-green-600 hover:bg-green-700">aktywny</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                nieaktywny
              </Badge>
            )}
          </div>
          <p className="pt-1 text-sm">
            <Link
              to="/admin/entitlements"
              className="underline hover:text-foreground text-muted-foreground"
            >
              Zarządzaj uprawnieniami →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
