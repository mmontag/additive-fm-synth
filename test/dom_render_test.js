const assert = require('assert');
const Keyboard = require('../keyboard.js');

// Simple minimal DOM mock to test renderUI
function createMockElement(tag) {
  return {
    tagName: tag,
    id: '',
    className: '',
    textContent: '',
    style: {},
    attributes: {},
    children: [],
    eventListeners: {},
    setAttribute(key, val) { this.attributes[key] = val; },
    getAttribute(key) { return this.attributes[key]; },
    appendChild(child) { this.children.push(child); },
    addEventListener(event, fn) {
      if (!this.eventListeners[event]) this.eventListeners[event] = [];
      this.eventListeners[event].push(fn);
    },
    set innerHTML(val) {
      if (val === '') this.children = [];
    }
  };
}

global.document = {
  createElement: (tag) => createMockElement(tag),
  getElementById: (id) => {
    if (id === 'keyboard-keys') return mockContainer;
    if (id === 'octave-display') return mockOctaveDisplay;
    return null;
  }
};

const mockContainer = createMockElement('div');
mockContainer.id = 'keyboard-keys';
const mockOctaveDisplay = createMockElement('span');
mockOctaveDisplay.id = 'octave-display';

const kb = new Keyboard({}, {}, { autoAttach: false, octave: 4 });
kb.renderUI();

assert.strictEqual(mockOctaveDisplay.textContent, 4, 'Octave display text should be 4');
assert.strictEqual(mockContainer.children.length, 18, 'Should render 18 piano keys');

const whiteKeys = mockContainer.children.filter(c => c.className.includes('white-key'));
const blackKeys = mockContainer.children.filter(c => c.className.includes('black-key'));
assert.strictEqual(whiteKeys.length, 11, 'Should have 11 white key elements');
assert.strictEqual(blackKeys.length, 7, 'Should have 7 black key elements');

// Verify key IDs for C4 octave
assert.strictEqual(whiteKeys[0].id, 'k60', 'First white key should be k60 (C4)');
assert.strictEqual(blackKeys[0].id, 'k61', 'First black key should be k61 (C#4)');
assert.strictEqual(whiteKeys[whiteKeys.length - 1].id, 'k77', 'Last white key should be k77 (F5)');

// Verify octave shift updates elements
kb.setOctave(5);
assert.strictEqual(mockOctaveDisplay.textContent, 5, 'Octave display should update to 5');
const newWhiteKeys = mockContainer.children.filter(c => c.className.includes('white-key'));
assert.strictEqual(newWhiteKeys[0].id, 'k72', 'First white key at octave 5 should be k72 (C5)');

console.log('✔ DOM render tests passed: All 18 keys and octave updates rendered correctly!');
