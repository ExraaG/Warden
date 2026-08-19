import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { db } from '../db/storage.js';
import { AuthManager } from '../core/authManager.js';
import {
  ApiResponse,
  AuthStatusResponse,
  LoginPayload,
  SetupPayload,
  SetupResponse,
  RegisterPayload,
  TwoFactorGenerateResponse,
  TwoFactorEnablePayload,
  TwoFactorEnableResponse,
  ResetPasswordPayload,
  WardenUser,
} from '@warden/shared';

export const authRouter = Router();

const COOKIE_NAME = 'warden_token';

const setAuthCookie = (res: Response, token: string, isTemp = false) => {
  const maxAge = isTemp ? 15 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
};

const clearAuthCookie = (res: Response) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
};

/**
 * Helper to extract token from Cookie or Authorization header
 */
export const extractToken = (req: Request): string | null => {
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

// ── 1. AUTH STATUS ──
authRouter.get('/status', (req: Request, res: Response) => {
  const hasUsers = db.getHasUsers();
  const token = extractToken(req);

  if (!token) {
    return res.json({
      success: true,
      data: {
        hasUsers,
        authenticated: false,
      } as AuthStatusResponse,
    });
  }

  const payload = AuthManager.verifyToken(token);
  if (!payload) {
    clearAuthCookie(res);
    return res.json({
      success: true,
      data: {
        hasUsers,
        authenticated: false,
      } as AuthStatusResponse,
    });
  }

  const user = db.getUserById(payload.id);
  if (!user) {
    clearAuthCookie(res);
    return res.json({
      success: true,
      data: {
        hasUsers,
        authenticated: false,
      } as AuthStatusResponse,
    });
  }

  res.json({
    success: true,
    data: {
      hasUsers,
      authenticated: true,
      user: AuthManager.toPublicUser(user),
      isTempRecovery: user.role === 'temp_recovery',
      expiresAt: user.expiresAt,
    } as AuthStatusResponse,
  });
});

// ── 2. GENERATE 2FA FOR FIRST-TIME SETUP ──
authRouter.post('/setup/generate-2fa', async (req: Request, res: Response) => {
  try {
    const hasUsers = db.getHasUsers();
    if (hasUsers) {
      return res.status(400).json({
        success: false,
        error: 'Initial setup is already completed. Please log in.',
      });
    }

    const username = (req.body.username || 'admin').trim();
    const result = await AuthManager.generateTotpSecret(username);
    res.json({
      success: true,
      data: result as TwoFactorGenerateResponse,
    });
  } catch (error: any) {
    console.error('[Auth] Setup 2FA generate error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate 2FA QR code for setup.',
    });
  }
});

