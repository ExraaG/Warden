import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../db/storage.js';
import { WardenUser, WardenUserPublic } from '@warden/shared';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/[\s-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateTOTP(secret: string, timestamp = Date.now()): string {
  const key = base32Decode(secret);
  const epoch = Math.floor(timestamp / 1000 / 30);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(epoch));
  const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return String(code).padStart(6, '0');
}

export interface TokenPayload {
  id: string;
  username: string;
  role: 'admin' | 'temp_recovery';
  isTempRecovery?: boolean;
}

export class AuthManager {
  private static readonly SALT_ROUNDS = 10;
  private static readonly APP_NAME = 'Warden';

  /**
   * Securely hash a plaintext password with bcrypt
   */
  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  /**
   * Verify password against a bcrypt hash
   */
  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!password || !hash) return false;
    return bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT authentication token (7-day validity for admin, 15-min for temp_recovery)
   */
  public static generateToken(user: WardenUser): string {
    const secret = db.getAuthSecret();
    const isTemp = user.role === 'temp_recovery';
    const expiresIn = isTemp ? '15m' : '7d';

    const payload: TokenPayload = {
      id: user.id,
      username: user.username,
      role: user.role,
      isTempRecovery: isTemp,
    };

    return jwt.sign(payload, secret, { expiresIn });
  }

  /**
   * Verify and decode a JWT token
   */
  public static verifyToken(token: string): TokenPayload | null {
    try {
      const secret = db.getAuthSecret();
      const decoded = jwt.verify(token, secret) as TokenPayload;
      // Also confirm the user still exists and is not expired
      const user = db.getUserById(decoded.id);
      if (!user) return null;
      if (user.expiresAt && new Date(user.expiresAt).getTime() <= Date.now()) {
        return null;
      }
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Generate TOTP secret and QR code Data URL for authenticator apps
   */
  public static async generateTotpSecret(
    username: string
  ): Promise<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string }> {
    const secret = base32Encode(crypto.randomBytes(20));
    const label = encodeURIComponent(`${this.APP_NAME}:${username}`);
    const issuer = encodeURIComponent(this.APP_NAME);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;

    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      margin: 1,
      width: 240,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl,
    };
  }

  /**
   * Verify a 6-digit TOTP code against a secret (with +/- 1 step window)
   */
  public static verifyTotp(token: string, secret: string, window = 1): boolean {
    if (!token || !secret) return false;
    const cleanToken = token.trim().replace(/[\s-]/g, '');
    if (cleanToken.length !== 6) return false;

    const now = Date.now();
    for (let i = -window; i <= window; i++) {
      const checkTime = now + i * 30 * 1000;
      if (generateTOTP(secret, checkTime) === cleanToken) {
        return true;
      }
    }
    return false;
  }

  /**
   * Generate 8 cryptographically secure backup recovery codes
   */
  public static async generateRecoveryCodes(
    count = 8
  ): Promise<{ plainCodes: string[]; hashedCodes: string[] }> {
    const plainCodes: string[] = [];
    const hashedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      // 16-character alphanumeric code formatted as XXXX-XXXX-XXXX-XXXX
      const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const p3 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const p4 = crypto.randomBytes(2).toString('hex').toUpperCase();
      const code = `${p1}-${p2}-${p3}-${p4}`;
      plainCodes.push(code);
      const hashed = await this.hashPassword(code.replace(/-/g, ''));
      hashedCodes.push(hashed);
    }

    return { plainCodes, hashedCodes };
  }

  /**
   * Check and consume a one-time recovery code
   */
  public static async verifyAndConsumeRecoveryCode(
    user: WardenUser,
    plainCode: string
  ): Promise<{ valid: boolean; updatedUser?: WardenUser }> {
    if (!plainCode || !user.recoveryCodes || user.recoveryCodes.length === 0) {
      return { valid: false };
    }

    const cleanInput = plainCode.trim().replace(/-/g, '').toUpperCase();
    const remainingHashed: string[] = [];
    let matched = false;

    for (const hash of user.recoveryCodes) {
      if (!matched) {
        const isMatch = await this.verifyPassword(cleanInput, hash);
        if (isMatch) {
          matched = true;
          continue; // Consume the code by omitting it from remaining list
        }
      }
      remainingHashed.push(hash);
    }

    if (matched) {
      const updated = db.updateUser(user.id, { recoveryCodes: remainingHashed });
      return { valid: true, updatedUser: updated };
    }

    return { valid: false };
  }

  /**
   * Generate a 15-minute emergency temporary recovery account and output to console logs
   */
  public static async generateEmergencyTempAccount(): Promise<{
    username: string;
    password: string;
    expiresAt: string;
    user: WardenUser;
  }> {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const username = 'warden_emergency_admin';
    // Random high-entropy 16-character password
    const p1 = crypto.randomBytes(3).toString('hex');
    const p2 = crypto.randomBytes(3).toString('hex');
    const p3 = crypto.randomBytes(3).toString('hex');
    const rawPassword = `Warden-${p1}-${p2}-${p3}`;
    const passwordHash = await this.hashPassword(rawPassword);

    const tempUser: WardenUser = {
      id: `temp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      username,
      passwordHash,
      role: 'temp_recovery',
      totpEnabled: false,
      recoveryCodes: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt,
    };

    db.createUser(tempUser);

    // Print prominent styled banner to server terminal output / stdout
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                 [WARDEN] EMERGENCY RECOVERY ACCOUNT GENERATED               ║');
    console.log('╠══════════════════════════════════════════════════════════════════════════════╣');
    console.log('║  A temporary emergency recovery account has been activated:                  ║');
    console.log('║                                                                              ║');
    console.log(`║  Username: \x1b[32m${username.padEnd(65)}\x1b[0m║`);
    console.log(`║  Password: \x1b[33m\x1b[1m${rawPassword.padEnd(65)}\x1b[0m║`);
    console.log('║  \x1b[31m\x1b[1mEXPIRES IN: 15 MINUTES\x1b[0m (Single-Use Recovery Session)                        ║');
    console.log('║  \x1b[36mPERMISSIONS:\x1b[0m Restricted strictly to Password Reset & 2FA Management.         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
    console.log('\n');

    return {
      username,
      password: rawPassword,
      expiresAt,
      user: tempUser,
    };
  }

  /**
   * Convert WardenUser to public model (stripping hashes, secrets, and recovery codes)
   */
  public static toPublicUser(user: WardenUser): WardenUserPublic {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt,
      isTempRecovery: user.role === 'temp_recovery',
      expiresAt: user.expiresAt,
    };
  }
}
