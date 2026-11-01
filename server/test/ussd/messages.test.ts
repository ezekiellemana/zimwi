// Copy template tests — verify prefix, 182-char screen limit, 160-char SMS limit.
// Design §10.3.

import { describe, it, expect } from "vitest";
import { copy, formatTsh } from "../../src/ussd/messages.copy.js";

// ── Representative worst-case inputs ────────────────────────────────────

const longShop = "Duka la Mama Asha Mzee Mwakikagile ABCDEFGHIJ";
const longCustomer = "Mzee Mwakikagile Supercalifragilistic";
const bigAmount = formatTsh(99_999_999);

const fiveDebtors = [
  { name: "JumaMzeeMwakikagile", phone: "+2557XX XXX 678", amount: formatTsh(99_999_999) },
  { name: "AshaMamaMwakikagile", phone: "+2557XX XXX 234", amount: formatTsh(88_888_888) },
  { name: "AmaniBabaMwakikagil", phone: "+2557XX XXX 890", amount: formatTsh(77_777_777) },
  { name: "ZukaKakaMwakikagil", phone: "+2557XX XXX 567", amount: formatTsh(66_666_666) },
  { name: "RehaDadaMwakikagil", phone: "+2557XX XXX 345", amount: formatTsh(55_555_555) },
];

const fiveReminderDebtors = fiveDebtors.map(({ name, amount }) => ({ name, amount }));

// ── formatTsh ───────────────────────────────────────────────────────────

describe("formatTsh", () => {
  it("formats 0", () => {
    expect(formatTsh(0)).toBe("TSh 0");
  });
  it("formats 500", () => {
    expect(formatTsh(500)).toBe("TSh 500");
  });
  it("formats 5000", () => {
    expect(formatTsh(5000)).toBe("TSh 5,000");
  });
  it("formats 1200000", () => {
    expect(formatTsh(1_200_000)).toBe("TSh 1,200,000");
  });
  it("formats 999999999", () => {
    expect(formatTsh(999_999_999)).toBe("TSh 999,999,999");
  });
});

// ── Per-language copy tests ──────────────────────────────────────────────

for (const lang of ["sw", "en"] as const) {
  const c = copy[lang];

  // Build a record of every screen-producing function with representative inputs.
  const screens: Record<string, () => string> = {
    mainMenu: () => c.mainMenu(longShop),
    registerShopPrompt: () => c.registerShopPrompt(),
    registerShopConfirm: () => c.registerShopConfirm(longShop),
    registerShopDone: () => c.registerShopDone(longShop),
    addDebtPhonePrompt: () => c.addDebtPhonePrompt(),
    addDebtNamePrompt: () => c.addDebtNamePrompt(),
    addDebtAmountPrompt: () => c.addDebtAmountPrompt(longCustomer),
    addDebtConfirm: () => c.addDebtConfirm(longCustomer, bigAmount),
    addDebtDone: () => c.addDebtDone(longCustomer, bigAmount),
    paymentSelect: () => c.paymentSelect(fiveDebtors),
    paymentPhonePrompt: () => c.paymentPhonePrompt(),
    paymentAmountPrompt: () => c.paymentAmountPrompt(longCustomer, bigAmount),
    paymentOverPayment: () => c.paymentOverPayment(longCustomer, bigAmount),
    paymentConfirm: () => c.paymentConfirm(longCustomer, bigAmount),
    paymentDone: () => c.paymentDone(longCustomer, bigAmount),
    whoOwes: () => c.whoOwes(fiveDebtors, bigAmount),
    reminderSelect: () => c.reminderSelect(fiveReminderDebtors),
    reminderConfirm: () => c.reminderConfirm(longCustomer, bigAmount),
    reminderDone: () => c.reminderDone(longCustomer),
    invalidPhone: () => c.invalidPhone(),
    invalidAmount: () => c.invalidAmount(),
    customerNotFound: () => c.customerNotFound(),
  };

  describe(`copy.${lang} — prefix and length`, () => {
    for (const [name, fn] of Object.entries(screens)) {
      it(`${name} starts with CON or END`, () => {
        const screen = fn();
        expect(screen.startsWith("CON ") || screen.startsWith("END ")).toBe(true);
      });

      it(`${name} <= 182 chars`, () => {
        const screen = fn();
        expect(screen.length).toBeLessThanOrEqual(182);
      });
    }
  });

  describe(`copy.${lang} — reminder SMS`, () => {
    it("is <= 160 chars with long inputs", () => {
      const sms = c.reminderSms(longCustomer, longShop, bigAmount);
      expect(sms.length).toBeLessThanOrEqual(160);
    });

    it("contains no curly quotes", () => {
      const sms = c.reminderSms(longCustomer, longShop, bigAmount);
      expect(sms).not.toMatch(/[\u2018\u2019\u201C\u201D]/);
    });

    it("contains no emoji (all chars GSM-7 / ASCII)", () => {
      const sms = c.reminderSms(longCustomer, longShop, bigAmount);
      for (const ch of sms) {
        expect(ch.charCodeAt(0)).toBeLessThanOrEqual(126);
      }
    });

    it("includes customer name, shop name, and amount", () => {
      const sms = c.reminderSms("Juma", "Duka", formatTsh(5000));
      expect(sms).toContain("Juma");
      expect(sms).toContain("Duka");
      expect(sms).toContain("TSh 5,000");
    });

    it("includes reply instruction", () => {
      const sms = c.reminderSms("Juma", "Duka", formatTsh(5000));
      expect(sms).toMatch(/LIPA/);
      expect(sms).toMatch(/TAREHE/);
    });
  });

  describe(`copy.${lang} — list views with 5 debtors`, () => {
    it("paymentSelect handles 5 debtors within 182 chars", () => {
      const screen = c.paymentSelect(fiveDebtors);
      expect(screen.startsWith("CON ")).toBe(true);
      expect(screen.length).toBeLessThanOrEqual(182);
    });

    it("whoOwes handles 5 debtors within 182 chars", () => {
      const screen = c.whoOwes(fiveDebtors, bigAmount);
      expect(screen.startsWith("END ")).toBe(true);
      expect(screen.length).toBeLessThanOrEqual(182);
    });

    it("reminderSelect handles 5 debtors within 182 chars", () => {
      const screen = c.reminderSelect(fiveReminderDebtors);
      expect(screen.startsWith("CON ")).toBe(true);
      expect(screen.length).toBeLessThanOrEqual(182);
    });

    it("paymentSelect with empty debtors still valid", () => {
      const screen = c.paymentSelect([]);
      expect(screen.startsWith("CON ")).toBe(true);
      expect(screen.length).toBeLessThanOrEqual(182);
    });

    it("whoOwes with empty debtors still valid", () => {
      const screen = c.whoOwes([], formatTsh(0));
      expect(screen.startsWith("END ")).toBe(true);
      expect(screen.length).toBeLessThanOrEqual(182);
    });
  });
}
