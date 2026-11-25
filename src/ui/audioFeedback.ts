let audioContext: AudioContext | null = null;
let audioEnabled = true;
let audioVolume = 0.65;

export function configureAudioFeedback(enabled: boolean, volume: number) {
  audioEnabled = enabled;
  audioVolume = Math.max(0, Math.min(1, volume / 100));
}

function getAudioContext(): AudioContext | null {
  try {
    audioContext ??= new AudioContext({ latencyHint: "interactive" });
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

export function primeAudioFeedback() {
  if (!audioEnabled || audioVolume <= 0) return;
  getAudioContext();
}

function playTone(
  context: AudioContext,
  frequency: number,
  endFrequency: number,
  startAt: number,
  duration: number,
  peak: number,
  type: OscillatorType,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startAt + duration);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak * audioVolume, startAt + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.01);
}

export function playClickSound() {
  if (!audioEnabled || audioVolume <= 0) return;
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  playTone(context, 620, 300, now, 0.035, 0.4, "triangle");
  playTone(context, 180, 90, now + 0.002, 0.048, 0.17, "sine");

  const clickLength = Math.ceil(context.sampleRate * 0.008);
  const clickBuffer = context.createBuffer(1, clickLength, context.sampleRate);
  const clickSamples = clickBuffer.getChannelData(0);
  for (let index = 0; index < clickLength; index += 1) {
    clickSamples[index] = (Math.random() * 2 - 1) * (1 - index / clickLength);
  }
  const click = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  click.buffer = clickBuffer;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2400, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.24 * audioVolume, now + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.01);
  click.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  click.start(now);
}

export function playLongPressSound() {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  for (const start of [0, 0.105]) {
    playTone(context, 920, 700, now + start, 0.065, 0.24, "triangle");
    playTone(context, 440, 360, now + start, 0.06, 0.08, "sine");
  }
}
