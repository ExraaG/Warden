import React, { useState, useEffect } from 'react';
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

interface AuthViewProps {
  authStatus: AuthStatusResponse;
  onAuthenticated: (user: WardenUserPublic, isTemp?: boolean, expiresAt?: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ authStatus, onAuthenticated }) => {
  // Mode: 'login' | 'setup' | 'setup_2fa' | 'setup_recovery_codes' | 'emergency_info'
  const isInitialSetup = !authStatus.hasUsers;
  const [mode, setMode] = useState<
    'login' | 'setup' | 'setup_2fa' | 'setup_recovery_codes' | 'emergency_info'
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

    if (password.length < 4) {
      setErrorMessage('Password must be at least 4 characters long.');
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

  // ── 3. VERIFY 2FA IN SETUP ──
  const handleVerifySetup2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setup2FAData || !totpCode) {
      setErrorMessage('Please enter the 6-digit authenticator code.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/auth/setup', {
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
      <div className="w-full max-w-sm relative z-10 my-auto">
        <Card className="p-6 bg-[var(--bg-surface)] border-[var(--color-border)] space-y-5">
          {/* Official Logo */}
          <div className="text-center pb-1">
            <img
              src="/warden_logo.png"
              alt="Warden"
              className="h-8 mx-auto object-contain select-none"
            />
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="bg-red-950/40 border border-red-500/40 rounded-lg p-3 text-xs text-red-300 font-mono flex items-start gap-2.5">
              <WardenIcon name="triangle-alert" size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
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
                  placeholder="admin"
                  className="w-full h-9 bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/60 font-mono transition-colors"
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
                  placeholder="Password"
                />
              </div>

              {/* 2FA Section (if required) */}
              {requires2FA && (
                <div className="p-3 bg-[var(--bg-main)] rounded-lg border border-[var(--accent-border)] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold uppercase text-[var(--color-accent)] font-mono">
                      {useRecoveryCode ? 'Recovery Code' : '2FA Code'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setUseRecoveryCode(!useRecoveryCode);
                        setTotpCode('');
                        setRecoveryCode('');
                      }}
                      className="text-[10px] text-slate-400 hover:text-slate-200 underline font-mono"
                    >
                      {useRecoveryCode ? 'Use 6-digit code' : 'Use recovery code'}
                    </button>
                  </div>

                  {useRecoveryCode ? (
                    <input
                      type="text"
                      required
                      autoFocus
                      value={recoveryCode}
                      onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      className="w-full h-9 bg-[var(--bg-surface)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 font-mono uppercase tracking-widest text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    />
                  ) : (
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-full h-9 bg-[var(--bg-surface)] border border-[var(--color-border)] px-3 rounded-md text-base text-slate-100 font-mono tracking-widest text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                    />
                  )}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={loading}
                className="w-full font-minecraft text-xs justify-center py-2"
              >
                <WardenIcon name="check" size={14} className="text-[#0d0e11]" />
                {requires2FA ? 'Verify & Log In' : 'Log In'}
              </Button>

              {/* Emergency Account Access Link */}
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setMode('emergency_info');
                  }}
                  className="text-[11px] text-slate-400 hover:text-[var(--color-accent)] transition-colors font-mono"
                >
                  Lost 2FA / Password? <span className="underline">Emergency Console Recovery</span>
                </button>
              </div>
            </form>
          )}

          {/* ════════ MODE: FIRST-TIME SETUP ════════ */}
          {mode === 'setup' && (
            <form onSubmit={handleSetup} className="space-y-4">
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
                  placeholder="admin"
                  className="w-full h-9 bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/60"
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
                  placeholder="Password"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                  Confirm Password
                </label>
                <PasswordInput
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
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
                {want2FAInSetup ? 'Continue to 2FA Setup' : 'Create Account'}
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

              <div className="bg-[var(--bg-main)] p-2 rounded border border-[var(--color-border)] text-center">
                <div className="text-[10px] text-slate-400 uppercase font-mono mb-0.5">Key:</div>
                <div className="text-xs font-mono font-bold text-[var(--color-accent)] tracking-wider select-all">
                  {setup2FAData.secret}
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
                  onClick={() => setMode('setup')}
                  className="flex-1 font-mono text-xs"
                >
                  Back
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

          {/* ════════ MODE: EMERGENCY CONSOLE INFO ════════ */}
          {mode === 'emergency_info' && (
            <div className="space-y-4">
              <div className="bg-red-950/30 border border-red-500/40 rounded-lg p-3 text-xs text-slate-300 font-mono leading-relaxed space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-red-300 uppercase tracking-wide">
                  <WardenIcon name="triangle-alert" size={15} className="text-red-400" />
                  Emergency Console Recovery
                </div>
                <p className="text-[11px] text-slate-300">
                  Generates temporary 15-minute login credentials printed to the server terminal / Docker logs.
                </p>
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
                        setMode('login');
                      }}
                      className="w-full font-minecraft text-xs justify-center"
                    >
                      Enter Credentials &rarr;
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  isLoading={emergencyLoading}
                  onClick={handleTriggerEmergencyAccess}
                  className="w-full font-minecraft text-xs justify-center py-2"
                >
                  <WardenIcon name="terminal-square" size={14} className="text-[#0d0e11]" />
                  Generate Recovery in Logs
                </Button>
              )}

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-xs text-slate-400 hover:text-slate-200 font-mono"
                >
                  &larr; Return to login
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
