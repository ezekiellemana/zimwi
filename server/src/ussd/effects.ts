// USSD effects: discriminated union produced by the core on confirmation.
// Design §2.4.

export type UssdEffect =
  | { kind: "createShop"; ownerId: number; name: string }
  | {
      kind: "recordDebt";
      shopId: number;
      customerPhone: string;
      customerName: string;
      amountTzs: number;
    }
  | { kind: "recordPayment"; customerId: number; amountTzs: number }
  | { kind: "sendReminder"; to: string; message: string };
