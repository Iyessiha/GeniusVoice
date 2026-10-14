/* A01 a été corrigé. Ce diagnostic délègue maintenant aux tests de
 * non-régression React/DOM : aucun react-test-renderer déprécié nécessaire.
 * Depuis la racine : npm ci && node docs/audit/reproduce-voice.cjs
 * Réseau, microphone et peer connection sont simulés.
 */
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run',
  'tests/useRealtimeVoice.test.tsx', 'tests/VoiceWidget.test.tsx', 'tests/WidgetSettings.test.tsx',
], { stdio: 'inherit' });
process.exitCode = result.status ?? 1;
