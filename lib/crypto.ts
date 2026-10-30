import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Asserts that the key is exactly 64 hex characters (32 bytes for AES-256).
 * Throws a clear error at use time so misconfiguration is caught early.
 */
function assertValidKey(key: string): void {
  if (!/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      'ENCRYPTION_KEY muss genau 64 Hex-Zeichen (32 Byte) sein. ' +
        'Generieren mit: openssl rand -hex 32',
    );
  }
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * @param plaintext  UTF-8 string to encrypt
 * @param key        32-byte hex key (ENCRYPTION_KEY env var)
 * @returns          base64 ciphertext (with 16-byte auth tag appended) + hex IV
 */
export function encrypt(plaintext: string, key: string): { encrypted: string; iv: string } {
  assertValidKey(key);
  const keyBuffer = Buffer.from(key, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([ciphertext, authTag]).toString('base64'),
    iv: iv.toString('hex'),
  };
}

/**
 * Decrypts AES-256-GCM ciphertext.
 * @param encrypted  base64 ciphertext+authTag
 * @param iv         hex IV
 * @param key        32-byte hex key
 */
export function decrypt(encrypted: string, iv: string, key: string): string {
  assertValidKey(key);
  const keyBuffer = Buffer.from(key, 'hex');
  const ivBuffer = Buffer.from(iv, 'hex');
  const data = Buffer.from(encrypted, 'base64');
  const authTag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
