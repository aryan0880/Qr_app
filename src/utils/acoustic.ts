/**
 * Optical + Acoustic Dual-Channel Audio Synthesizer for QRMesh
 * Uses Web Audio API to emit high-frequency acoustic data chirps in sync with optical QR frames.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Plays a dual-tone acoustic sync chirp encoding the packet seed
 * @param seed - The packet or frame seed index
 * @param volume - Volume factor between 0.0 and 1.0 (default: 0.15)
 */
export function playAcousticChirp(seed: number, volume: number = 0.15): void {
  const ctx = getAudioContext();
  if (!ctx || volume <= 0) return;

  const now = ctx.currentTime;
  const duration = 0.055; // 55ms rapid burst

  // Base sync tone (2200 Hz)
  const syncFreq = 2200;

  // Data frequency modulated by packet seed (1200 Hz - 3600 Hz range)
  const dataFreq = 1400 + ((seed * 137) % 1800);

  // Sync oscillator
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(syncFreq, now);

  gain1.gain.setValueAtTime(0.001, now);
  gain1.gain.exponentialRampToValueAtTime(volume * 0.7, now + 0.008);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc1.connect(gain1);
  gain1.connect(ctx.destination);

  osc1.start(now);
  osc1.stop(now + duration);

  // Data tone oscillator
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(dataFreq, now + 0.015);

  gain2.gain.setValueAtTime(0.001, now + 0.015);
  gain2.gain.exponentialRampToValueAtTime(volume, now + 0.025);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc2.connect(gain2);
  gain2.connect(ctx.destination);

  osc2.start(now + 0.015);
  osc2.stop(now + duration);
}
