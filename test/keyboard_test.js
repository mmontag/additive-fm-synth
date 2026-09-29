const assert = require('assert');
const Keyboard = require('../keyboard.js');

function runTests() {
  console.log('Running Keyboard Controller tests...');

  // Mock Synth
  const mockSynth = {
    notesOn: [],
    notesOff: [],
    noteOn: function(note, velocity) {
      this.notesOn.push({ note, velocity });
    },
    noteOff: function(note) {
      this.notesOff.push(note);
    },
    reset: function() {
      this.notesOn = [];
      this.notesOff = [];
    }
  };

  // Mock AudioContext
  const mockAudioContext = {
    state: 'suspended',
    resume: function() {
      this.state = 'running';
    }
  };

  // Test 1: Note mappings count & offsets
  assert.strictEqual(Keyboard.NOTE_KEYS.length, 18, 'Should have exactly 18 note keys mapped');
  const whiteKeys = Keyboard.NOTE_KEYS.filter(k => !k.isBlack);
  const blackKeys = Keyboard.NOTE_KEYS.filter(k => k.isBlack);
  assert.strictEqual(whiteKeys.length, 11, 'Should have 11 white keys');
  assert.strictEqual(blackKeys.length, 7, 'Should have 7 black keys');
  console.log('✔ Test 1 passed: 18 note keys verified (11 white, 7 black)');

  // Test 2: Note number calculation for default Octave 4
  const kb = new Keyboard(mockSynth, mockAudioContext, { autoAttach: false, octave: 4 });
  assert.strictEqual(kb.getBaseNote(), 60, 'Octave 4 base note should be C4 = 60');
  assert.strictEqual(kb.getNoteNumber(0), 60, 'KeyA offset 0 should be 60');
  assert.strictEqual(kb.getNoteNumber(1), 61, 'KeyW offset 1 should be 61');
  assert.strictEqual(kb.getNoteNumber(12), 72, 'KeyK offset 12 should be 72 (C5)');
  assert.strictEqual(kb.getNoteNumber(17), 77, 'Quote offset 17 should be 77 (F5)');
  console.log('✔ Test 2 passed: Note number calculations match MIDI standard');

  // Test 3: AudioContext unlocking on keydown
  mockSynth.reset();
  assert.strictEqual(mockAudioContext.state, 'suspended');
  kb.handleKeyDown({
    code: 'KeyA',
    key: 'a',
    repeat: false,
    preventDefault: () => {}
  });
  assert.strictEqual(mockAudioContext.state, 'running', 'AudioContext should resume on keydown');
  assert.strictEqual(mockSynth.notesOn.length, 1);
  assert.deepStrictEqual(mockSynth.notesOn[0], { note: 60, velocity: 1.0 });
  console.log('✔ Test 3 passed: AudioContext unlocked and noteOn triggered');

  // Test 4: Key repeat prevention
  mockSynth.reset();
  kb.handleKeyDown({
    code: 'KeyA',
    key: 'a',
    repeat: true,
    preventDefault: () => {}
  });
  assert.strictEqual(mockSynth.notesOn.length, 0, 'Should ignore key repeat');
  console.log('✔ Test 4 passed: Key repeat ignored');

  // Test 5: KeyUp releases active note
  kb.handleKeyUp({
    code: 'KeyA',
    key: 'a',
    preventDefault: () => {}
  });
  assert.strictEqual(mockSynth.notesOff.length, 1);
  assert.strictEqual(mockSynth.notesOff[0], 60, 'Should release note 60');
  assert.strictEqual(kb.activeKeys['KeyA'], undefined);
  console.log('✔ Test 5 passed: Note released correctly on keyup');

  // Test 6: Octave shift during held note (no stuck notes)
  mockSynth.reset();
  // Press KeyA (starts note 60)
  kb.handleKeyDown({
    code: 'KeyA',
    key: 'a',
    repeat: false,
    preventDefault: () => {}
  });
  assert.strictEqual(mockSynth.notesOn[0].note, 60);

  // Shift octave down with Z
  kb.handleKeyDown({
    code: 'KeyZ',
    key: 'z',
    repeat: false,
    preventDefault: () => {}
  });
  assert.strictEqual(kb.octave, 3, 'Octave should now be 3');

  // Release KeyA
  kb.handleKeyUp({
    code: 'KeyA',
    key: 'a',
    preventDefault: () => {}
  });
  // Must release the ORIGINAL note 60, NOT the new octave's note 48
  assert.strictEqual(mockSynth.notesOff.length, 1);
  assert.strictEqual(mockSynth.notesOff[0], 60, 'Must release original note 60 even after octave shift');
  console.log('✔ Test 6 passed: Octave shift during held note prevents stuck notes');

  // Test 7: Octave clamping
  kb.setOctave(10);
  assert.strictEqual(kb.octave, 7, 'Octave should clamp to max 7');
  kb.setOctave(0);
  assert.strictEqual(kb.octave, 1, 'Octave should clamp to min 1');
  console.log('✔ Test 7 passed: Octave clamping verified');

  // Test 8: Ignore shortcuts with meta/ctrl/alt
  mockSynth.reset();
  kb.handleKeyDown({
    code: 'KeyA',
    key: 'a',
    ctrlKey: true,
    preventDefault: () => {}
  });
  assert.strictEqual(mockSynth.notesOn.length, 0, 'Should ignore Ctrl+A');
  kb.handleKeyDown({
    code: 'KeyA',
    key: 'a',
    metaKey: true,
    preventDefault: () => {}
  });
  assert.strictEqual(mockSynth.notesOn.length, 0, 'Should ignore Cmd+A');
  console.log('✔ Test 8 passed: Modifier key shortcuts ignored');

  // Test 9: Form input elements ignored
  mockSynth.reset();
  kb.handleKeyDown({
    code: 'KeyA',
    key: 'a',
    target: { tagName: 'INPUT' },
    preventDefault: () => {}
  });
  assert.strictEqual(mockSynth.notesOn.length, 0, 'Should ignore input inside form fields');
  console.log('✔ Test 9 passed: Form field inputs ignored');

  // Test 10: Window blur releases all active notes
  mockSynth.reset();
  kb.handleKeyDown({ code: 'KeyA', key: 'a', repeat: false, preventDefault: () => {} });
  kb.handleKeyDown({ code: 'KeyS', key: 's', repeat: false, preventDefault: () => {} });
  assert.strictEqual(mockSynth.notesOn.length, 2);
  kb.handleBlur();
  assert.strictEqual(mockSynth.notesOff.length, 2, 'All notes released on blur');
  assert.strictEqual(Object.keys(kb.activeKeys).length, 0);
  console.log('✔ Test 10 passed: Window blur releases all notes');

  console.log('\nAll 10 tests passed successfully! 🎉');
}

runTests();
