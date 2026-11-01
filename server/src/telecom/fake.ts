// Fake telecom for tests and the web simulator.
// Design §7.2.

import type { Telecom } from "./telecom.js";

export interface SentMessage {
  to: string;
  message: string;
  timestamp: Date;
}

export class FakeTelecom implements Telecom {
  messages: SentMessage[] = [];

  async sendSms(to: string, message: string): Promise<void> {
    this.messages.push({ to, message, timestamp: new Date() });
  }

  clear(): void {
    this.messages = [];
  }
}