// ── 3. FIRST-TIME SETUP / SIGN-UP ──
authRouter.post('/setup', async (req: Request, res: Response) => {
  try {
    const hasUsers = db.getHasUsers();
    if (hasUsers) {
      return res.status(400).json({
        success: false,
        error: 'Initial setup is already completed. Please log in.',
      });
    }

    const { username, password, enableTotp, totpSecret, totpCode } =
      req.body as SetupPayload;

    if (!username || !username.trim() || !password || password.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'Username and a secure password (at least 4 characters) are required.',
      });
    }

    let isTotpEnabled = false;
    let validSecret = '';
    let recoveryCodes: string[] = [];
    let hashedRecoveryCodes: string[] = [];

    if (enableTotp) {
      if (!totpSecret || !totpCode) {
        return res.status(400).json({
          success: false,
          error: '2FA code and secret are required when enabling 2FA.',
        });
      }

      const isValidTotp = AuthManager.verifyTotp(totpCode, totpSecret);
      if (!isValidTotp) {
        return res.status(400).json({
          success: false,
          error: 'Invalid 2FA verification code. Please check your authenticator app.',
        });
      }

      isTotpEnabled = true;
      validSecret = totpSecret;
      const codes = await AuthManager.generateRecoveryCodes(8);
      recoveryCodes = codes.plainCodes;
      hashedRecoveryCodes = codes.hashedCodes;
    }

    const passwordHash = await AuthManager.hashPassword(password);
    const adminUser: WardenUser = {
      id: `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      username: username.trim(),
      passwordHash,
      role: 'admin',
      totpEnabled: isTotpEnabled,
      totpSecret: isTotpEnabled ? validSecret : undefined,
      recoveryCodes: hashedRecoveryCodes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.createUser(adminUser);

    const token = AuthManager.generateToken(adminUser);
    setAuthCookie(res, token);

    res.json({
      success: true,
      data: {
        user: AuthManager.toPublicUser(adminUser),
        token,
        recoveryCodes: isTotpEnabled ? recoveryCodes : undefined,
      } as SetupResponse,
    });
  } catch (error: any) {
    console.error('[Auth] Setup error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to complete initial setup.',
    });
  }
});

// ── 2B. GENERATE 2FA FOR REGISTRATION ──
authRouter.post('/register/generate-2fa', async (req: Request, res: Response) => {
  try {
    const username = (req.body.username || 'user').trim();
    const result = await AuthManager.generateTotpSecret(username);
    res.json({
      success: true,
      data: result as TwoFactorGenerateResponse,
    });
  } catch (error: any) {
    console.error('[Auth] Register 2FA generate error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate 2FA QR code for registration.',
    });
  }
});

// ── 2C. USER SIGN-UP / REGISTRATION ──
authRouter.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password, enableTotp, totpSecret, totpCode } =
      req.body as RegisterPayload;

    if (!username || !username.trim() || !password || password.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'Username and a password (at least 4 characters) are required.',
      });
    }

    const cleanUsername = username.trim();
    const existing = db.getUserByUsername(cleanUsername);
    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Username is already taken. Please choose another username.',
      });
    }

    let isTotpEnabled = false;
    let validSecret = '';
    let recoveryCodes: string[] = [];
    let hashedRecoveryCodes: string[] = [];

    if (enableTotp) {
      if (!totpSecret || !totpCode) {
        return res.status(400).json({
          success: false,
          error: '2FA code and secret are required when enabling 2FA.',
        });
      }

      const isValidTotp = AuthManager.verifyTotp(totpCode, totpSecret);
      if (!isValidTotp) {
        return res.status(400).json({
          success: false,
          error: 'Invalid 2FA verification code. Please check your authenticator app.',
        });
      }

      isTotpEnabled = true;
      validSecret = totpSecret;
      const codes = await AuthManager.generateRecoveryCodes(8);
      recoveryCodes = codes.plainCodes;
      hashedRecoveryCodes = codes.hashedCodes;
    }

    const passwordHash = await AuthManager.hashPassword(password);
    const newUser: WardenUser = {
      id: `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      username: cleanUsername,
      passwordHash,
      role: 'user',
      totpEnabled: isTotpEnabled,
      totpSecret: isTotpEnabled ? validSecret : undefined,
      recoveryCodes: hashedRecoveryCodes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.createUser(newUser);

    const token = AuthManager.generateToken(newUser);
    setAuthCookie(res, token);

    res.json({
      success: true,
      data: {
        user: AuthManager.toPublicUser(newUser),
        token,
        recoveryCodes: isTotpEnabled ? recoveryCodes : undefined,
      } as SetupResponse,
    });
  } catch (error: any) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to complete registration.',
    });
  }
});

// ── 3. LOGIN ──
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password, totpCode, recoveryCode } = req.body as LoginPayload;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required.',
      });
    }

    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password.',
      });
    }

    // Verify Password
    const passwordMatch = await AuthManager.verifyPassword(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password.',
      });
    }

    // If 2FA enabled, check TOTP or Recovery Code
    if (user.totpEnabled && user.totpSecret) {
      if (totpCode) {
        const isValid = AuthManager.verifyTotp(totpCode, user.totpSecret);
        if (!isValid) {
          return res.status(401).json({
            success: false,
            error: 'Invalid 6-digit authenticator code.',
            requiresTotp: true,
          });
        }
      } else if (recoveryCode) {
        const { valid } = await AuthManager.verifyAndConsumeRecoveryCode(
          user,
          recoveryCode
        );
        if (!valid) {
          return res.status(401).json({
            success: false,
            error: 'Invalid or already-used backup recovery code.',
            requiresTotp: true,
          });
        }
      } else {
        return res.status(200).json({
          success: false,
          requiresTotp: true,
          error: '2FA_REQUIRED',
          message: 'Two-factor authentication code required.',
        });
      }
    }

    const token = AuthManager.generateToken(user);
    const isTemp = user.role === 'temp_recovery';
    setAuthCookie(res, token, isTemp);

    res.json({
      success: true,
      data: {
        user: AuthManager.toPublicUser(user),
        token,
        isTempRecovery: isTemp,
        expiresAt: user.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Login failed.',
    });
  }
});

// ── 4. LOGOUT ──
authRouter.post('/logout', (_req: Request, res: Response) => {
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ── 5. EMERGENCY RECOVERY TRIGGER (15-MINUTE ACCOUNT TO LOGS) ──
authRouter.post('/emergency-trigger', async (_req: Request, res: Response) => {
  try {
    const result = await AuthManager.generateEmergencyTempAccount();
    res.json({
      success: true,
      data: {
        username: result.username,
        expiresAt: result.expiresAt,
        message:
          'Emergency temporary credentials generated and printed to the server terminal output / logs. Access will expire in 15 minutes.',
      },
    });
  } catch (error: any) {
    console.error('[Auth] Emergency trigger error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate emergency recovery credentials.',
    });
  }
});

// ── 6. GENERATE 2FA SECRET & QR CODE ──
authRouter.post('/2fa/generate', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    const payload = token ? AuthManager.verifyToken(token) : null;
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    const result = await AuthManager.generateTotpSecret(payload.username);
    res.json({
      success: true,
      data: result as TwoFactorGenerateResponse,
    });
  } catch (error: any) {
    console.error('[Auth] 2FA generate error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate 2FA secret.' });
  }
});

