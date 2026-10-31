import { describe, it, expect } from "vitest";
import { normalisePhone, maskPhone } from "../../src/ledger/phone.js";
import { LedgerError } from "../../src/ledger/types.js";

describe("normalisePhone", () => {
  it("normalises local 0-prefix format", () => {
    expect(normalisePhone("0712345678")).toBe("+255712345678");
    expect(normalisePhone("0655123456")).toBe("+255655123456");
  });

  it("normalises bare 9-digit format starting with 7", () => {
    expect(normalisePhone("712345678")).toBe("+255712345678");
  });

  it("normalises bare 9-digit format starting with 6", () => {
    expect(normalisePhone("655123456")).toBe("+255655123456");
  });

  it("keeps already-E.164 format unchanged", () => {
    expect(normalisePhone("+255712345678")).toBe("+255712345678");
    expect(normalisePhone("+255655123456")).toBe("+255655123456");
  });

  it("strips whitespace", () => {
    expect(normalisePhone(" 0712 345 678 ")).toBe("+255712345678");
    expect(normalisePhone("+255 712 345 678")).toBe("+255712345678");
  });

  it("rejects too-short numbers", () => {
    expect(() => normalisePhone("07123456")).toThrow(LedgerError);
    try {
      normalisePhone("07123456");
    } catch (e) {
      expect(e).toBeInstanceOf(LedgerError);
      if (e instanceof LedgerError) {
        expect(e.detail.kind).toBe("INVALID_PHONE");
      }
    }
  });

  it("rejects too-long numbers", () => {
    expect(() => normalisePhone("07123456789")).toThrow(LedgerError);
    try {
      normalisePhone("07123456789");
    } catch (e) {
      expect(e).toBeInstanceOf(LedgerError);
      if (e instanceof LedgerError) {
        expect(e.detail.kind).toBe("INVALID_PHONE");
      }
    }
  });

  it("rejects numbers with invalid prefix (not 6 or 7)", () => {
    expect(() => normalisePhone("0512345678")).toThrow(LedgerError);
    expect(() => normalisePhone("+255512345678")).toThrow(LedgerError);
  });

  it("rejects numbers with letters", () => {
    expect(() => normalisePhone("071234567a")).toThrow(LedgerError);
  });

  it("rejects non-255 country code", () => {
    expect(() => normalisePhone("+254712345678")).toThrow(LedgerError);
  });
});

describe("maskPhone", () => {
  it("masks middle digits of valid E.164", () => {
    expect(maskPhone("+255712345678")).toBe("+2557XX XXX 678");
    expect(maskPhone("+255655123456")).toBe("+2556XX XXX 456");
  });

  it("masks invalid format safely", () => {
    expect(maskPhone("+25471234")).toBe("+2547XXXXXXXX");
    expect(maskPhone("+1234567890")).toBe("+1234XXXXXXXX");
  });
});
