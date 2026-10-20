/**
 * Luby Transform / Fountain Codes Engine for QRMesh
 * Provides rateless, zero-waiting optical packet streaming over GF(2).
 */

// Simple fast deterministic PRNG (mulberry32)
export function mulberry32(a: number): () => number {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns deterministic neighbors (original chunk indices) for a given packet seed.
 * Seeds 0 to K-1 are systematic (degree 1: just chunk i).
 * Seeds >= K are combinations of 2 to min(K, 7) chunks.
 */
export function getPacketNeighbors(seed: number, totalChunks: number): number[] {
  if (totalChunks <= 1) return [0];

  // Systematic phase: seeds 0 to totalChunks - 1 are pure single chunks
  if (seed < totalChunks) {
    return [seed];
  }

  const rng = mulberry32(seed * 2654435761);

  // Soliton-inspired degree distribution for optical QR chunk sizes
  // Degrees 2 and 3 are given highest weight for fast peeling
  const rand = rng();
  let degree = 2;
  if (totalChunks > 3) {
    if (rand < 0.45) {
      degree = 2;
    } else if (rand < 0.75) {
      degree = 3;
    } else if (rand < 0.90) {
      degree = Math.min(4, totalChunks);
    } else {
      degree = Math.min(5, totalChunks);
    }
  }

  // Pick `degree` distinct indices from [0, totalChunks - 1]
  const indices = new Set<number>();
  let attempts = 0;
  while (indices.size < degree && attempts < 50) {
    attempts++;
    const idx = Math.floor(rng() * totalChunks);
    indices.add(idx);
  }

  // Fallback if set didn't fill
  if (indices.size === 0) indices.add(seed % totalChunks);

  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * XORs array `src` into array `dst`
 */
export function xorBuffers(dst: Uint8Array, src: Uint8Array): void {
  const len = Math.min(dst.length, src.length);
  for (let i = 0; i < len; i++) {
    dst[i] ^= src[i];
  }
}

/**
 * Encodes a Fountain packet from original chunk byte arrays
 */
export function encodeFountainPacket(
  originalChunks: Uint8Array[],
  seed: number,
  chunkSize: number
): { seed: number; neighbors: number[]; data: Uint8Array } {
  const totalChunks = originalChunks.length;
  const neighbors = getPacketNeighbors(seed, totalChunks);

  const payload = new Uint8Array(chunkSize);
  for (const idx of neighbors) {
    const chunk = originalChunks[idx];
    if (chunk) {
      xorBuffers(payload, chunk);
    }
  }

  return { seed, neighbors, data: payload };
}

/**
 * Fountain Decoder using Peeling Algorithm and GF(2) reduction
 */
export interface DecoderStatus {
  isComplete: boolean;
  resolvedCount: number;
  totalChunks: number;
  progressPercent: number;
}

export class FountainDecoder {
  totalChunks: number;
  chunkSize: number;
  solvedChunks: Map<number, Uint8Array>;
  equations: Array<{ neighbors: Set<number>; data: Uint8Array }>;

  constructor(totalChunks: number, chunkSize: number) {
    this.totalChunks = totalChunks;
    this.chunkSize = chunkSize;
    this.solvedChunks = new Map();
    this.equations = [];
  }

  /**
   * Add a newly received packet.
   * Returns true if this packet contributed new innovation (progress), false if redundant.
   */
  addPacket(seed: number, data: Uint8Array): boolean {
    if (this.isComplete()) return false;

    const neighbors = new Set(getPacketNeighbors(seed, this.totalChunks));
    const packetData = new Uint8Array(data);

    // Reduce against already solved chunks
    for (const [idx, solvedData] of this.solvedChunks.entries()) {
      if (neighbors.has(idx)) {
        xorBuffers(packetData, solvedData);
        neighbors.delete(idx);
      }
    }

    if (neighbors.size === 0) {
      // Packet provided no new information
      return false;
    }

    // Add equation and peel
    this.equations.push({ neighbors, data: packetData });
    return this.peel();
  }

  /**
   * Peels degree-1 equations recursively until no more degree-1 equations remain
   */
  private peel(): boolean {
    let madeProgress = false;
    let foundDegree1 = true;

    while (foundDegree1) {
      foundDegree1 = false;

      // Find any equation of degree 1
      for (let i = 0; i < this.equations.length; i++) {
        const eq = this.equations[i];
        if (eq.neighbors.size === 1) {
          foundDegree1 = true;
          madeProgress = true;

          const solvedIdx = eq.neighbors.values().next().value!;
          const solvedData = new Uint8Array(eq.data);

          this.solvedChunks.set(solvedIdx, solvedData);

          // Remove this equation
          this.equations.splice(i, 1);

          // Substitute newly solved variable into all remaining equations
          for (const remaining of this.equations) {
            if (remaining.neighbors.has(solvedIdx)) {
              xorBuffers(remaining.data, solvedData);
              remaining.neighbors.delete(solvedIdx);
            }
          }

          break; // restart scan
        }
      }
    }

    // Clean up empty equations
    this.equations = this.equations.filter((eq) => eq.neighbors.size > 0);

    return madeProgress;
  }

  isComplete(): boolean {
    return this.solvedChunks.size >= this.totalChunks;
  }

  getStatus(): DecoderStatus {
    const resolved = this.solvedChunks.size;
    return {
      isComplete: resolved >= this.totalChunks,
      resolvedCount: resolved,
      totalChunks: this.totalChunks,
      progressPercent: this.totalChunks > 0 ? (resolved / this.totalChunks) * 100 : 0,
    };
  }

  getResolvedChunks(): Uint8Array[] | null {
    if (!this.isComplete()) return null;
    const result: Uint8Array[] = [];
    for (let i = 0; i < this.totalChunks; i++) {
      const chunk = this.solvedChunks.get(i);
      if (!chunk) return null;
      result.push(chunk);
    }
    return result;
  }
}
