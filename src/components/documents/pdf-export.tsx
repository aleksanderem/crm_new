import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "@/lib/ez-icons";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PdfExportOptions {
  title: string;
  content: string; // rendered HTML
  signatures?: Array<{
    slotLabel: string;
    signedByName?: string;
    signedAt?: number;
    signatureData?: string; // base64 data URL
  }>;
  fileName?: string;
}

interface PdfExportButtonProps {
  title: string;
  content: string;
  signatures?: PdfExportOptions["signatures"];
  fileName?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSignaturesHtml(
  signatures: NonNullable<PdfExportOptions["signatures"]>,
): string {
  const slots = signatures
    .map((sig) => {
      const signedInfo = sig.signatureData
        ? `
          <img src="${sig.signatureData}" alt="Podpis" style="max-height:80px;display:block;margin-bottom:4px;" />
          <span class="signature-meta">
            ${sig.signedByName ?? ""}${sig.signedAt ? ` — ${new Date(sig.signedAt).toLocaleString("pl-PL")}` : ""}
          </span>
        `
        : `<span class="signature-meta">Oczekuje na podpis</span>`;

      return `
        <div class="signature-slot">
          <p class="signature-label">${sig.slotLabel}</p>
          ${signedInfo}
        </div>
      `;
    })
    .join("");

  return `
    <div class="signatures">
      <h4>Podpisy</h4>
      ${slots}
    </div>
  `;
}

function escapeHtml(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}

// ---------------------------------------------------------------------------
// Export function — uses browser print dialog via hidden iframe
// ---------------------------------------------------------------------------

export async function exportDocumentToPdf({
  title,
  content,
  signatures,
}: PdfExportOptions): Promise<void> {
  return new Promise<void>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "none";
    document.body.appendChild(iframe);

    const iframeDoc =
      iframe.contentDocument ?? iframe.contentWindow?.document ?? null;
    if (!iframeDoc) {
      document.body.removeChild(iframe);
      resolve();
      return;
    }

    const signaturesHtml =
      signatures && signatures.length > 0
        ? buildSignaturesHtml(signatures)
        : "";

    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html lang="pl">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page {
            size: A4;
            margin: 20mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 12pt;
            line-height: 1.6;
            color: #000;
            margin: 0;
            padding: 0;
          }
          .content {
            max-width: 100%;
          }
          .content h1 { font-size: 18pt; margin: 16pt 0 8pt; }
          .content h2 { font-size: 16pt; margin: 14pt 0 6pt; }
          .content h3 { font-size: 14pt; margin: 12pt 0 6pt; }
          .content p { margin: 0 0 8pt; }
          .content ul, .content ol { margin: 0 0 8pt; padding-left: 20pt; }
          .content img { max-width: 100%; }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          td, th {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
          }
          th {
            background: #f5f5f5;
          }
          .signatures {
            margin-top: 40px;
            border-top: 1px solid #ccc;
            padding-top: 20px;
          }
          .signatures h4 {
            font-size: 13pt;
            margin: 0 0 12px;
          }
          .signature-slot {
            margin-bottom: 20px;
          }
          .signature-label {
            font-weight: bold;
            margin: 0 0 4px;
            font-size: 11pt;
          }
          .signature-meta {
            font-size: 10pt;
            color: #666;
          }
        </style>
      </head>
      <body>
        <div class="content">${content}</div>
        ${signaturesHtml}
      </body>
      </html>
    `);
    iframeDoc.close();

    const cleanup = () => {
      try {
        document.body.removeChild(iframe);
      } catch {
        // iframe may have been removed already
      }
      resolve();
    };

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print();
        // Give the print dialog time to appear, then clean up
        setTimeout(cleanup, 1000);
      }, 500);
    };
  });
}

// ---------------------------------------------------------------------------
// Button component
// ---------------------------------------------------------------------------

export function PdfExportButton({
  title,
  content,
  signatures,
  fileName,
  className,
}: PdfExportButtonProps) {
  const [isPrinting, setIsPrinting] = useState(false);

  const handleExport = async () => {
    setIsPrinting(true);
    try {
      await exportDocumentToPdf({ title, content, signatures, fileName });
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isPrinting}
      className={cn(className)}
    >
      <Download className="mr-1 h-4 w-4" />
      {isPrinting ? "Przygotowywanie..." : "Eksportuj PDF"}
    </Button>
  );
}
