/* Diagnostic de l'audit du 14/10/2026, sans réseau ni vraie base.
 * Exécution depuis la racine : node docs/audit/reproduce.cjs
 * Origines/dates/réservation : défauts encore ouverts. Compteur : tests du correctif.
 * Les adaptateurs SQL sont simulés : cela ne remplace pas des tests Postgres.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    console, process, Date, URL, ...extra,
  }, { filename: file });
  return exports;
}

const schema = Object.fromEntries([
  'conversations', 'businesses', 'usageEvents', 'appointments', 'businessHours',
  'knowledgeItems', 'leads', 'services', 'agents',
].map((name) => [name, new Proxy({ name }, { get: (target, key) => target[key] ?? `${name}.${String(key)}` })]));
const orm = {
  eq: (...args) => args, and: (...args) => args, gte: (...args) => args, lt: (...args) => args,
  sql: (strings, ...values) => ({ strings, values }),
};

async function main() {
  const tenant = load('src/lib/tenant.ts', {
    '@/db': { db: {} }, '@/db/schema': schema, 'drizzle-orm': orm,
  }, { process: { env: { NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://app.example.test' } } });
  const business = { id: 'business-test', allowedDomains: ['client.example.test'], timezone: 'Africa/Abidjan' };
  assert.equal(tenant.isOriginAllowed(business, null), true);
  assert.equal(tenant.isOriginAllowed(business, 'https://intrus.example.test'), false);
  assert.equal(tenant.isOriginAllowed(business, 'https://app.example.test'), true);
  console.log('A02 : sans Origin => autorisé ; origine de l’iframe/app => autorisée indépendamment du site parent.');

  const timezone = load('src/lib/timezone.ts', {});
  const invalid = timezone.zonedToUtc('2026-02-30T09:30', 'Africa/Abidjan');
  assert.equal(invalid.toISOString(), '2026-03-02T09:30:00.000Z');
  console.log('A10 : 2026-02-30T09:30 normalisé en', invalid.toISOString(), 'au lieu d’être rejeté.');

  // A03 a été corrigé : exécuter maintenant sa suite de non-régression.
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/minutes.test.ts'], { stdio: 'inherit' });
  assert.equal(result.status, 0, 'Les tests du compteur terminal doivent passer.');
  console.log('A03 : non-régression du compteur terminal vérifiée.');

  // Cet adaptateur indique qu’aucun rendez-vous ne préexiste, et enregistre
  // les tables lues. Il ne simule PAS les contraintes ou les verrous Postgres.
  const reads = [];
  const inserted = [];
  const toolDb = {
    select() {
      const q = {
        from(t) { reads.push(t.name); return q; }, where() { return q; }, limit() { return q; },
        then(resolve, reject) { return Promise.resolve([]).then(resolve, reject); },
      };
      return q;
    },
    insert(table) {
      return { values(row) {
        inserted.push({ table: table.name, row });
        return { returning: async () => [{ id: 'appointment-test' }] };
      } };
    },
    update() { return { set: () => ({ where: async () => {} }) }; },
  };
  const tools = load('src/lib/tools.ts', {
    '@/db': { db: toolDb }, '@/db/schema': schema, 'drizzle-orm': orm,
    '@/lib/utils': { str: (x) => typeof x === 'string' ? x.trim() || undefined : undefined, int: (x) => Number.isFinite(x) ? Math.trunc(x) : undefined, newToken: () => 'test-token' },
    '@/lib/timezone': timezone,
  });
  const future = new Date();
  future.setUTCDate(future.getUTCDate() + 7);
  const date = future.toISOString().slice(0, 10);
  const booking = await tools.executeTool({ business, agent: { enabledTools: ['book_appointment'] }, conversationId: 'conv-test' }, 'book_appointment', {
    customer_name: 'Test', customer_phone: '+2250000000000', datetime: `${date}T23:30`,
  });
  assert.equal(booking.ok, true);
  assert.equal(reads.includes('business_hours'), false);
  assert.equal(inserted[0].table, 'appointments');
  console.log('A06 : book_appointment accepte 23:30 sans lire les horaires et sans preuve d’appel à check_availability.');
  console.log('Diagnostics exécutés. Aucune requête externe et aucune donnée réelle modifiée.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
