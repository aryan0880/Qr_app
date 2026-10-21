import * as pako from 'pako';
import { encodeFountainPacket } from './fountain';

// Encode array buffer to base64
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Decode base64 to array buffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// Byte chunk size: 45 raw bytes yields exactly 60 Base64 characters
export const BYTE_CHUNK_SIZE = 45;
export const LEGACY_CHUNK_SIZE = 60; 

function encode8BitWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length);
  const view = new DataView(buffer);
  
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 1 channel
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // ByteRate
  view.setUint16(32, 1, true); // BlockAlign
  view.setUint16(34, 8, true); // BitsPerSample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length, true);

  // Write 8-bit samples (0-255, center 128)
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    let val = Math.round((s + 1) * 127.5);
    view.setUint8(44 + i, val);
  }
  return buffer;
}

export type ImageQualityPreset = 'fast' | 'balanced' | 'hd';

export async function compressAndChunkFile(
  file: File,
  onProgress?: (progress: number, status: string) => void,
  useFountain: boolean = true,
  imageQuality: ImageQualityPreset = 'balanced'
): Promise<string[]> {
  const wait = () => new Promise(r => setTimeout(r, 25));

  let bytes: Uint8Array;
  let typeFlag: 'i' | 'a' = 'i';

  if (file.type.startsWith('audio')) {
    typeFlag = 'a';
    onProgress?.(10, "Loading Audio...");
    await wait();

    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await file.arrayBuffer();
    onProgress?.(30, "Decoding Audio Track...");
    await wait();
    
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    
    onProgress?.(50, "Downsampling to 8kHz Mono...");
    await wait();
    
    const TARGET_SAMPLE_RATE = 8000;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);
    const renderedBuffer = await offlineCtx.startRendering();
    
    onProgress?.(70, "Encoding 8-bit WAV...");
    await wait();
    const wavBuffer = encode8BitWAV(renderedBuffer.getChannelData(0), TARGET_SAMPLE_RATE);
    bytes = new Uint8Array(wavBuffer);
  } else {
    typeFlag = 'i';
    onProgress?.(10, "Loading Photo...");
    await wait();

    // Downscale image according to selected quality preset
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    onProgress?.(30, "Optimizing Resolution...");
    await wait();

    // Presets:
    // fast: 150px, quality 0.25 (ultra fast transfer)
    // balanced: 320px, quality 0.55 (sharp & crisp on mobile, reasonable packet count)
    // hd: 480px, quality 0.70 (high clarity details)
    let maxDimension = 320;
    let jpegQuality = 0.55;

    if (imageQuality === 'fast') {
      maxDimension = 160;
      jpegQuality = 0.25;
    } else if (imageQuality === 'hd') {
      maxDimension = 480;
      jpegQuality = 0.70;
    }

    const canvas = document.createElement('canvas');
    let width = img.width;
    let height = img.height;

    if (width > height) {
      if (width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      }
    } else {
      if (height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    
    onProgress?.(50, "Extracting Image Pixels...");
    await wait();

    const dataUrl = canvas.toDataURL('image/jpeg', jpegQuality);
    const base64Data = dataUrl.split(',')[1];
    
    const binStr = window.atob(base64Data);
    bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
  }

  onProgress?.(80, "Zlib Deflate Compression...");
  await wait();

  const compressed = pako.deflate(bytes);
  const origCompressedLength = compressed.length;

  if (useFountain) {
    onProgress?.(90, "Generating Fountain Packets...");
    await wait();

    const K = Math.ceil(origCompressedLength / BYTE_CHUNK_SIZE);
    const rawChunks: Uint8Array[] = [];

    for (let i = 0; i < K; i++) {
      const chunk = new Uint8Array(BYTE_CHUNK_SIZE);
      const slice = compressed.subarray(i * BYTE_CHUNK_SIZE, (i + 1) * BYTE_CHUNK_SIZE);
      chunk.set(slice);
      rawChunks.push(chunk);
    }

    const totalFrames = Math.max(K + 8, Math.ceil(K * 1.45));
    const chunks: string[] = [];

    for (let seed = 0; seed < totalFrames; seed++) {
      const { data } = encodeFountainPacket(rawChunks, seed, BYTE_CHUNK_SIZE);
      const payloadBase64 = arrayBufferToBase64(data.buffer);
      chunks.push(`f|${seed}|${K}|${origCompressedLength}|${typeFlag}|${payloadBase64}`);
    }

    onProgress?.(100, "Fountain Stream Ready");
    await wait();
    return chunks;
  } else {
    onProgress?.(90, "Generating Fixed Chunks...");
    await wait();

    const compressedBase64 = arrayBufferToBase64(compressed.buffer);
    const chunks: string[] = [];
    const totalChunks = Math.ceil(compressedBase64.length / LEGACY_CHUNK_SIZE);
    
    for (let i = 0; i < totalChunks; i++) {
      const chunkData = compressedBase64.slice(i * LEGACY_CHUNK_SIZE, (i + 1) * LEGACY_CHUNK_SIZE);
      chunks.push(`${i}|${totalChunks}|${typeFlag}|${chunkData}`);
    }

    onProgress?.(100, "Ready to Transmit");
    await wait();
    return chunks;
  }
}

/**
 * Compresses and chunks raw text for optical transmission
 */
export async function compressAndChunkText(
  text: string,
  onProgress?: (progress: number, status: string) => void,
  useFountain: boolean = true
): Promise<string[]> {
  const wait = () => new Promise(r => setTimeout(r, 20));

  onProgress?.(20, "Encoding UTF-8 Text...");
  await wait();
  const bytes = new TextEncoder().encode(text.trim());

  onProgress?.(55, "Zlib Compressing Text...");
  await wait();
  const compressed = pako.deflate(bytes);
  const origCompressedLength = compressed.length;
  const typeFlag = 't'; // 't' for text

  if (useFountain) {
    onProgress?.(80, "Generating Fountain Packets...");
    await wait();

    const K = Math.ceil(origCompressedLength / BYTE_CHUNK_SIZE);
    const rawChunks: Uint8Array[] = [];

    for (let i = 0; i < K; i++) {
      const chunk = new Uint8Array(BYTE_CHUNK_SIZE);
      const slice = compressed.subarray(i * BYTE_CHUNK_SIZE, (i + 1) * BYTE_CHUNK_SIZE);
      chunk.set(slice);
      rawChunks.push(chunk);
    }

    const totalFrames = Math.max(K + 6, Math.ceil(K * 1.4));
    const chunks: string[] = [];

    for (let seed = 0; seed < totalFrames; seed++) {
      const { data } = encodeFountainPacket(rawChunks, seed, BYTE_CHUNK_SIZE);
      const payloadBase64 = arrayBufferToBase64(data.buffer);
      chunks.push(`f|${seed}|${K}|${origCompressedLength}|${typeFlag}|${payloadBase64}`);
    }

    onProgress?.(100, "Text Fountain Ready");
    await wait();
    return chunks;
  } else {
    onProgress?.(80, "Generating Fixed Chunks...");
    await wait();

    const compressedBase64 = arrayBufferToBase64(compressed.buffer);
    const chunks: string[] = [];
    const totalChunks = Math.ceil(compressedBase64.length / LEGACY_CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const chunkData = compressedBase64.slice(i * LEGACY_CHUNK_SIZE, (i + 1) * LEGACY_CHUNK_SIZE);
      chunks.push(`${i}|${totalChunks}|${typeFlag}|${chunkData}`);
    }

    onProgress?.(100, "Ready to Transmit");
    await wait();
    return chunks;
  }
}

export function reassembleFromFountainChunks(
  solvedChunks: Uint8Array[],
  origCompressedLength: number,
  dataType: 'image' | 'audio' | 'text'
): string {
  if (solvedChunks.length === 0) throw new Error("No solved chunks to reassemble");

  const chunkSize = solvedChunks[0].length;
  const combined = new Uint8Array(solvedChunks.length * chunkSize);
  for (let i = 0; i < solvedChunks.length; i++) {
    combined.set(solvedChunks[i], i * chunkSize);
  }

  // Trim to exact original length
  const compressed = combined.subarray(0, origCompressedLength);
  const decompressed = pako.inflate(compressed);

  if (dataType === 'text') {
    return new TextDecoder().decode(decompressed);
  }

  let binaryString = '';
  for (let i = 0; i < decompressed.length; i++) {
    binaryString += String.fromCharCode(decompressed[i]);
  }

  const base64 = window.btoa(binaryString);
  const mime = dataType === 'audio' ? 'audio/wav' : 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

export function reassembleAndDecompress(
  chunksData: string[], 
  dataType: 'image' | 'audio' | 'text'
): string {
  const compressedBase64 = chunksData.join('');
  const compressedBuffer = base64ToArrayBuffer(compressedBase64);
  const decompressed = pako.inflate(new Uint8Array(compressedBuffer));
  
  if (dataType === 'text') {
    return new TextDecoder().decode(decompressed);
  }

  let binaryString = '';
  for (let i = 0; i < decompressed.length; i++) {
    binaryString += String.fromCharCode(decompressed[i]);
  }
  
  const base64 = window.btoa(binaryString);
  const mime = dataType === 'audio' ? 'audio/wav' : 'image/jpeg';
  return `data:${mime};base64,${base64}`;
}

export function createSampleImageFile(): Promise<File> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext('2d')!;

    // Background - Lego Yellow
    ctx.fillStyle = '#FFD500';
    ctx.fillRect(0, 0, 120, 120);

    // Border
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#2B2B2B';
    ctx.strokeRect(3, 3, 114, 114);

    // Lego studs on top
    ctx.fillStyle = '#D01012';
    ctx.fillRect(35, 15, 20, 12);
    ctx.strokeRect(35, 15, 20, 12);
    ctx.fillRect(65, 15, 20, 12);
    ctx.strokeRect(65, 15, 20, 12);

    // Robot / Lego Face Box
    ctx.fillStyle = '#0057A6';
    ctx.fillRect(25, 27, 70, 60);
    ctx.strokeRect(25, 27, 70, 60);

    // Eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(38, 42, 14, 14);
    ctx.fillRect(68, 42, 14, 14);
    ctx.fillStyle = '#2B2B2B';
    ctx.fillRect(44, 46, 6, 6);
    ctx.fillRect(74, 46, 6, 6);

    // Smile
    ctx.fillStyle = '#00A650';
    ctx.fillRect(45, 68, 30, 8);
    ctx.strokeRect(45, 68, 30, 8);

    // Label
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#2B2B2B';
    ctx.textAlign = 'center';
    ctx.fillText('QR-MESH', 60, 106);

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(new File([blob], 'sample-lego-bot.jpg', { type: 'image/jpeg' }));
      }
    }, 'image/jpeg', 0.8);
  });
}

