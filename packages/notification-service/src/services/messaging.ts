import crypto from 'crypto';
import { config } from '../utils/config';

const algo = 'aes-256-gcm';

export function encryptMessage(plaintext: string) {
  const keyB64 = config.MSG_ENCRYPTION_KEY_BASE64;
  if (!keyB64) return { ciphertext: plaintext, iv: '', tag: '', enc: false };
  const key = Buffer.from(keyB64, 'base64');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(algo, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    enc: true,
  };
}

export function decryptMessage(ciphertextB64: string, ivB64: string, tagB64: string) {
  const keyB64 = config.MSG_ENCRYPTION_KEY_BASE64;
  if (!keyB64) return ciphertextB64;
  const key = Buffer.from(keyB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv(algo, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}
