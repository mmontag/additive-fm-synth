const assert = require('assert');

// Mock DOM environment
global.document = {
  getElementById: (id) => null
};

// Global audio constants
global.SAMPLE_RATE = 44100;
global.PERIOD = Math.PI * 2;
global.MAX_SIDEBANDS = 50;
global.ANTI_ALIAS = true;

const envMod = require('../envelope.js');
global.Envelope = envMod.Envelope;
global.ENV_ATTACK = envMod.ENV_ATTACK;
global.ENV_DECAY = envMod.ENV_DECAY;
global.ENV_SUSTAIN = envMod.ENV_SUSTAIN;
global.ENV_RELEASE = envMod.ENV_RELEASE;
global.ENV_OFF = envMod.ENV_OFF;

const bessel = require('../bessel.js');
global.besselj = bessel.besselj;

const AdditiveFMVoice = require('../additivefmvoice.js');
const Synth = require('../synth.js');

console.log('Running Audio Engine & Voice Pooling performance tests...');

// Test 1: Synth preallocates voice pool
const synth = new Synth(AdditiveFMVoice, 16);
assert.strictEqual(synth.voicePool.length, 16, 'Voice pool should preallocate 16 voices');
assert.strictEqual(synth.activeVoices.length, 0, 'Initially no active voices');
console.log('✔ Test 1 passed: 16 voices pre-allocated in pool');

// Test 2: NoteOn acquires voice from pool
synth.noteOn(60, 1.0);
assert.strictEqual(synth.activeVoices.length, 1, 'Should have 1 active voice');
assert.strictEqual(synth.voicePool.length, 15, 'Voice pool should decrease to 15');
assert.strictEqual(synth.activeVoices[0].note, 60, 'Active voice should be note 60');
console.log('✔ Test 2 passed: noteOn acquires voice from pool');

// Test 3: Note re-triggering uses the same voice without re-allocating
const originalVoice = synth.activeVoices[0];
synth.noteOn(60, 0.8);
assert.strictEqual(synth.activeVoices.length, 1, 'Re-triggering should not increase active voice count');
assert.strictEqual(synth.voicePool.length, 15, 'Voice pool should remain 15');
assert.strictEqual(synth.activeVoices[0], originalVoice, 'Re-triggering should reuse existing active voice');
console.log('✔ Test 3 passed: Note re-triggering reuses active voice in-place');

// Test 4: NoteOff triggers release and finishes into pool
synth.noteOff(60);
assert.strictEqual(synth.activeVoices.length, 1, 'Voice stays active during release envelope');
assert.strictEqual(synth.activeVoices[0].ampEnv.state, ENV_RELEASE, 'Voice envelope in release');

// Render until envelope reaches ENV_OFF (release is 0.1s = 4410 samples)
let sampleCount = 0;
while (synth.activeVoices.length > 0 && sampleCount < 10000) {
  synth.render();
  sampleCount++;
}
assert.strictEqual(synth.activeVoices.length, 0, 'Active voices should be 0 after release finishes');
assert.strictEqual(synth.voicePool.length, 16, 'Voice pool should be restored to 16');
console.log('✔ Test 4 passed: Voice returns to pool upon release completion');

// Test 5: Voice stealing when >16 voices triggered
for (let note = 40; note < 40 + 20; note++) {
  synth.noteOn(note, 0.5);
}
assert.strictEqual(synth.activeVoices.length, 16, 'Active voices should be capped at max polyphony 16');
assert.strictEqual(synth.voicePool.length, 0, 'Voice pool exhausted');
// Clean up all notes
for (let note = 40; note < 40 + 20; note++) {
  synth.noteOff(note);
}
for (let s = 0; s < 10000; s++) synth.render();
assert.strictEqual(synth.voicePool.length, 16, 'All 16 voices returned to pool');
console.log('✔ Test 5 passed: Voice stealing gracefully handles >16 notes and reclaims all');

// Test 6: Zero memory growth during rapid note triggering (Object Pool validation)
const initialMem = process.memoryUsage().heapUsed;

for (let cycle = 0; cycle < 50; cycle++) {
  for (let n = 60; n < 68; n++) {
    synth.noteOn(n, 0.8);
  }
  for (let s = 0; s < 512; s++) synth.render();
  for (let n = 60; n < 68; n++) {
    synth.noteOff(n);
  }
  for (let s = 0; s < 512; s++) synth.render();
}

const finalMem = process.memoryUsage().heapUsed;
const heapDeltaKb = (finalMem - initialMem) / 1024;
console.log(`Heap delta after 400 note events: ${heapDeltaKb.toFixed(2)} KB`);
assert(heapDeltaKb < 500, 'Memory growth should be negligible (< 500 KB across 400 notes)');
console.log('✔ Test 6 passed: Zero object churn validated during rapid note cycles');

// Test 7: Audio rendering output check
synth.noteOn(60, 1.0);
const buffer = new Float32Array(512);
for (let i = 0; i < 512; i++) {
  buffer[i] = 0.5 * synth.render();
}
synth.noteOff(60);
let maxAmp = 0;
for (let i = 0; i < 512; i++) {
  const abs = Math.abs(buffer[i]);
  if (abs > maxAmp) maxAmp = abs;
}
assert(maxAmp > 0, 'Rendered audio buffer should contain sound');
assert(!isNaN(maxAmp), 'Rendered audio buffer should not be NaN');
assert(isFinite(maxAmp), 'Rendered audio buffer should be finite');
console.log(`Peak rendered buffer amplitude: ${maxAmp.toFixed(3)}`);
console.log('✔ Test 7 passed: Audio buffer produces clean signal');

console.log('\nAll Audio Engine & Voice Pooling tests passed successfully! 🎉');
