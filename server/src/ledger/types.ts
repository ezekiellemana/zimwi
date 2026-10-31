export interface Owner {
  id: number;
  phoneE164: string;
  createdAt: Date;
}

export interface Shop {
  id: number;
  ownerId: number;
  name: string;
  createdAt: Date;
}

export interface Customer {
  id: number;
  shopId: number;
  name: string;
  phoneE164: string;
  createdAt: Date;
}

export interface Debt {
  id: number;
  customerId: number;
  amountTzs: number; // integer > 0
  note: string | null;
  createdAt: Date;
  dueDate: Date; // createdAt + 7 days by default
}

export interface Payment {
  id: number;
  customerId: number;
  amountTzs: number; // integer > 0
  createdAt: Date;
}

export interface Balance {
  customerId: number;
  customerName: string;
  customerPhoneE164: string;
  amountTzs: number; // >= 0
  debtTotalTzs: number;
  paymentTotalTzs: number;
}

export type LedgerErrorDetail =
  | { kind: "INVALID_AMOUNT"; amount: number; reason: string }
  | { kind: "PAYMENT_EXCEEDS_BALANCE"; requested: number; balance: number }
  | { kind: "INVALID_PHONE"; raw: string }
  | { kind: "NAME_TOO_LONG"; max: number; actual: number }
  | { kind: "SHOP_NAME_TOO_LONG"; max: number; actual: number }
  | { kind: "NOTE_TOO_LONG"; max: number; actual: number }
  | { kind: "NOT_FOUND"; entity: string; id: number };

export class LedgerError extends Error {
  constructor(public detail: LedgerErrorDetail) {
    super(LedgerError.buildMessage(detail));
    this.name = "LedgerError";
  }

  private static buildMessage(detail: LedgerErrorDetail): string {
    switch (detail.kind) {
      case "INVALID_AMOUNT":
        return `Invalid amount: ${detail.reason}`;
      case "PAYMENT_EXCEEDS_BALANCE":
        return `Payment of ${detail.requested} TZS exceeds balance of ${detail.balance} TZS`;
      case "INVALID_PHONE":
        return `Invalid Tanzanian phone number`;
      case "NAME_TOO_LONG":
        return `Name too long: ${detail.actual} characters (max ${detail.max})`;
      case "SHOP_NAME_TOO_LONG":
        return `Shop name too long: ${detail.actual} characters (max ${detail.max})`;
      case "NOTE_TOO_LONG":
        return `Note too long: ${detail.actual} characters (max ${detail.max})`;
      case "NOT_FOUND":
        return `${detail.entity} with id ${detail.id} not found`;
    }
  }
}
