import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { useMutation } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Phone, Check } from "@/lib/ez-icons";
import { toast } from "sonner";

interface SmsConfigCardProps {
  organizationId: Id<"organizations">;
}

export function SmsConfigCard({ organizationId }: SmsConfigCardProps) {
  const config = useQuery(api.sms.getConfig, { organizationId });
  const saveConfig = useMutation(api.sms.saveConfig);

  const [provider, setProvider] = useState<"smsapi" | "twilio">("smsapi");
  const [apiToken, setApiToken] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [senderId, setSenderId] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setSenderId(config.senderId ?? "");
      setFromNumber(config.fromNumber ?? "");
    }
  }, [config]);

  const handleSave = async () => {
    if (!apiToken && !config?.hasToken) {
      toast.error("Token API jest wymagany");
      return;
    }
    setSaving(true);
    try {
      await saveConfig({
        organizationId,
        provider,
        apiToken: apiToken || (config?.hasToken ? "__UNCHANGED__" : ""),
        apiSecret: apiSecret || undefined,
        senderId: senderId || undefined,
        fromNumber: fromNumber || undefined,
      });
      toast.success("Konfiguracja SMS zapisana");
      setApiToken("");
      setApiSecret("");
    } catch (err: any) {
      toast.error(err.message ?? "Nie udało się zapisać konfiguracji");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">SMS</CardTitle>
              <CardDescription>
                Konfiguracja wysyłki SMS do weryfikacji podpisów
              </CardDescription>
            </div>
          </div>
          {config && (
            <Badge variant={config.isActive ? "default" : "secondary"}>
              {config.isActive ? "Aktywny" : "Nieaktywny"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as "smsapi" | "twilio")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="smsapi">SMSAPI.pl</SelectItem>
              <SelectItem value="twilio">Twilio</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>
            Token API
            {config?.hasToken && (
              <span className="ml-2 text-xs text-muted-foreground">(zapisany — wpisz nowy aby zmienić)</span>
            )}
          </Label>
          <Input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={config?.hasToken ? "••••••••••••" : "Wklej token API"}
          />
        </div>

        {provider === "twilio" && (
          <div className="space-y-1.5">
            <Label>
              API Secret (Auth Token)
              {config?.hasSecret && (
                <span className="ml-2 text-xs text-muted-foreground">(zapisany)</span>
              )}
            </Label>
            <Input
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder={config?.hasSecret ? "••••••••••••" : "Wklej Auth Token"}
            />
          </div>
        )}

        {provider === "smsapi" && (
          <div className="space-y-1.5">
            <Label>Nadawca (max 11 znaków)</Label>
            <Input
              value={senderId}
              onChange={(e) => setSenderId(e.target.value.slice(0, 11))}
              placeholder="np. KlinikaABC"
            />
            <p className="text-xs text-muted-foreground">
              Alfanumeryczny identyfikator nadawcy widoczny w SMS
            </p>
          </div>
        )}

        {provider === "twilio" && (
          <div className="space-y-1.5">
            <Label>Numer telefonu nadawcy</Label>
            <Input
              value={fromNumber}
              onChange={(e) => setFromNumber(e.target.value)}
              placeholder="+1 234 567 8900"
            />
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Zapisywanie..." : "Zapisz"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
