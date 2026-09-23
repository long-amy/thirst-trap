import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getBytes } from 'firebase/storage';
import { readFileSync } from 'fs';

const HOUSE_A = 'AAA111';
const HOUSE_B = 'BBB222';
// 1x1 png
const PNG = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0x0d,0x49,0x48,0x44,0x52]);

let pass = 0, fail = 0;
async function check(name, fn) {
  try { await fn(); console.log(`  PASS  ${name}`); pass++; }
  catch (e) { console.log(`  FAIL  ${name}\n        ${String(e).split('\n')[0]}`); fail++; }
}

const env = await initializeTestEnvironment({
  projectId: 'thirst-trap-test',
  firestore: { rules: readFileSync('firestore.rules','utf8'), host: '127.0.0.1', port: 8080 },
  storage:   { rules: readFileSync('storage.rules','utf8'),   host: '127.0.0.1', port: 9199 },
});

await env.withSecurityRulesDisabled(async ctx => {
  await setDoc(doc(ctx.firestore(), 'users/amy'), { householdId: HOUSE_A });
  await setDoc(doc(ctx.firestore(), 'users/stranger'), { householdId: HOUSE_B });
});

const amy = env.authenticatedContext('amy').storage();
const stranger = env.authenticatedContext('stranger').storage();
const meta = { contentType: 'image/png' };

console.log('\n--- cross-service lookup: can Storage read householdId from Firestore? ---');
await check('amy uploads a plant photo to her household', () =>
  assertSucceeds(uploadBytes(ref(amy, `plants/${HOUSE_A}/drake.png`), PNG, meta)));
await check('amy uploads a health photo to her household', () =>
  assertSucceeds(uploadBytes(ref(amy, `health/${HOUSE_A}/leaf.png`), PNG, meta)));
await check('amy reads back her own photo', () =>
  assertSucceeds(getBytes(ref(amy, `plants/${HOUSE_A}/drake.png`))));

console.log('\n--- isolation ---');
await check('stranger CANNOT upload into amy\'s household', () =>
  assertFails(uploadBytes(ref(stranger, `plants/${HOUSE_A}/evil.png`), PNG, meta)));
await check('stranger CANNOT read amy\'s photo', () =>
  assertFails(getBytes(ref(stranger, `plants/${HOUSE_A}/drake.png`))));

console.log('\n--- validation ---');
await check('non-image is rejected', () =>
  assertFails(uploadBytes(ref(amy, `plants/${HOUSE_A}/x.pdf`), PNG, { contentType: 'application/pdf' })));
await check('upload outside plants//health// is rejected', () =>
  assertFails(uploadBytes(ref(amy, `random/${HOUSE_A}/x.png`), PNG, meta)));

console.log(`\n${pass} passed, ${fail} failed\n`);
await env.cleanup();
process.exit(fail ? 1 : 0);
