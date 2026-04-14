import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@cvx/_generated/api";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/dev/emails")({
  component: DevEmailsPage,
});

function DevEmailsPage() {
  const emails = useQuery(api.dev.emails.list as any, { limit: 100 }) as any[] | undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedEmail = emails?.find((e: any) => e._id === selectedId);

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-950">
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Dev Email Inbox
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Przechwycone maile z DEV_INTERCEPT_EMAILS=true.{" "}
              {emails ? `${emails.length} maili.` : "Ladowanie..."}
            </p>
          </div>
          <Badge variant="outline" className="text-xs">
            DEV ONLY
          </Badge>
        </div>

        {emails && emails.length === 0 && (
          <div className="rounded-lg border bg-white dark:bg-gray-900 p-12 text-center">
            <p className="text-gray-500">Brak przechwyconych maili.</p>
            <p className="text-sm text-gray-400 mt-2">
              Ustaw zmienna srodowiskowa DEV_INTERCEPT_EMAILS=true w Convex
              dashboard, a nastepnie wygeneruj dokument wymagajacy podpisu.
            </p>
          </div>
        )}

        {emails && emails.length > 0 && (
          <div className="rounded-lg border bg-white dark:bg-gray-900 divide-y">
            {emails.map((email: any) => {
              const meta = email.metadata
                ? JSON.parse(email.metadata)
                : null;
              const date = new Date(email.createdAt);
              return (
                <button
                  key={email._id}
                  type="button"
                  onClick={() => setSelectedId(email._id)}
                  className="w-full text-left px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0"
                      >
                        {email.source}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {date.toLocaleString("pl-PL")}
                      </span>
                    </div>
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                      {email.subject}
                    </p>
                    <div className="flex gap-4 mt-1 text-xs text-gray-500">
                      <span>
                        Do: <strong>{email.to}</strong>
                      </span>
                      <span>
                        Od: <strong>{email.from}</strong>
                      </span>
                    </div>
                    {meta?.signingUrl && (
                      <div className="mt-2">
                        <a
                          href={meta.signingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Otworz link podpisu &rarr;
                        </a>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Email preview dialog */}
      <Dialog
        open={!!selectedEmail}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedEmail && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">
                  {selectedEmail.subject}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-gray-500">
                  <span>
                    Od: <strong>{selectedEmail.from}</strong>
                  </span>
                  <span>
                    Do: <strong>{selectedEmail.to}</strong>
                  </span>
                  <span>
                    {new Date(selectedEmail.createdAt).toLocaleString("pl-PL")}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {selectedEmail.source}
                  </Badge>
                </div>

                {selectedEmail.metadata && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
                      Metadata
                    </summary>
                    <pre className="mt-1 p-3 rounded bg-gray-100 dark:bg-gray-800 overflow-x-auto text-[11px]">
                      {JSON.stringify(
                        JSON.parse(selectedEmail.metadata),
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                )}

                {/* Rendered email preview */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs text-gray-500 border-b">
                    Podglad HTML
                  </div>
                  <div
                    className="bg-white text-black p-0"
                    style={{ minHeight: 200 }}
                    dangerouslySetInnerHTML={{
                      __html: selectedEmail.html,
                    }}
                  />
                </div>

                {/* Signing link shortcut */}
                {selectedEmail.metadata &&
                  JSON.parse(selectedEmail.metadata).signingUrl && (
                    <div className="pt-2">
                      <Button asChild variant="default" size="sm">
                        <a
                          href={
                            JSON.parse(selectedEmail.metadata).signingUrl
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Otworz strone podpisu
                        </a>
                      </Button>
                    </div>
                  )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
