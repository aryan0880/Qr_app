/**
 * Sound Design Synthesizer for QRMesh Motion Showreel
 * Generates all SFX procedurally via the Web Audio API:
 * - Mechanical relay clicks
 * - Staccato acoustic data chirps
 * - Deep sub bass impacts
 * - High-tech HUD laser sweeps
 * - Decryption resolution chimes
 */

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      ctx = new AudioContextClass();
    }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function playRelayClick(volume = 0.25): void {
  const c = getContext();
  if (!c || volume <= 0) return;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(800, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.025);

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

  osc.connect(gain);
  gain.connect(c.destination);

  osc.start(now);
  osc.stop(now + 0.04);
}

export function playSubBassDrop(volume = 0.3): void {
  const c = getContext();
  if (!c || volume <= 0) return;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(120, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.4);

  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  osc.connect(gain);
  gain.connect(c.destination);

  osc.start(now);
  osc.stop(now + 0.55);
}

export function playDataChirp(seed: number, volume = 0.15): void {
  const c = getContext();
  if (!c || volume <= 0) return;
  const now = c.currentTime;
  const duration = 0.04;

  const syncFreq = 2200;
  const dataFreq = 1600 + ((seed * 211) % 1800);

  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  const gain = c.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(syncFreq, now);

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(dataFreq, now);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(c.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + duration);
  osc2.stop(now + duration);
}

export function playLaserSweep(volume = 0.2): void {
  const c = getContext();
  if (!c || volume <= 0) return;
  const now = c.currentTime;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(2400, now + 0.15);

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

  osc.connect(gain);
  gain.connect(c.destination);

  osc.start(now);
  osc.stop(now + 0.22);
}

export function playSuccessChime(volume = 0.25): void {
  const c = getContext();
  if (!c || volume <= 0) return;
  const now = c.currentTime;

  const freqs = [880, 1174.66, 1760];
  freqs.forEach((freq, idx) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const startTime = now + idx * 0.08;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume * 0.7, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

    osc.connect(gain);
    gain.connect(c.destination);

    osc.start(startTime);
    osc.stop(startTime + 0.5);
  });
}
