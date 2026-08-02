import crypto from 'crypto'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET || 'altiflow_dev_secret'
const PASSKEY_ALGO = 'aes-256-gcm'
const PASSKEY_VERSION = 1

function getPasskeySecret() {
  return crypto.createHash('sha256').update(String(JWT_SECRET)).digest()
}

export function randomPasskeyExtension() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let ext = ''
  for (let i = 0; i < 6; i += 1) ext += chars[Math.floor(Math.random() * chars.length)]
  return ext
}

export function encryptPasskeyPayload(payload) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(PASSKEY_ALGO, getPasskeySecret(), iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${authTag.toString('hex')}.${encrypted.toString('hex')}`
}

export function decryptPasskeyPayload(content) {
  const [ivHex, tagHex, ciphertextHex] = String(content || '').trim().split('.')
  if (!ivHex || !tagHex || !ciphertextHex) throw new Error('Invalid passkey file format')
  const decipher = crypto.createDecipheriv(PASSKEY_ALGO, getPasskeySecret(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
  return JSON.parse(decrypted)
}

export function createPasskeyFile(userId) {
  const rawKey = crypto.randomBytes(32).toString('hex')
  const extension = randomPasskeyExtension()
  const payload = {
    v: PASSKEY_VERSION,
    uid: userId,
    key: rawKey,
    issued_at: new Date().toISOString(),
  }
  const encryptedContent = encryptPasskeyPayload(payload)
  return {
    rawKey,
    extension,
    file_name: `altiflow-passkey-${userId.slice(0, 8)}.${extension}`,
    file_content: encryptedContent,
  }
}
