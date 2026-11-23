/**
 * Crée les tables dans la base Neon (facultatif : l'API les crée aussi automatiquement).
 * Usage : DATABASE_URL=... npm run db:migrate   (ou avec un fichier .env)
 */
import { readFileSync, existsSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL manquante (variable d\'environnement ou fichier .env).');
  process.exit(1);
}
const sql = neon(url);
const statements = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
  .split(/;\s*$/m)
  .map((s) => s.replace(/--.*$/gm, '').trim())
  .filter(Boolean);
for (const s of statements) {
  await sql.query(s);
  console.log('✓', s.split('\n')[0]);
}
console.log('Base prête.');
