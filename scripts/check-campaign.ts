/**
 * Vérifie que la campagne par défaut est soluble et sans soft-lock.
 * Usage : npx tsx scripts/check-campaign.ts
 */
import { DEFAULT_CAMPAIGN, defaultLevels, generate } from '../src/shared/generator.ts';
import { analyze } from '../src/shared/solver.ts';

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

// Régression : l'ancienne carte « Pièges » (seed 53, 1er essai) avait une impasse (6,9)↔(6,16).
const oldPièges = [
  '###########',
  '#####E#####',
  '#####     #',
  '##### ###o#',
  '##### ###*#',
  '###x      #',
  '### #######',
  '### #######',
  '###oS######',
  '### ## ####',
  '###    ####',
  '#####  ####',
  '#####  x *#',
  '######oS  #',
  '####      #',
  '##        #',
  '## ### # ##',
  '##  * ## ##',
  '## P#######',
  '###########',
];
const oldAn = analyze(oldPièges);
assert(oldAn.win, 'ancienne Pièges : chemin vers sortie existe encore');
assert(
  oldAn.issues.some((i) => i.level === 'error' && i.message.includes('Impasse')),
  'ancienne Pièges : soft-lock (6,9)/(6,16) détecté',
);

const levels = defaultLevels();
assert(levels.length === DEFAULT_CAMPAIGN.length, `campagne : ${levels.length}/${DEFAULT_CAMPAIGN.length} niveaux`);

for (let i = 0; i < levels.length; i++) {
  const l = levels[i];
  const a = analyze(l.map);
  const errors = a.issues.filter((i) => i.level === 'error');
  assert(a.win && errors.length === 0, `${i + 1}. ${l.name} win=${a.win} errors=${errors.length}`);
}

// Le générateur refuse désormais explicitement les soft-locks sur le preset Pièges.
const regen = generate(DEFAULT_CAMPAIGN[4]);
assert(!!regen && regen.length > 0, 'Pièges : génération OK');
if (regen) {
  const a = analyze(regen);
  assert(a.win && !a.issues.some((i) => i.level === 'error'), 'Pièges régénéré : sans soft-lock');
}

if (failed) {
  console.error(`\n${failed} échec(s)`);
  process.exit(1);
}
console.log('\nCampagne OK');