// ── 7. ENABLE 2FA ──
authRouter.post('/2fa/enable', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    const payload = token ? AuthManager.verifyToken(token) : null;
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    const { secret, totpCode } = req.body as TwoFactorEnablePayload;
    if (!secret || !totpCode) {
      return res.status(400).json({
        success: false,
        error: 'Secret and verification code are required.',
      });
    }

    const isValid = AuthManager.verifyTotp(totpCode, secret);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid 6-digit code. Please verify your authenticator app.',
      });
    }

    const { plainCodes, hashedCodes } = await AuthManager.generateRecoveryCodes(8);

    db.updateUser(payload.id, {
      totpEnabled: true,
      totpSecret: secret,
      recoveryCodes: hashedCodes,
    });

    res.json({
      success: true,
      data: {
        success: true,
        recoveryCodes: plainCodes,
      } as TwoFactorEnableResponse,
    });
  } catch (error: any) {
    console.error('[Auth] 2FA enable error:', error);
    res.status(500).json({ success: false, error: 'Failed to enable 2FA.' });
  }
});

// ── 8. DISABLE 2FA ──
authRouter.post('/2fa/disable', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    const payload = token ? AuthManager.verifyToken(token) : null;
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    const user = db.getUserById(payload.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({
        success: false,
        error: 'Current password is required to disable 2FA.',
      });
    }

    const passwordMatch = await AuthManager.verifyPassword(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect password.' });
    }

    db.updateUser(user.id, {
      totpEnabled: false,
      totpSecret: undefined,
      recoveryCodes: [],
    });

    res.json({ success: true, message: '2FA has been disabled successfully.' });
  } catch (error: any) {
    console.error('[Auth] 2FA disable error:', error);
    res.status(500).json({ success: false, error: 'Failed to disable 2FA.' });
  }
});

// ── 9. RESET / CHANGE PASSWORD ──
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    const payload = token ? AuthManager.verifyToken(token) : null;
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    const { currentPassword, newPassword, resetTotp } =
      req.body as ResetPasswordPayload;

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 4 characters long.',
      });
    }

    const newHash = await AuthManager.hashPassword(newPassword);

    // If caller is in Emergency Recovery Mode (temp_recovery)
    if (payload.role === 'temp_recovery') {
      // Find the primary admin user
      const users = db.getUsers();
      const adminUser = users.find((u) => u.role === 'admin') || users[0];

      if (!adminUser) {
        return res.status(404).json({
          success: false,
          error: 'No primary administrator account found to reset.',
        });
      }

      const updates: Partial<WardenUser> = {
        passwordHash: newHash,
      };

      if (resetTotp) {
        updates.totpEnabled = false;
        updates.totpSecret = undefined;
        updates.recoveryCodes = [];
      }

      db.updateUser(adminUser.id, updates);

      // Clean up and delete the temporary emergency account
      db.deleteUser(payload.id);
      clearAuthCookie(res);

      return res.json({
        success: true,
        message:
          'Master password has been reset successfully! The emergency recovery session is now closed. Please log in with your new credentials.',
      });
    }

    // Normal Admin Password Change
    const user = db.getUserById(payload.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (!currentPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password is required.',
      });
    }

    const match = await AuthManager.verifyPassword(currentPassword, user.passwordHash);
    if (!match) {
      return res.status(401).json({
        success: false,
        error: 'Incorrect current password.',
      });
    }

    const updates: Partial<WardenUser> = {
      passwordHash: newHash,
    };

    if (resetTotp) {
      updates.totpEnabled = false;
      updates.totpSecret = undefined;
      updates.recoveryCodes = [];
    }

    db.updateUser(user.id, updates);

    res.json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (error: any) {
    console.error('[Auth] Reset password error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to reset password.',
    });
  }
});

// ── 10. REGENERATE RECOVERY CODES ──
authRouter.post('/recovery-codes/regenerate', async (req: Request, res: Response) => {
  try {
    const token = extractToken(req);
    const payload = token ? AuthManager.verifyToken(token) : null;
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Unauthorized.' });
    }

    const user = db.getUserById(payload.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    if (!user.totpEnabled) {
      return res.status(400).json({
        success: false,
        error: '2FA is not enabled for this account.',
      });
    }

    const { plainCodes, hashedCodes } = await AuthManager.generateRecoveryCodes(8);
    db.updateUser(user.id, { recoveryCodes: hashedCodes });

    res.json({
      success: true,
      data: {
        recoveryCodes: plainCodes,
      },
    });
  } catch (error: any) {
    console.error('[Auth] Regenerate recovery codes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate recovery codes.',
    });
  }
});
