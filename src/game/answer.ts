// PRD §9.1 answer obfuscation: XOR + base64 with a per-puzzle key.
// Stops casual spoilers in DevTools; it is not security (accepted for MVP).
import type { AnswerEntry } from './types';

export const answerKey = (date: string, puzzleNo: number) => `dbd:${date}:${puzzleNo}`;

function xor(bytes: Uint8Array, key: string): Uint8Array {
  const k = new TextEncoder().encode(key);
  return bytes.map((b, i) => b ^ k[i % k.length]);
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Obfuscates any JSON value with the same XOR + base64 scheme (Draft mode uses it for its secret). */
export function encodeSecret(value: unknown, key: string): string {
  return toBase64(xor(new TextEncoder().encode(JSON.stringify(value)), key));
}

export function decodeSecret<T>(encoded: string, key: string): T {
  return JSON.parse(new TextDecoder().decode(xor(fromBase64(encoded), key))) as T;
}

export const encodeAnswer = (entries: AnswerEntry[], key: string): string => encodeSecret(entries, key);
export const decodeAnswer = (encoded: string, key: string): AnswerEntry[] => decodeSecret<AnswerEntry[]>(encoded, key);
