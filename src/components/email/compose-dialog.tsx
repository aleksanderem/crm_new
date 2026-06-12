import { useState, useRef, useEffect } from "react";
import { useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSupabaseEmailTemplatesList } from "@/hooks/use-supabase-email-templates";
import { useSupabaseMailProvidersList } from "@/hooks/use-supabase-mail-providers";
import { formatActionError } from "@/lib/format-action-error";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ComposeDialogProps {
  organizationId: Id<"organizations">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replyTo?: {
    emailId: string;
    threadId: string;
    subject: string;
    from: string;
    to: string[];
  };
  contactId?: Id<"contacts">;
  companyId?: Id<"companies">;
  leadId?: Id<"leads">;
  defaultTo?: string;
}

export function ComposeDialog({
  organizationId,
  open,
  onOpenChange,
  replyTo,
  contactId,
  companyId,
  leadId,
  defaultTo,
}: ComposeDialogProps) {
  const { t } = useTranslation();
  const sendEmail = useAction(api.emails.send);
  const sendViaGmail = useAction(api.google.gmail.sendViaGmail);

  const { data: googleConnection } = useQuery(
    convexQuery(api.oauthConnections.getByProvider, {
      organizationId,
      provider: "google",
    }),
  );

  const { data: currentUser } = useQuery(
    convexQuery(api.app.getCurrentUser, {}),
  );

  const { data: emailTemplates } = useSupabaseEmailTemplatesList(
    organizationId,
    { activeOnly: true },
  );

  const { data: mailProviders } = useSupabaseMailProvidersList(organizationId);

  const sendProviders = mailProviders?.filter((p) => {
    const caps = p.capabilities as { canSend?: boolean } | undefined;
    return caps?.canSend;
  }) ?? [];
  const defaultProviderId = (mailProviders?.find((p) => p.isDefault) ?? sendProviders[0])?._id;

  const [selectedProviderId, setSelectedProviderId] = useState<string>("");

  const isGmailConnected = !!googleConnection;

  const [to, setTo] = useState(replyTo?.from ?? defaultTo ?? "");
  const [cc, setCc] = useState("");

  useEffect(() => {
    if (open && !replyTo && defaultTo && !to) {
      setTo(defaultTo);
    }
  }, [open, defaultTo]);
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, "")}` : "",
  );
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { data: renderedTemplate } = useQuery({
    ...convexQuery(api.emailTemplates.renderTemplate, {
      organizationId,
      templateId: selectedTemplateId as Id<"emailTemplates">,
      contactId,
      companyId,
      leadId,
    }),
    enabled: !!selectedTemplateId,
  });

  const lastAppliedTemplateRef = useRef<string | null>(null);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
  };

  // Apply rendered template when it arrives
  useEffect(() => {
    if (
      renderedTemplate &&
      selectedTemplateId &&
      lastAppliedTemplateRef.current !== selectedTemplateId
    ) {
      setSubject(renderedTemplate.subject);
      setBody(renderedTemplate.body);
      lastAppliedTemplateRef.current = selectedTemplateId;
    }
  }, [renderedTemplate, selectedTemplateId]);

  // Set default provider when providers load
  useEffect(() => {
    if (!selectedProviderId && defaultProviderId) {
      setSelectedProviderId(defaultProviderId);
    }
  }, [defaultProviderId, selectedProviderId]);

  const handleSend = async () => {
    if (!to.trim()) return;
    setIsSending(true);
    try {
      const toList = to
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const ccList = cc
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (isGmailConnected && currentUser) {
        await sendViaGmail({
          organizationId,
          to: toList,
          cc: ccList.length > 0 ? ccList : undefined,
          subject,
          bodyText: body,
          bodyHtml: undefined,
          threadId: replyTo?.threadId,
          inReplyTo: replyTo?.emailId,
          contactId,
          companyId,
          leadId,
          sentBy: currentUser._id,
          fromEmail: googleConnection!.providerAccountId,
        });
      } else {
        await sendEmail({
          organizationId,
          to: toList,
          cc: ccList.length > 0 ? ccList : undefined,
          subject,
          bodyText: body,
          bodyHtml: undefined,
          threadId: replyTo?.threadId,
          inReplyTo: replyTo?.emailId,
          contactId,
          companyId,
          leadId,
          mailProviderId: selectedProviderId || undefined,
        });
      }

      // Reset and close
      setTo("");
      setCc("");
      setSubject("");
      setBody("");
      setShowCc(false);
      setSelectedTemplateId("");
      setSelectedProviderId(defaultProviderId ?? "");
      lastAppliedTemplateRef.current = null;
      onOpenChange(false);
    } catch (e) {
      toast.error(
        formatActionError(e, t, {
          key: "email.errors.sendFailed",
          defaultValue: "Nie udało się wysłać wiadomości.",
        }),
      );
    } finally {
      setIsSending(false);
    }
  };

  const hasTemplates = emailTemplates && emailTemplates.length > 0;
  const isReply = !!replyTo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isReply ? t("inbox.reply") : t("inbox.compose")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template selector — only for new emails, not replies */}
          {!isReply && hasTemplates && (
            <div className="space-y-1.5">
              <Label>{t("emailTemplates.useTemplate")}</Label>
              <Select
                value={selectedTemplateId}
                onValueChange={handleTemplateSelect}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("emailTemplates.selectTemplate")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {emailTemplates.map((tmpl) => (
                    <SelectItem key={tmpl._id} value={tmpl._id}>
                      {tmpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Send from */}
          {sendProviders.length > 1 && (
            <div className="space-y-1.5">
              <Label>{t("inbox.sendFrom")}</Label>
              <Select
                value={selectedProviderId}
                onValueChange={setSelectedProviderId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("inbox.sendFrom")} />
                </SelectTrigger>
                <SelectContent>
                  {sendProviders.map((provider) => (
                    <SelectItem key={provider._id} value={provider._id}>
                      {provider.name} ({provider.fromEmail})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* To */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{t("inbox.to")}</Label>
              {!showCc && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setShowCc(true)}
                >
                  {t("inbox.cc")}
                </button>
              )}
            </div>
            <Input
              placeholder="recipient@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          {/* CC */}
          {showCc && (
            <div className="space-y-1.5">
              <Label>{t("inbox.cc")}</Label>
              <Input
                placeholder="cc@example.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
            </div>
          )}

          {/* Subject */}
          <div className="space-y-1.5">
            <Label>{t("inbox.subject")}</Label>
            <Input
              placeholder={t("inbox.subject")}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label>{t("inbox.body")}</Label>
            <Textarea
              placeholder={t("inbox.body")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="hidden sm:block">
            {isGmailConnected ? (
              <Badge variant="outline" className="text-xs">
                via Gmail
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                via Resend
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSending}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSend} disabled={!to.trim() || isSending}>
              {isSending ? t("inbox.sending") : t("inbox.send")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
