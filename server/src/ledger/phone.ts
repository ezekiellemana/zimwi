/**
 * Phone normalisation utilities for Tanzanian mobile numbers.
 * REQ-9.1, REQ-9.2, REQ-9.3, REQ-9.4
 */

import { LedgerError } from "./types.js";

/**
 * Normalise a Tanzanian phone number to E.164 format (+255...).
 * Accepts local formats: 0712345678, 712345678, +255712345678.
 * Returns E.164 or throws if invalid.
 *
 * REQ-9.1: Local formats (0... or bare 7...) are normalised to +255...
 * REQ-9.2: Already-E.164 numbers are kept unchanged
 * REQ-9.3: Invalid numbers throw an error
 */
export function normalisePhone(raw: string): string {
  // Strip whitespace
  let cleaned = raw.trim().replace(/\s+/g, "");

  // Remove leading + if present
  const hadPlus = cleaned.startsWith("+");
  if (hadPlus) {
    cleaned = cleaned.slice(1);
  }

  // Remove leading 0 (local format)
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }

  // If it's 9 digits starting with 6 or 7, prepend 255
  if (/^[67]\d{8}$/.test(cleaned)) {
    cleaned = "255" + cleaned;
  }

  // Validate: must be 255 followed by 6 or 7 and 8 more digits (12 digits total)
  if (!/^255[67]\d{8}$/.test(cleaned)) {
    // Don't include the full raw number in the error (REQ-9.4)
    // Mask it or truncate it
    const masked = raw.length > 8 ? raw.slice(0, 5) + "..." : raw;
    throw new LedgerError({ kind: "INVALID_PHONE", raw: masked });
  }

  return "+" + cleaned;
}

/**
 * Mask a phone number for logging.
 * Example: +255712345678 → +2557XX XXX 678
 *
 * REQ-9.4: Never log full phone numbers
 */
export function maskPhone(e164: string): string {
  if (!e164.startsWith("+255") || e164.length !== 13) {
    // If it's not the expected format, mask everything after the first 5 chars (+CCCC)
    const prefix = e164.slice(0, 5); // +1234 or +254X or similar
    return prefix + "XXXXXXXX";
  }

  // +255 7 12345678
  // Show: +2557 XX XXX 678 (last 3 digits)
  const prefix = e164.slice(0, 5); // +2557 (country + first digit of mobile prefix)
  const lastThree = e164.slice(-3);
  return `${prefix}XX XXX ${lastThree}`;
}
