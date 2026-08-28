import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useState } from "react";
import { toast } from "sonner";
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
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/_auth/admin/plans")({
  component: AdminPlans,
});

// ---------------------------------------------------------------------------
// Types inferred from the action return shapes
// ---------------------------------------------------------------------------

type PlanRow = {
  _id: string;
  key: string;
  productKey: string | null;
  name: string;
  description: string;
  seatLimit: number;
  stripeId: string;
  prices: unknown;
};

type ProductRow = {
  _id: string;
  productId: string;
  name: string;
  description: string;
  isActive: boolean;
  prices: unknown;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPlanPrice(prices: unknown): string {
  const p = prices as Record<string, unknown> | null | undefined;
  const amount = p?.month &&
    (p.month as Record<string, unknown>)?.pln &&
    ((p.month as Record<string, unknown>).pln as Record<string, unknown>)?.amount;
  if (typeof amount === "number") {
    return (amount / 100).toFixed(2) + " zł";
  }
  return "—";
}

function formatProductPrice(prices: unknown): string {
  const p = prices as Record<string, unknown> | null | undefined;
  const amount = p?.month &&
    (p.month as Record<string, unknown>)?.pln;
  if (typeof amount === "number") {
    return amount + " zł";
  }
  return "—";
}

// ---------------------------------------------------------------------------
// Edit Plan Dialog
// ---------------------------------------------------------------------------

function EditPlanDialog({ plan, onSuccess }: { plan: PlanRow; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description);
  const [seatLimit, setSeatLimit] = useState(String(plan.seatLimit));

  const updatePlanAction = useAction(api.admin.plans.updatePlan);
  const mutation = useMutation({
    mutationFn: updatePlanAction,
    onSuccess: () => {
      toast.success("Plan zaktualizowany");
      setOpen(false);
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  function handleSave() {
    mutation.mutate({
      planId: plan._id as Parameters<typeof updatePlanAction>[0]["planId"],
      name,
      description,
      seatLimit: Number(seatLimit),
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setName(plan.name);
            setDescription(plan.description);
            setSeatLimit(String(plan.seatLimit));
          }}
        >
          Edytuj
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edytuj plan</DialogTitle>
          <DialogDescription>
            Edytujesz plan <strong>{plan.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Read-only info */}
          <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground space-y-1">
            <p>Klucz: <span className="font-mono">{plan.key}</span></p>
            {plan.productKey && (
              <p>Produkt: <span className="font-mono">{plan.productKey}</span></p>
            )}
            <p>Cena/mies.: {formatPlanPrice(plan.prices)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Nazwa</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-description">Opis</Label>
            <Textarea
              id="plan-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-seat-limit">Limit miejsc</Label>
            <Input
              id="plan-seat-limit"
              type="number"
              min={1}
              value={seatLimit}
              onChange={(e) => setSeatLimit(e.target.value)}
              className="w-32"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Product Dialog
// ---------------------------------------------------------------------------

function EditProductDialog({
  product,
  onSuccess,
}: {
  product: ProductRow;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);

  const updateProductAction = useAction(api.admin.plans.updateProduct);
  const mutation = useMutation({
    mutationFn: updateProductAction,
    onSuccess: () => {
      toast.success("Produkt zaktualizowany");
      setOpen(false);
      onSuccess();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  function handleSave() {
    mutation.mutate({
      productDocId: product._id as Parameters<typeof updateProductAction>[0]["productDocId"],
      name,
      description,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setName(product.name);
            setDescription(product.description);
          }}
        >
          Edytuj
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edytuj produkt</DialogTitle>
          <DialogDescription>
            Edytujesz produkt <strong>{product.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Read-only info */}
          <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground space-y-1">
            <p>ID produktu: <span className="font-mono">{product.productId}</span></p>
            <p>Cena/mies.: {formatProductPrice(product.prices)}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-name">Nazwa</Label>
            <Input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-description">Opis</Label>
            <Textarea
              id="product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Zapisywanie…" : "Zapisz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function AdminPlans() {
  const queryClient = useQueryClient();

  // Admin gate
  const getIsPlatformAdmin = useAction(api.app.getIsPlatformAdmin);
  const { data: adminStatus, isLoading: adminLoading } = useQuery({
    queryKey: ["isPlatformAdmin"],
    queryFn: () => getIsPlatformAdmin({}),
  });

  const admin = Boolean(adminStatus?.isPlatformAdmin);

  // Plans query
  const listPlansAction = useAction(api.admin.plans.listPlans);
  const plansQuery = useQuery({
    queryKey: ["admin", "plans"],
    queryFn: () => listPlansAction({}),
    enabled: admin,
  });

  // Products query
  const listProductsAction = useAction(api.admin.plans.listProducts);
  const productsQuery = useQuery({
    queryKey: ["admin", "products"],
    queryFn: () => listProductsAction({}),
    enabled: admin,
  });

  // Product isActive toggle
  const updateProductAction = useAction(api.admin.plans.updateProduct);
  const toggleActiveMutation = useMutation({
    mutationFn: updateProductAction,
    onSuccess: () => {
      toast.success("Status produktu zaktualizowany");
      void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
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

  const plans: PlanRow[] = (plansQuery.data ?? []) as PlanRow[];
  const products: ProductRow[] = (productsQuery.data ?? []) as ProductRow[];

  function invalidatePlans() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "plans"] });
  }

  function invalidateProducts() {
    void queryClient.invalidateQueries({ queryKey: ["admin", "products"] });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plany i produkty</h1>
        <p className="text-sm text-muted-foreground">
          Zarządzaj planami subskrypcji i produktami platformy.
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Plany section                                                       */}
      {/* ------------------------------------------------------------------ */}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Plany</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Miejsca</TableHead>
                  <TableHead>Cena/mies.</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plansQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Ładowanie…
                    </TableCell>
                  </TableRow>
                ) : plans.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Brak planów.
                    </TableCell>
                  </TableRow>
                ) : (
                  plans.map((plan) => (
                    <TableRow key={plan._id}>
                      <TableCell className="text-muted-foreground">
                        {plan.productKey ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{plan.key}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{plan.name}</TableCell>
                      <TableCell>{plan.seatLimit}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatPlanPrice(plan.prices)}
                      </TableCell>
                      <TableCell>
                        <EditPlanDialog plan={plan} onSuccess={invalidatePlans} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Produkty section                                                    */}
      {/* ------------------------------------------------------------------ */}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Produkty</h2>
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Opis</TableHead>
                  <TableHead>Aktywny</TableHead>
                  <TableHead>Cena/mies.</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsQuery.isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Ładowanie…
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      Brak produktów.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((product) => (
                    <TableRow key={product._id}>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {product.productId}
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {product.description || "—"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={product.isActive}
                          onCheckedChange={(checked) => {
                            toggleActiveMutation.mutate({
                              productDocId: product._id as Parameters<typeof updateProductAction>[0]["productDocId"],
                              isActive: checked,
                            });
                          }}
                          disabled={toggleActiveMutation.isPending}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatProductPrice(product.prices)}
                      </TableCell>
                      <TableCell>
                        <EditProductDialog
                          product={product}
                          onSuccess={invalidateProducts}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
