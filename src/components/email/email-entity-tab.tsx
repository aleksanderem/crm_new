import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Mail } from "lucide-react";
import { ComposeDialog } from "./compose-dialog";

interface EmailEntityTabProps {
  organizationId: Id<"organizations">;
  entityType: "contact" | "company" | "lead";
  entityId: string;
  contactId?: Id<"contacts">;
  companyId?: Id<"companies">;
  leadId?: Id<"leads">;
}

export function EmailEntityTab({
  organizationId,
  entityType,
  entityId,
  contactId,
  companyId,
  leadId,
}: EmailEntityTabProps) {
  const { t } = useTranslation();
  const [composeOpen, setComposeOpen] = useState(false);

  const { data: emailsData } = useQuery(
    convexQuery(api.emails.listByEntity, {
      organizationId,
      entityType,
      entityId,
    })
  );

  const emails = emailsData ?? [];

  const formatDate = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{t("inbox.title")}</h3>
            <p className="text-sm text-muted-foreground">
              {t("inbox.description")}
            </p>
          </div>
          <Button onClick={() => setComposeOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("inbox.compose")}
          </Button>
        </div>

        {emails.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12">
            <Mail className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {t("inbox.empty")}
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px]">
            <div className="space-y-2">
              {emails.map((email) => (
                <div
                  key={email._id}
                  className="flex items-start gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {email.subject || "(no subject)"}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(email.sentAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {email.direction === "outbound"
                        ? `${t("inbox.thread.to")}: ${email.to?.join(", ")}`
                        : `${t("inbox.thread.from")}: ${email.from}`}
                    </p>
                    {email.snippet && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {email.snippet}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      <ComposeDialog
        organizationId={organizationId}
        open={composeOpen}
        onOpenChange={setComposeOpen}
        contactId={contactId}
        companyId={companyId}
        leadId={leadId}
      />
    </>
  );
}
