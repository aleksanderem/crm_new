import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, Mail, Phone, User } from "@/lib/ez-icons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SignatureSlot {
  slotId: string;
  slotLabel: string;
  verificationMethod?: "click" | "sms" | "email_otp";
  signerType?: "internal" | "external";
}

interface SignerConfig {
  slotId: string;
  signerType: "internal" | "external";
  signerUserId?: Id<"users">;
  signerName: string;
  signerEmail: string;
  signerPhone: string;
  verificationMethod: "click" | "sms" | "email_otp";
}

interface SendForSigningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: Id<"documentInstances">;
  organizationId: Id<"organizations">;
  signatures: SignatureSlot[];
  onSent?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SendForSigningDialog({
  open,
  onOpenChange,
  instanceId,
  organizationId,
  signatures,
  onSent,
}: SendForSigningDialogProps) {
  const sendForSigning = useMutation(api.signatureRequests.sendForSigning);

  // Build initial signer configs from slots
  const [signers, setSigners] = useState<SignerConfig[]>(() =>
    signatures
      .filter((s) => !s.signatureData)
      .map((slot) => ({
        slotId: slot.slotId,
        signerType: slot.signerType ?? "external",
        signerName: "",
        signerEmail: "",
        signerPhone: "",
        verificationMethod: slot.verificationMethod ?? "click",
      })),
  );

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateSigner = (index: number, updates: Partial<SignerConfig>) => {
    setSigners((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleSend = async () => {
    setError(null);

    // Validate
    for (const signer of signers) {
      if (signer.signerType === "external") {
        if (!signer.signerEmail) {
          setError(`Email wymagany dla slotu "${signatures.find((s) => s.slotId === signer.slotId)?.slotLabel}"`);
          return;
        }
        if (!signer.signerName) {
          setError(`Imię i nazwisko wymagane dla slotu "${signatures.find((s) => s.slotId === signer.slotId)?.slotLabel}"`);
          return;
        }
      }
      if (signer.verificationMethod === "sms" && !signer.signerPhone) {
        setError(`Numer telefonu wymagany dla weryfikacji SMS`);
        return;
      }
    }

    setSending(true);
    try {
      await sendForSigning({
        instanceId,
        signers: signers.map((s) => ({
          slotId: s.slotId,
          signerType: s.signerType,
          signerUserId: s.signerType === "internal" ? s.signerUserId : undefined,
          signerEmail: s.signerEmail || undefined,
          signerName: s.signerName || undefined,
          signerPhone: s.signerPhone || undefined,
          verificationMethod: s.verificationMethod,
        })),
      });
      onOpenChange(false);
      onSent?.();
    } catch (err: any) {
      setError(err.message ?? "Wystąpił błąd");
    } finally {
      setSending(false);
    }
  };

  const unsignedSlots = signatures.filter((s) => !(s as any).signatureData);

  if (unsignedSlots.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Wyślij do podpisu
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {signers.map((signer, index) => {
            const slot = signatures.find((s) => s.slotId === signer.slotId);
            return (
              <div key={signer.slotId} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{slot?.slotLabel ?? signer.slotId}</p>
                  <Badge variant="outline">
                    {signer.verificationMethod === "click"
                      ? "Kliknięcie"
                      : signer.verificationMethod === "sms"
                        ? "SMS OTP"
                        : "Email OTP"}
                  </Badge>
                </div>

                {/* Signer type */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Typ sygnatariusza</Label>
                  <Select
                    value={signer.signerType}
                    onValueChange={(v) =>
                      updateSigner(index, { signerType: v as "internal" | "external" })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">
                        <span className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" /> Użytkownik systemu
                        </span>
                      </SelectItem>
                      <SelectItem value="external">
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> Osoba zewnętrzna
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* External signer fields */}
                {signer.signerType === "external" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Imię i nazwisko</Label>
                      <Input
                        value={signer.signerName}
                        onChange={(e) => updateSigner(index, { signerName: e.target.value })}
                        placeholder="Jan Kowalski"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">E-mail</Label>
                      <Input
                        type="email"
                        value={signer.signerEmail}
                        onChange={(e) => updateSigner(index, { signerEmail: e.target.value })}
                        placeholder="jan@example.com"
                        className="h-9"
                      />
                    </div>
                  </>
                )}

                {/* Phone for SMS */}
                {signer.verificationMethod === "sms" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      <Phone className="mr-1 inline h-3.5 w-3.5" />
                      Telefon (wymagany dla SMS)
                    </Label>
                    <Input
                      type="tel"
                      value={signer.signerPhone}
                      onChange={(e) => updateSigner(index, { signerPhone: e.target.value })}
                      placeholder="+48 600 123 456"
                      className="h-9"
                    />
                  </div>
                )}

                {/* Verification method */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Metoda weryfikacji</Label>
                  <Select
                    value={signer.verificationMethod}
                    onValueChange={(v) =>
                      updateSigner(index, {
                        verificationMethod: v as "click" | "sms" | "email_otp",
                      })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="click">Kliknięcie (oznajmienie)</SelectItem>
                      <SelectItem value="sms">SMS OTP</SelectItem>
                      <SelectItem value="email_otp">Email OTP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Anuluj
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? "Wysyłanie..." : "Wyślij"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
