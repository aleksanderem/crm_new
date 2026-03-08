import { useState, useRef, useEffect } from "react";
import { useMutation, useAction } from "convex/react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cvx/_generated/api";
import { Id } from "@cvx/_generated/dataModel";
import { useTranslation } from "react-i18next";
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
}

export function ComposeDialog({
  organizationId,
  open,
  onOpenChange,
  replyTo,
  contactId,
  companyId,
  leadId,
}: ComposeDialogProps) {
  const { t } = useTranslation();
  const sendEmail = useMutation(api.emails.send);
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

  const { data: emailTemplates } = useQuery(
    convexQuery(api.emailTemplates.list, {
      organizationId,
      activeOnly: true,
    }),
  );

  const isGmailConnected = !!googleConnection;

  const [to, setTo] = useState(replyTo?.from ?? "");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, "")}` : "",
  );
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  const { data: renderedTemplate } = useQuery(
    selectedTemplateId
      ? convexQuery(api.emailTemplates.renderTemplate, {
          organizationId,
          templateId: selectedTemplateId as Id<"emailTemplates">,
          contactId,
          companyId,
          leadId,
        })
      : { queryKey: ["noop"], queryFn: () => null, enabled: false },
  );

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
        });
      }

      // Reset and close
      setTo("");
      setCc("");
      setSubject("");
      setBody("");
      setShowCc(false);
      setSelectedTemplateId("");
      lastAppliedTemplateRef.current = null;
      onOpenChange(false);
    } finally {
      setIsSending(false);
    }
  };

  const hasTemplates = emailTemplates && emailTemplates.length > 0;
  const isReply = !!replyTo;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
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
