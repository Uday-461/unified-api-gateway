import bcrypt from 'bcrypt';
import crypto from 'crypto';

export function hashApiKey(apiKey: string): string {
  return bcrypt.hashSync(apiKey, 10);
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `zup_${crypto.randomBytes(32).toString('hex')}`;
  const hash = hashApiKey(key);
  const prefix = key.substring(0, 8);
  return { key, hash, prefix };
}

export function encrypt(text: string, key: string): string {
  const algorithm = 'aes-256-cbc';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedText: string, key: string): string {
  if (!encryptedText || encryptedText === 'encrypted_key_here') {
    return 'placeholder_key';
  }

  try {
    const algorithm = 'aes-256-cbc';
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipher(algorithm, key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    return 'placeholder_key';
  }
}