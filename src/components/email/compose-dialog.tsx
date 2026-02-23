import { useState } from "react";
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
    })
  );

  const { data: currentUser } = useQuery(
    convexQuery(api.app.getCurrentUser, {})
  );

  const isGmailConnected = !!googleConnection;

  const [to, setTo] = useState(replyTo?.from ?? "");
  const [cc, setCc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, "")}` : ""
  );
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);

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
      onOpenChange(false);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {replyTo ? t("inbox.reply") : t("inbox.compose")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
              <Badge variant="outline" className="text-xs">via Gmail</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">via Resend</Badge>
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
            <Button
              onClick={handleSend}
              disabled={!to.trim() || isSending}
            >
              {isSending ? t("inbox.sending") : t("inbox.send")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
