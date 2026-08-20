import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { WardenIcon } from '../ui/WardenIcon';
import { PasswordInput } from '../ui/PasswordInput';
import { showToast } from '../ui/Toast';
import {
  AuthStatusResponse,
  TwoFactorGenerateResponse,
  WardenUserPublic,
} from '@warden/shared';

async function checkPwnedPassword(password: string): Promise<number> {
  if (!password || password.length < 4) return 0;
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await window.crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();

    const prefix = hashHex.substring(0, 5);
    const suffix = hashHex.substring(5);

    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'Add-Padding': 'true',
      },
    });
    if (!response.ok) return 0;
    const text = await response.text();
    const lines = text.split('\n');
    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(':');
      if (hashSuffix === suffix) {
        return parseInt(countStr, 10) || 1;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

const PasswordStrengthMeter: React.FC<{ password: string }> = ({ password }) => {
  const [breachCount, setBreachCount] = useState<number>(0);

  useEffect(() => {
    if (!password || password.length < 4) {
      setBreachCount(0);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      const count = await checkPwnedPassword(password);
      if (active) {
        setBreachCount(count);
      }
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [password]);

  const requirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter', met: /[a-z]/.test(password) },
    { label: 'At least one number', met: /[0-9]/.test(password) },
    { label: 'At least one special character', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const metCount = requirements.filter((r) => r.met).length;

  let percentage = 0;
  let barColor = 'bg-slate-700';
  let strengthText = 'None';
  let strengthTextColor = 'text-slate-500';

  if (password.length > 0) {
    if (metCount <= 2) {
      percentage = 25;
      barColor = 'bg-red-500';
      strengthText = 'Weak';
      strengthTextColor = 'text-red-400';
    } else if (metCount <= 4) {
      percentage = 60;
      barColor = 'bg-amber-500';
      strengthText = 'Medium';
      strengthTextColor = 'text-amber-400';
    } else {
      percentage = 100;
      barColor = 'bg-emerald-500';
      strengthText = 'Strong';
      strengthTextColor = 'text-emerald-400';
    }
  }

  return (
    <div className="space-y-2 mt-2 p-2.5 bg-[var(--bg-card)] rounded-md border border-white/10">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-slate-400 uppercase">Strength:</span>
        <span className={clsx('font-bold uppercase tracking-wider', strengthTextColor)}>
          {strengthText}
        </span>
      </div>

      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className={clsx('h-full transition-all duration-300', barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 pt-1">
        {requirements.map((req, idx) => (
          <div key={idx} className="flex items-center gap-1.5 text-[10px] font-mono">
            <WardenIcon
              name={req.met ? 'check' : 'x'}
              size={10}
              className={req.met ? 'text-emerald-400' : 'text-slate-600'}
            />
            <span className={req.met ? 'text-slate-200' : 'text-slate-500'}>
              {req.label}
            </span>
          </div>
        ))}
      </div>

      {breachCount > 0 && (
        <div className="flex items-center gap-2 p-2 bg-red-950/70 border border-red-500/60 rounded text-[11px] font-mono text-red-200 mt-2">
          <WardenIcon name="triangle-alert" size={13} className="text-red-400 shrink-0" />
          <span>
            Compromised: Found in <strong>{breachCount.toLocaleString()}</strong> known data breach{breachCount > 1 ? 'es' : ''}. Choose a different password.
          </span>
        </div>
      )}
    </div>
  );
};

interface AuthViewProps {
  authStatus: AuthStatusResponse;
  onAuthenticated: (user: WardenUserPublic, isTemp?: boolean, expiresAt?: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ authStatus, onAuthenticated }) => {
  // Mode: 'login' | 'register' | 'setup' | 'setup_2fa' | 'setup_recovery_codes' | 'emergency_info'
  const isInitialSetup = !authStatus.hasUsers;
  const [mode, setMode] = useState<
    'login' | 'register' | 'setup' | 'setup_2fa' | 'setup_recovery_codes' | 'emergency_info'
  >(isInitialSetup ? 'setup' : 'login');

  // Form states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 2FA Setup state
  const [want2FAInSetup, setWant2FAInSetup] = useState(false);
  const [setup2FAData, setSetup2FAData] = useState<TwoFactorGenerateResponse | null>(null);
  const [generatedRecoveryCodes, setGeneratedRecoveryCodes] = useState<string[]>([]);
  const [pendingUser, setPendingUser] = useState<WardenUserPublic | null>(null);

  // Emergency Trigger state
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyTriggered, setEmergencyTriggered] = useState(false);
  const [emergencyMessage, setEmergencyMessage] = useState<string | null>(null);

  // When authStatus changes from server
  useEffect(() => {
    if (!authStatus.hasUsers) {
      setMode('setup');
    } else if (mode === 'setup') {
      setMode('login');
    }
  }, [authStatus.hasUsers]);

  // ── 1. HANDLE LOGIN ──
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          totpCode: requires2FA && !useRecoveryCode ? totpCode.trim() : undefined,
          recoveryCode: requires2FA && useRecoveryCode ? recoveryCode.trim() : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.requiresTotp || data.error === '2FA_REQUIRED') {
          setRequires2FA(true);
          setErrorMessage(data.error === '2FA_REQUIRED' ? null : data.error);
        } else {
          setErrorMessage(data.error || 'Login failed. Please check your credentials.');
        }
        setLoading(false);
        return;
      }

      showToast(`Welcome back, ${data.data.user.username}!`, 'success');
      onAuthenticated(data.data.user, data.data.isTempRecovery, data.data.expiresAt);
    } catch (err: any) {
      setErrorMessage(err.message || 'Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── 2. HANDLE FIRST-TIME SETUP ──
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    const isStrong =
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password);

    if (!isStrong) {
      setErrorMessage('Password must meet all security requirements.');
      return;
    }

    // If user checked 2FA during setup, first generate the secret & QR code
    if (want2FAInSetup && !setup2FAData) {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/auth/setup/generate-2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim() || 'admin' }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to generate 2FA QR code');
        }

        setSetup2FAData(data.data);
        setMode('setup_2fa');
      } catch (err: any) {
        setErrorMessage('Failed to generate 2FA QR code: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Execute setup without 2FA
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          enableTotp: false,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Setup failed.');
      }

      showToast('Warden master account created successfully!', 'success');
      onAuthenticated(data.data.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Setup failed.');
    } finally {
      setLoading(false);
    }
  };

  // ── 2B. HANDLE USER REGISTRATION (SIGN UP) ──
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    const isStrong =
      password.length >= 8 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[^A-Za-z0-9]/.test(password);

    if (!isStrong) {
      setErrorMessage('Password must meet all security requirements.');
      return;
    }

    // If user checked 2FA during signup, generate the secret & QR code
    if (want2FAInSetup && !setup2FAData) {
      setLoading(true);
      try {
        const res = await fetch('/api/v1/auth/register/generate-2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim() }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to generate 2FA QR code');
        }

        setSetup2FAData(data.data);
        setMode('setup_2fa');
      } catch (err: any) {
        setErrorMessage('Failed to generate 2FA QR code: ' + err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // Execute registration without 2FA
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          enableTotp: false,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Registration failed.');
      }

      showToast(`Account created! Welcome, ${data.data.user.username}!`, 'success');
      onAuthenticated(data.data.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  // ── 3. VERIFY 2FA IN SETUP / REGISTRATION ──
  const handleVerifySetup2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setup2FAData || !totpCode) {
      setErrorMessage('Please enter the 6-digit authenticator code.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const endpoint = authStatus.hasUsers ? '/api/v1/auth/register' : '/api/v1/auth/setup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          enableTotp: true,
          totpSecret: setup2FAData.secret,
          totpCode: totpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '2FA verification failed.');
      }

      setGeneratedRecoveryCodes(data.data.recoveryCodes || []);
      setPendingUser(data.data.user);
      setMode('setup_recovery_codes');
    } catch (err: any) {
      setErrorMessage(err.message || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  // ── 4. DOWNLOAD RECOVERY CODES ──
  const handleDownloadRecoveryCodes = () => {
    if (generatedRecoveryCodes.length === 0) return;
    const content = [
      '=====================================================',
      '         WARDEN EMERGENCY BACKUP RECOVERY CODES      ',
      '=====================================================',
      `Generated: ${new Date().toISOString()}`,
      `Username:  ${username || 'admin'}`,
      '',
      'Store these codes in a secure vault or password manager.',
      'Each recovery code can only be used ONCE to log into Warden',
      'if you lose access to your authenticator device.',
      '',
      'RECOVERY CODES:',
      ...generatedRecoveryCodes.map((code, idx) => `[${idx + 1}] ${code}`),
      '',
      '=====================================================',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `warden-recovery-codes-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Recovery codes downloaded to file.', 'success');
  };

  const handleCopyRecoveryCodes = () => {
    if (generatedRecoveryCodes.length === 0) return;
    navigator.clipboard.writeText(generatedRecoveryCodes.join('\n'));
    showToast('Recovery codes copied to clipboard.', 'success');
  };

  // ── 5. EMERGENCY RECOVERY TRIGGER ──
  const handleTriggerEmergencyAccess = async () => {
    setEmergencyLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/auth/emergency-trigger', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to trigger emergency recovery.');
      }

      setEmergencyTriggered(true);
      setEmergencyMessage(data.data.message);
      showToast('Emergency credentials printed to server terminal output!', 'success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate emergency credentials.');
    } finally {
      setEmergencyLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0d0e11] flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-[425px] relative z-10 my-auto">
        {/* Official Logo Moved Further Up Above the UI Box */}
        <div className="text-center mb-6 sm:mb-8">
          <img
            src="/warden_logo.png"
            alt="Warden"
            className="h-8 sm:h-9 mx-auto object-contain select-none"
          />
        </div>

        <Card className="p-6 bg-[var(--bg-surface)] border-[var(--color-border)] space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-4 bg-red-950/50 border border-red-500/50 rounded-lg px-3.5 py-3 text-xs text-red-300 font-mono flex items-center gap-2.5 shadow-sm animate-in fade-in duration-150">
              <WardenIcon name="triangle-alert" size={16} className="text-red-400 shrink-0" />
              <div className="leading-snug">{errorMessage}</div>
            </div>
          )}

          {/* ════════ MODE: LOGIN ════════ */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                  Username
                </label>
                <input
                  type="text"
                  required
                  autoFocus={!requires2FA}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="NotchGamer"
                  className="w-full h-9 sm:h-10 bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] px-3 rounded-md text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/60 focus:border-[var(--color-accent)] font-mono transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                  Password
                </label>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>

              {/* 2FA Section (if required) */}
              {requires2FA && (
                <div className="p-3.5 bg-[var(--bg-main)] rounded-lg border border-[var(--accent-border)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase text-[var(--color-accent)] font-mono">
                      Two-Factor Authentication
                    </span>
                  </div>

                  {/* Segmented Control / Tab Switcher */}
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-[var(--bg-card)] rounded-md border border-[var(--color-border)]">
                    <button
                      type="button"
                      onClick={() => {
                        setUseRecoveryCode(false);
                        setRecoveryCode('');
                      }}
                      className={`py-1.5 px-1.5 sm:px-2 rounded text-[10.5px] sm:text-[11px] font-mono transition-colors flex items-center justify-center gap-1 whitespace-nowrap overflow-hidden ${
                        !useRecoveryCode
                          ? 'bg-[var(--color-accent)] text-[#0d0e11] font-bold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <WardenIcon name="binary" size={12} className={`shrink-0 ${!useRecoveryCode ? 'text-[#0d0e11]' : 'text-slate-400'}`} />
                      <span className="whitespace-nowrap truncate">6-Digit Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseRecoveryCode(true);
                        setTotpCode('');
                      }}
                      className={`py-1.5 px-1.5 sm:px-2 rounded text-[10.5px] sm:text-[11px] font-mono transition-colors flex items-center justify-center gap-1 whitespace-nowrap overflow-hidden ${
                        useRecoveryCode
                          ? 'bg-[var(--color-accent)] text-[#0d0e11] font-bold shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <WardenIcon name="code" size={12} className={`shrink-0 ${useRecoveryCode ? 'text-[#0d0e11]' : 'text-slate-400'}`} />
                      <span className="whitespace-nowrap truncate">Recovery Code</span>
                    </button>
                  </div>

                  {useRecoveryCode ? (
                    <div className="space-y-1">
                      <input
                        type="text"
                        required
                        autoFocus
                        value={recoveryCode}
                        onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                        placeholder="XXXX-XXXX-XXXX-XXXX"
                        className="w-full h-9 sm:h-10 bg-[var(--bg-surface)] border border-[var(--color-border)] px-3 rounded-md text-xs sm:text-sm text-slate-100 font-mono uppercase tracking-widest text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      />
                      <p className="text-[10px] text-slate-400 font-mono text-center">
                        Enter one of your 16-character backup recovery codes.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <input
                        type="text"
                        required
                        autoFocus
                        maxLength={6}
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        className="w-full h-9 sm:h-10 bg-[var(--bg-surface)] border border-[var(--color-border)] px-3 rounded-md text-base text-slate-100 font-mono tracking-widest text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                      />
                      <p className="text-[10px] text-slate-400 font-mono text-center">
                        Enter the code from your authenticator app.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={loading}
                className="w-full font-minecraft text-xs justify-center py-2.5"
              >
                <WardenIcon name="check" size={14} className="text-[#0d0e11]" />
                {requires2FA ? (useRecoveryCode ? 'Verify Recovery Code' : 'Verify 2FA & Log In') : 'Log In'}
              </Button>

              {/* Emergency Account Access Link */}
              <div className="pt-1 text-center text-[11px] text-slate-400 font-mono">
                <span>Lost 2FA / Password? </span>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setMode('emergency_info');
                  }}
                  className="underline text-slate-400 hover:text-[var(--color-accent)] transition-colors font-mono"
                >
                  Account Recovery
                </button>
              </div>

              {/* Sign Up Switcher */}
              <div className="pt-3 text-center">
                <span className="text-xs text-slate-400 font-mono">Don&apos;t have an account? </span>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setUsername('');
                    setPassword('');
                    setConfirmPassword('');
                    setWant2FAInSetup(false);
                    setMode('register');
                  }}
                  className="text-xs text-[var(--color-accent)] hover:underline font-minecraft font-bold tracking-wide transition-colors"
                >
                  Sign Up
                </button>
              </div>
            </form>
          )}

          {/* ════════ MODE: USER REGISTRATION (SIGN UP) ════════ */}
          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1 pb-1">
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wide font-minecraft">
                  Create an Account
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  Sign up for access to your assigned Warden servers.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                  Username
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="PlayerOne"
                  className="w-full h-9 sm:h-10 bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] px-3 rounded-md text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/60 focus:border-[var(--color-accent)] font-mono transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                  Password
                </label>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
                <PasswordStrengthMeter password={password} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                  Confirm Password
                </label>
                <PasswordInput
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
              </div>

              {/* Optional 2FA Checkbox */}
              <div
                onClick={() => setWant2FAInSetup(!want2FAInSetup)}
                className="flex items-center gap-2 pt-0.5 cursor-pointer select-none group"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                    want2FAInSetup
                      ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0d0e11]'
                      : 'border-[var(--color-border)] bg-[var(--bg-main)] group-hover:border-[var(--color-accent)]/50'
                  }`}
                >
                  {want2FAInSetup && (
                    <svg className="w-3 h-3 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-slate-300 group-hover:text-slate-100 transition-colors font-mono">
                  Enable 2FA (Authenticator App)
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={loading}
                className="w-full font-minecraft text-xs justify-center py-2.5 mt-1"
              >
                <WardenIcon name="check" size={14} className="text-[#0d0e11]" />
                Create Account &amp; Log In
              </Button>

              {/* Already have an account? */}
              <div className="pt-2 text-center">
                <span className="text-xs text-slate-400 font-mono">Already have an account? </span>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setMode('login');
                  }}
                  className="text-xs text-[var(--color-accent)] hover:underline font-minecraft font-bold tracking-wide transition-colors"
                >
                  Log In
                </button>
              </div>
            </form>
          )}

          {/* ════════ MODE: FIRST-TIME SETUP ════════ */}
          {mode === 'setup' && (
            <form onSubmit={handleSetup} className="space-y-4">
              <div className="space-y-1 pb-1">
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wide font-minecraft">
                  Initial Setup
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  Create your master administrator account.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                  Username
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="NotchGamer"
                  className="w-full h-9 sm:h-10 bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] px-3 rounded-md text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/60 focus:border-[var(--color-accent)] font-mono transition-all"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                  Password
                </label>
                <PasswordInput
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
                <PasswordStrengthMeter password={password} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                  Confirm Password
                </label>
                <PasswordInput
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
              </div>

              {/* Optional 2FA Checkbox */}
              <div
                onClick={() => setWant2FAInSetup(!want2FAInSetup)}
                className="flex items-center gap-2 pt-0.5 cursor-pointer select-none group"
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                    want2FAInSetup
                      ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0d0e11]'
                      : 'border-[var(--color-border)] bg-[var(--bg-main)] group-hover:border-[var(--color-accent)]/50'
                  }`}
                >
                  {want2FAInSetup && (
                    <svg className="w-3 h-3 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <span className="text-xs text-slate-300 group-hover:text-slate-100 transition-colors font-mono">
                  Enable 2FA (Authenticator App)
                </span>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={loading}
                className="w-full font-minecraft text-xs justify-center py-2 mt-1"
              >
                <WardenIcon name="check" size={14} className="text-[#0d0e11]" />
                Create Account
              </Button>
            </form>
          )}

          {/* ════════ MODE: SETUP 2FA (QR CODE) ════════ */}
          {mode === 'setup_2fa' && setup2FAData && (
            <form onSubmit={handleVerifySetup2FA} className="space-y-4 text-center">
              <p className="text-xs text-slate-300 font-mono">
                Scan with Authenticator App:
              </p>

              <div className="bg-white p-2.5 rounded-lg inline-block mx-auto">
                <img src={setup2FAData.qrCodeDataUrl} alt="2FA QR Code" className="w-40 h-40 mx-auto" />
              </div>

              <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--color-border)] text-center space-y-1">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Key:</div>
                <div className="text-[11px] font-mono font-bold text-[var(--color-accent)] tracking-wider select-all break-all px-1.5 py-1 rounded bg-[var(--bg-card)] border border-[var(--color-border)]/60">
                  {setup2FAData.secret.match(/.{1,4}/g)?.join(' ') || setup2FAData.secret}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono text-left">
                  6-Digit Code
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="w-full h-9 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-base text-slate-100 font-mono tracking-widest text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMode(authStatus.hasUsers ? 'register' : 'setup')}
                  className="flex-1 font-mono text-xs inline-flex items-center justify-center gap-1.5"
                >
                  <WardenIcon name="arrow-left" size={13} className="text-slate-400" />
                  <span>Back</span>
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={loading}
                  disabled={totpCode.length !== 6}
                  className="flex-1 font-minecraft text-xs justify-center"
                >
                  Verify &amp; Continue
                </Button>
              </div>
            </form>
          )}

          {/* ════════ MODE: RECOVERY CODES DOWNLOAD ════════ */}
          {mode === 'setup_recovery_codes' && (
            <div className="space-y-4">
              <div className="bg-amber-950/30 border border-amber-500/40 rounded-lg p-3 text-xs text-amber-200 font-mono leading-relaxed space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-300">
                  <WardenIcon name="triangle-alert" size={14} className="text-amber-400" />
                  Backup Recovery Codes
                </div>
                <p className="text-[11px] text-amber-200/80">
                  Save these one-time codes in case you lose access to your authenticator app.
                </p>
              </div>

              <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--color-border)] grid grid-cols-2 gap-1.5 text-center">
                {generatedRecoveryCodes.map((code, idx) => (
                  <div
                    key={idx}
                    className="p-1 bg-[var(--bg-card)] rounded text-[11px] font-mono font-bold text-slate-200 select-all border border-[var(--color-border)]/60"
                  >
                    {code}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyRecoveryCodes}
                  className="flex-1 font-mono text-xs"
                >
                  <WardenIcon name="edit" size={13} className="text-slate-400" />
                  Copy
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleDownloadRecoveryCodes}
                  className="flex-1 font-mono text-xs"
                >
                  <WardenIcon name="download" size={13} className="text-[var(--color-accent)]" />
                  Download (.txt)
                </Button>
              </div>

              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => {
                  if (pendingUser) {
                    onAuthenticated(pendingUser);
                  }
                }}
                className="w-full font-minecraft text-xs justify-center py-2 mt-2"
              >
                <WardenIcon name="check" size={14} className="text-[#0d0e11]" />
                Done
              </Button>
            </div>
          )}

          {/* ════════ MODE: EMERGENCY & RECOVERY ════════ */}
          {mode === 'emergency_info' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wide font-minecraft flex items-center gap-2">
                  <WardenIcon name="triangle-alert" size={15} className="text-[var(--color-accent)]" />
                  Account Recovery Options
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  Select a recovery method to regain access to your account:
                </p>
              </div>

              {/* Option 1: Use Backup Recovery Code */}
              <div className="p-4 bg-[var(--bg-main)] rounded-lg border border-[var(--color-border)] space-y-3">
                <div className="flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-accent)] shrink-0 mt-0.5">
                    <WardenIcon name="code" size={15} />
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-100 font-mono">
                      Backup Recovery Code
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono leading-relaxed">
                      Log in with one of your saved 16-character backup codes
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setErrorMessage(null);
                    setRequires2FA(true);
                    setUseRecoveryCode(true);
                    setMode('login');
                  }}
                  className="w-full font-minecraft text-xs justify-center"
                >
                  <WardenIcon name="check" size={13} className="text-[#0d0e11]" />
                  Use Backup Recovery Code
                </Button>
              </div>

              {/* Option 2: Emergency Console Access */}
              <div className="p-4 bg-[var(--bg-main)] rounded-lg border border-red-900/40 space-y-3">
                <div className="flex items-start gap-3.5">
                  <div className="w-8 h-8 rounded-lg bg-red-950/40 border border-red-800/40 flex items-center justify-center text-red-400 shrink-0 mt-0.5">
                    <WardenIcon name="terminal-square" size={15} />
                  </div>
                  <div className="space-y-0.5 min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-100 font-mono">
                      Emergency Console Credentials
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono leading-relaxed">
                      Print 15-minute temporary credentials to server logs
                    </div>
                  </div>
                </div>

                {emergencyTriggered ? (
                  <div className="bg-[var(--accent-dim)] border border-[var(--accent-border)] rounded-lg p-3 text-center space-y-2">
                    <div className="text-xs font-bold text-slate-100 font-mono">
                      Emergency Account Generated
                    </div>
                    <p className="text-[11px] text-slate-300 font-mono">
                      Check server console or run <code className="text-emerald-400 bg-black/40 px-1 py-0.5 rounded">docker compose logs</code> for credentials.
                    </p>
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setUsername('warden_emergency_admin');
                          setPassword('');
                          setRequires2FA(false);
                          setUseRecoveryCode(false);
                          setMode('login');
                        }}
                        className="w-full font-minecraft text-xs justify-center"
                      >
                        <WardenIcon name="play" size={12} className="text-[#0d0e11]" />
                        Enter Credentials
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    isLoading={emergencyLoading}
                    onClick={handleTriggerEmergencyAccess}
                    className="w-full font-minecraft text-xs justify-center"
                  >
                    <WardenIcon name="terminal-square" size={13} className="text-red-400" />
                    Generate Recovery in Logs
                  </Button>
                )}
              </div>

              {/* Centered Return to Login */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setMode('login');
                  }}
                  className="inline-flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 font-mono transition-colors"
                >
                  <WardenIcon name="arrow-left" size={13} className="text-slate-400" />
                  <span>Return to login</span>
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
