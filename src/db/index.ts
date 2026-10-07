import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");

const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");

// Supabase impose TLS. Avec DATABASE_SSL_CA on vérifie la chaîne
// complètement ; sans lui on chiffre sans vérifier l'autorité.
const globalForPool = globalThis as unknown as { __gvPool?: Pool };
const pool =
  globalForPool.__gvPool ??
  new Pool({
    connectionString: url,
    max: 10,
    ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
if (process.env.NODE_ENV !== "production") globalForPool.__gvPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
