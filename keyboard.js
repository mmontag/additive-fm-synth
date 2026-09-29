/**
 * Keyboard Controller for Additive FM Synth
 * Provides QWERTY musical typing and an interactive on-screen piano keyboard.
 */

(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Keyboard = factory();
  }
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';

  // Musical Typing Mapping (Ableton / GarageBand layout)
  // Semitone offsets from base C (C = 0)
  var NOTE_KEYS = [
    // White keys
    { code: 'KeyA', key: 'a', offset: 0, isBlack: false, noteName: 'C', seamAfter: 0 },
    { code: 'KeyW', key: 'w', offset: 1, isBlack: true,  noteName: 'C#', seamIndex: 0 },
    { code: 'KeyS', key: 's', offset: 2, isBlack: false, noteName: 'D', seamAfter: 1 },
    { code: 'KeyE', key: 'e', offset: 3, isBlack: true,  noteName: 'D#', seamIndex: 1 },
    { code: 'KeyD', key: 'd', offset: 4, isBlack: false, noteName: 'E' },
    { code: 'KeyF', key: 'f', offset: 5, isBlack: false, noteName: 'F', seamAfter: 3 },
    { code: 'KeyT', key: 't', offset: 6, isBlack: true,  noteName: 'F#', seamIndex: 3 },
    { code: 'KeyG', key: 'g', offset: 7, isBlack: false, noteName: 'G', seamAfter: 4 },
    { code: 'KeyY', key: 'y', offset: 8, isBlack: true,  noteName: 'G#', seamIndex: 4 },
    { code: 'KeyH', key: 'h', offset: 9, isBlack: false, noteName: 'A', seamAfter: 5 },
    { code: 'KeyU', key: 'u', offset: 10, isBlack: true, noteName: 'A#', seamIndex: 5 },
    { code: 'KeyJ', key: 'j', offset: 11, isBlack: false, noteName: 'B' },
    { code: 'KeyK', key: 'k', offset: 12, isBlack: false, noteName: 'C', seamAfter: 7 },
    { code: 'KeyO', key: 'o', offset: 13, isBlack: true, noteName: 'C#', seamIndex: 7 },
    { code: 'KeyL', key: 'l', offset: 14, isBlack: false, noteName: 'D', seamAfter: 8 },
    { code: 'KeyP', key: 'p', offset: 15, isBlack: true, noteName: 'D#', seamIndex: 8 },
    { code: 'Semicolon', key: ';', offset: 16, isBlack: false, noteName: 'E' },
    { code: 'Quote', key: "'", offset: 17, isBlack: false, noteName: 'F' }
  ];

  // Lookup maps for fast access
  var CODE_TO_NOTE = {};
  var CHAR_TO_NOTE = {};
  for (var i = 0; i < NOTE_KEYS.length; i++) {
    var item = NOTE_KEYS[i];
    CODE_TO_NOTE[item.code] = item;
    CHAR_TO_NOTE[item.key] = item;
  }

  function Keyboard(synth, audioContext, options) {
    options = options || {};
    this.synth = synth;
    this.audioContext = audioContext || null;
    this.octave = typeof options.octave === 'number' ? options.octave : 4;
    this.minOctave = options.minOctave || 1;
    this.maxOctave = options.maxOctave || 7;
    this.velocity = typeof options.velocity === 'number' ? options.velocity : 1.0;

    // Active key tracking: keyIdentifier -> noteNumber
    this.activeKeys = {};
    // Active mouse/touch note tracking
    this.activePointerNotes = {};

    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
    this.onBlur = this.handleBlur.bind(this);

    this.containerId = options.containerId || 'keyboard-keys';
    this.octaveDisplayId = options.octaveDisplayId || 'octave-display';

    if (typeof window !== 'undefined' && options.autoAttach !== false) {
      this.attach();
    }
  }

  Keyboard.NOTE_KEYS = NOTE_KEYS;

  Keyboard.prototype.attach = function() {
    window.addEventListener('keydown', this.onKeyDown, false);
    window.addEventListener('keyup', this.onKeyUp, false);
    window.addEventListener('blur', this.onBlur, false);
    document.addEventListener('visibilitychange', this.onBlur, false);

    this.renderUI();
  };

  Keyboard.prototype.detach = function() {
    window.removeEventListener('keydown', this.onKeyDown, false);
    window.removeEventListener('keyup', this.onKeyUp, false);
    window.removeEventListener('blur', this.onBlur, false);
    document.removeEventListener('visibilitychange', this.onBlur, false);
    this.releaseAll();
  };

  Keyboard.prototype.getBaseNote = function() {
    // MIDI note number for C of current octave: (octave + 1) * 12
    return (this.octave + 1) * 12;
  };

  Keyboard.prototype.getNoteNumber = function(offset) {
    var note = this.getBaseNote() + offset;
    return Math.max(0, Math.min(127, note));
  };

  Keyboard.prototype.unlockAudio = function() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  };

  Keyboard.prototype.setOctave = function(newOctave) {
    var clamped = Math.max(this.minOctave, Math.min(this.maxOctave, newOctave));
    if (clamped !== this.octave) {
      this.octave = clamped;
      this.updateOctaveDisplay();
      this.renderUI();
    }
  };

  Keyboard.prototype.octaveDown = function() {
    this.setOctave(this.octave - 1);
  };

  Keyboard.prototype.octaveUp = function() {
    this.setOctave(this.octave + 1);
  };

  Keyboard.prototype.shouldIgnoreEvent = function(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) {
      return true;
    }
    var target = e.target || e.srcElement;
    if (target) {
      var tag = target.tagName ? target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || target.isContentEditable) {
        return true;
      }
    }
    return false;
  };

  Keyboard.prototype.handleKeyDown = function(e) {
    if (this.shouldIgnoreEvent(e)) return;

    var code = e.code;
    var keyChar = e.key ? e.key.toLowerCase() : '';

    // Octave controls: Z = down, X = up
    if (code === 'KeyZ' || keyChar === 'z') {
      if (!e.repeat) {
        this.octaveDown();
      }
      e.preventDefault();
      return;
    }
    if (code === 'KeyX' || keyChar === 'x') {
      if (!e.repeat) {
        this.octaveUp();
      }
      e.preventDefault();
      return;
    }

    var noteItem = CODE_TO_NOTE[code] || CHAR_TO_NOTE[keyChar];
    if (!noteItem) return;

    // Prevent key repeat re-triggering voices
    if (e.repeat) {
      e.preventDefault();
      return;
    }

    var keyId = code || keyChar;
    if (this.activeKeys[keyId] !== undefined) {
      e.preventDefault();
      return;
    }

    this.unlockAudio();

    var noteNumber = this.getNoteNumber(noteItem.offset);
    this.activeKeys[keyId] = noteNumber;

    if (this.synth && typeof this.synth.noteOn === 'function') {
      this.synth.noteOn(noteNumber, this.velocity);
    }

    e.preventDefault();
  };

  Keyboard.prototype.handleKeyUp = function(e) {
    if (this.shouldIgnoreEvent(e)) return;

    var code = e.code;
    var keyChar = e.key ? e.key.toLowerCase() : '';

    if (code === 'KeyZ' || keyChar === 'z' || code === 'KeyX' || keyChar === 'x') {
      e.preventDefault();
      return;
    }

    var keyId = code || keyChar;
    if (this.activeKeys[keyId] !== undefined) {
      var noteNumber = this.activeKeys[keyId];
      delete this.activeKeys[keyId];

      if (this.synth && typeof this.synth.noteOff === 'function') {
        this.synth.noteOff(noteNumber);
      }
      e.preventDefault();
    }
  };

  Keyboard.prototype.handleBlur = function() {
    this.releaseAll();
  };

  Keyboard.prototype.releaseAll = function() {
    // Release active QWERTY notes
    for (var keyId in this.activeKeys) {
      if (this.activeKeys.hasOwnProperty(keyId)) {
        var note = this.activeKeys[keyId];
        if (this.synth && typeof this.synth.noteOff === 'function') {
          this.synth.noteOff(note);
        }
      }
    }
    this.activeKeys = {};

    // Release active mouse/touch notes
    for (var pointerNote in this.activePointerNotes) {
      if (this.activePointerNotes.hasOwnProperty(pointerNote)) {
        if (this.synth && typeof this.synth.noteOff === 'function') {
          this.synth.noteOff(parseInt(pointerNote, 10));
        }
      }
    }
    this.activePointerNotes = {};
  };

  Keyboard.prototype.updateOctaveDisplay = function() {
    if (typeof document === 'undefined') return;
    var el = document.getElementById(this.octaveDisplayId);
    if (el) {
      el.textContent = this.octave;
    }
  };

  Keyboard.prototype.renderUI = function() {
    if (typeof document === 'undefined') return;
    var container = document.getElementById(this.containerId);
    if (!container) return;

    this.updateOctaveDisplay();

    // Clear existing keys
    container.innerHTML = '';

    var self = this;
    var baseNote = this.getBaseNote();

    var whiteKeys = [];
    var blackKeys = [];

    for (var i = 0; i < NOTE_KEYS.length; i++) {
      var item = NOTE_KEYS[i];
      if (item.isBlack) {
        blackKeys.push(item);
      } else {
        whiteKeys.push(item);
      }
    }

    var totalWhiteKeys = whiteKeys.length; // 11

    // Render white keys first
    for (var w = 0; w < whiteKeys.length; w++) {
      var wItem = whiteKeys[w];
      var wNoteNum = baseNote + wItem.offset;
      var wOctave = Math.floor(wNoteNum / 12) - 1;
      var wLabel = wItem.noteName + wOctave;

      var wEl = document.createElement('div');
      wEl.id = 'k' + wNoteNum;
      wEl.className = 'piano-key white-key';
      wEl.setAttribute('data-note', wNoteNum);

      var wNoteSpan = document.createElement('span');
      wNoteSpan.className = 'key-note-name';
      wNoteSpan.textContent = wLabel;

      var wBadge = document.createElement('span');
      wBadge.className = 'key-badge';
      wBadge.textContent = wItem.key.toUpperCase();

      wEl.appendChild(wNoteSpan);
      wEl.appendChild(wBadge);

      this.bindKeyEvents(wEl, wNoteNum);
      container.appendChild(wEl);
    }

    // Render black keys with absolute positioning over white keys
    for (var b = 0; b < blackKeys.length; b++) {
      var bItem = blackKeys[b];
      var bNoteNum = baseNote + bItem.offset;
      var bOctave = Math.floor(bNoteNum / 12) - 1;
      var bLabel = bItem.noteName + bOctave;

      var bEl = document.createElement('div');
      bEl.id = 'k' + bNoteNum;
      bEl.className = 'piano-key black-key';
      bEl.setAttribute('data-note', bNoteNum);

      // Position black key over the seam between white keys
      // seamIndex + 1 gives the seam boundary percentage
      var seamPercent = ((bItem.seamIndex + 1) / totalWhiteKeys) * 100;
      bEl.style.left = 'calc(' + seamPercent + '% - 16px)';

      var bNoteSpan = document.createElement('span');
      bNoteSpan.className = 'key-note-name';
      bNoteSpan.textContent = bLabel;

      var bBadge = document.createElement('span');
      bBadge.className = 'key-badge';
      bBadge.textContent = bItem.key.toUpperCase();

      bEl.appendChild(bNoteSpan);
      bEl.appendChild(bBadge);

      this.bindKeyEvents(bEl, bNoteNum);
      container.appendChild(bEl);
    }
  };

  Keyboard.prototype.bindKeyEvents = function(element, noteNumber) {
    var self = this;

    function startNote(e) {
      e.preventDefault();
      self.unlockAudio();
      if (!self.activePointerNotes[noteNumber]) {
        self.activePointerNotes[noteNumber] = true;
        if (self.synth && typeof self.synth.noteOn === 'function') {
          self.synth.noteOn(noteNumber, self.velocity);
        }
      }
    }

    function stopNote(e) {
      if (self.activePointerNotes[noteNumber]) {
        delete self.activePointerNotes[noteNumber];
        if (self.synth && typeof self.synth.noteOff === 'function') {
          self.synth.noteOff(noteNumber);
        }
      }
    }

    element.addEventListener('mousedown', startNote);
    element.addEventListener('mouseup', stopNote);
    element.addEventListener('mouseleave', stopNote);

    element.addEventListener('touchstart', startNote, { passive: false });
    element.addEventListener('touchend', stopNote, { passive: false });
    element.addEventListener('touchcancel', stopNote, { passive: false });
  };

  return Keyboard;
});
