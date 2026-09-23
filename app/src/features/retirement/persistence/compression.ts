/**
 * Deflate + base64url compression with a format marker ('C' = deflate, 'R'
 * = raw JSON), so an older link survives a future change to the
 * compression path. Ported approach (not code) from plan-state.js's
 * compressState/decompressState — see
 * docs/retirement-react-rewrite-plan.md §3.7: without a backend there's no
 * way to make the URL itself shorter than this, so the format is kept,
 * just re-encapsulated as a hook (persistence/shareLink.ts) instead of
 * module-level imperative functions.
 */

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '==='.slice((b64.length + 3) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

export async function compressJson(obj: unknown): Promise<string> {
  const json = JSON.stringify(obj)
  if (typeof CompressionStream === 'function') {
    try {
      const stream = new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(new CompressionStream('deflate'))
      const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
      return 'C' + bytesToBase64url(bytes)
    } catch {
      // fall through to raw
    }
  }
  return 'R' + bytesToBase64url(new TextEncoder().encode(json))
}

export async function decompressJson<T>(str: string): Promise<T> {
  const marker = str[0]
  const bytes = base64urlToBytes(str.slice(1))
  if (marker === 'C') {
    const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('deflate'))
    return JSON.parse(new TextDecoder().decode(await new Response(stream).arrayBuffer())) as T
  }
  if (marker === 'R') return JSON.parse(new TextDecoder().decode(bytes)) as T
  throw new Error('Unknown share-link format.')
}
