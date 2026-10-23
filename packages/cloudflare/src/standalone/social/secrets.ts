import type { SecretBox } from './types.js';
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (text: string) => Uint8Array.from(atob(text), char => char.charCodeAt(0));
/**
 * Creates an AES-GCM envelope with tenant/site/account associated-data binding and explicit rotation keys.
 * @param options - Trusted configuration or scoped server binding.
 * @returns Scoped result; invalid state or stale admission fails closed.
 * @example import { createSecretBox } from '@alneas/sitekit-cloudflare/standalone';
 * export const invoke = (...args: Parameters<typeof createSecretBox>) => createSecretBox(...args);
 */
export function createSecretBox(options: {
  /** Trusted currentKeyId value. */
  currentKeyId: string;
  /** Trusted keys value. */
  keys: Record<string, Uint8Array>
}): SecretBox {
  const keys = Object.fromEntries(Object.entries(options.keys).map(([id, bytes]) => [id, new Uint8Array(bytes)]));
  if (!keys[options.currentKeyId] || Object.values(keys).some(bytes => bytes.byteLength !== 32)) throw new Error('32-byte encryption keys required');
  const key = async (id: string) => { if (!keys[id]) throw new Error('Encryption key unavailable'); return crypto.subtle.importKey('raw', keys[id]!, 'AES-GCM', false, ['encrypt', 'decrypt']); };
  return {
    async seal(value, context) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, await key(options.currentKeyId), new TextEncoder().encode(value));
      return { keyId: options.currentKeyId, iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) };
    },
    async open(value, context) {
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(value.iv), additionalData: new TextEncoder().encode(context) }, await key(value.keyId), decode(value.ciphertext));
      return new TextDecoder().decode(plaintext);
    },
  };
}
