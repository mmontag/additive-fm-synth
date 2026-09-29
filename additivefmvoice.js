/**
 * Additive FM Voice
 * Synthesizes FM sideband components directly using additive synthesis
 * with anti-aliasing above Nyquist.
 */

var TWO_PI = Math.PI * 2;
var PERIOD = typeof PERIOD !== 'undefined' ? PERIOD : TWO_PI;
var MAX_SIDEBANDS = typeof MAX_SIDEBANDS !== 'undefined' ? MAX_SIDEBANDS : 50;
var SAMPLE_RATE = typeof SAMPLE_RATE !== 'undefined' ? SAMPLE_RATE : 44100;
var ANTI_ALIAS = typeof ANTI_ALIAS !== 'undefined' ? ANTI_ALIAS : true;

var SINE_TABLE_SIZE = 8192;
var SINE_TABLE = new Float32Array(SINE_TABLE_SIZE);
for (var _s = 0; _s < SINE_TABLE_SIZE; _s++) {
  SINE_TABLE[_s] = Math.sin((_s / SINE_TABLE_SIZE) * TWO_PI);
}
var SINE_RAD_TO_INDEX = SINE_TABLE_SIZE / TWO_PI;
var SINE_MASK = SINE_TABLE_SIZE - 1;

function AdditiveFMVoice(frequency, velocity) {
  this.ampEnv = new Envelope(0, 0.1, 0.4, 0.1);
  this.indexEnv = new Envelope(0, 1, 0.1, 0.2);
  this.indexMax = 20;
  this.indexMin = 1;

  this.updateInterval = 128;
  this.updateIntervalInverse = 1 / this.updateInterval;
  this.updateCounter = 0;

  this.numBands = MAX_SIDEBANDS + 1;
  this.freqs = new Float32Array(this.numBands);
  this.phases = new Float32Array(this.numBands);
  this.phaseSteps = new Float32Array(this.numBands);
  this.ampsFrom = new Float32Array(this.numBands);
  this.ampsTo = new Float32Array(this.numBands);

  this.frequency = 0;
  this.velocity = 0;
  this.note = -1;

  if (typeof frequency === 'number' && frequency > 0) {
    this.reset(frequency, velocity || 1.0);
  }
}

AdditiveFMVoice.prototype.reset = function(frequency, velocity, note) {
  this.frequency = frequency;
  this.velocity = typeof velocity === 'number' ? velocity : 1.0;
  this.note = typeof note === 'number' ? note : -1;
  this.updateCounter = 0;

  this.ampEnv.reset();
  this.indexEnv.reset();

  for (var i = 0; i < this.numBands; i++) {
    this.phases[i] = 0;
    this.ampsFrom[i] = 0;
    this.ampsTo[i] = 0;
  }

  this.indexEnv.render();
  this.update();
  for (var i = 0; i < this.numBands; i++) {
    this.ampsFrom[i] = this.ampsTo[i];
  }
};

AdditiveFMVoice.prototype.update = function() {
  var index = this.indexMin + this.indexEnv.val * (this.indexMax - this.indexMin);
  var carrier = this.frequency;
  var mod = this.frequency / 4;
  var centerIdx = Math.floor(MAX_SIDEBANDS / 2);
  var nyquist = SAMPLE_RATE / 2;

  // Order 0: Carrier frequency
  var amp0 = besselj(index, 0);
  this.freqs[centerIdx] = carrier;
  this.phaseSteps[centerIdx] = (TWO_PI * carrier) / SAMPLE_RATE;
  this.ampsFrom[centerIdx] = this.ampsTo[centerIdx];
  this.ampsTo[centerIdx] = ANTI_ALIAS ? (carrier > nyquist ? 0 : amp0) : amp0;

  // Orders 1 to 24 (sidebands)
  for (var order = 1; order <= centerIdx; order++) {
    var amp = besselj(index, order);

    // Upper sideband
    var upperIdx = centerIdx + order;
    if (upperIdx < this.numBands) {
      var uFreq = carrier + mod * order;
      this.freqs[upperIdx] = uFreq;
      this.phaseSteps[upperIdx] = (TWO_PI * uFreq) / SAMPLE_RATE;
      this.ampsFrom[upperIdx] = this.ampsTo[upperIdx];
      this.ampsTo[upperIdx] = ANTI_ALIAS ? (uFreq > nyquist ? 0 : amp) : amp;
    }

    // Lower sideband
    var lowerIdx = centerIdx - order;
    if (lowerIdx >= 0) {
      var lFreq = carrier - mod * order;
      this.freqs[lowerIdx] = lFreq;
      this.phaseSteps[lowerIdx] = (TWO_PI * lFreq) / SAMPLE_RATE;
      var sign = (order % 2 === 1) ? -1 : 1;
      this.ampsFrom[lowerIdx] = this.ampsTo[lowerIdx];
      this.ampsTo[lowerIdx] = ANTI_ALIAS ? (Math.abs(lFreq) > nyquist ? 0 : sign * amp) : sign * amp;
    }
  }
};

AdditiveFMVoice.prototype.render = function() {
  this.indexEnv.render();
  if (this.updateCounter++ >= this.updateInterval) {
    this.update();
    this.updateCounter = 0;
  }

  var updateRemaining = this.updateInterval - this.updateCounter;
  var inv = this.updateIntervalInverse;
  var val = 0;

  for (var i = 0; i < this.numBands; i++) {
    if (this.freqs[i] !== 0) {
      var amp = (this.ampsFrom[i] * updateRemaining + this.ampsTo[i] * this.updateCounter) * inv;
      var idx = (this.phases[i] * SINE_RAD_TO_INDEX) & SINE_MASK;
      val += amp * SINE_TABLE[idx];
      this.phases[i] += this.phaseSteps[i];
      if (this.phases[i] >= TWO_PI) this.phases[i] -= TWO_PI;
      else if (this.phases[i] < 0) this.phases[i] += TWO_PI;
    }
  }
  return this.velocity * this.ampEnv.render() * val;
};

AdditiveFMVoice.prototype.noteOff = function() {
  this.ampEnv.noteOff();
  this.indexEnv.noteOff();
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdditiveFMVoice;
}