export async function createSampleAudioFile(): Promise<File> {
  const sampleRate = 8000;
  const duration = 0.8;
  const offlineCtx = new OfflineAudioContext(1, Math.ceil(duration * sampleRate), sampleRate);

  const notes = [
    { freq: 523.25, start: 0.00, dur: 0.18 },
    { freq: 659.25, start: 0.18, dur: 0.18 },
    { freq: 783.99, start: 0.36, dur: 0.18 },
    { freq: 1046.50, start: 0.54, dur: 0.24 },
  ];

  for (const n of notes) {
    const osc = offlineCtx.createOscillator();
    const gain = offlineCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(n.freq, n.start);

    gain.gain.setValueAtTime(0.01, n.start);
    gain.gain.exponentialRampToValueAtTime(0.25, n.start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, n.start + n.dur);

    osc.connect(gain);
    gain.connect(offlineCtx.destination);

    osc.start(n.start);
    osc.stop(n.start + n.dur);
  }

  const renderedBuffer = await offlineCtx.startRendering();
  const wavBuffer = encode8BitWAV(renderedBuffer.getChannelData(0), sampleRate);
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return new File([blob], 'sample-arcade-chime.wav', { type: 'audio/wav' });
}

export function getSampleSecretText(): string {
  return `🔐 AIR-GAP SECRET NOTE
---------------------------------
Timestamp: ${new Date().toISOString()}
Protocol: QRMesh Optical Fountain
Passcode: #kbs-mesh-9982-gamma

"Transfer complete with 0 bytes transmitted over any network. 100% optical light air-gap verification."`;
}
