import crypto from 'crypto';
import { env } from '../config/env.js';

const algorithm = 'aes-256-gcm';

export function encryptApiKey(value: string) {
  const iv = crypto.randomBytes(12);
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptApiKey(value: string) {
  const buffer = Buffer.from(value, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const text = buffer.subarray(28);
  const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(text), decipher.final()]);
  return decrypted.toString('utf8');
}
