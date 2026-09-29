const assert = require('assert');
const SpectrumBox = require('../spectrumBox.js');

console.log('Running SpectrumBox optimization tests...');

// Mock AudioContext and AnalyserNode
const mockAnalyser = {
  fftSize: 2048,
  frequencyBinCount: 1024,
  minDecibels: -100,
  maxDecibels: -30,
  smoothingTimeConstant: 0.25,
  getByteFrequencyData: function(arr) {
    arr.fill(120);
  },
  getByteTimeDomainData: function(arr) {
    arr.fill(128);
  }
};

const mockCtx = {
  createAnalyser: () => mockAnalyser
};

// Mock Canvas and 2D Context
const drawnOperations = [];
const mockCanvasCtx = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  fillRect: (x, y, w, h) => drawnOperations.push({ op: 'fillRect', x, y, w, h }),
  beginPath: () => drawnOperations.push({ op: 'beginPath' }),
  rect: (x, y, w, h) => drawnOperations.push({ op: 'rect', x, y, w, h }),
  fill: () => drawnOperations.push({ op: 'fill' }),
  moveTo: (x, y) => drawnOperations.push({ op: 'moveTo', x, y }),
  lineTo: (x, y) => drawnOperations.push({ op: 'lineTo', x, y }),
  stroke: () => drawnOperations.push({ op: 'stroke' })
};

const mockCanvas = {
  width: 1024,
  height: 100,
  getContext: () => mockCanvasCtx
};

global.document = {
  getElementById: (id) => mockCanvas
};

global.window = {
  requestAnimationFrame: (cb) => 1,
  cancelAnimationFrame: (id) => {}
};

// Test 1: Frequency mode
const freqBox = new SpectrumBox(2048, 2048, 'fftbox', mockCtx, SpectrumBox.Types.FREQUENCY);
assert.strictEqual(freqBox.dbTable.length, 256, 'Should create 256-entry lookup table');
assert(!isNaN(freqBox.dbTable[0]), 'Lookup table values must be numbers');
assert(freqBox.dbTable[255] > freqBox.dbTable[0], 'Higher byte values should correspond to higher magnitudes');

drawnOperations.length = 0;
freqBox.update();
assert(drawnOperations.some(op => op.op === 'fill'), 'Should use batched fill');
assert(!drawnOperations.some(op => op.op === 'putImageData'), 'Must NOT use putImageData');
console.log('✔ Test 1 passed: Frequency mode uses precomputed lookup and batched fill');

// Test 2: Time domain (waveform) mode
const waveBox = new SpectrumBox(2048, 1024, 'wavebox', mockCtx, SpectrumBox.Types.TIME);
drawnOperations.length = 0;
waveBox.update();
assert(drawnOperations.some(op => op.op === 'beginPath'), 'Waveform should beginPath');
assert(drawnOperations.some(op => op.op === 'stroke'), 'Waveform should stroke single path');
assert(!drawnOperations.some(op => op.op === 'putImageData'), 'Must NOT use putImageData');
console.log('✔ Test 2 passed: Time mode uses single stroke path instead of 1024 putImageData calls');

console.log('\nAll SpectrumBox tests passed successfully! 🎉');
