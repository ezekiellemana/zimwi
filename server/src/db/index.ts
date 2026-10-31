/**
 * Database connection helper.
 * Exports a function to create a Drizzle client from a PGlite instance.
 */

import { drizzle } from "drizzle-orm/pglite";
import type { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema.js";

/**
 * Create a Drizzle client from a PGlite instance.
 * Used for tests (in-process PGlite) and production (Neon via PGlite).
 */
export function createDb(pg: PGlite) {
  return drizzle(pg, { schema });
}

export type DbClient = ReturnType<typeof createDb>;
