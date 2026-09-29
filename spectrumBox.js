/*
   SpectrumBox - A JavaScript spectral analyzer.
   Mohit Cheppudira - 0xfe.blogspot.com
*/

/**
  @constructor
  Create an n-point FFT based spectral analyzer.
  @param num_points - Number of points for transform.
  @param num_bins - Number of bins to show on canvas.
  @param canvas_id - Canvas element ID.
  @param audio_context - An AudioContext instance.
*/
SpectrumBox = function(num_points, num_bins, canvas_id, audio_context, type) {
  this.init(num_points, num_bins, canvas_id, audio_context, type);
}

SpectrumBox.Types = {
  FREQUENCY: 1,
  TIME: 2
}

SpectrumBox.prototype.init = function(
    num_points, num_bins,
    canvas_id, audio_context, type) {
  this.num_bins = num_bins;
  this.num_points = num_points;
  this.canvas_id = canvas_id;
  this.update_rate_ms = 16;
  this.smoothing = 0.25;
  this.type = type || SpectrumBox.Types.FREQUENCY;

  // Number of points we actually want to display. If zero, display all points.
  this.valid_points = 0;

  // Determine the boundaries of the canvas.
  this.canvas = document.getElementById(canvas_id);
  this.width = this.canvas.width;
  this.height = this.canvas.height;
  if (this.type == SpectrumBox.Types.FREQUENCY) {
    this.bar_spacing = 0;
  } else {
    this.bar_spacing = 1;
  }

  this.ctx = this.canvas.getContext('2d');
  this.actx = audio_context;

  // Create the spectral analyzer
  this.fft = this.actx.createAnalyser();
  this.fft.fftSize = this.num_points;
  this.data = new Uint8Array(this.fft.frequencyBinCount);

  // Precompute dB to magnitude lookup table
  this.initDbTable();
}

SpectrumBox.prototype.initDbTable = function() {
  this.dbTable = new Float32Array(256);
  var minDb = this.fft ? this.fft.minDecibels : -100;
  var maxDb = this.fft ? this.fft.maxDecibels : -30;
  var rangeDb = maxDb - minDb;
  for (var i = 0; i < 256; i++) {
    var db = (i / 256) * rangeDb + minDb;
    this.dbTable[i] = Math.pow(10, 0.05 * db) * 35;
  }
};

/* Returns the AudioNode of the FFT. You can route signals into this. */
SpectrumBox.prototype.getAudioNode = function() {
  return this.fft;
}

/* Returns the canvas' 2D context. Use this to configure the look
   of the display. */
SpectrumBox.prototype.getCanvasContext = function() {
  return this.ctx;
}

/* Set the number of points to work with. */
SpectrumBox.prototype.setValidPoints = function(points) {
  this.valid_points = points;
  return this;
}

/* Set the domain type for the graph (TIME / FREQUENCY. */
SpectrumBox.prototype.setType = function(type) {
  this.type = type;
  return this;
}

/* Enable the analyzer. Starts drawing stuff on the canvas using requestAnimationFrame. */
SpectrumBox.prototype.enable = function() {
  var that = this;
  if (!this.animating) {
    this.animating = true;
    function draw() {
      if (that.animating) {
        that.update();
        that.rafId = window.requestAnimationFrame(draw);
      }
    }
    this.rafId = window.requestAnimationFrame(draw);
  }
  return this;
}

/* Disable the analyzer. Stops drawing stuff on the canvas. */
SpectrumBox.prototype.disable = function() {
  this.animating = false;
  if (this.rafId) {
    window.cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
  return this;
}

/* Updates the canvas display. */
SpectrumBox.prototype.update = function() {
  var data = this.data;
  if (this.type == SpectrumBox.Types.FREQUENCY) {
    this.fft.smoothingTimeConstant = this.smoothing;
    this.fft.getByteFrequencyData(data);
  } else {
    this.fft.smoothingTimeConstant = 0;
    this.fft.getByteTimeDomainData(data);
  }

  var length = data.length;

  // Clear canvas then redraw graph.
  this.ctx.fillStyle = this.background;
  this.ctx.fillRect(0, 0, this.width, this.height);

  var bar_width = 1;

  if (this.type == SpectrumBox.Types.FREQUENCY) {
    this.ctx.fillStyle = this.foreground;
    this.ctx.beginPath();
    for (var i = 0; i < length; ++i) {
      var mag = this.dbTable[data[i]];
      var barHeight = mag * this.height;
      if (barHeight > 0) {
        this.ctx.rect(
          i * bar_width, this.height,
          bar_width - this.bar_spacing, -barHeight);
      }
    }
    this.ctx.fill();
  } else {
    this.ctx.strokeStyle = this.foreground;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    for (var i = 0; i < length; ++i) {
      var y = this.height / 2 - (data[i] - 128) / 64 * this.height + 2;
      if (i === 0) {
        this.ctx.moveTo(i, y);
      } else {
        this.ctx.lineTo(i, y);
      }
    }
    this.ctx.stroke();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpectrumBox;
}