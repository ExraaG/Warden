'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { WardenSettings, WardenServer } from '@warden/shared';
import { WardenIcon } from '../../components/ui/WardenIcon';
import { showToast } from '../../components/ui/Toast';

import { PasswordInput } from '../../components/ui/PasswordInput';
import { Modal } from '../../components/ui/Modal';
import { WardenUserPublic, TwoFactorGenerateResponse } from '@warden/shared';

export default function SettingsPage() {
  const [settings, setSettings] = useState<WardenSettings | null>(null);
  const [wardenApiKey, setWardenApiKey] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('Europe/Vienna');
  const [autoUpdateTime, setAutoUpdateTime] = useState<string>('04:00');
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(true);
  const [autoRestartEnabled, setAutoRestartEnabled] = useState<boolean>(false);
  const [autoRestartTime, setAutoRestartTime] = useState<string>('05:00');
  const [showTimezoneEditor, setShowTimezoneEditor] = useState<boolean>(false);
  const [detectedTimezone, setDetectedTimezone] = useState<string>('Europe/Vienna');
  const [saving, setSaving] = useState<boolean>(false);
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [updateInfo, setUpdateInfo] = useState<{
    updateAvailable: boolean;
    currentCommit?: string;
    latestCommit?: string;
    commitMessage?: string;
  } | null>(null);
  const [serversList, setServersList] = useState<WardenServer[]>([]);
  const [selectedExportServer, setSelectedExportServer] = useState<string>('');
  const [exportingServer, setExportingServer] = useState<boolean>(false);

  // Security & Authentication State
  const [currentUser, setCurrentUser] = useState<WardenUserPublic | null>(null);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [changingPassword, setChangingPassword] = useState<boolean>(false);

  // User Accounts Management State (Admins Only)
  const [usersList, setUsersList] = useState<WardenUserPublic[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [showAddUserModal, setShowAddUserModal] = useState<boolean>(false);
  const [showEditUserModal, setShowEditUserModal] = useState<boolean>(false);
  const [selectedUserToEdit, setSelectedUserToEdit] = useState<WardenUserPublic | null>(null);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newUserPassword, setNewUserPassword] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [editUserPassword, setEditUserPassword] = useState<string>('');
  const [editUserRole, setEditUserRole] = useState<'admin' | 'user'>('user');
  const [creatingUser, setCreatingUser] = useState<boolean>(false);
  const [updatingUser, setUpdatingUser] = useState<boolean>(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // 2FA Management State
  const [show2FAModal, setShow2FAModal] = useState<boolean>(false);
  const [twoFactorData, setTwoFactorData] = useState<TwoFactorGenerateResponse | null>(null);
  const [twoFactorVerifyCode, setTwoFactorVerifyCode] = useState<string>('');
  const [enabling2FA, setEnabling2FA] = useState<boolean>(false);
  const [disablePassword, setDisablePassword] = useState<string>('');
  const [disabling2FA, setDisabling2FA] = useState<boolean>(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showRecoveryModal, setShowRecoveryModal] = useState<boolean>(false);
  const [regeneratingRecovery, setRegeneratingRecovery] = useState<boolean>(false);

  // Dev & Testing Tools Modal State [Dev Branch]
  const [showDevDeleteAllServersModal, setShowDevDeleteAllServersModal] = useState<boolean>(false);
  const [devDeleteAllServersInput, setDevDeleteAllServersInput] = useState<string>('');
  const [devDeletingAllServers, setDevDeletingAllServers] = useState<boolean>(false);

  const [showDevDeleteAllUsersModal, setShowDevDeleteAllUsersModal] = useState<boolean>(false);
  const [devDeleteAllUsersInput, setDevDeleteAllUsersInput] = useState<string>('');
  const [devKeepCurrentAdmin, setDevKeepCurrentAdmin] = useState<boolean>(true);
  const [devDeletingAllUsers, setDevDeletingAllUsers] = useState<boolean>(false);

  const [showDevFactoryResetModal, setShowDevFactoryResetModal] = useState<boolean>(false);
  const [devFactoryResetInput, setDevFactoryResetInput] = useState<string>('');
  const [devExecutingFactoryReset, setDevExecutingFactoryReset] = useState<boolean>(false);

  const fetchAuthUser = async () => {
    try {
      const res = await fetch('/api/v1/auth/status').then((r) => r.json());
      if (res.success && res.data && res.data.user) {
        setCurrentUser(res.data.user);
      }
    } catch {}
  };

  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch('/api/v1/users').then((r) => r.json());
      if (res.success && Array.isArray(res.data)) {
        setUsersList(res.data);
      }
    } catch {} finally {
      setLoadingUsers(false);
    }
  };

  const fetchUpdateStatus = async (force = false) => {
    try {
      const res = await fetch(`/api/v1/system/update-status${force ? '?force=true' : ''}`).then((r) => r.json());
      if (res.success && res.data) {
        setUpdateInfo(res.data);
        return res.data;
      }
    } catch {}
    return null;
  };

  useEffect(() => {
    fetchAuthUser();
    fetchUsers();
    fetchUpdateStatus();
    fetch('/api/v1/servers')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setServersList(res.data);
          if (res.data.length > 0) {
            setSelectedExportServer(res.data[0].id);
          }
        }
      })
      .catch(() => {});
    const browserTz = typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'Europe/Vienna';
    setDetectedTimezone(browserTz || 'Europe/Vienna');
    fetch('/api/v1/settings')
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          setSettings(res.data);
          setTimezone(res.data.timezone || browserTz || 'Europe/Vienna');
          setAutoUpdateTime(res.data.autoUpdateTime || '04:00');
          setAutoUpdateEnabled(res.data.autoUpdateEnabled !== false);
          setAutoRestartEnabled(Boolean(res.data.autoRestartEnabled));
          setAutoRestartTime(res.data.autoRestartTime || '05:00');
        }
      })
      .catch((err) => console.error('Error loading settings:', err));
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newUserPassword) {
      showToast('Username and password are required.', 'error');
      return;
    }
    setCreatingUser(true);
    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newUserPassword,
          role: newUserRole,
        }),
      }).then((r) => r.json());
      if (res.success) {
        showToast(`User account '${newUsername.trim()}' created!`, 'success');
        setNewUsername('');
        setNewUserPassword('');
        setNewUserRole('user');
        setShowAddUserModal(false);
        fetchUsers();
      } else {
        showToast(res.error || 'Failed to create user account.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to create user account.', 'error');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleOpenEditUser = (user: WardenUserPublic) => {
    setSelectedUserToEdit(user);
    setEditUserRole(user.role === 'admin' ? 'admin' : 'user');
    setEditUserPassword('');
    setShowEditUserModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserToEdit) return;
    setUpdatingUser(true);
    try {
      const res = await fetch(`/api/v1/users/${selectedUserToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: editUserRole,
          newPassword: editUserPassword || undefined,
        }),
      }).then((r) => r.json());
      if (res.success) {
        showToast(`User '${selectedUserToEdit.username}' updated successfully!`, 'success');
        setShowEditUserModal(false);
        setSelectedUserToEdit(null);
        setEditUserPassword('');
        fetchUsers();
      } else {
        showToast(res.error || 'Failed to update user.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update user.', 'error');
    } finally {
      setUpdatingUser(false);
    }
  };

  const handleDeleteUser = async (user: WardenUserPublic) => {
    if (!confirm(`Are you sure you want to delete user '${user.username}'? This cannot be undone.`)) {
      return;
    }
    setDeletingUserId(user.id);
    try {
      const res = await fetch(`/api/v1/users/${user.id}`, { method: 'DELETE' }).then((r) => r.json());
      if (res.success) {
        showToast(`User '${user.username}' deleted successfully.`, 'success');
        fetchUsers();
      } else {
        showToast(res.error || 'Failed to delete user.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to delete user.', 'error');
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 4) {
      showToast('New password must be at least 4 characters long.', 'error');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to change password.');
      }
      showToast('Master password updated successfully!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err.message || 'Password update failed.', 'error');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleStart2FASetup = async () => {
    setEnabling2FA(true);
    try {
      const res = await fetch('/api/v1/auth/2fa/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to generate 2FA secret.');
      }
      setTwoFactorData(data.data);
      setTwoFactorVerifyCode('');
      setShow2FAModal(true);
    } catch (err: any) {
      showToast(err.message || 'Failed to generate 2FA QR code.', 'error');
    } finally {
      setEnabling2FA(false);
    }
  };

  const handleConfirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorData || !twoFactorVerifyCode) return;

    setEnabling2FA(true);
    try {
      const res = await fetch('/api/v1/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: twoFactorData.secret,
          totpCode: twoFactorVerifyCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '2FA confirmation failed.');
      }

      showToast('Two-Factor Authentication enabled successfully!', 'success');
      setRecoveryCodes(data.data.recoveryCodes || []);
      setShow2FAModal(false);
      setShowRecoveryModal(true);
      fetchAuthUser();
      window.dispatchEvent(new CustomEvent('warden_auth_changed'));
    } catch (err: any) {
      showToast(err.message || 'Verification failed.', 'error');
    } finally {
      setEnabling2FA(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword) {
      showToast('Enter your password to disable 2FA.', 'error');
      return;
    }

    setDisabling2FA(true);
    try {
      const res = await fetch('/api/v1/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to disable 2FA.');
      }
      showToast('2FA has been disabled.', 'success');
      setDisablePassword('');
      fetchAuthUser();
      window.dispatchEvent(new CustomEvent('warden_auth_changed'));
    } catch (err: any) {
      showToast(err.message || 'Failed to disable 2FA.', 'error');
    } finally {
      setDisabling2FA(false);
    }
  };

  const handleRegenerateRecoveryCodes = async () => {
    setRegeneratingRecovery(true);
    try {
      const res = await fetch('/api/v1/auth/recovery-codes/regenerate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to regenerate recovery codes.');
      }
      setRecoveryCodes(data.data.recoveryCodes || []);
      setShowRecoveryModal(true);
      showToast('New backup recovery codes generated!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to regenerate codes.', 'error');
    } finally {
      setRegeneratingRecovery(false);
    }
  };

  const handleDownloadCodesFile = () => {
    if (recoveryCodes.length === 0) return;
    const content = [
      '=====================================================',
      '         WARDEN EMERGENCY BACKUP RECOVERY CODES      ',
      '=====================================================',
      `Generated: ${new Date().toISOString()}`,
      `Account:   ${currentUser?.username || 'admin'}`,
      '',
      'RECOVERY CODES:',
      ...recoveryCodes.map((code, idx) => `[${idx + 1}] ${code}`),
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
    showToast('Recovery codes downloaded.', 'success');
  };

  const handleManualCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const data = await fetchUpdateStatus(true);
      if (data?.updateAvailable) {
        showToast(`Update available! Version ${data.latestCommit}`, 'info');
      } else {
        showToast(`Warden is running the latest version (${data?.version || 'v2'})!`, 'success');
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleExportServer = async () => {
    if (!selectedExportServer) {
      showToast('Please select a server to export', 'error');
      return;
    }
    setExportingServer(true);
    try {
      const target = serversList.find((s) => s.id === selectedExportServer);
      showToast('Exporting server archive (saving chunks)...', 'info');
      const res = await fetch(`/api/v1/servers/${selectedExportServer}/export`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const disposition = res.headers.get('content-disposition');
      let filename = `warden-${target?.name?.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || selectedExportServer}.zip`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('Server ZIP exported and downloaded successfully!', 'success');
    } catch (err: any) {
      showToast(`Export error: ${err.message}`, 'error');
    } finally {
      setExportingServer(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/v1/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wardenApiKey: wardenApiKey || undefined,
          timezone,
          autoUpdateTime,
          autoUpdateEnabled,
          autoRestartTime,
          autoRestartEnabled,
        }),
      }).then((r) => r.json());

      if (res.success) {
        setWardenApiKey('');
        setSettings(res.data);
        showToast('Settings saved successfully!', 'success');
      } else {
        showToast(`Save failed: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Save error: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-4 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2.5 sm:gap-3">
          <WardenIcon name="settings" size={20} className="text-[var(--color-accent)] shrink-0" />
          <span>Warden Configuration</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Configure standalone Minecraft engine settings, timezone, automated 4 AM update schedules, and API keys.
        </p>
      </Card>

      <form onSubmit={handleSave} className="space-y-4 sm:space-y-6">
        {/* Engine Status Card */}
        <Card header="Orchestrator Engine Status" badge={<WardenIcon name="server" size={16} className="text-[var(--color-accent)]" />}>
          <div className="space-y-2.5 text-xs font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5 border-b border-[var(--color-border)]">
              <span className="text-slate-400">Architecture</span>
              <span className="text-[var(--color-accent)] font-bold">Warden Standalone Native</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5 border-b border-[var(--color-border)]">
              <span className="text-slate-400">Process Manager</span>
              <span className="text-slate-200">Active (Node Child Process)</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5 border-b border-[var(--color-border)]">
              <span className="text-slate-400">Supported Modloaders</span>
              <span className="text-slate-200">Paper, Fabric, Purpur, Quilt, Vanilla</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5">
              <span className="text-slate-400">Storage Root</span>
              <span className="text-slate-300">/data/servers/</span>
            </div>
          </div>
        </Card>

        {/* Automated Schedules & Timezone Card */}
        <Card header="Automated Server Schedules" badge={<WardenIcon name="clock" size={16} className="text-[var(--color-accent)]" />}>
          <div className="space-y-4 text-sm">
            {/* System Timezone with auto-detection */}
            <div className="p-3.5 bg-[var(--bg-main)] border border-[var(--color-border)] rounded-lg space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-slate-200 uppercase font-minecraft">Active System Timezone</div>
                  <div className="text-[11px] text-slate-400 font-mono">All automated jobs execute according to this timezone.</div>
                </div>
                <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-2.5 py-1 rounded text-xs font-mono font-bold shrink-0 self-start sm:self-auto">
                  {timezone || detectedTimezone}
                </span>
              </div>

              {!showTimezoneEditor ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowTimezoneEditor(true)}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-mono cursor-pointer"
                  >
                    Wrong Timezone? Change it here
                  </button>
                </div>
              ) : (
                <div className="pt-2.5 border-t border-[var(--color-border)] space-y-2">
                  <label className="block text-[11px] font-semibold uppercase text-slate-400 font-mono">
                    Custom Timezone Name
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      placeholder="e.g. Europe/Vienna, America/New_York, UTC"
                      className="flex-1 bg-[var(--bg-surface)] border border-[var(--color-border)] p-2 rounded text-xs text-slate-100 font-mono focus:ring-1 focus:ring-emerald-500"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTimezone(detectedTimezone);
                        showToast(`Timezone set to detected: ${detectedTimezone}`, 'info');
                      }}
                      className="text-xs font-mono whitespace-nowrap"
                    >
                      Detect Mine ({detectedTimezone})
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 1. Automated Mod Updates */}
            <div className="p-3.5 bg-[var(--bg-main)] border border-[var(--color-border)] rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Automated Mod Updates</div>
                  <div className="text-[11px] text-slate-400 font-mono">Automatically checks Modrinth and updates modpacks with safety backup and rollback.</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoUpdateEnabled}
                  onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 font-mono">
                  Daily Execution Time (24h format)
                </label>
                <input
                  type="time"
                  value={autoUpdateTime}
                  onChange={(e) => setAutoUpdateTime(e.target.value)}
                  disabled={!autoUpdateEnabled}
                  className="w-full sm:w-48 bg-[var(--bg-surface)] border border-[var(--color-border)] p-2 rounded-md text-xs text-slate-100 font-mono disabled:opacity-40"
                />
              </div>
            </div>

            {/* 2. Automated Daily Server Restart */}
            <div className="p-3.5 bg-[var(--bg-main)] border border-[var(--color-border)] rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Automated Daily Server Restarts</div>
                  <div className="text-[11px] text-slate-400 font-mono">Safely restarts running Minecraft servers daily to clear memory leaks and keep ticks smooth.</div>
                </div>
                <input
                  type="checkbox"
                  checked={autoRestartEnabled}
                  onChange={(e) => setAutoRestartEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 font-mono">
                  Daily Execution Time (24h format)
                </label>
                <input
                  type="time"
                  value={autoRestartTime}
                  onChange={(e) => setAutoRestartTime(e.target.value)}
                  disabled={!autoRestartEnabled}
                  className="w-full sm:w-48 bg-[var(--bg-surface)] border border-[var(--color-border)] p-2 rounded-md text-xs text-slate-100 font-mono disabled:opacity-40"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* API Authentication Card */}
        <Card header="Warden API Security" badge={<WardenIcon name="code" size={16} className="text-[var(--color-accent)]" />}>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1">
              Warden API Key (Remote & Integration Clients)
            </label>
            <input
              type="password"
              value={wardenApiKey}
              onChange={(e) => setWardenApiKey(e.target.value)}
              placeholder={settings?.wardenApiKeySet ? '•••••••••••••••• (Key Active)' : 'Set custom API key...'}
              className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 font-mono"
            />
            <p className="text-[11px] text-slate-400 mt-2 font-mono">
              Pass this key in the <code className="text-[var(--color-accent)] bg-black/40 px-1 py-0.5 rounded">X-Warden-API-Key</code> header when calling REST endpoints.
            </p>
          </div>
        </Card>

        {/* System Version & Updates Card */}
        <Card
          header="System Version & Updates"
          badge={
            <span className="bg-emerald-950 text-[var(--color-accent)] border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-minecraft uppercase font-bold tracking-wider">
              Auto-Checking GitHub
            </span>
          }
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="font-semibold text-xs text-slate-200 flex items-center gap-2">
                <span>Warden System Orchestrator</span>
                <span className="bg-[var(--bg-main)] border border-[var(--color-border)] text-slate-300 font-mono text-[10px] px-2 py-0.5 rounded font-bold">
                  {updateInfo?.currentCommit ? `Version: ${updateInfo.currentCommit}` : 'Version: v1'}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono leading-relaxed max-w-xl">
                Warden checks GitHub (<code className="text-emerald-400">ExraaG/Warden</code>) on every website load. When updates are published, you can install them with 1 click while preserving all Minecraft server data.
              </p>
              {updateInfo?.latestCommit && (
                <div className="text-[11px] font-mono text-slate-400 pt-1 flex items-center gap-2">
                  <span>Latest GitHub Version:</span>
                  <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                    {updateInfo.latestCommit}
                  </span>
                  {updateInfo.commitMessage && (
                    <span className="text-slate-500 truncate max-w-md hidden md:inline">
                      — &quot;{updateInfo.commitMessage}&quot;
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <Button
                type="button"
                variant="outline"
                size="sm"
                isLoading={checkingUpdate}
                onClick={handleManualCheckUpdate}
                className="text-xs font-minecraft"
              >
                <WardenIcon name="refresh-cw" size={12} className={checkingUpdate ? 'animate-spin' : ''} />
                Check Updates
              </Button>
              {updateInfo?.updateAvailable && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => window.dispatchEvent(new CustomEvent('warden_open_update_modal'))}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black font-bold font-minecraft text-xs"
                >
                  <WardenIcon name="download" size={13} className="text-black" />
                  Install Update
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Server Export & Migration Card */}
        <Card
          header="Server Export & Migration"
          badge={<WardenIcon name="download" size={16} className="text-[var(--color-accent)]" />}
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-mono leading-relaxed">
              Export any of your Minecraft server instances as a standalone <code className="text-emerald-400">.zip</code> archive. This contains all worlds, configs, installed mods/plugins, and server properties.
            </p>
            {serversList.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1">
                <select
                  value={selectedExportServer}
                  onChange={(e) => setSelectedExportServer(e.target.value)}
                  className="flex-1 bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/50 font-mono"
                >
                  {serversList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.detection?.loader || 'vanilla'} {s.detection?.mcVersion || ''})
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={exportingServer}
                  onClick={handleExportServer}
                  className="px-5 font-minecraft text-xs shrink-0"
                >
                  <WardenIcon name="download" size={14} className="text-[#0d0e11]" />
                  Download ZIP
                </Button>
              </div>
            ) : (
              <div className="text-xs font-mono text-slate-500 italic">
                No servers currently installed to export.
              </div>
            )}
          </div>
        </Card>

        {/* Android Mobile Client Card */}
        <Card
          header="Android Mobile App"
          badge={
            <span className="bg-emerald-950 text-[var(--color-accent)] border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-minecraft uppercase font-bold tracking-wider">
              Coming Soon
            </span>
          }
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-semibold text-xs text-slate-200">
                Native Android Companion for Warden
              </div>
              <p className="text-xs text-slate-400 font-mono leading-relaxed max-w-xl">
                A lightweight Android app built for Warden is in development. It will support real-time push notifications for server crash alerts &amp; mod updates, live console streaming, and quick server power controls from your phone.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-main)] border border-[var(--color-border)] text-xs text-slate-300 font-mono font-medium">
                <WardenIcon name="cpu" size={13} className="text-[var(--color-accent)] shrink-0" />
                In Development
              </span>
            </div>
          </div>
        </Card>

        {/* Security & Master Authentication Card */}
        <Card
          header="Security & Master Authentication"
          badge={
            currentUser?.totpEnabled ? (
              <span className="bg-emerald-950 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-minecraft uppercase font-bold tracking-wider flex items-center gap-1">
                <WardenIcon name="check" size={10} className="text-emerald-400" />
                2FA Enabled
              </span>
            ) : (
              <span className="bg-amber-950 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-minecraft uppercase font-bold tracking-wider">
                2FA Optional
              </span>
            )
          }
        >
          <div className="space-y-6">
            {/* Account Info & 2FA Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-[var(--bg-main)] rounded-xl border border-[var(--color-border)]">
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-100 font-mono flex items-center gap-2">
                  <span>Active Account:</span>
                  <span className="text-[var(--color-accent)]">{currentUser?.username || 'admin'}</span>
                  <span className="text-[10px] bg-[var(--bg-card)] border border-[var(--color-border)] px-1.5 py-0.5 rounded uppercase font-semibold text-slate-400">
                    {currentUser?.role || 'admin'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-mono">
                  {currentUser?.totpEnabled
                    ? 'Two-Factor Authentication is active with TOTP & backup recovery codes.'
                    : 'Protect your Minecraft servers by adding a 6-digit authenticator app to your login.'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {currentUser?.totpEnabled ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerateRecoveryCodes}
                      isLoading={regeneratingRecovery}
                      className="font-mono text-xs"
                    >
                      <WardenIcon name="download" size={13} className="text-slate-400" />
                      Recovery Codes
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => setShow2FAModal(true)}
                      className="font-minecraft text-xs"
                    >
                      Disable 2FA
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleStart2FASetup}
                    isLoading={enabling2FA}
                    className="font-minecraft text-xs"
                  >
                    <WardenIcon name="check" size={13} className="text-[#0d0e11]" />
                    Enable 2FA (QR Code)
                  </Button>
                )}
              </div>
            </div>

            {/* Change Password Form */}
            <div className="space-y-3 pt-2 border-t border-[var(--color-border)]">
              <div className="text-xs font-bold text-slate-200 font-minecraft uppercase tracking-wide flex items-center gap-2">
                <WardenIcon name="edit" size={14} className="text-[var(--color-accent)]" />
                Change Master Password
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1 font-mono">
                    Current Password
                  </label>
                  <PasswordInput
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1 font-mono">
                    New Password
                  </label>
                  <PasswordInput
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1 font-mono">
                    Confirm New Password
                  </label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={changingPassword}
                  onClick={handleChangePassword}
                  disabled={!currentPassword || !newPassword}
                  className="font-minecraft text-xs px-4"
                >
                  <WardenIcon name="save" size={13} className="text-slate-300" />
                  Update Password
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* User Accounts Management Card (Admin Only) */}
        {currentUser?.role === 'admin' && (
          <Card
            header="User Accounts & Access"
            badge={
              <span className="bg-[var(--bg-main)] text-[var(--color-accent)] border border-[var(--color-border)] px-2 py-0.5 rounded text-[10px] font-minecraft uppercase font-bold tracking-wider">
                {usersList.length} {usersList.length === 1 ? 'Account' : 'Accounts'}
              </span>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--color-border)]">
                <div>
                  <div className="text-xs font-semibold text-slate-200">
                    System User Accounts
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Create and manage accounts. Standard users can create servers and access servers assigned to them.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setNewUsername('');
                    setNewUserPassword('');
                    setNewUserRole('user');
                    setShowAddUserModal(true);
                  }}
                  className="font-minecraft text-xs shrink-0 px-4"
                >
                  <WardenIcon name="plus" size={13} className="text-[#0d0e11]" />
                  Add User
                </Button>
              </div>

              {/* User Accounts List */}
              <div className="space-y-2">
                {loadingUsers && usersList.length === 0 ? (
                  <div className="py-6 text-center text-xs font-mono text-slate-400">
                    Loading accounts...
                  </div>
                ) : usersList.length === 0 ? (
                  <div className="py-6 text-center text-xs font-mono text-slate-400">
                    No user accounts found.
                  </div>
                ) : (
                  usersList.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    const isDeleting = deletingUserId === u.id;
                    return (
                      <div
                        key={u.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[var(--bg-main)] rounded-lg border border-[var(--color-border)] hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-[var(--bg-card)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-accent)] font-minecraft font-bold text-xs shrink-0">
                            {u.username.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-100 font-mono flex items-center gap-2">
                              <span>{u.username}</span>
                              {isSelf && (
                                <span className="text-[9px] bg-[var(--color-accent)]/20 text-[var(--color-accent)] border border-[var(--color-accent)]/40 px-1.5 py-0.2 rounded uppercase font-bold font-mono">
                                  You
                                </span>
                              )}
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold font-mono ${
                                  u.role === 'admin'
                                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                                }`}
                              >
                                {u.role === 'admin' ? 'Admin' : 'User'}
                              </span>
                              {u.totpEnabled ? (
                                <span className="text-[9px] bg-emerald-950/50 text-emerald-300 border border-emerald-800/40 px-1.5 py-0.2 rounded font-mono">
                                  2FA
                                </span>
                              ) : (
                                <span className="text-[9px] bg-slate-900 text-slate-500 border border-slate-800 px-1.5 py-0.2 rounded font-mono">
                                  No 2FA
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              Created {new Date(u.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenEditUser(u)}
                            className="font-mono text-xs px-2.5 py-1 h-7"
                          >
                            <WardenIcon name="edit" size={12} className="text-slate-400" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={isSelf || isDeleting}
                            isLoading={isDeleting}
                            onClick={() => handleDeleteUser(u)}
                            className="font-mono text-xs px-2.5 py-1 h-7 disabled:opacity-30"
                          >
                            <WardenIcon name="trash" size={12} />
                            Delete
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </Card>
        )}

        <Card
          header="Developer & Testing Lab"
          badge={
            <span className="bg-amber-950/80 text-amber-300 border border-amber-600/50 px-2 py-0.5 rounded text-[10px] font-minecraft uppercase font-bold tracking-wider">
              Dev Branch Only
            </span>
          }
        >
          <div className="space-y-4">
            <div className="bg-amber-950/30 border border-amber-700/40 p-3 rounded-lg flex items-start gap-2.5 text-xs text-amber-200/90 font-mono leading-relaxed">
              <WardenIcon name="triangle-alert" size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300 font-bold block mb-0.5">DEV TESTING CONTROLS</strong>
                These tools allow fast bulk database wiping and server resetting while building and testing on the <code className="text-white bg-black/40 px-1 rounded">dev</code> branch. These controls will be removed before the release is merged to <code className="text-white bg-black/40 px-1 rounded">main</code>.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
              <div className="p-3.5 bg-[var(--bg-main)] border border-red-900/40 rounded-lg flex flex-col justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-red-400 font-minecraft uppercase flex items-center gap-1.5 mb-1">
                    <WardenIcon name="server" size={13} className="text-red-400" />
                    Purge All Servers
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
                    Permanently delete every server instance across all users on this Warden installation.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setDevDeleteAllServersInput('');
                    setShowDevDeleteAllServersModal(true);
                  }}
                  className="font-minecraft text-xs w-full justify-center"
                >
                  <WardenIcon name="trash" size={13} className="text-white" />
                  Purge All Servers
                </Button>
              </div>

              <div className="p-3.5 bg-[var(--bg-main)] border border-amber-900/40 rounded-lg flex flex-col justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-amber-400 font-minecraft uppercase flex items-center gap-1.5 mb-1">
                    <WardenIcon name="users" size={13} className="text-amber-400" />
                    Purge All Users
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
                    Delete user accounts from storage (with option to preserve active administrator session).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDevDeleteAllUsersInput('');
                    setShowDevDeleteAllUsersModal(true);
                  }}
                  className="font-minecraft text-xs w-full justify-center border-amber-800/60 text-amber-300 hover:bg-amber-950/40"
                >
                  <WardenIcon name="users" size={13} className="text-amber-400" />
                  Purge All Users
                </Button>
              </div>

              <div className="p-3.5 bg-[var(--bg-main)] border border-red-950 rounded-lg flex flex-col justify-between gap-3 bg-red-950/20">
                <div>
                  <div className="text-xs font-bold text-red-300 font-minecraft uppercase flex items-center gap-1.5 mb-1">
                    <WardenIcon name="triangle-alert" size={13} className="text-red-400" />
                    Factory Reset
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
                    Completely wipe all servers and all users. Warden returns to the initial onboarding screen.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setDevFactoryResetInput('');
                    setShowDevFactoryResetModal(true);
                  }}
                  className="font-minecraft text-xs w-full justify-center bg-red-800 hover:bg-red-700"
                >
                  <WardenIcon name="trash" size={13} className="text-white" />
                  Factory Reset
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" variant="primary" isLoading={saving} className="px-6">
            <WardenIcon name="check" size={16} className="text-[#0d0e11]" />
            Save Configuration
          </Button>
        </div>
      </form>

      {/* Add User Modal */}
      <Modal
        isOpen={showAddUserModal}
        onClose={() => setShowAddUserModal(false)}
        title="Add New User Account"
        maxWidth="md"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
              Username
            </label>
            <input
              type="text"
              required
              autoFocus
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="e.g. Alex"
              className="w-full h-10 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
              Password
            </label>
            <PasswordInput
              required
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              placeholder="Enter password (min 4 characters)"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
              Account Role &amp; Permissions
            </label>
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'user')}
              className="w-full h-10 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-xs sm:text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="user">Standard User (Can create servers &amp; manage assigned servers)</option>
              <option value="admin">Administrator (Full access to all servers &amp; system settings)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddUserModal(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={creatingUser}
              className="font-minecraft text-xs px-5"
            >
              <WardenIcon name="plus" size={13} className="text-[#0d0e11]" />
              Create Account
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditUserModal && Boolean(selectedUserToEdit)}
        onClose={() => {
          setShowEditUserModal(false);
          setSelectedUserToEdit(null);
          setEditUserPassword('');
        }}
        title={`Edit User: ${selectedUserToEdit?.username || ''}`}
        maxWidth="md"
      >
        {selectedUserToEdit && (
          <form onSubmit={handleUpdateUser} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                Account Role
              </label>
              <select
                value={editUserRole}
                onChange={(e) => setEditUserRole(e.target.value as 'admin' | 'user')}
                className="w-full h-10 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-xs sm:text-sm text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              >
                <option value="user">Standard User (Assigned servers &amp; own servers)</option>
                <option value="admin">Administrator (Full system &amp; all server access)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
                Reset Password (Optional)
              </label>
              <PasswordInput
                value={editUserPassword}
                onChange={(e) => setEditUserPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
              />
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                Enter a new password only if you wish to reset this user's password.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowEditUserModal(false);
                  setSelectedUserToEdit(null);
                  setEditUserPassword('');
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={updatingUser}
                className="font-minecraft text-xs px-5"
              >
                <WardenIcon name="save" size={13} className="text-[#0d0e11]" />
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* 2FA Enable Modal (QR Code) */}
      <Modal
        isOpen={show2FAModal && !currentUser?.totpEnabled}
        onClose={() => setShow2FAModal(false)}
        title="Enable Two-Factor Authentication"
        maxWidth="md"
      >
        {twoFactorData && (
          <form onSubmit={handleConfirm2FA} className="space-y-4 text-center">
            <p className="text-xs text-slate-300 font-mono leading-relaxed">
              Scan this QR code using Google Authenticator, Aegis, Authy, or 1Password:
            </p>

            <div className="bg-white p-3 rounded-xl inline-block shadow-lg mx-auto">
              <img src={twoFactorData.qrCodeDataUrl} alt="2FA QR Code" className="w-44 h-44 mx-auto" />
            </div>

            <div className="bg-[var(--bg-main)] p-2.5 rounded-lg border border-[var(--color-border)] text-center space-y-1">
              <div className="text-[10px] text-slate-400 uppercase font-mono">Manual Key:</div>
              <div className="text-[11px] font-mono font-bold text-[var(--color-accent)] tracking-wider select-all break-all px-1.5 py-1 rounded bg-[var(--bg-card)] border border-[var(--color-border)]/60">
                {twoFactorData.secret.match(/.{1,4}/g)?.join(' ') || twoFactorData.secret}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1.5 font-mono text-left">
                Enter 6-Digit Authenticator Code
              </label>
              <input
                type="text"
                required
                autoFocus
                maxLength={6}
                value={twoFactorVerifyCode}
                onChange={(e) => setTwoFactorVerifyCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                className="w-full h-10 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-lg text-slate-100 font-mono tracking-widest text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--color-border)]">
              <Button type="button" variant="outline" size="sm" onClick={() => setShow2FAModal(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={enabling2FA}
                disabled={twoFactorVerifyCode.length !== 6}
                className="font-minecraft text-xs"
              >
                <WardenIcon name="check" size={13} className="text-[#0d0e11]" />
                Verify &amp; Activate 2FA
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* 2FA Disable Modal */}
      <Modal
        isOpen={show2FAModal && Boolean(currentUser?.totpEnabled)}
        onClose={() => {
          setShow2FAModal(false);
          setDisablePassword('');
        }}
        title="Disable Two-Factor Authentication"
        maxWidth="md"
      >
        <form onSubmit={handleDisable2FA} className="space-y-4">
          <div className="bg-red-950/30 border border-red-500/40 rounded-lg p-3 text-xs text-red-200 font-mono">
            Disabling 2FA reduces login security. You will need your master password to sign in without an authenticator app.
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-300 mb-1 font-mono">
              Confirm Current Password
            </label>
            <PasswordInput
              required
              autoFocus
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Enter your master password"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShow2FAModal(false);
                setDisablePassword('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              isLoading={disabling2FA}
              className="font-minecraft text-xs"
            >
              Disable 2FA
            </Button>
          </div>
        </form>
      </Modal>

      {/* Recovery Codes Modal */}
      <Modal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        title="Backup Recovery Codes"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-lg p-3 text-xs text-amber-200 font-mono leading-relaxed space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-amber-300">
              <WardenIcon name="triangle-alert" size={14} className="text-amber-400" />
              Store in a Secure Location
            </div>
            <p className="text-[11px] text-amber-200/80">
              Each code can be used ONCE if you lose access to your authenticator app.
            </p>
          </div>

          <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--color-border)] grid grid-cols-2 gap-2 text-center">
            {recoveryCodes.map((code, idx) => (
              <div
                key={idx}
                className="p-1.5 bg-[var(--bg-card)] rounded text-[11px] font-mono font-bold text-slate-200 select-all border border-[var(--color-border)]/60"
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
              onClick={() => {
                navigator.clipboard.writeText(recoveryCodes.join('\n'));
                showToast('Recovery codes copied to clipboard.', 'success');
              }}
              className="flex-1 font-mono text-xs"
            >
              <WardenIcon name="edit" size={13} className="text-slate-400" />
              Copy Codes
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleDownloadCodesFile}
              className="flex-1 font-mono text-xs"
            >
              <WardenIcon name="download" size={13} className="text-[var(--color-accent)]" />
              Download (.txt)
            </Button>
          </div>

          <div className="flex justify-end pt-2 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setShowRecoveryModal(false)}
              className="font-minecraft text-xs px-5"
            >
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Dev Tool 1: Purge All Servers (Global) Modal */}
      {showDevDeleteAllServersModal && (
        <Modal
          isOpen={showDevDeleteAllServersModal}
          onClose={() => {
            if (!devDeletingAllServers) {
              setShowDevDeleteAllServersModal(false);
              setDevDeleteAllServersInput('');
            }
          }}
          title="[DEV] Purge All Servers Globally"
        >
          <div className="space-y-4">
            <div className="bg-red-950/40 border border-red-800/60 p-3.5 rounded-lg text-xs text-red-200 flex items-start gap-2.5 font-mono leading-relaxed">
              <WardenIcon name="triangle-alert" size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-red-300 font-bold block mb-1">GLOBAL SERVER PURGE</strong>
                This will permanently delete <strong className="text-white">ALL Minecraft servers</strong> on this Warden host across all user accounts. Every world file, mod, configuration, and player file will be destroyed.
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-300 font-mono">
                To confirm global server purge, please type <strong className="text-red-400 font-mono select-all bg-red-950/60 px-1.5 py-0.5 rounded border border-red-800/40">DELETE ALL SERVERS GLOBAL</strong> below:
              </label>
              <input
                type="text"
                autoFocus
                value={devDeleteAllServersInput}
                onChange={(e) => setDevDeleteAllServersInput(e.target.value)}
                placeholder="DELETE ALL SERVERS GLOBAL"
                className="w-full h-9 bg-[var(--bg-main)] border border-[var(--color-border)] focus:border-red-500 focus:ring-1 focus:ring-red-500/50 px-3 rounded-md text-xs text-slate-100 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border)]">
              <Button
                variant="outline"
                size="md"
                type="button"
                disabled={devDeletingAllServers}
                onClick={() => {
                  setShowDevDeleteAllServersModal(false);
                  setDevDeleteAllServersInput('');
                }}
                className="px-4 font-mono text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                type="button"
                isLoading={devDeletingAllServers}
                disabled={devDeleteAllServersInput !== 'DELETE ALL SERVERS GLOBAL' || devDeletingAllServers}
                onClick={async () => {
                  if (devDeleteAllServersInput !== 'DELETE ALL SERVERS GLOBAL') return;
                  setDevDeletingAllServers(true);
                  try {
                    const res = await fetch('/api/v1/servers/batch/all?scope=all', { method: 'DELETE' }).then((r) => r.json());
                    if (res.success) {
                      const count = res.data?.deletedCount || 0;
                      showToast(`Global server purge complete: ${count} servers deleted.`, 'success');
                      setShowDevDeleteAllServersModal(false);
                      setDevDeleteAllServersInput('');
                      setServersList([]);
                      localStorage.removeItem('warden_selected_server_id');
                      window.dispatchEvent(new CustomEvent('warden_server_changed', { detail: '' }));
                      window.dispatchEvent(new CustomEvent('warden_server_updated'));
                    } else {
                      showToast(`Purge failed: ${res.error}`, 'error');
                    }
                  } catch (err: any) {
                    showToast(`Error: ${err.message}`, 'error');
                  } finally {
                    setDevDeletingAllServers(false);
                  }
                }}
                className="px-5 font-minecraft text-xs"
              >
                <WardenIcon name="trash" size={14} className="text-white" />
                Purge All Servers (Global)
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Dev Tool 2: Purge All Users Modal */}
      {showDevDeleteAllUsersModal && (
        <Modal
          isOpen={showDevDeleteAllUsersModal}
          onClose={() => {
            if (!devDeletingAllUsers) {
              setShowDevDeleteAllUsersModal(false);
              setDevDeleteAllUsersInput('');
            }
          }}
          title="[DEV] Purge All User Accounts"
        >
          <div className="space-y-4">
            <div className="bg-amber-950/40 border border-amber-800/60 p-3.5 rounded-lg text-xs text-amber-200 flex items-start gap-2.5 font-mono leading-relaxed">
              <WardenIcon name="triangle-alert" size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300 font-bold block mb-1">USER DATABASE PURGE</strong>
                This will delete user accounts from the Warden database.
              </div>
            </div>

            <label className="flex items-center gap-2.5 p-3 bg-[var(--bg-main)] border border-[var(--color-border)] rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={devKeepCurrentAdmin}
                onChange={(e) => setDevKeepCurrentAdmin(e.target.checked)}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              />
              <div>
                <div className="text-xs font-semibold text-slate-200">Preserve My Current Admin Account ({currentUser?.username})</div>
                <div className="text-[10px] text-slate-400 font-mono">Keep your active session logged in while wiping all other accounts.</div>
              </div>
            </label>

            <div className="space-y-2">
              <label className="block text-xs text-slate-300 font-mono">
                To confirm user purge, please type <strong className="text-amber-400 font-mono select-all bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/40">DELETE ALL USERS</strong> below:
              </label>
              <input
                type="text"
                autoFocus
                value={devDeleteAllUsersInput}
                onChange={(e) => setDevDeleteAllUsersInput(e.target.value)}
                placeholder="DELETE ALL USERS"
                className="w-full h-9 bg-[var(--bg-main)] border border-[var(--color-border)] focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 px-3 rounded-md text-xs text-slate-100 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border)]">
              <Button
                variant="outline"
                size="md"
                type="button"
                disabled={devDeletingAllUsers}
                onClick={() => {
                  setShowDevDeleteAllUsersModal(false);
                  setDevDeleteAllUsersInput('');
                }}
                className="px-4 font-mono text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                type="button"
                isLoading={devDeletingAllUsers}
                disabled={devDeleteAllUsersInput !== 'DELETE ALL USERS' || devDeletingAllUsers}
                onClick={async () => {
                  if (devDeleteAllUsersInput !== 'DELETE ALL USERS') return;
                  setDevDeletingAllUsers(true);
                  try {
                    const res = await fetch('/api/v1/users/batch/all', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ keepCurrentAdmin: devKeepCurrentAdmin }),
                    }).then((r) => r.json());
                    if (res.success) {
                      const count = res.data?.deletedCount || 0;
                      showToast(`User purge complete: ${count} users deleted.`, 'success');
                      setShowDevDeleteAllUsersModal(false);
                      setDevDeleteAllUsersInput('');
                      if (!devKeepCurrentAdmin) {
                        setTimeout(() => {
                          window.location.href = '/';
                        }, 600);
                      } else {
                        fetchUsers();
                      }
                    } else {
                      showToast(`User purge failed: ${res.error}`, 'error');
                    }
                  } catch (err: any) {
                    showToast(`Error: ${err.message}`, 'error');
                  } finally {
                    setDevDeletingAllUsers(false);
                  }
                }}
                className="px-5 font-minecraft text-xs"
              >
                <WardenIcon name="trash" size={14} className="text-white" />
                Purge Users
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showDevFactoryResetModal && (
        <Modal
          isOpen={showDevFactoryResetModal}
          onClose={() => {
            if (!devExecutingFactoryReset) {
              setShowDevFactoryResetModal(false);
              setDevFactoryResetInput('');
            }
          }}
          title="[DEV] Factory Reset & Full Wipe"
        >
          <div className="space-y-4">
            <div className="bg-red-950/60 border border-red-700 p-3.5 rounded-lg text-xs text-red-200 flex items-start gap-2.5 font-mono leading-relaxed">
              <WardenIcon name="triangle-alert" size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-red-300 font-bold block mb-1">TOTAL FACTORY RESET</strong>
                This will delete <strong className="text-white">ALL Minecraft servers</strong> and <strong className="text-white">ALL user accounts</strong>, returning Warden to the first-time setup state.
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs text-slate-300 font-mono">
                To confirm factory wipe, please type <strong className="text-red-400 font-mono select-all bg-red-950/60 px-1.5 py-0.5 rounded border border-red-800/40">FACTORY PURGE WARDEN</strong> below:
              </label>
              <input
                type="text"
                autoFocus
                value={devFactoryResetInput}
                onChange={(e) => setDevFactoryResetInput(e.target.value)}
                placeholder="FACTORY PURGE WARDEN"
                className="w-full h-9 bg-[var(--bg-main)] border border-[var(--color-border)] focus:border-red-500 focus:ring-1 focus:ring-red-500/50 px-3 rounded-md text-xs text-slate-100 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--color-border)]">
              <Button
                variant="outline"
                size="md"
                type="button"
                disabled={devExecutingFactoryReset}
                onClick={() => {
                  setShowDevFactoryResetModal(false);
                  setDevFactoryResetInput('');
                }}
                className="px-4 font-mono text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="md"
                type="button"
                isLoading={devExecutingFactoryReset}
                disabled={devFactoryResetInput !== 'FACTORY PURGE WARDEN' || devExecutingFactoryReset}
                onClick={async () => {
                  if (devFactoryResetInput !== 'FACTORY PURGE WARDEN') return;
                  setDevExecutingFactoryReset(true);
                  try {
                    const res = await fetch('/api/v1/system/dev-reset', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ resetServers: true, resetUsers: true, keepCurrentAdmin: false }),
                    }).then((r) => r.json());
                    if (res.success) {
                      showToast('Factory purge complete. Redirecting to onboarding...', 'success');
                      setShowDevFactoryResetModal(false);
                      setDevFactoryResetInput('');
                      localStorage.clear();
                      setTimeout(() => {
                        window.location.href = '/';
                      }, 800);
                    } else {
                      showToast(`Factory reset failed: ${res.error}`, 'error');
                    }
                  } catch (err: any) {
                    showToast(`Error: ${err.message}`, 'error');
                  } finally {
                    setDevExecutingFactoryReset(false);
                  }
                }}
                className="px-5 font-minecraft text-xs bg-red-800 hover:bg-red-700"
              >
                <WardenIcon name="trash" size={14} className="text-white" />
                Factory Purge Warden
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
