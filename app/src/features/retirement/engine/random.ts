/**
 * Deterministic PRNG + Gaussian sampler, ported bit-for-bit from
 * retirement-engine.js so Monte Carlo output is identical to the legacy
 * engine for the same seed (the parity oracle in engine.test.ts depends on
 * this).
 */

export type RandomFn = () => number

export function mulberry32(seed: number): RandomFn {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeGaussian(rand: RandomFn): RandomFn {
  let spare: number | null = null
  return function () {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    let u: number, v: number, s: number
    do {
      u = rand() * 2 - 1
      v = rand() * 2 - 1
      s = u * u + v * v
    } while (s === 0 || s >= 1)
    const mul = Math.sqrt((-2 * Math.log(s)) / s)
    spare = v * mul
    return u * mul
  }
}
