import { FISCAL_API_URL, FISCAL_API_KEY } from "@cvx/env";

// VAT rates used on Polish fiscal receipts.
// A=23%, B=8%, C=5%, D=0% (medically exempt services typically fall under D).
export type FiscalVatRate = "A" | "B" | "C" | "D";

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number; // in PLN, up to 2 decimal places
  vatRate: FiscalVatRate;
}

export interface ReceiptPayload {
  organizationNip: string;
  amount: number; // total gross in PLN
  paymentMethod: "cash" | "card" | "transfer" | "other";
  items: ReceiptItem[];
  currency?: string; // defaults to PLN
  externalId?: string; // our paymentId — used by the service for idempotency
}

export interface RefundPayload {
  fiscalReceiptId: string; // the ID previously returned by sendReceipt
  amount: number; // refund amount in PLN
  reason?: string;
}

export interface FiscalResponse {
  fiscalReceiptId: string;
  deviceNumber?: string;
  printedAt?: number; // epoch ms when the fiscal device actually printed
}

export interface IFiscalDevice {
  sendReceipt(payload: ReceiptPayload): Promise<FiscalResponse>;
  sendRefund(payload: RefundPayload): Promise<FiscalResponse>;
  ping(): Promise<boolean>;
}

export class FiscalDeviceError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "FiscalDeviceError";
  }
}

export class FiscalNotConfiguredError extends Error {
  constructor() {
    super(
      "Fiscal service not configured: set FISCAL_API_URL and FISCAL_API_KEY in Convex environment",
    );
    this.name = "FiscalNotConfiguredError";
  }
}

/**
 * Generic HTTP adapter for cloud-based fiscal services.
 *
 * Expects the configured service to expose three endpoints:
 *   POST /receipts → FiscalResponse
 *   POST /refunds  → FiscalResponse
 *   GET  /ping     → 200 OK
 *
 * To integrate with hardware registers (Posnet, Novitus, Elzab) instead,
 * implement `IFiscalDevice` directly for the vendor's serial/TCP/REST protocol
 * and return the hardware adapter from `createFiscalDevice()`.
 */
class HttpFiscalAdapter implements IFiscalDevice {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private get headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  async sendReceipt(payload: ReceiptPayload): Promise<FiscalResponse> {
    const res = await fetch(`${this.baseUrl}/receipts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new FiscalDeviceError(
        `sendReceipt failed (HTTP ${res.status}): ${text}`,
        res.status,
      );
    }
    return res.json() as Promise<FiscalResponse>;
  }

  async sendRefund(payload: RefundPayload): Promise<FiscalResponse> {
    const res = await fetch(`${this.baseUrl}/refunds`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new FiscalDeviceError(
        `sendRefund failed (HTTP ${res.status}): ${text}`,
        res.status,
      );
    }
    return res.json() as Promise<FiscalResponse>;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/ping`, {
        method: "GET",
        headers: this.headers,
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Returns the configured fiscal device adapter.
 * Throws `FiscalNotConfiguredError` when env vars are missing so callers
 * can surface a clear error to operators rather than a generic fetch failure.
 */
export function createFiscalDevice(): IFiscalDevice {
  if (!FISCAL_API_URL || !FISCAL_API_KEY) {
    throw new FiscalNotConfiguredError();
  }
  return new HttpFiscalAdapter(FISCAL_API_URL, FISCAL_API_KEY);
}
