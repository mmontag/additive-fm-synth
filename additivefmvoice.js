/**
 * Additive FM Voice
 * Synthesizes FM sideband components directly using additive synthesis
 * with anti-aliasing above Nyquist.
 */

var SINE_TABLE_SIZE = 8192;
var SINE_TABLE = new Float32Array(SINE_TABLE_SIZE);
for (var _s = 0; _s < SINE_TABLE_SIZE; _s++) {
  SINE_TABLE[_s] = Math.sin((_s / SINE_TABLE_SIZE) * PERIOD);
}
var SINE_RAD_TO_INDEX = SINE_TABLE_SIZE / PERIOD;
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
  this.currentAmps = new Float32Array(this.numBands);
  this.ampTos = new Float32Array(this.numBands);
  this.ampSteps = new Float32Array(this.numBands);

  this.activeIndices = new Int32Array(this.numBands);
  this.activeCount = 0;

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
    this.currentAmps[i] = 0;
    this.ampTos[i] = 0;
    this.ampSteps[i] = 0;
  }

  this.indexEnv.render();
  this.update();
  for (var i = 0; i < this.numBands; i++) {
    this.currentAmps[i] = this.ampTos[i];
    this.ampSteps[i] = 0;
  }
};

AdditiveFMVoice.prototype.update = function() {
  var index = this.indexMin + this.indexEnv.val * (this.indexMax - this.indexMin);
  var carrier = this.frequency;
  var mod = this.frequency / 4;
  var centerIdx = MAX_SIDEBANDS / 2;
  var nyquist = SAMPLE_RATE / 2;

  var activeCount = 0;

  for (var order = 0; order < MAX_SIDEBANDS / 2; order++) {
    var amp = besselj(index, order);

    // Upper sideband
    var upperIdx = centerIdx + order;
    var uFreq = carrier + mod * order;
    this.freqs[upperIdx] = uFreq;
    this.phaseSteps[upperIdx] = (PERIOD * uFreq) / SAMPLE_RATE;
    var uAmpTo = ANTI_ALIAS ? (uFreq > nyquist ? 0 : amp) : amp;
    this.ampSteps[upperIdx] = (uAmpTo - this.currentAmps[upperIdx]) * this.updateIntervalInverse;
    this.ampTos[upperIdx] = uAmpTo;
    if (Math.abs(this.currentAmps[upperIdx]) > 1e-4 || Math.abs(uAmpTo) > 1e-4) {
      this.activeIndices[activeCount++] = upperIdx;
    }

    // Lower sideband
    var lowerIdx = centerIdx - order;
    var lFreq = carrier - mod * order;
    this.freqs[lowerIdx] = lFreq;
    this.phaseSteps[lowerIdx] = (PERIOD * lFreq) / SAMPLE_RATE;
    var sign = (order % 2 === 1) ? -1 : 1;
    var lAmpTo = ANTI_ALIAS ? sign * (Math.abs(lFreq) > nyquist ? 0 : amp) : sign * amp;
    this.ampSteps[lowerIdx] = (lAmpTo - this.currentAmps[lowerIdx]) * this.updateIntervalInverse;
    this.ampTos[lowerIdx] = lAmpTo;
    if (Math.abs(this.currentAmps[lowerIdx]) > 1e-4 || Math.abs(lAmpTo) > 1e-4) {
      this.activeIndices[activeCount++] = lowerIdx;
    }
  }
  this.activeCount = activeCount;
};

AdditiveFMVoice.prototype.render = function() {
  this.indexEnv.render();
  if (this.updateCounter++ >= this.updateInterval) {
    this.update();
    this.updateCounter = 0;
  }

  var val = 0;
  var count = this.activeCount;
  for (var k = 0; k < count; k++) {
    var i = this.activeIndices[k];
    this.currentAmps[i] += this.ampSteps[i];
    var idx = (this.phases[i] * SINE_RAD_TO_INDEX) & SINE_MASK;
    val += this.currentAmps[i] * SINE_TABLE[idx];
    this.phases[i] += this.phaseSteps[i];
    if (this.phases[i] >= PERIOD) this.phases[i] -= PERIOD;
    else if (this.phases[i] < 0) this.phases[i] += PERIOD;
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
