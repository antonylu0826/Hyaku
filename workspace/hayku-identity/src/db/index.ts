import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL ?? 'postgres://hayku:hayku@localhost:5432/hayku_identity';

const client = postgres(connectionString);
export const db = drizzle(client, { schema });

export { schema };
