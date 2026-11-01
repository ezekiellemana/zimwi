// FakeTelecom unit tests.
// Design §10.6.

import { describe, it, expect } from "vitest";
import { FakeTelecom } from "../../src/telecom/fake.js";

describe("FakeTelecom", () => {
  it("sendSms appends to messages array", async () => {
    const telecom = new FakeTelecom();
    await telecom.sendSms("+255712345678", "Hello from Zimwi");
    expect(telecom.messages).toHaveLength(1);
    expect(telecom.messages[0]?.to).toBe("+255712345678");
    expect(telecom.messages[0]?.message).toBe("Hello from Zimwi");
    expect(telecom.messages[0]?.timestamp).toBeInstanceOf(Date);
  });

  it("clear empties the messages array", async () => {
    const telecom = new FakeTelecom();
    await telecom.sendSms("+255712345678", "First");
    await telecom.sendSms("+255712345678", "Second");
    expect(telecom.messages).toHaveLength(2);
    telecom.clear();
    expect(telecom.messages).toHaveLength(0);
  });

  it("multiple sends accumulate correctly", async () => {
    const telecom = new FakeTelecom();
    for (let i = 0; i < 5; i++) {
      await telecom.sendSms("+255712345678", `Message ${i}`);
    }
    expect(telecom.messages).toHaveLength(5);
    expect(telecom.messages[0]?.message).toBe("Message 0");
    expect(telecom.messages[4]?.message).toBe("Message 4");
  });

  it("clear on empty array is a no-op", () => {
    const telecom = new FakeTelecom();
    telecom.clear();
    expect(telecom.messages).toHaveLength(0);
  });

  it("records distinct recipients", async () => {
    const telecom = new FakeTelecom();
    await telecom.sendSms("+255712345678", "To Juma");
    await telecom.sendSms("+255723456789", "To Asha");
    expect(telecom.messages).toHaveLength(2);
    expect(telecom.messages[0]?.to).toBe("+255712345678");
    expect(telecom.messages[1]?.to).toBe("+255723456789");
  });
});
