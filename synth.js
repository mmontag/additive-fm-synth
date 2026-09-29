function Synth(voiceClass, maxPolyphony) {
	this.voiceClass = voiceClass;
	this.maxPolyphony = maxPolyphony || 16;
	this.activeVoices = []; // Compact array of currently sounding voices
	this.noteToVoice = {};  // Map of noteNumber -> active voice instance
	this.voices = this.noteToVoice; // Backwards-compatible alias
	this.voicePool = [];    // Pre-allocated idle voice pool

	// Pre-populate pool
	for (var i = 0; i < this.maxPolyphony; i++) {
		this.voicePool.push(new this.voiceClass(0, 0));
	}
}

Synth.prototype.frequencyFromNoteNumber = function(note) {
	return 440 * Math.pow(2, (note - 69) / 12);
};

Synth.prototype.noteOn = function(note, velocity) {
	var frequency = this.frequencyFromNoteNumber(note);
	var voice;

	// If note is already playing on an active voice, re-trigger it
	if (this.noteToVoice[note]) {
		voice = this.noteToVoice[note];
		if (typeof voice.reset === 'function') {
			voice.reset(frequency, velocity, note);
		} else {
			voice = new this.voiceClass(frequency, velocity);
			this.noteToVoice[note] = voice;
		}
	} else {
		// Acquire an idle voice from the pool
		if (this.voicePool.length > 0) {
			voice = this.voicePool.pop();
		} else if (this.activeVoices.length >= this.maxPolyphony) {
			// Voice stealing: steal the oldest active voice
			voice = this.activeVoices.shift();
			if (voice && voice.note !== undefined && this.noteToVoice[voice.note] === voice) {
				delete this.noteToVoice[voice.note];
			}
		} else {
			voice = new this.voiceClass(0, 0);
		}

		if (typeof voice.reset === 'function') {
			voice.reset(frequency, velocity, note);
		} else {
			voice = new this.voiceClass(frequency, velocity);
		}
		voice.note = note;
		this.noteToVoice[note] = voice;
		this.activeVoices.push(voice);
	}

	var e = document.getElementById("k" + note);
	if (e)
		e.classList.add("pressed");
};

Synth.prototype.noteOff = function(note) {
	var voice = this.noteToVoice[note];
	if (voice) {
		voice.noteOff();
		// Voice remains in this.activeVoices until its release envelope finishes (ENV_OFF)
	}

	var e = document.getElementById("k" + note);
	if (e)
		e.classList.remove("pressed");
};

Synth.prototype.render = function() {
	var val = 0;
	var count = this.activeVoices.length;
	for (var i = 0; i < count; i++) {
		var voice = this.activeVoices[i];
		val += voice.render();
		if (voice.ampEnv && voice.ampEnv.state === ENV_OFF) {
			// Voice release completed: reclaim to pool
			if (this.noteToVoice[voice.note] === voice) {
				delete this.noteToVoice[voice.note];
			}
			this.activeVoices.splice(i, 1);
			this.voicePool.push(voice);
			i--;
			count--;
		}
	}
	return val;
};

if (typeof module !== 'undefined' && module.exports) {
	module.exports = Synth;
}