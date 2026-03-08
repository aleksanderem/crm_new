import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import type { Id } from "@cvx/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Send, User } from "@/lib/ez-icons";

interface ReviewAssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: Id<"organizations">;
  onAssign: (reviewerId: Id<"users">) => void;
  sending?: boolean;
}

export function ReviewAssignDialog({
  open,
  onOpenChange,
  organizationId,
  onAssign,
  sending,
}: ReviewAssignDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: members } = useQuery(
    convexQuery(api.organizations.getMembers, { organizationId }),
  );

  const handleSubmit = () => {
    if (!selectedUserId) return;
    onAssign(selectedUserId as Id<"users">);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Wyślij do przeglądu
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Przypisz recenzenta</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz osobę..." />
              </SelectTrigger>
              <SelectContent>
                {members?.filter((m) => m.user).map((member) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5" />
                      {member.user!.name ?? member.user!.email ?? "Użytkownik"}
                      {member.role && (
                        <span className="text-xs text-muted-foreground">
                          ({member.role})
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Anuluj
          </Button>
          <Button onClick={handleSubmit} disabled={sending || !selectedUserId}>
            {sending ? "Wysyłanie..." : "Wyślij do przeglądu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
