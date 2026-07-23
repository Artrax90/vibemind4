// AES encryption for passwords using Web Crypto API
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

// Derive a key from a passphrase
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a string
export async function encrypt(plaintext: string, passphrase: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: iv },
    key,
    encoder.encode(plaintext)
  );
  
  // Combine salt + iv + ciphertext and base64 encode
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Decrypt a string
export async function decrypt(ciphertext: string, passphrase: string): Promise<string> {
  const decoder = new TextDecoder();
  const combined = new Uint8Array([...atob(ciphertext)].map(c => c.charCodeAt(0)));
  
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const data = combined.slice(28);
  
  const key = await deriveKey(passphrase, salt);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: iv },
    key,
    data
  );
  
  return decoder.decode(decrypted);
}

// Simple passphrase derived from machine ID
const MACHINE_PASSPHRASE = 'vibemind-desktop-' + (navigator.userAgent.slice(0, 20));

export async function encryptPassword(password: string): Promise<string> {
  if (!password) return '';
  try {
    return await encrypt(password, MACHINE_PASSPHRASE);
  } catch (e) {
    console.error('Encryption failed:', e);
    return password; // Fallback to plaintext on error
  }
}

export async function decryptPassword(encrypted: string): Promise<string> {
  if (!encrypted) return '';
  // Check if it's already encrypted (base64 format)
  if (!encrypted.includes('/') && !encrypted.includes('+') && encrypted.length < 10) {
    return encrypted; // Likely plaintext
  }
  try {
    return await decrypt(encrypted, MACHINE_PASSPHRASE);
  } catch (e) {
    // Not encrypted or wrong key — return as-is
    return encrypted;
  }
}
