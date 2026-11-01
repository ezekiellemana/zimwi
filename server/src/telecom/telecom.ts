// Telecom interface for SMS sending.
// Design §7.1.
// All Africa's Talking calls live behind this interface so the simulator
// and tests can use a fake implementation with the same contract.

export interface Telecom {
  sendSms(to: string, message: string): Promise<void>;
}
