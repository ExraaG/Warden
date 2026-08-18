'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WardenServer, ServerLoader, ScheduledTask } from '@warden/shared';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Dropdown, DropdownOption } from '../components/ui/Dropdown';
import { NumberInput } from '../components/ui/NumberInput';
import { WardenIcon } from '../components/ui/WardenIcon';
import { getCommandSuggestions } from '../utils/minecraftCommands';
import { showToast } from '../components/ui/Toast';

type TabType = 'mods' | 'players' | 'properties' | 'files' | 'console' | 'settings';

export default function DashboardPage() {
  const [serverId, setServerId] = useState<string>('');
  const [allServers, setAllServers] = useState<WardenServer[]>([]);
  const [server, setServer] = useState<WardenServer | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ text: string; type?: 'info' | 'success' | 'error' } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<TabType>('mods');
  const [liveUptime, setLiveUptime] = useState<number>(0);

  // Create Server Modal State & Options
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [creatingServer, setCreatingServer] = useState<boolean>(false);
  const [customVersionMode, setCustomVersionMode] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState({
    name: 'My Minecraft Server',
    loader: 'paper' as ServerLoader,
    mcVersion: '1.21.1',
    port: 25565,
    minMemory: '2G',
    maxMemory: '4G',
    autoStart: true,
  });

  const CREATE_LOADER_OPTIONS: DropdownOption[] = [
    { id: 'paper', label: 'Paper', sublabel: 'High Performance Plugins' },
    { id: 'fabric', label: 'Fabric', sublabel: 'Fast Modern Modloader' },
    { id: 'purpur', label: 'Purpur', sublabel: 'High Performance Paper Fork' },
    { id: 'quilt', label: 'Quilt', sublabel: 'Modular Modloader (Fabric Compatible)' },
    { id: 'vanilla', label: 'Vanilla', sublabel: 'Official Mojang Game Server' },
  ];

  const CREATE_MC_VERSIONS: DropdownOption[] = [
    { id: '1.21.1', label: '1.21.1', sublabel: 'Latest Release' },
    { id: '1.21', label: '1.21', sublabel: 'Tricky Trials' },
    { id: '1.20.6', label: '1.20.6', sublabel: 'Armored Paws' },
    { id: '1.20.4', label: '1.20.4', sublabel: 'Popular Modding standard' },
    { id: '1.20.2', label: '1.20.2', sublabel: 'Release' },
    { id: '1.20.1', label: '1.20.1', sublabel: 'LTS Standard' },
    { id: '1.19.4', label: '1.19.4', sublabel: 'Trails & Tales' },
    { id: '1.19.2', label: '1.19.2', sublabel: 'The Wild Update' },
    { id: '1.18.2', label: '1.18.2', sublabel: 'Caves & Cliffs II' },
    { id: '1.16.5', label: '1.16.5', sublabel: 'Nether Update' },
  ];

  const CREATE_MIN_RAM_OPTIONS: DropdownOption[] = [
    { id: '1G', label: '1 GB' },
    { id: '2G', label: '2 GB' },
    { id: '4G', label: '4 GB' },
    { id: '6G', label: '6 GB' },
    { id: '8G', label: '8 GB' },
  ];

  const CREATE_MAX_RAM_OPTIONS: DropdownOption[] = [
    { id: '2G', label: '2 GB' },
    { id: '4G', label: '4 GB' },
    { id: '6G', label: '6 GB' },
    { id: '8G', label: '8 GB' },
    { id: '12G', label: '12 GB' },
    { id: '16G', label: '16 GB' },
    { id: '24G', label: '24 GB' },
    { id: '32G', label: '32 GB' },
  ];

  const [createAvailableVersions, setCreateAvailableVersions] = useState<DropdownOption[]>(CREATE_MC_VERSIONS);
  const [createLoadingVersions, setCreateLoadingVersions] = useState<boolean>(false);

  useEffect(() => {
    if (!showCreateModal) return;
    setCreateLoadingVersions(true);
    fetch(`/api/v1/meta/versions?loader=${createForm.loader}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          const mapped: DropdownOption[] = data.data.map((v: any) => ({
            id: v.id,
            label: v.label,
            sublabel: v.sublabel,
          }));
          setCreateAvailableVersions(mapped);
          // If current version is not in list, auto-select latest
          if (!mapped.find((m) => m.id === createForm.mcVersion)) {
            setCreateForm((prev) => ({ ...prev, mcVersion: mapped[0].id }));
          }
        }
      })
      .catch((err) => console.warn('Failed to load dynamic versions:', err))
      .finally(() => setCreateLoadingVersions(false));
  }, [showCreateModal, createForm.loader]);

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingServer(true);
    try {
      const res = await fetch('/api/v1/servers/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      }).then((r) => r.json());

      if (res.success && res.data) {
        showToast(`Server '${createForm.name}' created successfully!`, 'success');
        setShowCreateModal(false);
        setServerId(res.data.id);
        localStorage.setItem('warden_selected_server_id', res.data.id);
        window.dispatchEvent(new CustomEvent('warden_server_changed', { detail: res.data.id }));
        window.dispatchEvent(new CustomEvent('warden_server_updated'));
        loadServerDetails(res.data.id);
        loadAllServers();
      } else {
        showToast(`Failed to create server: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Creation error: ${err.message}`, 'error');
    } finally {
      setCreatingServer(false);
    }
  };

  // Custom Confirm Modal State
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmText?: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const promptConfirm = (opts: {
    title: string;
    description: string;
    confirmText?: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => void;
  }) => {
    setConfirmDialog({
      open: true,
      title: opts.title,
      description: opts.description,
      confirmText: opts.confirmText || 'Confirm',
      variant: opts.variant || 'danger',
      onConfirm: opts.onConfirm,
    });
  };

  // Loader & Version Confirmation & Change Loader State
  const [manualLoader, setManualLoader] = useState<ServerLoader>('fabric');
  const [manualVersion, setManualVersion] = useState<string>('1.21.1');
  const [showChangeLoaderModal, setShowChangeLoaderModal] = useState<boolean>(false);
  const [changingLoader, setChangingLoader] = useState<boolean>(false);
  const [newLoader, setNewLoader] = useState<ServerLoader>('paper');
  const [newMcVersion, setNewMcVersion] = useState<string>('1.21.1');
  const [changeLoaderVersions, setChangeLoaderVersions] = useState<DropdownOption[]>(CREATE_MC_VERSIONS);
  const [loadingChangeVersions, setLoadingChangeVersions] = useState<boolean>(false);

  useEffect(() => {
    if (!showChangeLoaderModal) return;
    setLoadingChangeVersions(true);
    fetch(`/api/v1/meta/versions?loader=${newLoader}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          const mapped: DropdownOption[] = data.data.map((v: any) => ({
            id: v.id,
            label: v.label,
            sublabel: v.sublabel,
          }));
          setChangeLoaderVersions(mapped);
          if (!mapped.find((m) => m.id === newMcVersion)) {
            setNewMcVersion(mapped[0].id);
          }
        }
      })
      .catch((err) => console.warn(err))
      .finally(() => setLoadingChangeVersions(false));
  }, [showChangeLoaderModal, newLoader]);

  const handleChangeLoader = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverId) return;
    setChangingLoader(true);
    try {
      const res = await fetch(`/api/v1/servers/${serverId}/change-loader`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loader: newLoader, mcVersion: newMcVersion }),
      }).then((r) => r.json());

      if (res.success && res.data) {
        showToast(`Server software switched to ${newLoader.toUpperCase()} (${newMcVersion})!`, 'success');
        setShowChangeLoaderModal(false);
        loadServerDetails(serverId);
        loadAllServers();
        window.dispatchEvent(new CustomEvent('warden_server_updated'));
      } else {
        showToast(`Loader switch failed: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Switch error: ${err.message}`, 'error');
    } finally {
      setChangingLoader(false);
    }
  };

  const handleDeleteServer = (id: string, name: string) => {
    promptConfirm({
      title: 'Delete Minecraft Server',
      description: `Are you sure you want to permanently delete "${name}"? All worlds, player data, plugins, mods, and configurations will be permanently destroyed. This action CANNOT be undone.`,
      confirmText: 'Delete Server',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/v1/servers/${id}`, { method: 'DELETE' }).then((r) => r.json());
          if (res.success) {
            showToast(`Server '${name}' deleted permanently.`, 'info');
            const remaining = allServers.filter((s) => s.id !== id);
            if (remaining.length > 0) {
              setServerId(remaining[0].id);
              localStorage.setItem('warden_selected_server_id', remaining[0].id);
              window.dispatchEvent(new CustomEvent('warden_server_changed', { detail: remaining[0].id }));
              window.dispatchEvent(new CustomEvent('warden_server_updated'));
              loadServerDetails(remaining[0].id);
            } else {
              setServerId('');
              setServer(null);
              localStorage.removeItem('warden_selected_server_id');
            }
            loadAllServers();
          } else {
            showToast(`Delete failed: ${res.error}`, 'error');
          }
        } catch (err: any) {
          showToast(`Delete error: ${err.message}`, 'error');
        }
      },
    });
  };

  // Dev Mode State (Custom Loader & MC Version Override for search/install)
  const [devMode, setDevMode] = useState<boolean>(false);
  const [devLoader, setDevLoader] = useState<ServerLoader>('fabric');
  const [devVersion, setDevVersion] = useState<string>('1.21.1');
  const [devFilterByVersion, setDevFilterByVersion] = useState<boolean>(false);

  // Version Picker Modal for Dev Mode mod install
  const [versionPickerMod, setVersionPickerMod] = useState<any | null>(null);
  const [availableVersions, setAvailableVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);

  // Mod Repository State
  const [installedMods, setInstalledMods] = useState<any[]>([]);
  const [modsLoading, setModsLoading] = useState<boolean>(false);
  const [modsError, setModsError] = useState<string | null>(null);
  const [modSearchQuery, setModSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [modVersionsMap, setModVersionsMap] = useState<Record<string, any[]>>({});
  const [selectedVersionMap, setSelectedVersionMap] = useState<Record<string, string>>({});
  const [searchingMods, setSearchingMods] = useState<boolean>(false);
  const [installingMod, setInstallingMod] = useState<string | null>(null);
  const [removingMod, setRemovingMod] = useState<string | null>(null);
  const [updateRunning, setUpdateRunning] = useState<boolean>(false);

  // .mrpack Modpack Import State
  const [showMrPackModal, setShowMrPackModal] = useState<boolean>(false);
  const [mrPackFile, setMrPackFile] = useState<File | null>(null);
  const [mrPackUrl, setMrPackUrl] = useState<string>('');
  const [mrPackPreview, setMrPackPreview] = useState<any | null>(null);
  const [loadingMrPackPreview, setLoadingMrPackPreview] = useState<boolean>(false);
  const [importingMrPack, setImportingMrPack] = useState<boolean>(false);
  const [mrPackResult, setMrPackResult] = useState<any | null>(null);
  const [mrPackError, setMrPackError] = useState<string | null>(null);
  const [mrPackIncludeMods, setMrPackIncludeMods] = useState<boolean>(true);
  const [mrPackIncludeDatapacks, setMrPackIncludeDatapacks] = useState<boolean>(true);
  const [mrPackIncludeResourcePacks, setMrPackIncludeResourcePacks] = useState<boolean>(false);
  const [mrPackIncludeShaderPacks, setMrPackIncludeShaderPacks] = useState<boolean>(false);
  const [mrPackIncludeOverrides, setMrPackIncludeOverrides] = useState<boolean>(true);
  const [mrPackExcludedPaths, setMrPackExcludedPaths] = useState<string[]>([]);
  const [mrPackSearchQuery, setMrPackSearchQuery] = useState<string>('');
  const [mrPackProgress, setMrPackProgress] = useState<any | null>(null);
  const [mrPackProgressLogs, setMrPackProgressLogs] = useState<any[]>([]);
  const [lastProgressTimestamp, setLastProgressTimestamp] = useState<number>(Date.now());
  const [hangTightText, setHangTightText] = useState<string>('');

  // Players Management State
  const [players, setPlayers] = useState<any[]>([]);
  const [bannedIps, setBannedIps] = useState<any[]>([]);
  const [playerStats, setPlayerStats] = useState<any | null>(null);
  const [loadingPlayers, setLoadingPlayers] = useState<boolean>(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');
  const [showAddPlayerModal, setShowAddPlayerModal] = useState<boolean>(false);
  const [newPlayerName, setNewPlayerName] = useState<string>('');
  const [newPlayerAction, setNewPlayerAction] = useState<string>('whitelist_add');
  const [newPlayerReason, setNewPlayerReason] = useState<string>('');
  const [playerActionLoading, setPlayerActionLoading] = useState<string | null>(null);
  const [expandedPreviousNames, setExpandedPreviousNames] = useState<Record<string, boolean>>({});

  // Custom Player Moderation Modal State (replaces native prompt/confirm)
  const [playerModalConfig, setPlayerModalConfig] = useState<{
    isOpen: boolean;
    playerName: string;
    action: 'kick' | 'ban' | 'ban_ip';
    title: string;
    description: string;
    needsReason: boolean;
    reason: string;
  }>({
    isOpen: false,
    playerName: '',
    action: 'kick',
    title: '',
    description: '',
    needsReason: true,
    reason: '',
  });

  const openPlayerConfirmModal = (playerName: string, action: 'kick' | 'ban' | 'ban_ip') => {
    let title = '';
    let description = '';
    let defaultReason = '';
    let needsReason = false;

    if (action === 'kick') {
      title = `Kick Player: ${playerName}`;
      description = `This will immediately disconnect ${playerName} from the Minecraft server. They may rejoin if not banned.`;
      defaultReason = 'Kicked by administrator';
      needsReason = true;
    } else if (action === 'ban') {
      title = `Ban Player: ${playerName}`;
      description = `This will disconnect and permanently ban ${playerName}'s Minecraft account from joining this server.`;
      defaultReason = 'Banned by operator';
      needsReason = true;
    } else if (action === 'ban_ip') {
      title = `IP Ban: ${playerName}`;
      description = `This will ban the IP address associated with ${playerName}, preventing all accounts from this IP from connecting.`;
      defaultReason = 'Banned IP by operator';
      needsReason = false;
    }

    setPlayerModalConfig({
      isOpen: true,
      playerName,
      action,
      title,
      description,
      needsReason,
      reason: defaultReason,
    });
  };

  const handleConfirmPlayerModal = async () => {
    const { playerName, action, reason } = playerModalConfig;
    setPlayerModalConfig((prev) => ({ ...prev, isOpen: false }));
    await handlePlayerAction(playerName, action, reason || undefined);
  };

  // Server Properties UI State
  const [serverProperties, setServerProperties] = useState<Record<string, string>>({});
  const [originalProperties, setOriginalProperties] = useState<Record<string, string>>({});
  const [loadingProperties, setLoadingProperties] = useState<boolean>(false);
  const [savingProperties, setSavingProperties] = useState<boolean>(false);
  const [propertiesSavedToast, setPropertiesSavedToast] = useState<boolean>(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState<boolean>(false);
  const [showRestartModal, setShowRestartModal] = useState<boolean>(false);
  const [restartingServer, setRestartingServer] = useState<boolean>(false);

  // Properties that strictly require a full server process restart to apply
  const changedPropertiesRequireRestart = React.useMemo(() => {
    if (Object.keys(originalProperties).length === 0) return false;
    const restartKeys = [
      'server-port',
      'online-mode',
      'gamemode',
      'hardcore',
      'view-distance',
      'spawn-protection',
      'allow-flight',
      'resource-pack',
      'level-name',
      'level-seed',
    ];
    for (const key of restartKeys) {
      if ((serverProperties[key] ?? '') !== (originalProperties[key] ?? '')) {
        return true;
      }
    }
    return false;
  }, [serverProperties, originalProperties]);

  const hasUnsavedProperties = React.useMemo(() => {
    if (Object.keys(originalProperties).length === 0) return false;
    const keys = Array.from(new Set([...Object.keys(serverProperties), ...Object.keys(originalProperties)]));
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if ((serverProperties[key] ?? '') !== (originalProperties[key] ?? '')) {
        return true;
      }
    }
    return false;
  }, [serverProperties, originalProperties]);

  // File Manager State
  const [pathStack, setPathStack] = useState<string[]>([]);
  const [files, setFiles] = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [loadingFileContent, setLoadingFileContent] = useState<boolean>(false);
  const [savingFile, setSavingFile] = useState<boolean>(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [fileSavedToast, setFileSavedToast] = useState<boolean>(false);

  // Console State
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [command, setCommand] = useState<string>('');
  const [sendingCmd, setSendingCmd] = useState<boolean>(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(0);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const logEndRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Dynamic Hang Tight status effect for modpack downloads/deployments
  useEffect(() => {
    if (!importingMrPack) {
      setHangTightText('');
      return;
    }
    const interval = setInterval(() => {
      const elapsed = (Date.now() - lastProgressTimestamp) / 1000;
      if (elapsed >= 14) {
        setHangTightText('Finalizing mod transfer / disk sync... hang tight!');
      } else if (elapsed >= 6) {
        setHangTightText('Still working on this mod, hang tight...');
      } else if (elapsed >= 3) {
        setHangTightText('Downloading asset / deploying to server...');
      } else {
        setHangTightText('');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [importingMrPack, lastProgressTimestamp]);

  // Load command history on client mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('warden_command_history');
      if (saved) {
        setCommandHistory(JSON.parse(saved).slice(0, 100));
      }
    } catch (e) {}
  }, []);

  // Settings State
  const [craftyUrl, setCraftyUrl] = useState<string>('');
  const [craftyApiKey, setCraftyApiKey] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('Europe/Vienna');
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(true);
  const [autoUpdateTime, setAutoUpdateTime] = useState<string>('04:00');
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false);

  // Custom Scheduled Tasks State
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState<boolean>(false);
  const [showTaskModal, setShowTaskModal] = useState<boolean>(false);
  const [taskName, setTaskName] = useState<string>('');
  const [taskAction, setTaskAction] = useState<ScheduledTask['action']>('restart_server');
  const [taskServerId, setTaskServerId] = useState<string>('all');
  const [taskTriggerType, setTaskTriggerType] = useState<'schedule' | 'on_mod_update'>('schedule');
  const [taskTargetMod, setTaskTargetMod] = useState<string>('');
  const [taskScheduleTime, setTaskScheduleTime] = useState<string>('05:00');
  const [taskCommand, setTaskCommand] = useState<string>('');
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  // Tabs scroll state
  const [tabsCanScrollLeft, setTabsCanScrollLeft] = useState<boolean>(false);
  const [tabsCanScrollRight, setTabsCanScrollRight] = useState<boolean>(true);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const checkTabsScroll = useCallback(() => {
    if (tabsContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tabsContainerRef.current;
      setTabsCanScrollLeft(scrollLeft > 6);
      setTabsCanScrollRight(scrollLeft < scrollWidth - clientWidth - 6);
    }
  }, []);

  useEffect(() => {
    checkTabsScroll();
    const handleResize = () => checkTabsScroll();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkTabsScroll]);

  const currentPath = pathStack.join('/');


  const loadServerDetails = useCallback((id: string) => {
    if (!id) {
      setLoading(false);
      return;
    }
    fetch(`/api/v1/servers/${id}`)
      .then((res) => res.json())
      .then((res) => {
        if (res.success && res.data) {
          setServer(res.data);
          if (res.data.stats?.uptimeSeconds) {
            setLiveUptime(res.data.stats.uptimeSeconds);
          }
          const det = res.data.detection;
          if (det) {
            const detectedLoader = det.loader !== 'unknown' ? det.loader : 'fabric';
            const detectedVer = det.mcVersion || '1.21.1';
            setManualLoader(detectedLoader);
            setManualVersion(detectedVer);
            setDevLoader(detectedLoader);
            setDevVersion(detectedVer);
          }
        }
      })
      .catch((err) => console.error('Error fetching server details:', err))
      .finally(() => setLoading(false));
  }, []);

  const loadAllServers = useCallback(() => {
    fetch('/api/v1/servers')
      .then((res) => res.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setAllServers(res.data);
          const savedId = localStorage.getItem('warden_selected_server_id');
          const target = (savedId && res.data.some((s: WardenServer) => s.id === savedId))
            ? savedId
            : res.data[0].id;
          setServerId(target);
          localStorage.setItem('warden_selected_server_id', target);
          loadServerDetails(target);
        } else {
          // If server list was not ready yet during reload/restart, retry automatically in 1.5s
          setTimeout(() => {
            fetch('/api/v1/servers')
              .then((r) => r.json())
              .then((d) => {
                if (d.success && Array.isArray(d.data) && d.data.length > 0) {
                  setAllServers(d.data);
                  const first = d.data[0].id;
                  setServerId(first);
                  localStorage.setItem('warden_selected_server_id', first);
                  loadServerDetails(first);
                } else {
                  setLoading(false);
                }
              })
              .catch(() => setLoading(false));
          }, 1500);
        }
      })
      .catch((err) => {
        console.error('Failed to load servers, retrying automatically in 1.5s:', err);
        setTimeout(() => {
          fetch('/api/v1/servers')
            .then((r) => r.json())
            .then((d) => {
              if (d.success && Array.isArray(d.data) && d.data.length > 0) {
                setAllServers(d.data);
                const first = d.data[0].id;
                setServerId(first);
                localStorage.setItem('warden_selected_server_id', first);
                loadServerDetails(first);
              } else {
                setLoading(false);
              }
            })
            .catch(() => setLoading(false));
        }, 1500);
      });
  }, [loadServerDetails]);

  useEffect(() => {
    loadAllServers();

    const handleServerChanged = (e: any) => {
      if (e.detail) {
        setServerId(e.detail);
        setServer(null);
        setInstalledMods([]);
        setFiles([]);
        setSelectedFile(null);
        setFileContent('');
        setPathStack([]);
        loadServerDetails(e.detail);
      }
    };

    window.addEventListener('warden_server_changed', handleServerChanged);
    return () => window.removeEventListener('warden_server_changed', handleServerChanged);
  }, [loadServerDetails, loadAllServers]);

  const fetchInstalledMods = useCallback(() => {
    if (!serverId) return;
    setModsLoading(true);
    setModsError(null);
    fetch(`/api/v1/servers/${serverId}/mods`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setInstalledMods(data.data);
        } else if (!data.success) {
          setModsError(data.error || 'Failed to load mods');
        }
      })
      .catch((err) => setModsError(err.message || 'Network error'))
      .finally(() => setModsLoading(false));
  }, [serverId]);

  const fetchFiles = useCallback((path: string) => {
    if (!serverId) return;
    setLoadingFiles(true);
    setFilesError(null);
    setSelectedFile(null);
    setFileContent('');
    fetch(`/api/v1/servers/${serverId}/files?path=${encodeURIComponent(path)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setFiles(data.data);
        } else if (!data.success) {
          setFilesError(data.error || 'Failed to load files');
          setFiles([]);
        }
      })
      .catch((err) => {
        setFilesError(err.message || 'Network error');
        setFiles([]);
      })
      .finally(() => setLoadingFiles(false));
  }, [serverId]);

  const [theme, setTheme] = useState<'emerald' | 'sculk'>('emerald');

  useEffect(() => {
    try {
      const saved = (localStorage.getItem('warden-theme') as 'emerald' | 'sculk') || 'emerald';
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } catch (e) {}
  }, []);

  const handleSelectTheme = (newTheme: 'emerald' | 'sculk') => {
    setTheme(newTheme);
    try {
      localStorage.setItem('warden-theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme);
    } catch (e) {}
  };

  const fetchLogs = useCallback((silent = false) => {
    if (!serverId) return;
    if (!silent) setLogsLoading(true);
    fetch(`/api/v1/servers/${serverId}/console`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) setLogs(data.data);
      })
      .finally(() => {
        if (!silent) setLogsLoading(false);
      });
  }, [serverId]);

  const fetchTasks = useCallback(() => {
    setLoadingTasks(true);
    fetch('/api/v1/tasks')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setTasks(data.data);
        }
      })
      .finally(() => setLoadingTasks(false));
  }, []);

  const fetchSettings = useCallback(() => {
    fetch('/api/v1/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setCraftyUrl(data.data.craftyUrl || '');
          setTimezone(data.data.timezone || 'Europe/Vienna');
          setAutoUpdateEnabled(data.data.autoUpdateEnabled !== false);
          setAutoUpdateTime(data.data.autoUpdateTime || '04:00');
          if (Array.isArray(data.data.customTasks)) {
            setTasks(data.data.customTasks);
          }
        }
      });
  }, []);

  const fetchPlayers = useCallback(() => {
    if (!serverId) return;
    setLoadingPlayers(true);
    fetch(`/api/v1/servers/${serverId}/players`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          setPlayers(data.data.players || []);
          setBannedIps(data.data.bannedIps || []);
          setPlayerStats(data.data.stats || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPlayers(false));
  }, [serverId]);

  const handlePlayerAction = async (name: string, action: string, reason?: string, ip?: string) => {
    if (!serverId) return;
    const actionKey = `${name || ip}_${action}`;
    setPlayerActionLoading(actionKey);

    try {
      const res = await fetch(`/api/v1/servers/${serverId}/players/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action, reason, ip }),
      }).then((r) => r.json());

      if (res.success) {
        fetchPlayers();
        showToast('Player action completed', 'success');
      } else {
        showToast(res.error || 'Action failed', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Action error', 'error');
    } finally {
      setPlayerActionLoading(null);
    }
  };

  const handleAddPlayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;
    await handlePlayerAction(newPlayerName.trim(), newPlayerAction, newPlayerReason);
    setShowAddPlayerModal(false);
    setNewPlayerName('');
    setNewPlayerReason('');
  };

  const fetchProperties = useCallback(() => {
    if (!serverId) return;
    setLoadingProperties(true);
    fetch(`/api/v1/servers/${serverId}/properties`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) {
          const props = data.data.properties || {};
          setServerProperties(props);
          setOriginalProperties(props);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProperties(false));
  }, [serverId]);

  const [pendingTab, setPendingTab] = useState<TabType | null>(null);

  const handleSaveProperties = async (e?: React.FormEvent, skipRestartPrompt = false): Promise<boolean> => {
    if (e) e.preventDefault();
    if (!serverId) return false;

    const needsRestart = changedPropertiesRequireRestart;
    setSavingProperties(true);

    try {
      const res = await fetch(`/api/v1/servers/${serverId}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: serverProperties }),
      }).then((r) => r.json());

      if (res.success) {
        setOriginalProperties(serverProperties);
        showToast('Server properties saved successfully!', 'success');

        if (needsRestart && !skipRestartPrompt) {
          setShowRestartModal(true);
        }
        return true;
      } else {
        showToast(res.error || 'Failed to save server properties', 'error');
        return false;
      }
    } catch (err: any) {
      showToast(err.message || 'Save error', 'error');
      return false;
    } finally {
      setSavingProperties(false);
    }
  };

  const handleRestartServerAction = async () => {
    if (!serverId) return;
    setRestartingServer(true);
    try {
      await fetch(`/api/v1/servers/${serverId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });
      setShowRestartModal(false);
      showToast('Server restart initiated', 'info');
    } catch (err: any) {
      showToast(err.message || 'Restart error', 'error');
    } finally {
      setRestartingServer(false);
    }
  };

  const handleDiscardProperties = () => {
    setServerProperties(originalProperties);
    setShowUnsavedModal(false);
    if (pendingTab) {
      setActiveTab(pendingTab);
      setPendingTab(null);
    }
  };

  const handleTabClick = (tabId: TabType) => {
    if (activeTab === 'properties' && tabId !== 'properties' && hasUnsavedProperties) {
      setPendingTab(tabId);
      setShowUnsavedModal(true);
      return;
    }
    setActiveTab(tabId);
  };

  const handlePropertyChange = (key: string, value: string) => {
    setServerProperties((prev) => ({ ...prev, [key]: value }));
  };

  // Warn user before closing or refreshing browser if there are unsaved properties
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedProperties) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedProperties]);

  useEffect(() => {
    if (!serverId) return;
    fetchPlayers(); // Always load players list so player names & avatars are available in Console & Modals
    if (activeTab === 'mods') fetchInstalledMods();
    if (activeTab === 'properties') fetchProperties();
    if (activeTab === 'files') fetchFiles(currentPath);
    if (activeTab === 'console') fetchLogs();
    if (activeTab === 'settings') {
      fetchSettings();
      fetchTasks();
    }
  }, [serverId, activeTab, currentPath, fetchInstalledMods, fetchPlayers, fetchProperties, fetchFiles, fetchLogs, fetchSettings, fetchTasks]);

  // Live ticking counter for server uptime
  useEffect(() => {
    if (server?.status !== 'online') return;
    const timer = setInterval(() => {
      setLiveUptime((prev) => (prev > 0 ? prev + 1 : prev));
    }, 1000);
    return () => clearInterval(timer);
  }, [server?.status]);

  // Sync live uptime whenever fresh server stats arrive
  useEffect(() => {
    if (server?.stats?.uptimeSeconds) {
      setLiveUptime(server.stats.uptimeSeconds);
    }
  }, [server?.stats?.uptimeSeconds]);

  // Periodic server stats polling every 5s to keep live stats in sync
  useEffect(() => {
    if (!serverId) return;
    const interval = setInterval(() => {
      fetch(`/api/v1/servers/${serverId}`)
        .then((res) => res.json())
        .then((res) => {
          if (res.success && res.data) {
            setServer((prev) => (prev ? { ...prev, ...res.data } : res.data));
            if (res.data.stats?.uptimeSeconds) {
              setLiveUptime(res.data.stats.uptimeSeconds);
            }
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [serverId]);

  // Live polling for players list & online statuses every 1 second (1000ms)
  useEffect(() => {
    if (!serverId) return;
    const interval = setInterval(() => {
      fetch(`/api/v1/servers/${serverId}/players`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setPlayers(data.data.players || []);
            setBannedIps(data.data.bannedIps || []);
            setPlayerStats(data.data.stats || null);
          }
        })
        .catch(() => {});
    }, 1000);
    return () => clearInterval(interval);
  }, [serverId]);

  // Live polling for server console logs every 2s when console tab is active
  useEffect(() => {
    if (!serverId || activeTab !== 'console') return;
    fetchLogs();
    const interval = setInterval(() => {
      fetchLogs(true);
    }, 2000);
    return () => clearInterval(interval);
  }, [serverId, activeTab, fetchLogs]);

  useEffect(() => {
    if (activeTab === 'console') {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);


  const fetchVersionsForMods = useCallback(
    async (mods: any[], overrideLoader?: string, overrideVersion?: string, filterVer?: boolean) => {
      const targetLoader = overrideLoader !== undefined ? overrideLoader : devMode ? devLoader : undefined;
      const targetVer = overrideVersion !== undefined ? overrideVersion : devMode ? devVersion : undefined;
      const shouldFilter = filterVer !== undefined ? filterVer : devFilterByVersion;

      const newMap: Record<string, any[]> = {};
      const newSel: Record<string, string> = {};

      await Promise.all(
        mods.map(async (mod) => {
          const params = new URLSearchParams({ projectId: mod.id });
          if (targetLoader && targetLoader !== 'unknown') params.append('loader', targetLoader);
          if (shouldFilter && targetVer) params.append('mcVersion', targetVer);

          try {
            const res = await fetch(`/api/v1/servers/${serverId}/mods/versions?${params.toString()}`).then((r) => r.json());
            if (res.success && Array.isArray(res.data) && res.data.length > 0) {
              newMap[mod.id] = res.data;
              newSel[mod.id] = res.data[0].id;
            }
          } catch {}
        })
      );

      setModVersionsMap((prev) => ({ ...prev, ...newMap }));
      setSelectedVersionMap((prev) => ({ ...prev, ...newSel }));
    },
    [serverId, devMode, devLoader, devVersion, devFilterByVersion]
  );

  const handleSearchMods = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!modSearchQuery.trim()) return;
    setSearchingMods(true);
    setSearchResults([]);

    const params = new URLSearchParams({ q: modSearchQuery });
    if (devMode) {
      if (devLoader && devLoader !== 'unknown') params.append('loader', devLoader);
      if (devFilterByVersion && devVersion) params.append('mcVersion', devVersion);
    }

    fetch(`/api/v1/servers/${serverId}/mods/search?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setSearchResults(data.data);
          fetchVersionsForMods(data.data);
        }
      })
      .finally(() => setSearchingMods(false));
  };

  const handleToggleDevMode = () => {
    if (!devMode && searchResults.length === 0 && !modSearchQuery.trim()) {
      setActionMessage({ text: 'Search for a mod first to enable and configure DEV Mode.', type: 'info' });
      setTimeout(() => setActionMessage(null), 3500);
      return;
    }
    const nextDev = !devMode;
    setDevMode(nextDev);
    if (searchResults.length > 0) {
      fetchVersionsForMods(searchResults, nextDev ? devLoader : undefined, nextDev ? devVersion : undefined, devFilterByVersion);
    }
  };

  const handleInstallModVersion = async (mod: any, versionId?: string) => {
    setInstallingMod(mod.id);
    try {
      let targetVersionId = versionId || selectedVersionMap[mod.id];
      if (!targetVersionId) {
        const verParams = new URLSearchParams({ projectId: mod.id });
        if (devMode) {
          if (devLoader) verParams.append('loader', devLoader);
          if (devFilterByVersion && devVersion) verParams.append('mcVersion', devVersion);
        }
        const verRes = await fetch(`/api/v1/servers/${serverId}/mods/versions?${verParams.toString()}`).then((r) => r.json());
        if (verRes.success && verRes.data && verRes.data.length > 0) {
          targetVersionId = verRes.data[0].id;
        }
      }

      if (!targetVersionId) {
        showToast('No compatible version found for this loader / MC version.', 'error');
        return;
      }

      const installRes = await fetch(`/api/v1/servers/${serverId}/mods/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: mod.id,
          versionId: targetVersionId,
          includeDependencies: true,
          loader: devMode ? devLoader : undefined,
          mcVersion: devMode ? devVersion : undefined,
        }),
      }).then((r) => r.json());

      if (installRes.success) {
        setSearchResults([]);
        setModSearchQuery('');
        setVersionPickerMod(null);
        fetchInstalledMods();
        // Trigger a secondary refresh after 1.5s to ensure Crafty file index sync is captured
        setTimeout(() => fetchInstalledMods(), 1500);
        showToast(`Installed ${mod.title || mod.slug} successfully!`, 'success');
      } else {
        showToast(`Install failed: ${installRes.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Install error: ${err.message}`, 'error');
    } finally {
      setInstallingMod(null);
    }
  };

  const handleRemoveMod = async (filename: string) => {
    promptConfirm({
      title: 'Remove Mod File',
      description: `Are you sure you want to remove "${filename}"? This action cannot be undone.`,
      confirmText: 'Remove Mod',
      variant: 'danger',
      onConfirm: async () => {
        setRemovingMod(filename);
        try {
          const res = await fetch(`/api/v1/servers/${serverId}/mods/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
          }).then((r) => r.json());
          if (res.success) {
            fetchInstalledMods();
            showToast(`Removed ${filename}`, 'info');
          } else {
            showToast(`Remove failed: ${res.error}`, 'error');
          }
        } catch (err: any) {
          showToast(`Remove error: ${err.message}`, 'error');
        } finally {
          setRemovingMod(null);
        }
      },
    });
  };

  const handleRunModUpdates = async () => {
    promptConfirm({
      title: 'Run Mod Updates Now',
      description: 'Run automated Modrinth updates for all installed mods? The server will be backed up, stopped, updated, and restarted safely.',
      confirmText: 'Update Now',
      variant: 'primary',
      onConfirm: async () => {
        setUpdateRunning(true);
        showToast('Running mod update job...', 'info');
        try {
          const res = await fetch(`/api/v1/servers/${serverId}/update-now`, { method: 'POST' }).then((r) => r.json());
          if (res.success) {
            showToast(`Update complete: ${res.data?.summary || 'Mods checked and updated.'}`, 'success');
            fetchInstalledMods();
            loadServerDetails(serverId);
          } else {
            showToast(`Update failed: ${res.error}`, 'error');
          }
        } catch (err: any) {
          showToast(`Update error: ${err.message}`, 'error');
        } finally {
          setUpdateRunning(false);
        }
      },
    });
  };

  const navigateInto = (dirName: string) => {
    const newStack = [...pathStack, dirName];
    setPathStack(newStack);
    fetchFiles(newStack.join('/'));
  };

  const navigateBack = () => {
    const newStack = pathStack.slice(0, -1);
    setPathStack(newStack);
    fetchFiles(newStack.join('/'));
  };

  const navigateToIndex = (idx: number) => {
    const newStack = pathStack.slice(0, idx + 1);
    setPathStack(newStack);
    fetchFiles(newStack.join('/'));
  };

  const handleOpenFile = (filename: string) => {
    const fullPath = currentPath ? `${currentPath}/${filename}` : filename;
    setSelectedFile(fullPath);
    setLoadingFileContent(true);
    setFileContent('');
    setOriginalContent('');
    setFileSavedToast(false);
    fetch(`/api/v1/servers/${serverId}/files/content?path=${encodeURIComponent(fullPath)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data !== undefined) {
          const content = typeof data.data === 'string' ? data.data : (data.data?.content || '');
          setFileContent(content);
          setOriginalContent(content);
        } else {
          showToast(`Could not open file: ${data.error || 'Unknown error'}`, 'error');
        }
      })
      .catch((err) => {
        showToast(`Error reading file: ${err.message}`, 'error');
      })
      .finally(() => {
        setLoadingFileContent(false);
      });
  };

  const handleSaveFile = () => {
    if (!selectedFile) return;
    setSavingFile(true);
    fetch(`/api/v1/servers/${serverId}/files/content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: selectedFile, content: fileContent }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setOriginalContent(fileContent);
          showToast('File saved successfully!', 'success');
        } else {
          showToast(`Save failed: ${data.error}`, 'error');
        }
      })
      .catch((err) => showToast(`Save error: ${err.message}`, 'error'))
      .finally(() => setSavingFile(false));
  };

  const handleDeleteFile = async (filename: string, isDir: boolean) => {
    const fullPath = currentPath ? `${currentPath}/${filename}` : filename;
    promptConfirm({
      title: isDir ? 'Delete Directory' : 'Delete File',
      description: `Are you sure you want to delete ${isDir ? 'directory' : 'file'} "${filename}"? This action cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        setDeletingFile(filename);
        try {
          const res = await fetch(`/api/v1/servers/${serverId}/files`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: fullPath }),
          }).then((r) => r.json());
          if (res.success) {
            fetchFiles(currentPath);
            if (selectedFile === fullPath) {
              setSelectedFile(null);
              setFileContent('');
            }
            showToast(`Deleted ${filename}`, 'info');
          } else {
            showToast(`Delete failed: ${res.error}`, 'error');
          }
        } catch (err: any) {
          showToast(`Delete error: ${err.message}`, 'error');
        } finally {
          setDeletingFile(null);
        }
      },
    });
  };

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    const cmd = command.trim();
    setCommand('');
    setShowSuggestions(false);
    setHistoryIndex(-1);

    // Save to command history (max 100 items, deduped consecutively)
    setCommandHistory((prev) => {
      const filtered = prev.filter((c) => c !== cmd);
      const nextHistory = [cmd, ...filtered].slice(0, 100);
      try {
        localStorage.setItem('warden_command_history', JSON.stringify(nextHistory));
      } catch (e) {}
      return nextHistory;
    });

    setSendingCmd(true);
    fetch(`/api/v1/servers/${serverId}/console`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd }),
    })
      .then(() => fetchLogs())
      .finally(() => setSendingCmd(false));
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    fetch('/api/v1/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        craftyUrl,
        craftyApiKey: craftyApiKey || undefined,
        timezone,
        autoUpdateEnabled,
        autoUpdateTime,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSettingsSaved(true);
          setCraftyApiKey('');
          showToast('Server settings saved successfully!', 'success');
          setTimeout(() => setSettingsSaved(false), 3000);
        } else {
          showToast(`Save failed: ${data.error}`, 'error');
        }
      })
      .catch((err: any) => showToast(`Save error: ${err.message}`, 'error'))
      .finally(() => setSavingSettings(false));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName.trim()) return;
    try {
      const res = await fetch('/api/v1/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: taskName,
          action: taskAction,
          serverId: taskServerId,
          triggerType: taskTriggerType,
          targetMod: taskTriggerType === 'on_mod_update' ? taskTargetMod : undefined,
          scheduleTime: taskTriggerType === 'schedule' ? taskScheduleTime : undefined,
          command: taskAction === 'console_command' ? taskCommand : undefined,
          enabled: true,
        }),
      }).then((r) => r.json());

      if (res.success) {
        setTasks(res.data);
        setShowTaskModal(false);
        setTaskName('');
        setTaskCommand('');
        setTaskTargetMod('');
        showToast('Scheduled task created successfully!', 'success');
      } else {
        showToast(`Error creating task: ${res.error}`, 'error');
      }
    } catch (err: any) {
      showToast(`Error creating task: ${err.message}`, 'error');
    }
  };


  const handleToggleTask = async (taskId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      }).then((r) => r.json());
      if (res.success) {
        setTasks(res.data);
        showToast(`Task ${!enabled ? 'enabled' : 'disabled'}`, 'info');
      }
    } catch (err) {}
  };

  const handleDeleteTask = async (taskId: string) => {
    promptConfirm({
      title: 'Delete Scheduled Task',
      description: 'Are you sure you want to delete this scheduled task? This action cannot be undone.',
      confirmText: 'Delete Task',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/v1/tasks/${taskId}`, { method: 'DELETE' }).then((r) => r.json());
          if (res.success) {
            setTasks(res.data);
            showToast('Scheduled task deleted', 'info');
          }
        } catch (err: any) {
          showToast(`Delete error: ${err.message}`, 'error');
        }
      },
    });
  };

  const handleRunTaskNow = async (taskId: string) => {
    setRunningTaskId(taskId);
    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/run`, { method: 'POST' }).then((r) => r.json());
      if (res.success) {
        fetchTasks();
        showToast('Scheduled task executed successfully!', 'success');
      } else {
        showToast('Task execution failed.', 'error');
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setRunningTaskId(null);
    }
  };

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!serverId) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/servers/${serverId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).then((r) => r.json());

      if (res.success) {
        // Immediately refresh server status and schedule quick follow-up checks so state transitions smoothly
        loadServerDetails(serverId);
        setTimeout(() => loadServerDetails(serverId), 1000);
        setTimeout(() => loadServerDetails(serverId), 2500);
        setTimeout(() => loadServerDetails(serverId), 5000);
      } else {
        setActionMessage({ text: `Failed: ${res.error}`, type: 'error' });
        setTimeout(() => setActionMessage(null), 4000);
      }
    } catch (err: any) {
      setActionMessage({ text: `Error: ${err.message}`, type: 'error' });
      setTimeout(() => setActionMessage(null), 4000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmLoader = async (loaderStr: ServerLoader, versionStr: string) => {
    if (!serverId) return;
    try {
      await fetch(`/api/v1/servers/${serverId}/confirm-loader`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loader: loaderStr, mcVersion: versionStr }),
      });
      loadServerDetails(serverId);
      window.dispatchEvent(new CustomEvent('warden_server_updated'));
    } catch (err: any) {
      console.error('Failed to confirm loader:', err);
    }
  };

  const handleSaveConfirmation = async () => {
    if (!serverId) return;
    try {
      await fetch(`/api/v1/servers/${serverId}/confirm-loader`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loader: manualLoader, mcVersion: manualVersion }),
      });
      setShowConfirmModal(false);
      loadServerDetails(serverId);
      window.dispatchEvent(new CustomEvent('warden_server_updated'));
    } catch (err) {
      console.error('Error confirming loader:', err);
    }
  };

  if (loading && !server) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <div className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-8 h-8 rounded-full mb-3" />
        <span className="text-xs font-mono">Loading server details...</span>
      </div>
    );
  }

  if (!server) {
    return (
      <div className="space-y-6">
        <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-6 sm:p-10 text-center max-w-lg mx-auto my-12">
          <div className="w-14 h-14 rounded-full bg-[var(--accent-dim)] text-[var(--color-accent)] border border-[var(--accent-border)] flex items-center justify-center mx-auto mb-4 font-minecraft text-xl font-bold">
            +
          </div>
          <h3 className="font-minecraft font-bold text-slate-100 text-lg mb-2">No Minecraft Server Found</h3>
          <p className="text-slate-400 text-xs mb-6 leading-relaxed font-mono">
            Warden runs standalone with 1-click downloads for Paper, Fabric, Purpur, Quilt, and Vanilla.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)} className="px-5">
              <WardenIcon name="plus" size={14} className="text-[#0d0e11]" />
              Create New Server
            </Button>
            <a href="/settings" className="inline-block">
              <Button variant="outline" size="sm">
                Settings
              </Button>
            </a>
          </div>
        </Card>
      </div>
    );
  }

  const isConfirmed = server.detection?.isConfirmed;
  const stats = server.stats || { cpuPercent: 0, memoryBytes: 0, maxMemoryBytes: 0, onlinePlayers: 0, maxPlayers: 20, uptimeSeconds: 0 };
  const currentLoaderName = (server.detection?.loader && server.detection.loader !== 'unknown' ? server.detection.loader : 'unknown').toUpperCase();
  const currentVersionNum = server.detection?.mcVersion || '?';
  const isOnline = server.status === 'online';

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatUptime = (secs: number) => {
    if (!isOnline || !secs || secs <= 0) return 'Offline';
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remainingSecs = Math.floor(secs % 60);

    if (days > 0) {
      return `${days}d ${hours}h ${mins}m`;
    }
    if (hours > 0) {
      return `${hours}h ${mins}m ${remainingSecs}s`;
    }
    if (mins > 0) {
      return `${mins}m ${remainingSecs}s`;
    }
    return `${remainingSecs}s`;
  };

  return (
    <div className="space-y-5">
      {/* Detection Confirmation Banner */}
      {!isConfirmed && (
        <div className="bg-[var(--accent-dim)] border border-[var(--accent-border)] rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start sm:items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] shrink-0 mt-1 sm:mt-0" />
            <div>
              <span className="font-bold text-slate-100 font-minecraft uppercase">
                Detected: {currentLoaderName} • MC {currentVersionNum}
              </span>
              <div className="text-slate-400 text-[11px] mt-0.5">
                Confirm your loader and version so Warden installs correct mod updates from Modrinth.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleConfirmLoader(server.detection?.loader || 'fabric', server.detection?.mcVersion || '1.21.1')}
            >
              <WardenIcon name="check" size={14} className="text-[#0d0e11]" />
              Confirm ({currentLoaderName} {currentVersionNum})
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowConfirmModal(true)}>
              <WardenIcon name="edit" size={14} className="text-slate-300" />
              Change
            </Button>
          </div>
        </div>
      )}

      {/* Action message toast */}
      {actionMessage && (
        <div className="bg-[var(--bg-surface)] border border-[var(--color-border)] rounded-lg px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-mono text-slate-200 shadow-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${actionMessage.type === 'error' ? 'bg-red-500' : 'bg-[var(--color-accent)]'}`} />
            <span className="truncate">{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-200 shrink-0">
            <WardenIcon name="x" size={14} className="text-slate-400" />
          </button>
        </div>
      )}

      {/* Server Header: Name + Status LEFT, Controls RIGHT */}
      <div className="bg-[var(--bg-surface)] border border-[var(--color-border)] rounded-lg p-3.5 sm:p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 shadow-sm transition-colors">
        {/* LEFT: Server identity & status */}
        <div className="flex items-center flex-wrap gap-2.5 sm:gap-3">
          <h1 className="font-minecraft text-sm sm:text-base font-bold text-slate-100 tracking-wider uppercase truncate max-w-full">
            {server.name}
          </h1>
          <Badge status={server.status} />
          <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
            <span className="bg-[var(--bg-card)] text-slate-400 px-2 py-0.5 rounded border border-[var(--color-border)] font-mono text-[10px]">
              ID:{server.craftyServerId.substring(0, 8)}
            </span>
            {server.detection?.loader !== 'unknown' && (
              <span className="bg-[var(--accent-dim)] text-[var(--color-accent)] px-2 py-0.5 rounded border border-[var(--accent-border)] font-minecraft text-[10px] font-bold uppercase">
                {currentLoaderName}
              </span>
            )}
            {currentVersionNum !== '?' && (
              <span className="bg-[var(--accent-dim)] text-[var(--color-accent)] px-2 py-0.5 rounded border border-[var(--accent-border)] font-minecraft text-[10px] font-bold">
                {currentVersionNum}
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setNewLoader((server.detection?.loader as ServerLoader) || 'paper');
                setNewMcVersion(server.detection?.mcVersion || '1.21.1');
                setShowChangeLoaderModal(true);
              }}
              className="text-[10px] text-[var(--color-accent)] hover:underline font-mono ml-1 flex items-center gap-1 bg-[var(--accent-dim)]/50 px-1.5 py-0.5 rounded border border-[var(--accent-border)]/50 hover:bg-[var(--accent-dim)]"
              title="Change server modloader or Minecraft version"
            >
              <WardenIcon name="edit" size={10} className="text-[var(--color-accent)]" />
              Change Loader
            </button>
          </div>
        </div>

        {/* RIGHT: Server action controls + mod update + delete */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2 flex-1 sm:flex-initial">
            {isOnline ? (
              <>
                <Button variant="outline" size="sm" onClick={() => handleAction('restart')} isLoading={actionLoading} className="flex-1 sm:flex-initial">
                  <WardenIcon name="rotate-clockwise" size={14} className="text-slate-300" />
                  Restart
                </Button>
                <Button variant="danger" size="sm" onClick={() => handleAction('stop')} isLoading={actionLoading} className="flex-1 sm:flex-initial">
                  <WardenIcon name="power" size={14} className="text-white" />
                  Stop
                </Button>
              </>
            ) : (
              <Button variant="primary" size="sm" onClick={() => handleAction('start')} isLoading={actionLoading} className="flex-1 sm:flex-initial">
                <WardenIcon name="play" size={14} className="text-[#0d0e11]" />
                Start Server
              </Button>
            )}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRunModUpdates}
            isLoading={updateRunning}
            title="Check and install updates for all installed mods"
            className="flex-1 sm:flex-initial"
          >
            <WardenIcon name="refresh-cw" size={14} className="text-[var(--color-accent)]" />
            <span className="hidden sm:inline">Run Mod Updates</span>
            <span className="sm:hidden">Updates</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCreateModal(true)}
            title="Create a new Minecraft server"
            className="flex-1 sm:flex-initial"
          >
            <WardenIcon name="plus" size={14} className="text-slate-300" />
            <span className="hidden sm:inline">New Server</span>
            <span className="sm:hidden">+ New</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDeleteServer(server.id, server.name)}
            title="Delete this Minecraft server permanently"
            className="text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-transparent hover:border-red-800/40 p-1.5"
          >
            <WardenIcon name="trash" size={14} className="text-red-400" />
          </Button>
        </div>
      </div>

      {/* Stats Grid - 2 cols on portrait mobile, 4 cols on horizontal/landscape mobile and desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-2.5 sm:p-3 lg:p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1 sm:mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">CPU Usage</span>
            <WardenIcon name="cpu" size={14} className="text-slate-400 shrink-0" />
          </div>
          <div className="h-7 sm:h-8 flex items-center text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-slate-100 font-mono">
            {stats.cpuPercent.toFixed(1)}%
          </div>
          <div className="h-4 flex items-center w-full mt-0.5 sm:mt-1">
            <div className="w-full bg-[var(--bg-card)] rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  stats.cpuPercent > 80 ? 'bg-red-500' : stats.cpuPercent > 50 ? 'bg-amber-400' : 'bg-[var(--color-accent)]'
                }`}
                style={{ width: `${Math.min(stats.cpuPercent, 100)}%` }}
              />
            </div>
          </div>
        </Card>

        <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-2.5 sm:p-3 lg:p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1 sm:mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Memory RAM</span>
            <WardenIcon name="server" size={14} className="text-slate-400 shrink-0" />
          </div>
          <div className="h-7 sm:h-8 flex items-center text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-slate-100 font-mono whitespace-nowrap">
            {formatBytes(stats.memoryBytes)}
          </div>
          <div className="h-4 flex items-center text-[9px] sm:text-[10px] text-slate-500 font-mono mt-0.5 sm:mt-1 truncate">
            Allocated Active
          </div>
        </Card>

        <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-2.5 sm:p-3 lg:p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1 sm:mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Players</span>
            <WardenIcon name="users" size={14} className="text-slate-400 shrink-0" />
          </div>
          <div className="h-7 sm:h-8 flex items-center text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-slate-100 font-mono">
            {stats.onlinePlayers}
            <span className="text-xs sm:text-sm text-slate-500 font-normal">/{stats.maxPlayers}</span>
          </div>
          <div className="h-4 flex items-center text-[9px] sm:text-[10px] text-[var(--color-accent)] font-mono mt-0.5 sm:mt-1 truncate">
            {stats.onlinePlayers > 0 ? `${stats.onlinePlayers} active` : '0 online'}
          </div>
        </Card>

        <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-2.5 sm:p-3 lg:p-4">
          <div className="flex items-center justify-between text-slate-400 mb-1 sm:mb-1.5">
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider">Uptime</span>
            <WardenIcon name="clock" size={14} className="text-slate-400 shrink-0" />
          </div>
          <div className="h-7 sm:h-8 flex items-center text-sm sm:text-base md:text-lg lg:text-2xl font-bold text-slate-100 font-mono whitespace-nowrap">
            {isOnline ? formatUptime(liveUptime || stats.uptimeSeconds) : 'Offline'}
          </div>
          <div className="h-4 flex items-center text-[9px] sm:text-[10px] text-[var(--color-accent)] font-mono mt-0.5 sm:mt-1 uppercase truncate">
            {server.status || (isOnline ? 'online' : 'offline')}
          </div>
        </Card>
      </div>

      {/* Tab Navigation with Dynamic Left & Right Scroll Hint Indicators */}
      <div className="relative">
        {/* Left Scroll Indicator Gradient & Arrow on Small Screens */}
        {tabsCanScrollLeft && (
          <div
            onClick={() => {
              if (tabsContainerRef.current) {
                tabsContainerRef.current.scrollBy({ left: -140, behavior: 'smooth' });
              }
            }}
            className="sm:hidden cursor-pointer absolute left-0 top-0 bottom-1 w-8 bg-gradient-to-r from-[var(--bg-main)] via-[var(--bg-main)]/90 to-transparent flex items-center justify-start pl-0.5 z-10 text-slate-400 select-none"
          >
            <span className="text-[13px] font-bold text-slate-300 animate-pulse">&lsaquo;</span>
          </div>
        )}

        <div
          ref={tabsContainerRef}
          onScroll={checkTabsScroll}
          className={`flex items-center gap-1.5 pb-1 overflow-x-auto max-w-full no-scrollbar scroll-smooth transition-all ${
            tabsCanScrollLeft ? 'pl-6' : ''
          } ${tabsCanScrollRight ? 'pr-7 sm:pr-0' : ''}`}
        >
          {[
            {
              id: 'mods',
              label: manualLoader === 'paper' || manualLoader === 'spigot' || manualLoader === 'bukkit' || manualLoader === 'purpur' ? 'Plugins' : 'Mods',
              icon: 'box',
              badge: installedMods.length > 0 ? installedMods.length : undefined,
            },
            { id: 'players', label: 'Players', icon: 'users', badge: players.length > 0 ? players.length : undefined },
            { id: 'properties', label: 'Properties', icon: 'edit' },
            { id: 'files', label: 'Files', icon: 'folder' },
            { id: 'console', label: 'Console', icon: 'code' },
            { id: 'settings', label: 'Settings', icon: 'settings' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id as TabType)}
                className={`px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-md font-minecraft text-[11px] sm:text-xs flex items-center gap-1.5 sm:gap-2 transition-all shrink-0 whitespace-nowrap ${
                  isActive
                    ? 'bg-[var(--color-accent)] text-[#0d0e11] font-bold shadow-sm'
                    : 'bg-[var(--bg-surface)] text-slate-300 hover:text-slate-100 hover:bg-[var(--bg-card)] border border-[var(--color-border)]'
                }`}
              >
                <WardenIcon name={tab.icon as any} size={14} className={isActive ? 'text-[#0d0e11]' : 'text-slate-400'} />
                <span>{tab.label}</span>
                {tab.badge !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${isActive ? 'bg-[#0d0e11]/20 text-[#0d0e11]' : 'bg-[var(--bg-card)] text-slate-400'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Right Scroll Indicator Gradient & Arrow on Small Screens */}
        {tabsCanScrollRight && (
          <div
            onClick={() => {
              if (tabsContainerRef.current) {
                tabsContainerRef.current.scrollBy({ left: 140, behavior: 'smooth' });
              }
            }}
            className="sm:hidden cursor-pointer absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-[var(--bg-main)] via-[var(--bg-main)]/90 to-transparent flex items-center justify-end pr-0.5 z-10 text-slate-400 select-none"
          >
            <span className="text-[13px] font-bold text-slate-300 animate-pulse">&rsaquo;</span>
          </div>
        )}
      </div>

      {/* ── TAB 1: MODS / PLUGINS ── */}
      {activeTab === 'mods' && (
        <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-3.5 sm:p-5 space-y-4">
          {/* Header + Search Bar + Dev Mode Toggle */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 pb-1">
            <div>
              <h2 className="font-minecraft text-sm font-bold text-slate-100 tracking-wider flex items-center gap-2">
                <WardenIcon name="box" size={16} className="text-[var(--color-accent)]" />
                {manualLoader === 'paper' || manualLoader === 'spigot' || manualLoader === 'bukkit' || manualLoader === 'purpur' ? 'INSTALLED PLUGINS' : 'INSTALLED MODS'}
                {installedMods.length > 0 && (
                  <span className="text-xs font-mono text-slate-400">({installedMods.length})</span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Scans server <code className="font-mono text-slate-300">{manualLoader === 'paper' || manualLoader === 'spigot' || manualLoader === 'bukkit' || manualLoader === 'purpur' ? 'plugins/' : 'mods/'}</code> directory and matches against Modrinth.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
              <form onSubmit={handleSearchMods} className="flex items-center gap-1.5 flex-1 min-w-0">
                <input
                  type="text"
                  value={modSearchQuery}
                  onChange={(e) => setModSearchQuery(e.target.value)}
                  placeholder="Search Modrinth..."
                  className="h-8 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 flex-1 sm:w-44 font-mono"
                />
                <Button type="submit" variant="primary" size="sm" isLoading={searchingMods} className="shrink-0">
                  <WardenIcon name="search" size={14} className="text-[#0d0e11]" />
                  <span>Search</span>
                </Button>
              </form>

              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="outline" size="sm" onClick={fetchInstalledMods} isLoading={modsLoading} title="Refresh installed mods" className="shrink-0">
                  <WardenIcon name="refresh-cw" size={14} className="text-slate-300" />
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setMrPackFile(null);
                    setMrPackUrl('');
                    setMrPackPreview(null);
                    setMrPackResult(null);
                    setMrPackError(null);
                    setShowMrPackModal(true);
                  }}
                  className="shrink-0"
                  title="Import Modrinth Modpack (.mrpack)"
                >
                  <WardenIcon name="download" size={14} className="text-[var(--color-accent)]" />
                  <span>Import .mrpack</span>
                </Button>

                {/* Dev Mode Bean Switch (Only shown when searching) */}
                {(modSearchQuery.trim() !== '' || searchResults.length > 0 || searchingMods) && (
                  <div className="inline-flex items-center gap-1.5 select-none px-1 h-8 shrink-0 ml-auto sm:ml-0">
                    <span className="text-[11px] font-minecraft font-bold text-slate-300 tracking-wider flex items-center leading-none">
                      DEV
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={devMode}
                      onClick={() => setDevMode(!devMode)}
                      className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer focus:outline-none shrink-0 ${
                        devMode ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
                      }`}
                      title={`Dev Mode: ${devMode ? 'ON' : 'OFF'}`}
                    >
                      <span
                        className={`w-3.5 h-3.5 rounded-full absolute top-[3px] transition-all ${
                          devMode
                            ? 'left-[19px] bg-white shadow-sm'
                            : 'left-[3px] bg-red-500 shadow-[0_0_6px_#ef4444]'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dev Mode Control Bar */}
          {devMode && (
            <div className="bg-[var(--bg-card)] border border-[var(--color-border)] rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
              <div className="flex items-center gap-2">
                <span className="font-minecraft text-xs font-bold text-[var(--color-accent)] tracking-wider uppercase">
                  DEV Mode
                </span>
              </div>

              <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 min-w-[130px]">
                  <span className="text-[10px] font-minecraft uppercase text-slate-400">Loader:</span>
                  <Dropdown
                    options={[
                      { id: 'fabric', label: 'Fabric' },
                      { id: 'forge', label: 'Forge' },
                      { id: 'neoforge', label: 'NeoForge' },
                      { id: 'quilt', label: 'Quilt' },
                      { id: 'paper', label: 'Paper' },
                      { id: 'spigot', label: 'Spigot' },
                      { id: 'bukkit', label: 'Bukkit' },
                      { id: 'purpur', label: 'Purpur' },
                      { id: 'vanilla', label: 'Vanilla' },
                    ]}
                    selectedId={devLoader}
                    onSelect={(opt) => {
                      const l = opt.id as ServerLoader;
                      setDevLoader(l);
                      if (searchResults.length > 0) fetchVersionsForMods(searchResults, l, devVersion, devFilterByVersion);
                    }}
                    title="Select Loader"
                    size="sm"
                    className="w-28"
                  />
                </div>

                <div className="flex items-center gap-1.5 min-w-[140px]">
                  <span className="text-[10px] font-minecraft uppercase text-slate-400">MC Ver:</span>
                  <Dropdown
                    options={[
                      { id: '26.2', label: '26.2 (Snap)' },
                      { id: '1.21.4', label: '1.21.4' },
                      { id: '1.21.3', label: '1.21.3' },
                      { id: '1.21.2', label: '1.21.2' },
                      { id: '1.21.1', label: '1.21.1' },
                      { id: '1.21', label: '1.21' },
                      { id: '1.20.6', label: '1.20.6' },
                      { id: '1.20.5', label: '1.20.5' },
                      { id: '1.20.4', label: '1.20.4' },
                      { id: '1.20.3', label: '1.20.3' },
                      { id: '1.20.2', label: '1.20.2' },
                      { id: '1.20.1', label: '1.20.1' },
                      { id: '1.20', label: '1.20' },
                      { id: '1.19.4', label: '1.19.4' },
                      { id: '1.19.3', label: '1.19.3' },
                      { id: '1.19.2', label: '1.19.2' },
                      { id: '1.19.1', label: '1.19.1' },
                      { id: '1.19', label: '1.19' },
                      { id: '1.18.2', label: '1.18.2' },
                      { id: '1.18.1', label: '1.18.1' },
                      { id: '1.18', label: '1.18' },
                      { id: '1.17.1', label: '1.17.1' },
                      { id: '1.17', label: '1.17' },
                      { id: '1.16.5', label: '1.16.5' },
                      { id: '1.16.4', label: '1.16.4' },
                      { id: '1.16.3', label: '1.16.3' },
                      { id: '1.16.2', label: '1.16.2' },
                      { id: '1.16.1', label: '1.16.1' },
                      { id: '1.16', label: '1.16' },
                      { id: '1.15.2', label: '1.15.2' },
                      { id: '1.14.4', label: '1.14.4' },
                      { id: '1.13.2', label: '1.13.2' },
                      { id: '1.12.2', label: '1.12.2' },
                      { id: '1.11.2', label: '1.11.2' },
                      { id: '1.10.2', label: '1.10.2' },
                      { id: '1.9.4', label: '1.9.4' },
                      { id: '1.8.9', label: '1.8.9' },
                      { id: '1.7.10', label: '1.7.10' },
                    ]}
                    selectedId={devVersion}
                    onSelect={(opt) => {
                      const v = opt.id;
                      setDevVersion(v);
                      if (searchResults.length > 0) fetchVersionsForMods(searchResults, devLoader, v, devFilterByVersion);
                    }}
                    title="Select Minecraft Version"
                    size="sm"
                    className="w-32"
                  />
                </div>

                {/* Custom Rounded Toggle for Strict Version Filter */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !devFilterByVersion;
                    setDevFilterByVersion(next);
                    if (searchResults.length > 0) fetchVersionsForMods(searchResults, devLoader, devVersion, next);
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none bg-[var(--bg-main)] border border-[var(--color-border)] px-2.5 py-1 rounded-full hover:border-slate-500 transition-colors"
                >
                  <span
                    className={`w-6 h-3.5 rounded-full transition-colors relative inline-block shrink-0 ${
                      devFilterByVersion ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
                    }`}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full absolute top-[2px] transition-all ${
                        devFilterByVersion ? 'left-[12px] bg-[#0d0e11]' : 'left-[2px] bg-slate-400'
                      }`}
                    />
                  </span>
                  <span className="text-[11px] font-mono">Strict Filter</span>
                </button>
              </div>
            </div>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="bg-[var(--bg-main)] p-3 sm:p-4 rounded-lg border border-[var(--color-border)] space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-minecraft text-xs font-bold uppercase text-[var(--color-accent)] tracking-wider">
                  Modrinth Search Results ({searchResults.length})
                </h3>
                <button
                  onClick={() => setSearchResults([])}
                  className="text-slate-400 hover:text-slate-200 transition-colors p-1"
                >
                  <WardenIcon name="x" size={14} className="text-slate-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {searchResults.map((mod) => {
                  const versions = modVersionsMap[mod.id] || [];
                  const selectedVerId = selectedVersionMap[mod.id] || (versions[0]?.id ?? '');

                  return (
                    <div key={mod.id} className="bg-[var(--bg-surface)] p-3 rounded-lg border border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {mod.iconUrl ? (
                          <img src={mod.iconUrl} alt="" className="w-9 h-9 rounded bg-[var(--bg-main)] shrink-0 object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-[var(--bg-main)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                            <WardenIcon name="box" size={16} className="text-slate-500" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-100 text-xs truncate">{mod.title}</div>
                          <div className="text-[11px] text-slate-400 truncate">{mod.description}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {mod.downloads ? `${mod.downloads.toLocaleString()} DL` : 'Modrinth'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 pt-2 sm:pt-0">
                        {/* Version Selector Dropdown */}
                        {versions.length > 0 && (
                          <Dropdown
                            size="sm"
                            options={versions.map((ver) => ({
                              id: ver.id,
                              label: ver.versionNumber || ver.name,
                            }))}
                            selectedId={selectedVerId}
                            onSelect={(opt) =>
                              setSelectedVersionMap((prev) => ({ ...prev, [mod.id]: opt.id }))
                            }
                            className="max-w-[140px] truncate"
                          />
                        )}

                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleInstallModVersion(mod, selectedVerId)}
                          isLoading={installingMod === mod.id}
                        >
                          <WardenIcon name="download" size={13} className="text-[#0d0e11]" />
                          Install
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}


          {/* Installed Mods List */}
          {modsError ? (
            <div className="py-8 text-center space-y-2">
              <div className="text-slate-200 text-sm font-semibold">Failed to load mods</div>
              <div className="text-xs text-slate-400 font-mono">{modsError}</div>
              <Button variant="outline" size="sm" onClick={fetchInstalledMods}>Retry</Button>
            </div>
          ) : modsLoading ? (
            <div className="py-12 text-center">
              <div className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-6 h-6 rounded-full mb-2" />
              <div className="text-xs text-slate-400 font-mono">Scanning mods directory...</div>
            </div>
          ) : installedMods.length === 0 ? (
            <div className="py-12 text-center">
              <WardenIcon name="box" size={32} className="text-slate-600 mx-auto mb-3 block" />
              <div className="text-sm font-semibold text-slate-300">No .jar files found in mods/ directory.</div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                Install mods using the search bar above.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {installedMods.map((mod) => {
                const iconSrc = mod.iconUrl
                  ? mod.iconUrl
                  : mod.hasJarIcon
                  ? `/api/v1/servers/${serverId}/mods/${encodeURIComponent(mod.filename)}/icon`
                  : null;

                return (
                  <div key={mod.filename} className="py-3 flex items-center gap-3 group">
                    {iconSrc ? (
                      <img
                        src={iconSrc}
                        alt=""
                        className="w-8 h-8 rounded bg-[#0d0e11] shrink-0 object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-[#0d0e11] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                        <WardenIcon name="box" size={14} className="text-slate-500" />
                      </div>
                    )}


                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-100 text-xs flex items-center gap-2 flex-wrap">
                        <span className="truncate">{mod.title || mod.filename}</span>
                        {mod.isCustomMod ? (
                          <span className="bg-[var(--bg-card)] text-slate-400 border border-[var(--color-border)] px-1.5 py-px rounded text-[9px] uppercase font-mono shrink-0">
                            Local
                          </span>
                        ) : (
                          <span className="bg-[var(--accent-dim)] text-[var(--color-accent)] border border-[var(--accent-border)] px-1.5 py-px rounded text-[9px] uppercase font-mono shrink-0">
                            Modrinth
                          </span>
                        )}
                        {mod.hasUpdate && (
                          <span className="bg-amber-950/40 text-amber-400 border border-amber-800/40 px-1.5 py-px rounded text-[9px] uppercase font-mono shrink-0">
                            Update Available
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                        <span className="truncate">{mod.filename}</span>
                        {mod.size > 0 && <span className="shrink-0">• {formatBytes(mod.size)}</span>}
                        {mod.downloads ? (
                          <span className="text-slate-400 shrink-0">• {mod.downloads.toLocaleString()} DL</span>
                        ) : null}
                      </div>
                    </div>

                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveMod(mod.filename)}
                      isLoading={removingMod === mod.filename}
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      title="Uninstall mod"
                    >
                      <WardenIcon name="trash" size={13} className="text-white" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── TAB: PLAYERS (Aternos Style with 3D/2D Heads & Moderation) ── */}
      {activeTab === 'players' && (
        <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-4 sm:p-6 space-y-6">
          {/* Header + Search + Add Player Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
            <div>
              <h2 className="font-minecraft text-sm font-bold text-slate-100 tracking-wider flex items-center gap-2 uppercase">
                <WardenIcon name="users" size={16} className="text-[var(--color-accent)]" />
                Player Management
                {players.length > 0 && (
                  <span className="text-xs font-mono text-slate-400">({players.length} known)</span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Manage whitelist, operators (OP), kicks, and player / IP bans with instant avatar heads.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <input
                type="text"
                value={playerSearchQuery}
                onChange={(e) => setPlayerSearchQuery(e.target.value)}
                placeholder="Search player name..."
                className="h-8 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 w-full sm:w-56 font-mono"
              />

              <Button variant="outline" size="sm" onClick={fetchPlayers} isLoading={loadingPlayers} title="Refresh players">
                <WardenIcon name="refresh-cw" size={14} className="text-slate-300" />
              </Button>

              <Button variant="primary" size="sm" onClick={() => setShowAddPlayerModal(true)}>
                <WardenIcon name="plus" size={14} className="text-[#0d0e11]" />
                Add Player
              </Button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          {playerStats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 pt-1 pb-1 text-xs font-minecraft">
              <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-3.5 rounded-xl flex items-center justify-between shadow-sm">
                <span className="text-slate-400">Whitelisted:</span>
                <span className="text-[var(--color-accent)] font-bold text-sm">{playerStats.whitelistedCount}</span>
              </div>
              <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-3.5 rounded-xl flex items-center justify-between shadow-sm">
                <span className="text-slate-400">Operators (OP):</span>
                <span className="text-amber-400 font-bold text-sm">{playerStats.opsCount}</span>
              </div>
              <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-3.5 rounded-xl flex items-center justify-between shadow-sm">
                <span className="text-slate-400">Banned Players:</span>
                <span className="text-red-400 font-bold text-sm">{playerStats.bannedCount}</span>
              </div>
              <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-3.5 rounded-xl flex items-center justify-between shadow-sm">
                <span className="text-slate-400">IP Bans:</span>
                <span className="text-purple-400 font-bold text-sm">{bannedIps.length}</span>
              </div>
            </div>
          )}

          {/* Players Long Rows List */}
          {loadingPlayers ? (
            <div className="py-12 text-center">
              <div className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-6 h-6 rounded-full mb-2" />
              <div className="text-xs text-slate-400 font-mono">Loading players data...</div>
            </div>
          ) : players.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <WardenIcon name="users" size={32} className="text-slate-600 mx-auto mb-2 block" />
              <div className="font-semibold text-slate-200">No players recorded yet</div>
              <div className="text-xs text-slate-500 font-mono">
                Players who join will appear here. Click &quot;Add Player&quot; above to pre-add a username.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {players
                .filter((p) => !playerSearchQuery || p.name.toLowerCase().includes(playerSearchQuery.toLowerCase()))
                .map((player) => {
                  const avatarUrl = `https://mc-heads.net/avatar/${encodeURIComponent(player.name)}/36`;
                  const isActing = playerActionLoading?.startsWith(player.name);

                  return (
                    <div key={player.name} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      {/* Left: 3D/2D Avatar Head + Name + Status Badges */}
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={avatarUrl}
                          alt={player.name}
                          className="w-9 h-9 rounded-md bg-[var(--bg-main)] border border-[var(--color-border)] shrink-0 object-cover shadow-sm"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://minotar.net/avatar/${encodeURIComponent(player.name)}/36`;
                          }}
                        />

                        <div className="min-w-0">
                          <div className="font-bold text-slate-100 text-xs flex items-center gap-2 flex-wrap">
                            <span className="truncate">{player.name}</span>
                            {player.isOnline ? (
                              <span className="bg-emerald-950/60 text-[var(--color-accent)] border border-emerald-500 px-2 py-0.5 rounded-full text-[9px] uppercase font-mono font-bold shadow-sm">
                                Online
                              </span>
                            ) : (
                              <span className="bg-slate-800/60 text-slate-400 border border-slate-700/60 px-1.5 py-px rounded text-[9px] uppercase font-mono">
                                Offline
                              </span>
                            )}
                            {player.isOp && (
                              <span className="bg-amber-950/40 text-amber-400 border border-amber-800/40 px-1.5 py-px rounded text-[9px] uppercase font-mono font-bold">
                                OP (Level {player.opLevel || 4})
                              </span>
                            )}
                            {player.isWhitelisted && (
                              <span className="bg-[var(--accent-dim)] text-[var(--color-accent)] border border-[var(--accent-border)] px-1.5 py-px rounded text-[9px] uppercase font-mono">
                                Whitelisted
                              </span>
                            )}
                            {player.isBanned && (
                              <span className="bg-red-950/40 text-red-400 border border-red-800/40 px-1.5 py-px rounded text-[9px] uppercase font-mono">
                                Banned
                              </span>
                            )}
                            {player.previousNames && player.previousNames.length > 0 && (
                              <div className="relative inline-block">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedPreviousNames((prev) => ({ ...prev, [player.name]: !prev[player.name] }))
                                  }
                                  className="inline-flex items-center gap-1 text-[9px] text-amber-400 hover:text-amber-300 font-minecraft bg-amber-950/40 border border-amber-800/40 px-1.5 py-px rounded cursor-pointer transition-colors"
                                  title="View previously recorded usernames for this account"
                                >
                                  <span>formerly ({player.previousNames.length})</span>
                                  <WardenIcon
                                    name="chevron-down"
                                    size={10}
                                    className={`transition-transform ${expandedPreviousNames[player.name] ? 'rotate-180' : ''}`}
                                  />
                                </button>

                                {expandedPreviousNames[player.name] && (
                                  <div className="absolute left-0 top-full mt-1.5 bg-[var(--bg-surface)] border border-[var(--color-border)] rounded-xl p-2.5 shadow-[0_10px_38px_rgba(0,0,0,0.8)] z-[9999] min-w-[150px] space-y-1 text-slate-300 text-xs font-mono">
                                    <div className="text-[10px] uppercase font-bold text-slate-400 border-b border-[var(--color-border)] pb-1 mb-1.5">
                                      Previous Names:
                                    </div>
                                    {player.previousNames.map((oldName: string) => (
                                      <div key={oldName} className="text-slate-200 flex items-center gap-1.5 py-0.5">
                                        <span className="text-amber-400 font-bold">↳</span> {oldName}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-2 flex-wrap truncate">
                            {player.uuid && <span className="truncate">UUID: {player.uuid.substring(0, 14)}...</span>}
                            {player.banReason && <span className="text-red-400 truncate">• {player.banReason}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Right: Quick Moderation Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap self-end md:self-auto">
                        {/* Whitelist Toggle */}
                        <Button
                          variant={player.isWhitelisted ? 'secondary' : 'outline'}
                          size="sm"
                          onClick={() => handlePlayerAction(player.name, player.isWhitelisted ? 'whitelist_remove' : 'whitelist_add')}
                          isLoading={playerActionLoading === `${player.name}_${player.isWhitelisted ? 'whitelist_remove' : 'whitelist_add'}`}
                          title={player.isWhitelisted ? 'Remove from whitelist' : 'Add to whitelist'}
                        >
                          <WardenIcon name="check" size={13} className={player.isWhitelisted ? 'text-[var(--color-accent)]' : 'text-slate-400'} />
                          <span>{player.isWhitelisted ? 'Whitelisted' : 'Whitelist'}</span>
                        </Button>

                        {/* OP / De-OP Toggle */}
                        <Button
                          variant={player.isOp ? 'secondary' : 'outline'}
                          size="sm"
                          onClick={() => handlePlayerAction(player.name, player.isOp ? 'deop' : 'op')}
                          isLoading={playerActionLoading === `${player.name}_${player.isOp ? 'deop' : 'op'}`}
                          title={player.isOp ? 'Demote Operator' : 'Promote to Server Operator'}
                        >
                          <WardenIcon name="binary" size={13} className={player.isOp ? 'text-amber-400' : 'text-slate-400'} />
                          <span>{player.isOp ? 'De-OP' : 'OP'}</span>
                        </Button>

                        {/* Kick Player (Only rendered when player is active/online) */}
                        {player.isOnline && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openPlayerConfirmModal(player.name, 'kick')}
                            isLoading={playerActionLoading === `${player.name}_kick`}
                            title="Kick player from server"
                          >
                            <WardenIcon name="power" size={13} className="text-amber-400" />
                            <span>Kick</span>
                          </Button>
                        )}

                        {/* Ban / Unban */}
                        <Button
                          variant={player.isBanned ? 'outline' : 'danger'}
                          size="sm"
                          onClick={() => {
                            if (player.isBanned) {
                              handlePlayerAction(player.name, 'pardon');
                            } else {
                              openPlayerConfirmModal(player.name, 'ban');
                            }
                          }}
                          isLoading={playerActionLoading === `${player.name}_${player.isBanned ? 'pardon' : 'ban'}`}
                          title={player.isBanned ? 'Unban player' : 'Ban player from server'}
                        >
                          <WardenIcon name="trash" size={13} className={player.isBanned ? 'text-slate-300' : 'text-white'} />
                          <span>{player.isBanned ? 'Pardon' : 'Ban'}</span>
                        </Button>

                        {/* IP Ban */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPlayerConfirmModal(player.name, 'ban_ip')}
                          isLoading={playerActionLoading === `${player.name}_ban_ip`}
                          title="Ban player's IP address"
                        >
                          <span>IP Ban</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>
      )}

      {/* ── TAB: PROPERTIES (Visual Server Properties UI with Pill Toggles) ── */}
      {activeTab === 'properties' && (
        <div className="space-y-6 pb-16">
          {/* Header Bar */}
          <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-5 sm:p-6 mb-2">
            <div>
              <h2 className="font-minecraft text-base sm:text-lg font-bold text-slate-100 tracking-wider flex items-center gap-2.5 uppercase">
                <WardenIcon name="edit" size={20} className="text-[var(--color-accent)]" />
                Server Properties Editor
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                Visual controls for <code className="font-mono text-slate-200 bg-[var(--bg-main)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">server.properties</code>. Changes will update your Minecraft server configuration.
              </p>
            </div>
          </Card>

          {loadingProperties ? (
            <div className="py-16 text-center">
              <div className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-7 h-7 rounded-full mb-3" />
              <div className="text-xs text-slate-400 font-mono">Loading server.properties...</div>
            </div>
          ) : (
            <form onSubmit={handleSaveProperties} className="space-y-5">
              {/* Category 1: Access & Security (Whitelist, Online Mode, PvP, Hardcore) */}
              <Card className="p-5 sm:p-6 space-y-4">
                <div className="mb-2">
                  <h3 className="font-minecraft text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-2">
                    <WardenIcon name="check" size={14} className="text-[var(--color-accent)]" />
                    Access &amp; Security Controls
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                  {/* Whitelist Pill Toggle */}
                  {(() => {
                    const isChecked = serverProperties['white-list'] === 'true' || serverProperties['enforce-whitelist'] === 'true';
                    return (
                      <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                        <div>
                          <div className="font-semibold text-xs text-slate-100">Enforce Whitelist</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Only whitelisted players can join</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          onClick={() => {
                            const val = isChecked ? 'false' : 'true';
                            handlePropertyChange('white-list', val);
                            handlePropertyChange('enforce-whitelist', val);
                          }}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer p-0.5 focus:outline-none ${
                            isChecked ? 'bg-[var(--color-accent)]' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full block transition-transform shadow-md ${
                              isChecked ? 'translate-x-5 bg-[#0d0e11]' : 'translate-x-0 bg-slate-300'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Online Mode (Mojang Authentication) */}
                  {(() => {
                    const isChecked = serverProperties['online-mode'] !== 'false';
                    return (
                      <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                        <div>
                          <div className="font-semibold text-xs text-slate-100">Online Mode (Auth)</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Require official Mojang accounts</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          onClick={() => handlePropertyChange('online-mode', isChecked ? 'false' : 'true')}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer p-0.5 focus:outline-none ${
                            isChecked ? 'bg-[var(--color-accent)]' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full block transition-transform shadow-md ${
                              isChecked ? 'translate-x-5 bg-[#0d0e11]' : 'translate-x-0 bg-slate-300'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })()}

                  {/* PvP Toggle */}
                  {(() => {
                    const isChecked = serverProperties['pvp'] !== 'false';
                    return (
                      <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                        <div>
                          <div className="font-semibold text-xs text-slate-100">Player vs Player (PvP)</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Allow players to damage each other</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          onClick={() => handlePropertyChange('pvp', isChecked ? 'false' : 'true')}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer p-0.5 focus:outline-none ${
                            isChecked ? 'bg-[var(--color-accent)]' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full block transition-transform shadow-md ${
                              isChecked ? 'translate-x-5 bg-[#0d0e11]' : 'translate-x-0 bg-slate-300'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Hardcore Toggle */}
                  {(() => {
                    const isChecked = serverProperties['hardcore'] === 'true';
                    return (
                      <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                        <div>
                          <div className="font-semibold text-xs text-slate-100">Hardcore Mode</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Permanent ban upon player death</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          onClick={() => handlePropertyChange('hardcore', isChecked ? 'false' : 'true')}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer p-0.5 focus:outline-none ${
                            isChecked ? 'bg-red-500' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full block transition-transform shadow-md ${
                              isChecked ? 'translate-x-5 bg-white' : 'translate-x-0 bg-slate-300'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Allow Flight */}
                  {(() => {
                    const isChecked = serverProperties['allow-flight'] === 'true';
                    return (
                      <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                        <div>
                          <div className="font-semibold text-xs text-slate-100">Allow Flight</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">Prevent kick for survival flight</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          onClick={() => handlePropertyChange('allow-flight', isChecked ? 'false' : 'true')}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer p-0.5 focus:outline-none ${
                            isChecked ? 'bg-[var(--color-accent)]' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full block transition-transform shadow-md ${
                              isChecked ? 'translate-x-5 bg-[#0d0e11]' : 'translate-x-0 bg-slate-300'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Spawn Protection Radius */}
                  <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-4 rounded-xl shadow-sm">
                    <label className="block text-xs font-semibold text-slate-100 mb-1">
                      Spawn Protection (Blocks)
                    </label>
                    <NumberInput
                      min={0}
                      max={1000}
                      value={serverProperties['spawn-protection'] || '16'}
                      onChange={(val) => handlePropertyChange('spawn-protection', val)}
                    />
                  </div>
                </div>
              </Card>

              {/* Category 2: Gameplay, World, & Spawning */}
              <Card className="p-5 sm:p-6 space-y-4">
                <div className="mb-2">
                  <h3 className="font-minecraft text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-2">
                    <WardenIcon name="box" size={14} className="text-[var(--color-accent)]" />
                    World &amp; Gameplay Settings
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
                  {/* Game Mode */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Default Game Mode</label>
                    <Dropdown
                      options={[
                        { id: 'survival', label: 'Survival' },
                        { id: 'creative', label: 'Creative' },
                        { id: 'adventure', label: 'Adventure' },
                        { id: 'spectator', label: 'Spectator' },
                      ]}
                      selectedId={serverProperties['gamemode'] || 'survival'}
                      onSelect={(opt) => handlePropertyChange('gamemode', opt.id)}
                      className="w-full"
                    />
                  </div>

                  {/* Difficulty */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Difficulty</label>
                    <Dropdown
                      options={[
                        { id: 'peaceful', label: 'Peaceful' },
                        { id: 'easy', label: 'Easy' },
                        { id: 'normal', label: 'Normal' },
                        { id: 'hard', label: 'Hard' },
                      ]}
                      selectedId={serverProperties['difficulty'] || 'easy'}
                      onSelect={(opt) => handlePropertyChange('difficulty', opt.id)}
                      className="w-full"
                    />
                  </div>

                  {/* Max Players */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Max Players Capacity</label>
                    <NumberInput
                      min={1}
                      max={1000}
                      value={serverProperties['max-players'] || '20'}
                      onChange={(val) => handlePropertyChange('max-players', val)}
                    />
                  </div>

                  {/* View Distance */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      View Distance ({serverProperties['view-distance'] || '10'} Chunks)
                    </label>
                    <input
                      type="range"
                      min="4"
                      max="32"
                      value={serverProperties['view-distance'] || '10'}
                      onChange={(e) => handlePropertyChange('view-distance', e.target.value)}
                      className="w-full accent-[var(--color-accent)] cursor-pointer mt-2"
                    />
                  </div>
                </div>

                {/* Spawning Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3">
                  {/* Spawn Monsters */}
                  {(() => {
                    const isChecked = serverProperties['spawn-monsters'] !== 'false';
                    return (
                      <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                        <span className="text-xs font-semibold text-slate-100">Spawn Monsters</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          onClick={() => handlePropertyChange('spawn-monsters', isChecked ? 'false' : 'true')}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer p-0.5 focus:outline-none ${
                            isChecked ? 'bg-[var(--color-accent)]' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full block transition-transform shadow-md ${
                              isChecked ? 'translate-x-5 bg-[#0d0e11]' : 'translate-x-0 bg-slate-300'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Spawn Animals */}
                  {(() => {
                    const isChecked = serverProperties['spawn-animals'] !== 'false';
                    return (
                      <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                        <span className="text-xs font-semibold text-slate-100">Spawn Animals</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          onClick={() => handlePropertyChange('spawn-animals', isChecked ? 'false' : 'true')}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer p-0.5 focus:outline-none ${
                            isChecked ? 'bg-[var(--color-accent)]' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full block transition-transform shadow-md ${
                              isChecked ? 'translate-x-5 bg-[#0d0e11]' : 'translate-x-0 bg-slate-300'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Spawn NPCs */}
                  {(() => {
                    const isChecked = serverProperties['spawn-npcs'] !== 'false';
                    return (
                      <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-4 rounded-xl flex items-center justify-between gap-3 shadow-sm">
                        <span className="text-xs font-semibold text-slate-100">Spawn NPCs (Villagers)</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isChecked}
                          onClick={() => handlePropertyChange('spawn-npcs', isChecked ? 'false' : 'true')}
                          className={`w-11 h-6 rounded-full transition-colors relative shrink-0 cursor-pointer p-0.5 focus:outline-none ${
                            isChecked ? 'bg-[var(--color-accent)]' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-full block transition-transform shadow-md ${
                              isChecked ? 'translate-x-5 bg-[#0d0e11]' : 'translate-x-0 bg-slate-300'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })()}
              </div>
            </Card>

            {/* Category 3: Server Branding & MOTD */}
            <Card className="p-5 sm:p-6 space-y-4">
              <div className="mb-2">
                <h3 className="font-minecraft text-xs font-bold text-slate-200 tracking-wider uppercase flex items-center gap-2">
                  <WardenIcon name="code" size={14} className="text-[var(--color-accent)]" />
                  Server List Branding &amp; Network
                </h3>
              </div>

              <div className="space-y-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Server MOTD (Message of the Day)</label>
                  <input
                    type="text"
                    value={serverProperties['motd'] || 'A Minecraft Server Powered by Warden'}
                    onChange={(e) => handlePropertyChange('motd', e.target.value)}
                    placeholder="e.g. §aWelcome to our Survival Server!§r"
                    className="w-full h-8 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Server Port</label>
                    <NumberInput
                      min={1}
                      max={65535}
                      value={serverProperties['server-port'] || '25565'}
                      onChange={(val) => handlePropertyChange('server-port', val)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Resource Pack URL (Optional)</label>
                    <input
                      type="text"
                      value={serverProperties['resource-pack'] || ''}
                      onChange={(e) => handlePropertyChange('resource-pack', e.target.value)}
                      placeholder="https://example.com/pack.zip"
                      className="w-full h-8 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                    />
                  </div>
                </div>
              </div>
            </Card>
          </form>
        )}

        {/* Floating Sticky Pill Bar for Unsaved Changes */}
        {hasUnsavedProperties && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--color-accent)]/60 text-slate-100 px-5 py-3 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.45)] flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-minecraft font-bold tracking-wide">
                You have unsaved changes!
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setServerProperties(originalProperties)}
                className="px-3 py-1.5 rounded-full text-xs font-minecraft text-slate-400 hover:text-slate-200 hover:bg-[var(--bg-card)] transition-all cursor-pointer"
              >
                Discard
              </button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSaveProperties()}
                isLoading={savingProperties}
                className="rounded-full shadow-md"
              >
                <WardenIcon name="save" size={14} className="text-[#0d0e11]" />
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </div>
    )}

      {/* ── TAB 2: FILES ── */}
      {activeTab === 'files' && (
        <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-5 space-y-4">
          {/* Header + Breadcrumbs */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h2 className="font-minecraft text-sm font-bold text-slate-100 tracking-wider flex items-center gap-2 shrink-0 uppercase">
                <WardenIcon name="folder" size={16} className="text-[var(--color-accent)]" />
                Files Explorer
              </h2>

              <div className="flex items-center gap-1 font-mono text-xs flex-wrap">
                <button
                  onClick={() => { setPathStack([]); fetchFiles(''); }}
                  className="text-[var(--color-accent)] hover:underline font-semibold"
                >
                  /root
                </button>
                {pathStack.map((seg, idx) => (
                  <React.Fragment key={idx}>
                    <span className="text-slate-600">/</span>
                    <button
                      onClick={() => navigateToIndex(idx)}
                      className={`transition-colors ${
                        idx === pathStack.length - 1 ? 'text-slate-300 font-bold' : 'text-[var(--color-accent)] hover:underline'
                      }`}
                    >
                      {seg}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {pathStack.length > 0 && (
                <Button variant="outline" size="sm" onClick={navigateBack}>
                  <WardenIcon name="arrow-left" size={14} className="text-slate-300" />
                  Up
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => fetchFiles(currentPath)} isLoading={loadingFiles}>
                <WardenIcon name="refresh-cw" size={14} className="text-slate-300" />
              </Button>
            </div>
          </div>

          {filesError && (
            <div className="bg-red-950/30 border border-red-800/40 text-red-400 text-xs font-mono p-3 rounded-md">
              {filesError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* File List / Explorer */}
            <div className="lg:col-span-4 space-y-1 max-h-[500px] overflow-y-auto pr-1">
              {loadingFiles ? (
                <div className="py-12 text-center">
                  <div className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-5 h-5 rounded-full" />
                </div>
              ) : files.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs font-mono">
                  {filesError ? 'Error loading files' : 'Empty directory'}
                </div>
              ) : (
                files
                  .sort((a, b) => {
                    const aIsDir = Boolean(a.is_dir || a.isDir);
                    const bIsDir = Boolean(b.is_dir || b.isDir);
                    if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
                    return a.name.localeCompare(b.name);
                  })
                  .map((file) => {
                    const isDirectory = Boolean(file.is_dir || file.isDir);
                    const fullPath = currentPath ? `${currentPath}/${file.name}` : file.name;
                    const isSelected = selectedFile === fullPath;

                    return (
                      <div
                        key={file.name}
                        onClick={() => isDirectory ? navigateInto(file.name) : handleOpenFile(file.name)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                          isSelected
                            ? 'bg-[var(--accent-dim)] border-[var(--accent-border)] text-[var(--color-accent)]'
                            : 'bg-[var(--bg-main)] border-transparent hover:border-[var(--color-border)] hover:bg-[var(--bg-card)] text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {isDirectory ? (
                            <WardenIcon name="folder" size={14} className="text-[var(--color-accent)] shrink-0" />
                          ) : (
                            <WardenIcon name="code" size={14} className="text-slate-400 shrink-0" />
                          )}
                          <span className="text-xs font-mono truncate font-medium">
                            {file.name}
                          </span>
                          {isDirectory && <span className="text-slate-600 text-xs font-mono">/</span>}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!isDirectory && file.size > 0 && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              {formatBytes(file.size)}
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(file.name, isDirectory);
                            }}
                            className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded hover:bg-[var(--bg-surface)]"
                            title={isDirectory ? "Delete directory" : "Delete file"}
                          >
                            {deletingFile === file.name ? (
                              <div className="w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <WardenIcon name="trash" size={13} className="text-red-400" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Clean File Editor */}
            <div className="lg:col-span-8 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-h-[36px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-mono text-slate-300 font-medium truncate">
                    {selectedFile ? `/${selectedFile}` : 'Select a file from the explorer to view or edit'}
                  </span>
                  {fileSavedToast && (
                    <span className="text-[var(--color-accent)] text-xs font-mono flex items-center gap-1 shrink-0">
                      <WardenIcon name="check" size={12} className="text-[var(--color-accent)]" /> Saved
                    </span>
                  )}
                </div>

                {selectedFile && !loadingFileContent && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveFile}
                    isLoading={savingFile}
                    disabled={fileContent === originalContent}
                    className="shrink-0 self-start sm:self-auto"
                  >
                    <WardenIcon name="save" size={14} className="text-[#0d0e11]" />
                    Save File
                  </Button>
                )}
              </div>

              {loadingFileContent ? (
                <div className="w-full h-80 bg-[var(--bg-main)] rounded-lg border border-[var(--color-border)] flex flex-col items-center justify-center text-slate-400 gap-2">
                  <div className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-5 h-5 rounded-full" />
                  <span className="text-xs font-mono">Loading file contents...</span>
                </div>
              ) : (
                <textarea
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  rows={20}
                  readOnly={!selectedFile}
                  className="w-full bg-[var(--bg-main)] text-slate-100 font-mono text-xs p-4 rounded-lg border border-[var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 resize-none leading-relaxed"
                  placeholder={selectedFile ? 'File is empty.' : 'Click any file on the left to open and edit.'}
                  spellCheck={false}
                />
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ── TAB 3: CONSOLE ── */}
      {activeTab === 'console' && (
        <Card className="bg-[var(--bg-surface)] border-[var(--color-border)] p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between pb-1">
            <h2 className="font-minecraft text-sm font-bold text-slate-100 tracking-wider flex items-center gap-2 uppercase">
              <WardenIcon name="code" size={16} className="text-[var(--color-accent)]" />
              Live Server Console
            </h2>
            <Button variant="outline" size="sm" onClick={() => fetchLogs()} isLoading={logsLoading}>
              <WardenIcon name="refresh-cw" size={14} className="text-slate-300" />
              Refresh
            </Button>
          </div>

          <div className="bg-[var(--bg-main)] border border-[var(--color-border)] rounded-xl p-4 font-mono text-xs text-slate-300 h-96 overflow-y-auto space-y-1 select-text leading-relaxed shadow-inner">
            {logs.length === 0 ? (
              <span className="text-slate-600">No console output received yet.</span>
            ) : (
              logs.map((line, i) => {
                // Parse Minecraft color codes (§0-§f, §l, §o, §r), ANSI escape sequences, and HTML entities
                const renderFormattedLine = (rawLine: string) => {
                  // Decode HTML entities (e.g. &lt; -> <, &gt; -> >, &quot; -> ", &amp; -> &)
                  let text = rawLine
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&quot;/g, '"')
                    .replace(/&#39;/g, "'")
                    .replace(/&amp;/g, '&');

                  // If line contains § or ANSI escape codes, format tokens
                  if (text.includes('§') || text.includes('\u001b')) {
                    const parts = text.split(/(§[0-9a-fk-or]|\u001b\[[0-9;]*m)/gi);
                    let currentColor = '';
                    let currentBold = false;
                    let currentItalic = false;

                    const colorMap: Record<string, string> = {
                      '§0': 'text-black',
                      '§1': 'text-blue-500',
                      '§2': 'text-emerald-500',
                      '§3': 'text-cyan-500',
                      '§4': 'text-red-500',
                      '§5': 'text-purple-400',
                      '§6': 'text-amber-400',
                      '§7': 'text-slate-400',
                      '§8': 'text-slate-500',
                      '§9': 'text-sky-400',
                      '§a': 'text-emerald-400',
                      '§b': 'text-cyan-300',
                      '§c': 'text-rose-400',
                      '§d': 'text-pink-400',
                      '§e': 'text-yellow-300',
                      '§f': 'text-white',
                    };

                    return parts.map((part, index) => {
                      if (!part) return null;
                      const code = part.toLowerCase();

                      if (colorMap[code]) {
                        currentColor = colorMap[code];
                        return null;
                      }
                      if (code === '§l') {
                        currentBold = true;
                        return null;
                      }
                      if (code === '§o') {
                        currentItalic = true;
                        return null;
                      }
                      if (code === '§r' || code === '\u001b[0m') {
                        currentColor = '';
                        currentBold = false;
                        currentItalic = false;
                        return null;
                      }
                      if (part.startsWith('\u001b[')) return null;

                      return (
                        <span
                          key={index}
                          className={`${currentColor || 'text-slate-300'} ${currentBold ? 'font-bold' : ''} ${
                            currentItalic ? 'italic' : ''
                          }`}
                        >
                          {part}
                        </span>
                      );
                    });
                  }

                  // Standalone Minecraft Chat Message: <Player> Message
                  const standaloneChatMatch = text.match(/^<([^>]+)>\s*(.*)$/);
                  if (standaloneChatMatch) {
                    const [, playerName, chatMsg] = standaloneChatMatch;
                    return (
                      <span className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-cyan-400 font-bold font-minecraft">&lt;{playerName}&gt;</span>
                        <span className="text-slate-100">{chatMsg}</span>
                      </span>
                    );
                  }

                  // Command Execution Feedback: Gave 1 [Item] to Player, Teleported Player, Made Player OP, etc.
                  if (text.startsWith('Gave ') || text.startsWith('Teleported ') || text.startsWith('Set ') || text.startsWith('Changed ') || text.startsWith('Summoned ')) {
                    return <span className="text-emerald-300 font-mono italic">{text}</span>;
                  }

                  // Minecraft Standard Log Line Parser: [HH:MM:SS] [Thread/LEVEL]: Message
                  const match = text.match(/^(\[\d{2}:\d{2}:\d{2}\])\s+(\[.*?\]):\s*(.*)$/);
                  if (match) {
                    const [, timestamp, threadLevel, content] = match;
                    const isError = threadLevel.includes('ERROR') || content.includes('Unknown or incomplete command') || content.includes('<--[HERE]');
                    const isWarn = threadLevel.includes('WARN');
                    const chatMatch = content.match(/^<([^>]+)>\s*(.*)$/);
                    const isJoin = content.includes('joined the game') || content.includes('logged in with entity');
                    const isLeave = content.includes('left the game') || content.includes('lost connection');
                    const isOp = content.includes('server operator');
                    const isBan = content.includes('Banned') || content.includes('Unbanned') || content.includes('Kicked');
                    const isFeedback = content.startsWith('Gave ') || content.startsWith('Teleported ') || content.startsWith('Set ') || content.startsWith('Summoned ');

                    return (
                      <span className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-slate-500 font-mono select-none">{timestamp}</span>
                        <span
                          className={`font-mono text-[11px] select-none ${
                            isError ? 'text-rose-400 font-bold' : isWarn ? 'text-amber-400 font-bold' : 'text-slate-500'
                          }`}
                        >
                          {threadLevel}:
                        </span>
                        {chatMatch ? (
                          <span className="flex items-baseline gap-1.5 flex-wrap">
                            <span className="text-cyan-400 font-bold font-minecraft">&lt;{chatMatch[1]}&gt;</span>
                            <span className="text-slate-100">{chatMatch[2]}</span>
                          </span>
                        ) : (
                          <span
                            className={
                              isError
                                ? 'text-rose-400 font-semibold'
                                : isWarn
                                ? 'text-amber-400'
                                : isJoin
                                ? 'text-emerald-400 font-medium'
                                : isLeave
                                ? 'text-slate-400'
                                : isOp
                                ? 'text-amber-300 font-medium'
                                : isBan
                                ? 'text-rose-300 font-medium'
                                : isFeedback
                                ? 'text-emerald-300 italic'
                                : 'text-slate-300'
                            }
                          >
                            {content}
                          </span>
                        )}
                      </span>
                    );
                  }

                  // Default Fallback
                  return (
                    <span
                      className={
                        text.includes('ERROR') || text.includes('<--[HERE]')
                          ? 'text-rose-400 font-semibold'
                          : text.includes('WARN')
                          ? 'text-amber-400'
                          : text.startsWith('Gave ') || text.startsWith('Teleported ')
                          ? 'text-emerald-300 italic'
                          : 'text-slate-300'
                      }
                    >
                      {text}
                    </span>
                  );
                };

                return (
                  <div key={i} className="flex items-start py-0.5 hover:bg-white/[0.02] px-1 rounded transition-colors">
                    <span className="text-slate-600 select-none mr-2">&gt;</span>
                    <div className="flex-1 min-w-0 break-words">{renderFormattedLine(line)}</div>
                  </div>
                );
              })
            )}
            <div ref={logEndRef} />
          </div>

          {/* Console Command Input with Minecraft Autocomplete Suggestions */}
          <div className="relative mt-3">
            {/* Autocomplete Popup List */}
            {(() => {
              const currentVersion = server?.detection?.mcVersion || '1.21.1';
              const suggestions = command.trim() ? getCommandSuggestions(command, currentVersion, players) : [];

              if (!showSuggestions || suggestions.length === 0) return null;

              return (
                <div className="absolute bottom-full left-0 mb-2 w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl z-50 p-1.5 space-y-0.5 animate-in fade-in slide-in-from-bottom-1">
                  <div className="px-2.5 py-1 text-[10px] font-minecraft font-bold uppercase tracking-wider text-slate-400 border-b border-[var(--color-border)] flex items-center justify-between">
                    <span>Suggestions (MC {currentVersion})</span>
                    <span className="text-[9px] font-mono text-slate-500">Tab / ↑ ↓ / Click to complete</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-0.5 pt-1">
                    {suggestions.map((sug, idx) => {
                      const isHighlighted = idx === (selectedSuggestionIndex % suggestions.length);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCommand(sug.completion);
                            setShowSuggestions(false);
                            commandInputRef.current?.focus();
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-mono flex items-center justify-between transition-colors ${
                            isHighlighted
                              ? 'bg-[var(--accent-dim)] text-[var(--color-accent)] font-bold'
                              : 'text-slate-200 hover:bg-[var(--bg-card)]'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {sug.avatarUrl && (
                              <img
                                src={sug.avatarUrl}
                                alt=""
                                className="w-5 h-5 rounded bg-slate-900 border border-[var(--color-border)] shrink-0 object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = `https://minotar.net/avatar/${encodeURIComponent(sug.text)}/20`;
                                }}
                              />
                            )}
                            <span className="text-[var(--color-accent)] font-bold truncate">{sug.label}</span>
                          </div>

                          {sug.hint && (
                            <span className="text-[11px] text-slate-400 font-sans truncate max-w-xs ml-2 shrink-0">
                              {sug.hint}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <form onSubmit={handleSendCommand} className="flex items-center gap-2">
              <span className="text-[var(--color-accent)] font-mono text-sm font-bold shrink-0">$</span>
              <input
                ref={commandInputRef}
                type="text"
                value={command}
                onChange={(e) => {
                  setCommand(e.target.value);
                  setShowSuggestions(true);
                  setSelectedSuggestionIndex(0);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  // Delay so mouse clicks can register on suggestions
                  setTimeout(() => setShowSuggestions(false), 200);
                }}
                onKeyDown={(e) => {
                  const currentVersion = server?.detection?.mcVersion || '1.21.1';
                  const suggestions = command.trim() ? getCommandSuggestions(command, currentVersion, players) : [];
                  const isPopupActive = showSuggestions && suggestions.length > 0;

                  if (e.key === 'Tab') {
                    if (isPopupActive) {
                      e.preventDefault();
                      const chosen = suggestions[selectedSuggestionIndex % suggestions.length];
                      if (chosen) {
                        setCommand(chosen.completion);
                        setSelectedSuggestionIndex(0);
                      }
                    }
                  } else if (e.key === 'Escape') {
                    setShowSuggestions(false);
                  } else if (e.key === 'ArrowUp') {
                    if (isPopupActive) {
                      e.preventDefault();
                      setSelectedSuggestionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
                    } else if (commandHistory.length > 0) {
                      e.preventDefault();
                      const nextIndex = historyIndex + 1 < commandHistory.length ? historyIndex + 1 : historyIndex;
                      setHistoryIndex(nextIndex);
                      setCommand(commandHistory[nextIndex] || '');
                      setShowSuggestions(false);
                    }
                  } else if (e.key === 'ArrowDown') {
                    if (isPopupActive) {
                      e.preventDefault();
                      setSelectedSuggestionIndex((prev) => (prev + 1) % suggestions.length);
                    } else if (commandHistory.length > 0) {
                      e.preventDefault();
                      if (historyIndex > 0) {
                        const nextIndex = historyIndex - 1;
                        setHistoryIndex(nextIndex);
                        setCommand(commandHistory[nextIndex] || '');
                        setShowSuggestions(false);
                      } else if (historyIndex === 0) {
                        setHistoryIndex(-1);
                        setCommand('');
                        setShowSuggestions(false);
                      }
                    }
                  }
                }}
                placeholder="Execute Minecraft command (e.g. give @a diamond 64, tp @p, list)..."
                className="flex-1 h-8 bg-[var(--bg-main)] text-slate-100 font-mono text-xs px-3 rounded-md border border-[var(--color-border)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={sendingCmd}
                disabled={!command.trim()}
              >
                <WardenIcon name="play" size={14} className="text-[#0d0e11]" />
                Send
              </Button>
            </form>
          </div>
        </Card>
      )}


      {/* ── TAB 4: SETTINGS & SCHEDULES ── */}
      {activeTab === 'settings' && (
        <div className="space-y-6 pb-16">
          {/* Header */}
          <div className="mb-2 px-1">
            <h2 className="font-minecraft text-base sm:text-lg font-bold text-slate-100 tracking-wider flex items-center gap-2.5 uppercase">
              <WardenIcon name="settings" size={20} className="text-[var(--color-accent)]" />
              Settings &amp; Automation
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 leading-relaxed">
              Customize appearance themes, safety engine schedules, controller integration, and automated routines.
            </p>
          </div>



          {/* Server Loader & Game Version Configuration */}
          <Card className="p-5 sm:p-6 space-y-5">
            <div className="section-header flex items-center justify-between">
              <div>
                <h3 className="section-title font-minecraft font-bold text-slate-100 tracking-wider flex items-center gap-2 uppercase">
                  <WardenIcon name="cpu" size={16} className="text-[var(--color-accent)]" />
                  Server Loader &amp; Version Override
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Change the active mod loader engine and target Minecraft version for <span className="text-[var(--color-accent)] font-semibold">{server?.name || 'this server'}</span>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mod Loader / Software Engine
                </label>
                <Dropdown
                  options={[
                    { id: 'fabric', label: 'Fabric' },
                    { id: 'forge', label: 'Forge' },
                    { id: 'neoforge', label: 'NeoForge' },
                    { id: 'quilt', label: 'Quilt' },
                    { id: 'paper', label: 'Paper' },
                    { id: 'spigot', label: 'Spigot' },
                    { id: 'bukkit', label: 'Bukkit' },
                    { id: 'purpur', label: 'Purpur' },
                    { id: 'vanilla', label: 'Vanilla' },
                  ]}
                  selectedId={manualLoader}
                  onSelect={(opt) => setManualLoader(opt.id as ServerLoader)}
                  title="Select Mod Loader"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Target Minecraft Version
                </label>
                <Dropdown
                  options={[
                    { id: '26.2', label: '26.2 (Snapshot)' },
                    { id: '1.21.4', label: '1.21.4' },
                    { id: '1.21.3', label: '1.21.3' },
                    { id: '1.21.2', label: '1.21.2' },
                    { id: '1.21.1', label: '1.21.1' },
                    { id: '1.21', label: '1.21' },
                    { id: '1.20.6', label: '1.20.6' },
                    { id: '1.20.5', label: '1.20.5' },
                    { id: '1.20.4', label: '1.20.4' },
                    { id: '1.20.3', label: '1.20.3' },
                    { id: '1.20.2', label: '1.20.2' },
                    { id: '1.20.1', label: '1.20.1' },
                    { id: '1.20', label: '1.20' },
                    { id: '1.19.4', label: '1.19.4' },
                    { id: '1.19.3', label: '1.19.3' },
                    { id: '1.19.2', label: '1.19.2' },
                    { id: '1.19.1', label: '1.19.1' },
                    { id: '1.19', label: '1.19' },
                    { id: '1.18.2', label: '1.18.2' },
                    { id: '1.18.1', label: '1.18.1' },
                    { id: '1.18', label: '1.18' },
                    { id: '1.17.1', label: '1.17.1' },
                    { id: '1.17', label: '1.17' },
                    { id: '1.16.5', label: '1.16.5' },
                    { id: '1.16.4', label: '1.16.4' },
                    { id: '1.16.3', label: '1.16.3' },
                    { id: '1.16.2', label: '1.16.2' },
                    { id: '1.16.1', label: '1.16.1' },
                    { id: '1.16', label: '1.16' },
                    { id: '1.15.2', label: '1.15.2' },
                    { id: '1.14.4', label: '1.14.4' },
                    { id: '1.13.2', label: '1.13.2' },
                    { id: '1.12.2', label: '1.12.2' },
                    { id: '1.11.2', label: '1.11.2' },
                    { id: '1.10.2', label: '1.10.2' },
                    { id: '1.9.4', label: '1.9.4' },
                    { id: '1.8.9', label: '1.8.9' },
                    { id: '1.7.10', label: '1.7.10' },
                  ]}
                  selectedId={manualVersion}
                  onSelect={(opt) => setManualVersion(opt.id)}
                  title="Select Minecraft Version"
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3 mt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (!serverId) return;
                  try {
                    await fetch(`/api/v1/servers/${serverId}/confirm-loader`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ loader: manualLoader, mcVersion: manualVersion }),
                    });
                    loadServerDetails(serverId);
                    showToast('Server loader and version settings updated successfully!', 'success');
                  } catch (e: any) {
                    showToast('Failed to update loader settings', 'error');
                  }
                }}
              >
                <WardenIcon name="save" size={14} className="text-[#0d0e11]" />
                Apply Loader &amp; Version to Server
              </Button>
            </div>
          </Card>

          {/* Automated Mod Updates & Restart Settings */}
          <Card className="p-5 sm:p-6 space-y-5">
            <div className="section-header flex items-center justify-between">
              <div>
                <h3 className="section-title font-minecraft font-bold text-slate-100 tracking-wider flex items-center gap-2 uppercase">
                  <WardenIcon name="clock" size={16} className="text-[var(--color-accent)]" />
                  Automated Updates &amp; Schedules
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Configure when Warden automatically checks for mod updates, creates backups, and restarts servers.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Daily Mod Update Schedule
                  </label>
                  <input
                    type="time"
                    value={autoUpdateTime}
                    onChange={(e) => setAutoUpdateTime(e.target.value)}
                    className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Timezone
                  </label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="e.g. Europe/Vienna, UTC"
                    className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2.5 text-xs font-semibold text-slate-300 cursor-pointer select-none py-2.5">
                    <input
                      type="checkbox"
                      checked={autoUpdateEnabled}
                      onChange={(e) => setAutoUpdateEnabled(e.target.checked)}
                      className="rounded border-[var(--color-border)] bg-[var(--bg-main)] text-[var(--color-accent)] focus:ring-0"
                    />
                    <span>Enable Automated Daily Updates</span>
                  </label>
                </div>
              </div>

              {/* Crafty API URL & Key */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Crafty Controller URL
                  </label>
                  <input
                    type="text"
                    value={craftyUrl}
                    onChange={(e) => setCraftyUrl(e.target.value)}
                    placeholder="https://your-crafty-host:8443 or https://host.docker.internal:8443"
                    className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Crafty API Key <span className="text-slate-500 font-normal">(leave blank to keep current)</span>
                  </label>
                  <input
                    type="password"
                    value={craftyApiKey}
                    onChange={(e) => setCraftyApiKey(e.target.value)}
                    placeholder="••••••••••••••••"
                    className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" variant="primary" size="sm" isLoading={savingSettings}>
                  <WardenIcon name="save" size={14} className="text-[#0d0e11]" />
                  Save System Settings
                </Button>
                {settingsSaved && (
                  <span className="text-[var(--color-accent)] text-xs font-mono flex items-center gap-1">
                    <WardenIcon name="check" size={12} className="text-[var(--color-accent)]" /> Saved &amp; Schedules Updated
                  </span>
                )}
              </div>
            </form>
          </Card>

          {/* Custom Scheduled Tasks Card */}
          <Card className="p-5 sm:p-6 space-y-5">
            <div className="section-header flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="section-title font-minecraft font-bold text-slate-100 tracking-wider flex items-center gap-2 uppercase">
                  <WardenIcon name="check" size={16} className="text-[var(--color-accent)]" />
                  Custom Tasks &amp; Automations
                </h3>

                <p className="text-xs text-slate-400 mt-1">
                  Set up automated routines like daily server restarts, broadcast commands, or custom jobs.
                </p>
              </div>

              <Button variant="primary" size="sm" onClick={() => setShowTaskModal(true)} className="self-start sm:self-auto">
                <WardenIcon name="plus" size={14} className="text-[#0d0e11]" />
                Add Scheduled Task
              </Button>
            </div>

            {loadingTasks ? (
              <div className="py-8 text-center text-slate-400">
                <div className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-5 h-5 rounded-full" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs font-mono">
                No custom scheduled tasks configured yet. Click &quot;Add Scheduled Task&quot; above to create one.
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">

                {tasks.map((task) => {
                  const actionLabels: Record<string, string> = {
                    restart_server: 'Restart Server',
                    stop_server: 'Stop Server',
                    start_server: 'Start Server',
                    run_mod_updates: 'Run Mod Updates',
                    console_command: 'Console Command',
                  };

                  const targetServerName = task.serverId === 'all'
                    ? 'All Servers'
                    : allServers.find((s) => s.id === task.serverId)?.name || task.serverId;

                  return (
                    <div key={task.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                        {/* Smooth Pill Switch Button */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={task.enabled}
                          onClick={() => handleToggleTask(task.id, task.enabled)}
                          className={`w-9 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer focus:outline-none mt-0.5 sm:mt-0 ${
                            task.enabled ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-border)]'
                          }`}
                          title={`Task is ${task.enabled ? 'Enabled' : 'Disabled'}`}
                        >
                          <span
                            className={`w-3.5 h-3.5 rounded-full absolute top-[3px] transition-all ${
                              task.enabled
                                ? 'left-[19px] bg-[#0d0e11] shadow-sm'
                                : 'left-[3px] bg-slate-400'
                            }`}
                          />
                        </button>

                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-slate-100 flex items-center gap-2 flex-wrap">
                            <span className="truncate">{task.name}</span>
                            <span className="bg-[var(--bg-card)] text-[var(--color-accent)] border border-[var(--color-border)] px-1.5 py-px rounded text-[10px] font-mono">
                              {actionLabels[task.action] || task.action}
                            </span>
                            <span className="bg-[var(--bg-main)] text-slate-400 border border-[var(--color-border)] px-1.5 py-px rounded text-[10px] font-mono">
                              {targetServerName}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2 flex-wrap">
                            {task.triggerType === 'on_mod_update' ? (
                              <span className="text-[var(--color-accent)] font-semibold flex items-center gap-1">
                                <WardenIcon name="refresh-cw" size={12} className="text-[var(--color-accent)]" /> On Update: {task.targetMod || 'Any Mod'}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <WardenIcon name="clock" size={12} className="text-slate-500" /> Daily at {task.scheduleTime || '05:00'}
                              </span>
                            )}
                            {task.command && <span className="text-slate-500 truncate">• &quot;{task.command}&quot;</span>}
                            {task.lastRun && (
                              <span className="text-slate-500">
                                • Last ran: {new Date(task.lastRun).toLocaleTimeString()} ({task.lastStatus})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRunTaskNow(task.id)}
                          isLoading={runningTaskId === task.id}
                          title="Trigger this task immediately"
                        >
                          <WardenIcon name="play" size={12} className="text-slate-300" />
                          Run Now
                        </Button>

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDeleteTask(task.id)}
                          isLoading={deletingTaskId === task.id}
                          title="Delete task"
                        >
                          <WardenIcon name="trash" size={12} className="text-white" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}


      {/* Manual Loader & MC Version Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Set Server Loader & Minecraft Version"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveConfirmation}>
              <WardenIcon name="check" size={14} className="text-[#0d0e11]" />
              Save &amp; Confirm
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
              Mod Loader
            </label>
            <Dropdown
              options={[
                { id: 'fabric', label: 'Fabric' },
                { id: 'forge', label: 'Forge' },
                { id: 'neoforge', label: 'NeoForge' },
                { id: 'quilt', label: 'Quilt' },
                { id: 'paper', label: 'Paper / Spigot' },
                { id: 'vanilla', label: 'Vanilla' },
              ]}
              selectedId={manualLoader}
              onSelect={(opt) => setManualLoader(opt.id as ServerLoader)}
              title="Select Server Mod Loader"
              icon="box"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
              Minecraft Version
            </label>
            <input
              type="text"
              value={manualVersion}
              onChange={(e) => setManualVersion(e.target.value)}
              placeholder="e.g. 26.2, 1.21.1, 1.20.1"
              className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 font-mono"
            />
          </div>
        </div>
      </Modal>

      {/* Dev Mode Version Picker Modal for Installing Mods */}
      {versionPickerMod && (
        <Modal
          isOpen={Boolean(versionPickerMod)}
          onClose={() => setVersionPickerMod(null)}
          title={`Select Version for ${versionPickerMod.title}`}
          maxWidth="lg"
          footer={
            <Button variant="outline" size="sm" onClick={() => setVersionPickerMod(null)}>
              Cancel
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Targeting: <strong className="text-[var(--color-accent)] uppercase">{devLoader}</strong> • MC <strong className="text-[var(--color-accent)]">{devVersion}</strong>
            </p>

            {loadingVersions ? (
              <div className="py-8 text-center">
                <div className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-5 h-5 rounded-full" />
              </div>
            ) : availableVersions.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs font-mono">
                No versions found matching the current target criteria.
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)] max-h-80 overflow-y-auto">
                {availableVersions.map((ver) => (
                  <div key={ver.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-slate-100 truncate">{ver.name || ver.versionNumber}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {ver.filename} • {ver.dependencies?.length || 0} dependencies
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleInstallModVersion(versionPickerMod, ver.id)}
                      isLoading={installingMod === versionPickerMod.id}
                    >
                      <WardenIcon name="download" size={13} className="text-[#0d0e11]" />
                      Install This Version
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Add Custom Scheduled Task Modal */}
      <Modal
        isOpen={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        title="Add Custom Task"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowTaskModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateTask}>
              <WardenIcon name="check" size={14} className="text-[#0d0e11]" />
              Create Task
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Task Name
            </label>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="e.g. Restart on Voice Chat Update, Daily 05:00 Restart"
              className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Trigger Condition
              </label>
              <Dropdown
                options={[
                  { id: 'schedule', label: 'Daily Scheduled Time (Clock)' },
                  { id: 'on_mod_update', label: 'On Mod Update (Event)' },
                ]}
                selectedId={taskTriggerType}
                onSelect={(opt) => setTaskTriggerType(opt.id as any)}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Target Server
              </label>
              <Dropdown
                options={[
                  { id: 'all', label: 'All Servers' },
                  ...allServers.map((s) => ({ id: s.id, label: s.name })),
                ]}
                selectedId={taskServerId}
                onSelect={(opt) => setTaskServerId(opt.id)}
                className="w-full"
              />
            </div>
          </div>

          {taskTriggerType === 'schedule' ? (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Daily Run Time (HH:MM)
              </label>
              <input
                type="time"
                value={taskScheduleTime}
                onChange={(e) => setTaskScheduleTime(e.target.value)}
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                required
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Target Mod Trigger
              </label>
              <Dropdown
                options={[
                  { id: '', label: '⚡ Any Mod (Trigger whenever any mod updates)' },
                  ...installedMods.map((m) => {
                    const label = m.title ? `${m.title} (${m.filename})` : m.filename;
                    const val = m.slug || m.filename.replace(/\.jar$/i, '');
                    return { id: val, label };
                  }),
                ]}
                selectedId={taskTargetMod}
                onSelect={(opt) => setTaskTargetMod(opt.id)}
                className="w-full"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Action to Execute
            </label>
            <Dropdown
              options={[
                { id: 'restart_server', label: 'Restart Server' },
                { id: 'stop_server', label: 'Stop Server' },
                { id: 'start_server', label: 'Start Server' },
                { id: 'run_mod_updates', label: 'Run Mod Updates' },
                { id: 'console_command', label: 'Execute Minecraft Console Command' },
              ]}
              selectedId={taskAction}
              onSelect={(opt) => setTaskAction(opt.id as any)}
              className="w-full"
            />
          </div>

          {taskAction === 'console_command' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Minecraft Console Command
              </label>
              <input
                type="text"
                value={taskCommand}
                onChange={(e) => setTaskCommand(e.target.value)}
                placeholder="e.g. say Server restarting in 5 minutes!, save-all"
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                required
              />
            </div>
          )}
        </form>
      </Modal>

      {/* Quick Add Player Modal (Aternos Style) */}
      <Modal
        isOpen={showAddPlayerModal}
        onClose={() => setShowAddPlayerModal(false)}
        title="Add Player / Manage Access"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowAddPlayerModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleAddPlayerSubmit} disabled={!newPlayerName.trim()}>
              <WardenIcon name="plus" size={14} className="text-[#0d0e11]" />
              Execute Player Action
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddPlayerSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Minecraft Username (IGN)
            </label>
            <div className="flex items-center gap-2.5">
              {newPlayerName.trim() ? (
                <img
                  src={`https://mc-heads.net/avatar/${encodeURIComponent(newPlayerName.trim())}/36`}
                  alt=""
                  className="w-9 h-9 rounded-md bg-[var(--bg-main)] border border-[var(--color-border)] shrink-0 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://minotar.net/avatar/${encodeURIComponent(newPlayerName.trim())}/36`;
                  }}
                />
              ) : (
                <div className="w-9 h-9 rounded-md bg-[var(--bg-main)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                  <WardenIcon name="users" size={16} className="text-slate-500" />
                </div>
              )}
              <input
                type="text"
                value={newPlayerName}
                onChange={(e) => setNewPlayerName(e.target.value)}
                placeholder="e.g. Notch, Alex, Jeb_"
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                required
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Initial Role / Action
            </label>
            <Dropdown
              options={[
                { id: 'whitelist_add', label: 'Whitelist Player (Allow Access)' },
                { id: 'op', label: 'Promote to Server Operator (OP)' },
                { id: 'ban', label: 'Pre-Ban Player (Deny Access)' },
              ]}
              selectedId={newPlayerAction}
              onSelect={(opt) => setNewPlayerAction(opt.id)}
              className="w-full"
            />
          </div>

          {newPlayerAction === 'ban' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Ban Reason (Optional)
              </label>
              <input
                type="text"
                value={newPlayerReason}
                onChange={(e) => setNewPlayerReason(e.target.value)}
                placeholder="e.g. Griefing, Rule violation"
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
              />
            </div>
          )}
        </form>
      </Modal>

      {/* Unsaved Changes Confirmation Modal */}
      <Modal
        isOpen={showUnsavedModal}
        onClose={() => setShowUnsavedModal(false)}
        title="Unsaved Properties Changes"
        footer={
          <>
            <Button variant="danger" size="sm" onClick={handleDiscardProperties}>
              Discard Changes
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                await handleSaveProperties(undefined, true);
                setShowUnsavedModal(false);
                if (pendingTab) {
                  setActiveTab(pendingTab);
                  setPendingTab(null);
                }
              }}
              isLoading={savingProperties}
            >
              <WardenIcon name="save" size={14} className="text-[#0d0e11]" />
              Save &amp; Continue
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-slate-300 text-xs">
          <p>
            You have modified your server properties without saving. Leaving this tab will lose your changes unless you save them now.
          </p>
          <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-3 rounded-lg text-slate-400 font-mono text-[11px]">
            Tip: You can save your modifications with &quot;Save &amp; Continue&quot; or discard them.
          </div>
        </div>
      </Modal>

      {/* Server Restart Required Confirmation Modal */}
      <Modal
        isOpen={showRestartModal}
        onClose={() => setShowRestartModal(false)}
        title="Server Restart Required"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowRestartModal(false)}>
              Restart Later
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRestartServerAction}
              isLoading={restartingServer}
            >
              <WardenIcon name="refresh-cw" size={14} className="text-[#0d0e11]" />
              Restart Server Now
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 text-slate-300 text-xs">
          <div className="flex items-center gap-2.5 text-amber-400 font-minecraft font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
            Configuration Saved to server.properties
          </div>
          <p>
            Some settings you modified (such as port, authentication mode, gamemode, hardcore, or world view distance) require a server restart before Minecraft can apply them.
          </p>
          <div className="bg-[var(--bg-card)] border border-[var(--color-border)] p-3 rounded-lg text-slate-400 font-mono text-[11px]">
            Would you like to restart the Minecraft server now to apply these changes?
          </div>
        </div>
      </Modal>

      {/* Custom Player Moderation Action Modal (Kick, Ban, IP Ban) */}
      <Modal
        isOpen={playerModalConfig.isOpen}
        onClose={() => setPlayerModalConfig((prev) => ({ ...prev, isOpen: false }))}
        title={playerModalConfig.title || 'Confirm Player Action'}
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPlayerModalConfig((prev) => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button
              variant={playerModalConfig.action === 'kick' ? 'primary' : 'danger'}
              size="sm"
              onClick={handleConfirmPlayerModal}
              isLoading={!!playerActionLoading}
            >
              <WardenIcon
                name={playerModalConfig.action === 'kick' ? 'power' : 'trash'}
                size={14}
                className={playerModalConfig.action === 'kick' ? 'text-[#0d0e11]' : 'text-white'}
              />
              Confirm {playerModalConfig.action === 'kick' ? 'Kick' : playerModalConfig.action === 'ban' ? 'Ban' : 'IP Ban'}
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-xs text-slate-300">
          <div className="flex items-center gap-3 p-3 bg-[var(--bg-card)] border border-[var(--color-border)] rounded-xl">
            <img
              src={`https://mc-heads.net/avatar/${encodeURIComponent(playerModalConfig.playerName)}/36`}
              alt={playerModalConfig.playerName}
              className="w-9 h-9 rounded-md bg-[var(--bg-main)] border border-[var(--color-border)] shrink-0 object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://minotar.net/avatar/${encodeURIComponent(playerModalConfig.playerName)}/36`;
              }}
            />
            <div>
              <div className="font-minecraft font-bold text-sm text-slate-100">{playerModalConfig.playerName}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Target Player Account</div>
            </div>
          </div>

          <p className="leading-relaxed text-slate-300">
            {playerModalConfig.description}
          </p>

          {playerModalConfig.needsReason && (
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1.5">
                Reason / Note <span className="text-slate-500 font-normal">(shown to player upon disconnect)</span>
              </label>
              <input
                type="text"
                value={playerModalConfig.reason}
                onChange={(e) => setPlayerModalConfig((prev) => ({ ...prev, reason: e.target.value }))}
                placeholder="e.g. Breaking server rules, AFK, etc."
                className="w-full bg-[var(--bg-main)] border border-[var(--color-border)] p-2.5 rounded-lg text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirmPlayerModal();
                  }
                }}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Import Modrinth Modpack (.mrpack) Modal */}
      <Modal
        isOpen={showMrPackModal}
        maxWidth="3xl"
        onClose={() => {
          if (!importingMrPack) setShowMrPackModal(false);
        }}
        title="Import Modrinth Modpack (.mrpack)"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMrPackModal(false)}
              disabled={importingMrPack}
            >
              {mrPackResult ? 'Close' : 'Cancel'}
            </Button>
            {!mrPackResult && (
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  if (!mrPackFile && !mrPackUrl.trim()) return;
                  setImportingMrPack(true);
                  setMrPackError(null);
                  setMrPackProgress({
                    percent: 0,
                    current: 0,
                    total: 100,
                    message: 'Initializing modpack deployment...',
                    stage: 'downloading',
                  });
                  setMrPackProgressLogs([]);

                  setTimeout(() => {
                    const container = document.getElementById('modal-scroll-container');
                    if (container) {
                      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
                    }
                  }, 50);

                  try {
                    let bodyData: any = {
                      options: {
                        includeMods: mrPackIncludeMods,
                        includeDatapacks: mrPackIncludeDatapacks,
                        includeResourcePacks: mrPackIncludeResourcePacks,
                        includeShaderPacks: mrPackIncludeShaderPacks,
                        includeOverrides: mrPackIncludeOverrides,
                        excludedFilePaths: mrPackExcludedPaths,
                      },
                    };
                    if (mrPackFile) {
                      const base64Data = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(mrPackFile);
                      });
                      bodyData.data = base64Data;
                    } else if (mrPackUrl) {
                      bodyData.url = mrPackUrl.trim();
                    }

                    const res = await fetch(`/api/v1/servers/${serverId}/import-mrpack`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(bodyData),
                    });

                    if (!res.ok || !res.body) {
                      throw new Error(`Server returned HTTP ${res.status}`);
                    }

                    const reader = res.body.getReader();
                    const decoder = new TextDecoder();
                    let bufferText = '';

                    while (true) {
                      const { done, value } = await reader.read();
                      if (done) break;
                      bufferText += decoder.decode(value, { stream: true });

                      const lines = bufferText.split('\n');
                      bufferText = lines.pop() || '';

                      for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data: ')) {
                          try {
                            const payload = JSON.parse(trimmed.slice(6));
                            if (payload.type === 'progress') {
                              setLastProgressTimestamp(Date.now());
                              setMrPackProgress(payload.data);
                              if (payload.data?.filename && (payload.data?.stage === 'uploading' || payload.data?.stage === 'error' || payload.data?.stage === 'downloading')) {
                                const isErr = payload.data?.stage === 'error';
                                setMrPackProgressLogs((prev) => {
                                  if (prev.some((p) => p.filename === payload.data.filename && p.isError === isErr)) return prev;
                                  return [
                                    {
                                      id: `${Date.now()}-${Math.random()}`,
                                      filename: payload.data.filename,
                                      title: payload.data.title,
                                      targetDir: payload.data.targetDir || 'mods',
                                      isError: isErr,
                                      errorMsg: payload.data.message,
                                      time: new Date().toLocaleTimeString(),
                                    },
                                    ...prev.slice(0, 7),
                                  ];
                                });
                              }
                            } else if (payload.type === 'complete') {
                              setMrPackResult(payload.data);
                              fetchInstalledMods();
                              fetchFiles(currentPath);
                              fetchProperties();
                              loadServerDetails(serverId);
                              window.dispatchEvent(new CustomEvent('warden_server_updated'));
                            } else if (payload.type === 'error') {
                              setMrPackError(payload.error || 'Failed to install modpack');
                              fetchInstalledMods();
                              fetchFiles(currentPath);
                            }
                          } catch {}
                        }
                      }
                    }
                  } catch (err: any) {
                    setMrPackError(err.message || 'Error installing modpack');
                  } finally {
                    setImportingMrPack(false);
                    fetchInstalledMods();
                    fetchFiles(currentPath);
                    loadServerDetails(serverId);
                  }
                }}
                disabled={(!mrPackFile && !mrPackUrl.trim()) || loadingMrPackPreview || importingMrPack}
                isLoading={importingMrPack}
              >
                <WardenIcon name="download" size={14} className="text-[#0d0e11]" />
                Install Modpack
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4 text-xs text-slate-300">
          <p className="text-slate-400">
            Upload an <code className="text-slate-200 font-mono">.mrpack</code> file or paste a Modrinth CDN link. Warden creates all missing folders, downloads server-compatible files, and installs overrides.
          </p>

          {/* Source Selection: Upload File or Paste URL */}
          <div className="space-y-3">
            {/* File Upload Zone */}
            <div className="border border-dashed border-[var(--color-border)] hover:border-[var(--color-accent)]/50 rounded-xl p-4 text-center bg-[var(--bg-main)] transition-colors cursor-pointer relative">
              <input
                type="file"
                accept=".mrpack"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setMrPackFile(file);
                  setMrPackError(null);
                  setMrPackPreview(null);
                  setMrPackResult(null);
                  setMrPackProgress(null);
                  setMrPackProgressLogs([]);
                  setMrPackExcludedPaths([]);
                  setMrPackSearchQuery('');
                  setLoadingMrPackPreview(true);

                  try {
                    const reader = new FileReader();
                    reader.onload = async () => {
                      const base64Data = reader.result as string;
                      try {
                        const res = await fetch(`/api/v1/servers/${serverId}/preview-mrpack`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ data: base64Data }),
                        });
                        const data = await res.json();
                        if (data.success && data.data) {
                          setMrPackPreview(data.data);
                        } else {
                          setMrPackError(data.error || 'Failed to inspect .mrpack file');
                        }
                      } catch (err: any) {
                        setMrPackError(err.message || 'Error communicating with server');
                      } finally {
                        setLoadingMrPackPreview(false);
                      }
                    };
                    reader.readAsDataURL(file);
                  } catch (err: any) {
                    setMrPackError(err.message);
                    setLoadingMrPackPreview(false);
                  }
                }}
                disabled={importingMrPack}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                <WardenIcon name="download" size={24} className="text-[var(--color-accent)]" />
                <span className="font-semibold text-slate-200">
                  {mrPackFile ? mrPackFile.name : 'Choose .mrpack file or drag & drop'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Modrinth Modpack Archive (.mrpack)</span>
              </div>
            </div>

            {/* URL Input Option */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={mrPackUrl}
                onChange={(e) => setMrPackUrl(e.target.value)}
                placeholder="Or paste .mrpack direct download URL..."
                className="flex-1 h-8 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50"
                disabled={importingMrPack}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={!mrPackUrl.trim() || loadingMrPackPreview || importingMrPack}
                isLoading={loadingMrPackPreview}
                onClick={async () => {
                  if (!mrPackUrl.trim()) return;
                  setMrPackFile(null);
                  setMrPackError(null);
                  setMrPackPreview(null);
                  setMrPackResult(null);
                  setMrPackProgress(null);
                  setMrPackProgressLogs([]);
                  setMrPackExcludedPaths([]);
                  setMrPackSearchQuery('');
                  setLoadingMrPackPreview(true);

                  try {
                    const res = await fetch(`/api/v1/servers/${serverId}/preview-mrpack`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ url: mrPackUrl.trim() }),
                    });
                    const data = await res.json();
                    if (data.success && data.data) {
                      setMrPackPreview(data.data);
                    } else {
                      setMrPackError(data.error || 'Failed to inspect .mrpack from URL');
                    }
                  } catch (err: any) {
                    setMrPackError(err.message || 'Error connecting to modpack URL');
                  } finally {
                    setLoadingMrPackPreview(false);
                  }
                }}
              >
                Inspect
              </Button>
            </div>
          </div>

          {/* Loading Preview Spinner */}
          {loadingMrPackPreview && (
            <div className="flex items-center justify-center gap-2 py-6 text-slate-400 font-mono">
              <span className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-4 h-4 rounded-full" />
              <span>Analyzing modpack &amp; fetching metadata from Modrinth...</span>
            </div>
          )}

          {/* Error Message */}
          {mrPackError && (
            <div className="bg-red-950/50 border border-red-800/60 p-3 rounded-xl text-red-300 flex items-center gap-2.5 shadow-sm">
              <WardenIcon name="triangle-alert" size={16} className="text-red-400 shrink-0" />
              <div className="text-xs font-mono">{mrPackError}</div>
            </div>
          )}

          {/* Modpack Preview Card */}
          {mrPackPreview && !mrPackResult && (() => {
            const currentLoader = (server?.detection?.loader || 'vanilla').toLowerCase();
            const rawServerMc = server?.detection?.mcVersion;
            const currentMcVer = (rawServerMc && String(rawServerMc).toLowerCase() !== 'false') ? String(rawServerMc) : '';
            const rawModpackMc = mrPackPreview.mcVersion;
            const modpackMcVer = (rawModpackMc && String(rawModpackMc).toLowerCase() !== 'false') ? String(rawModpackMc) : '';
            const modpackLoader = (mrPackPreview.loader || 'fabric').toLowerCase();

            // A loader/version mismatch disclaimer is triggered if:
            // 1. Current server is Vanilla or Unknown and modpack is Fabric/Forge/NeoForge
            // 2. Or current loader doesn't match modpack loader (e.g. Paper vs Fabric)
            // 3. Or MC versions differ
            const isLoaderMismatch = currentLoader !== modpackLoader || currentLoader === 'vanilla' || currentLoader === 'unknown';
            const isVersionMismatch = Boolean(currentMcVer && modpackMcVer && currentMcVer !== modpackMcVer);
            const hasDisclaimer = isLoaderMismatch || isVersionMismatch;

            const isCategoryActive = (category: string) => {
              if (category === 'mods') return mrPackIncludeMods;
              if (category === 'datapacks') return mrPackIncludeDatapacks;
              if (category === 'resourcepacks') return mrPackIncludeResourcePacks;
              if (category === 'shaderpacks') return mrPackIncludeShaderPacks;
              if (category === 'overrides') return mrPackIncludeOverrides;
              return true;
            };

            const allModsList: any[] = mrPackPreview.modsList || [];
            const activeAndSelectedCount = allModsList.filter((m: any) => isCategoryActive(m.category) && !mrPackExcludedPaths.includes(m.path)).length;

            const filteredMods = allModsList.filter((m: any) => {
              if (mrPackSearchQuery.trim()) {
                const q = mrPackSearchQuery.toLowerCase();
                return m.title.toLowerCase().includes(q) || m.filename.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
              }
              return true;
            });

            return (
              <div className="space-y-4">
                {/* Loader & Version Compatibility / Mismatch Disclaimer Card */}
                {hasDisclaimer ? (
                  <div className="bg-amber-950/60 border-2 border-amber-500/70 rounded-xl p-3.5 sm:p-4 space-y-2.5 text-amber-200 shadow-xl">
                    <div className="flex items-center gap-2 font-minecraft font-bold text-xs text-amber-400">
                      <WardenIcon name="triangle-alert" size={18} className="text-amber-400 shrink-0 animate-pulse" />
                      <span>LOADER / VERSION MISMATCH DISCLAIMER</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-black/40 p-2.5 rounded-lg border border-amber-500/30">
                      <div>
                        <div className="text-slate-400 text-[10px]">Your Server:</div>
                        <div className="font-bold text-white uppercase text-xs mt-0.5">
                          {currentLoader || 'Vanilla'} {currentMcVer ? `(MC ${currentMcVer})` : ''}
                        </div>
                      </div>
                      <div>
                        <div className="text-amber-400 text-[10px]">Modpack Requires:</div>
                        <div className="font-bold text-[var(--color-accent)] uppercase text-xs mt-0.5">
                          {modpackLoader} {modpackMcVer ? `(MC ${modpackMcVer})` : ''}
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] leading-relaxed text-amber-100">
                      ⚠️ <strong>Attention:</strong> Your server is detected as <strong className="text-white uppercase">{currentLoader}</strong>, but this modpack contains <strong className="text-white uppercase">{modpackLoader}</strong> mods.
                    </p>
                    <p className="text-[10px] leading-relaxed text-amber-300 font-mono">
                      {currentLoader === 'vanilla' || currentLoader === 'unknown'
                        ? 'Vanilla servers do not have a mods/ folder. Switch your server jar to Fabric/Forge in Crafty and start it once to initialize the mods directory.'
                        : `Warden will deploy files, but Minecraft will only run them once you switch the server jar to ${modpackLoader.toUpperCase()}.`}
                    </p>
                  </div>
                ) : (
                  <div className="bg-[var(--accent-dim)] border border-[var(--accent-border)] rounded-xl p-3 flex items-center justify-between text-xs text-[var(--color-accent)] font-mono">
                    <div className="flex items-center gap-2 font-minecraft font-semibold">
                      <WardenIcon name="check" size={16} className="text-[var(--color-accent)] shrink-0" />
                      <span>Loader Compatible: {modpackLoader.toUpperCase()} (MC {modpackMcVer})</span>
                    </div>
                    <span className="text-[10px] text-slate-400">Matches Server Jar</span>
                  </div>
                )}

                {/* Modpack Header & Info */}
                <div className="bg-[var(--bg-card)] border border-[var(--color-border)] rounded-xl p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-minecraft font-bold text-sm text-slate-100">{mrPackPreview.name}</h4>
                      {mrPackPreview.summary && (
                        <p className="text-slate-400 text-[11px] mt-0.5">{mrPackPreview.summary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="bg-[var(--accent-dim)] text-[var(--color-accent)] border border-[var(--accent-border)] px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase">
                        {mrPackPreview.loader}
                      </span>
                      <span className="bg-[var(--bg-main)] text-slate-300 border border-[var(--color-border)] px-2 py-0.5 rounded text-[10px] font-mono">
                        MC {mrPackPreview.mcVersion}
                      </span>
                    </div>
                  </div>

                  {/* Component Category Checkboxes: Click anywhere on box to toggle */}
                  <div>
                    <div className="text-[11px] font-semibold text-slate-300 mb-2">Select Components to Install (Click boxes to toggle):</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                      {/* Mods Toggle Box */}
                      <button
                        type="button"
                        onClick={() => setMrPackIncludeMods(!mrPackIncludeMods)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all text-left select-none ${
                          mrPackIncludeMods
                            ? 'bg-[var(--accent-dim)] border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40 text-slate-100 shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--color-border)] text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                          mrPackIncludeMods ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0d0e11]' : 'border-[var(--color-border)] bg-[var(--bg-card)]'
                        }`}>
                          {mrPackIncludeMods && <WardenIcon name="check" size={12} className="text-[#0d0e11] stroke-[3]" />}
                        </div>
                        <div className="truncate">
                          <div className="font-semibold text-xs truncate">Mods ({mrPackPreview.modsCount})</div>
                          <div className="text-[10px] text-slate-400 font-mono">mods/</div>
                        </div>
                      </button>

                      {/* Datapacks Toggle Box */}
                      <button
                        type="button"
                        onClick={() => setMrPackIncludeDatapacks(!mrPackIncludeDatapacks)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all text-left select-none ${
                          mrPackIncludeDatapacks
                            ? 'bg-[var(--accent-dim)] border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40 text-slate-100 shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--color-border)] text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                          mrPackIncludeDatapacks ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0d0e11]' : 'border-[var(--color-border)] bg-[var(--bg-card)]'
                        }`}>
                          {mrPackIncludeDatapacks && <WardenIcon name="check" size={12} className="text-[#0d0e11] stroke-[3]" />}
                        </div>
                        <div className="truncate">
                          <div className="font-semibold text-xs truncate">Datapacks ({mrPackPreview.datapacksCount})</div>
                          <div className="text-[10px] text-slate-400 font-mono">world/datapacks/</div>
                        </div>
                      </button>

                      {/* Overrides / Configs Toggle Box */}
                      <button
                        type="button"
                        onClick={() => setMrPackIncludeOverrides(!mrPackIncludeOverrides)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all text-left select-none ${
                          mrPackIncludeOverrides
                            ? 'bg-[var(--accent-dim)] border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40 text-slate-100 shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--color-border)] text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                          mrPackIncludeOverrides ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0d0e11]' : 'border-[var(--color-border)] bg-[var(--bg-card)]'
                        }`}>
                          {mrPackIncludeOverrides && <WardenIcon name="check" size={12} className="text-[#0d0e11] stroke-[3]" />}
                        </div>
                        <div className="truncate">
                          <div className="font-semibold text-xs truncate">Configs ({mrPackPreview.overridesCount})</div>
                          <div className="text-[10px] text-slate-400 font-mono">config/ &amp; overrides</div>
                        </div>
                      </button>

                      {/* Resource Packs Toggle Box */}
                      <button
                        type="button"
                        onClick={() => setMrPackIncludeResourcePacks(!mrPackIncludeResourcePacks)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all text-left select-none ${
                          mrPackIncludeResourcePacks
                            ? 'bg-[var(--accent-dim)] border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40 text-slate-100 shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--color-border)] text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                          mrPackIncludeResourcePacks ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0d0e11]' : 'border-[var(--color-border)] bg-[var(--bg-card)]'
                        }`}>
                          {mrPackIncludeResourcePacks && <WardenIcon name="check" size={12} className="text-[#0d0e11] stroke-[3]" />}
                        </div>
                        <div className="truncate">
                          <div className="font-semibold text-xs truncate">Resource Packs ({mrPackPreview.resourcePacksCount})</div>
                          <div className="text-[10px] text-slate-400 font-mono">resourcepacks/</div>
                        </div>
                      </button>

                      {/* Shader Packs Toggle Box */}
                      <button
                        type="button"
                        onClick={() => setMrPackIncludeShaderPacks(!mrPackIncludeShaderPacks)}
                        className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all text-left select-none ${
                          mrPackIncludeShaderPacks
                            ? 'bg-[var(--accent-dim)] border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/40 text-slate-100 shadow-sm'
                            : 'bg-[var(--bg-main)] border-[var(--color-border)] text-slate-400 hover:border-slate-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                          mrPackIncludeShaderPacks ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0d0e11]' : 'border-[var(--color-border)] bg-[var(--bg-card)]'
                        }`}>
                          {mrPackIncludeShaderPacks && <WardenIcon name="check" size={12} className="text-[#0d0e11] stroke-[3]" />}
                        </div>
                        <div className="truncate">
                          <div className="font-semibold text-xs truncate">Shaders ({mrPackPreview.shaderPacksCount})</div>
                          <div className="text-[10px] text-slate-400 font-mono">shaderpacks/</div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Mod List with Rich Cards and Include/Exclude Checkboxes */}
                <div className="bg-[var(--bg-card)] border border-[var(--color-border)] rounded-xl p-3.5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-minecraft font-bold text-xs text-slate-100">
                        MODS &amp; FILES LIST ({activeAndSelectedCount} / {allModsList.length} SELECTED)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={mrPackSearchQuery}
                        onChange={(e) => setMrPackSearchQuery(e.target.value)}
                        placeholder="Filter mod list..."
                        className="h-7 bg-[var(--bg-main)] border border-[var(--color-border)] px-2.5 rounded text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 w-36 sm:w-44"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setMrPackExcludedPaths([]);
                        }}
                        className="text-[10px] text-[var(--color-accent)] hover:underline font-mono shrink-0"
                      >
                        Select All
                      </button>
                      <span className="text-slate-600">•</span>
                      <button
                        type="button"
                        onClick={() => {
                          setMrPackExcludedPaths(allModsList.map((m: any) => m.path));
                        }}
                        className="text-[10px] text-slate-400 hover:text-slate-200 font-mono shrink-0"
                      >
                        Deselect All
                      </button>
                    </div>
                  </div>

                  {/* Vertical Top-to-Bottom Scrollable List of Mods */}
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {filteredMods.map((mod: any) => {
                      const categoryEnabled = isCategoryActive(mod.category);
                      const isExcluded = mrPackExcludedPaths.includes(mod.path);
                      const isChecked = categoryEnabled && !isExcluded;

                      return (
                        <div
                          key={mod.path}
                          onClick={() => {
                            if (!categoryEnabled) return;
                            if (isChecked) {
                              setMrPackExcludedPaths([...mrPackExcludedPaths, mod.path]);
                            } else {
                              setMrPackExcludedPaths(mrPackExcludedPaths.filter((p) => p !== mod.path));
                            }
                          }}
                          className={`p-2.5 rounded-lg border transition-all flex items-start gap-3 select-none ${
                            !categoryEnabled
                              ? 'bg-[var(--bg-main)]/30 border-dashed border-[var(--color-border)]/40 opacity-40 cursor-not-allowed'
                              : isChecked
                              ? 'bg-[var(--bg-main)] border-[var(--color-border)] hover:border-[var(--color-accent)]/40 cursor-pointer'
                              : 'bg-[var(--bg-main)]/50 border-[var(--color-border)]/40 opacity-50 cursor-pointer'
                          }`}
                        >
                          {/* Checkbox */}
                          <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border mt-1 transition-colors ${
                            !categoryEnabled
                              ? 'border-slate-700 bg-slate-800'
                              : isChecked
                              ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0d0e11]'
                              : 'border-[var(--color-border)] bg-[var(--bg-card)]'
                          }`}>
                            {isChecked && <WardenIcon name="check" size={12} className="text-[#0d0e11] stroke-[3]" />}
                          </div>

                          {/* Mod Icon */}
                          {mod.iconUrl ? (
                            <img
                              src={mod.iconUrl}
                              alt=""
                              className="w-8 h-8 rounded bg-[#0d0e11] shrink-0 object-cover border border-[var(--color-border)]"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-[#0d0e11] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                              <WardenIcon name="box" size={14} className="text-slate-500" />
                            </div>
                          )}

                          {/* Mod Title & Description */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-100 text-xs truncate">{mod.title}</span>
                              <span className="bg-[var(--bg-card)] text-slate-400 border border-[var(--color-border)] px-1.5 py-px rounded text-[9px] font-mono shrink-0">
                                {mod.category}
                              </span>
                              {!categoryEnabled && (
                                <span className="bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-px rounded text-[9px] font-mono shrink-0">
                                  Category Disabled
                                </span>
                              )}
                              {mod.isClientOnly && (
                                <span className="bg-amber-950/40 text-amber-400 border border-amber-800/40 px-1.5 py-px rounded text-[9px] font-mono shrink-0">
                                  Client-only
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{mod.description}</p>

                            <div className="text-[10px] text-slate-500 font-mono mt-1 flex items-center gap-2 flex-wrap">
                              <span className="truncate">{mod.filename}</span>
                              {mod.downloads !== undefined && (
                                <span className="shrink-0">• {mod.downloads.toLocaleString()} DL</span>
                              )}
                              {mod.fileSize && (
                                <span className="shrink-0">• {formatBytes(mod.fileSize)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filteredMods.length === 0 && (
                      <div className="text-center py-6 text-slate-500 text-xs">
                        No mods match the filter &quot;{mrPackSearchQuery}&quot;
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Installing Granular Real-Time Progress Indicator */}
          {importingMrPack && (
            <div className="bg-[var(--bg-card)] border border-[var(--color-accent)]/60 p-5 rounded-2xl space-y-4 shadow-2xl relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--color-accent)]/10 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Mod Icon or Animated Spinner */}
                  {mrPackProgress?.iconUrl ? (
                    <img
                      src={mrPackProgress.iconUrl}
                      alt=""
                      className="w-11 h-11 rounded-xl bg-[#0d0e11] object-cover border border-[var(--color-accent)]/50 shrink-0 shadow"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-[var(--accent-dim)] border border-[var(--accent-border)] flex items-center justify-center shrink-0">
                      <span className="inline-block animate-spin border-2 border-[var(--color-accent)] border-t-transparent w-5 h-5 rounded-full" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="font-minecraft font-bold text-xs text-slate-100 truncate">
                      {mrPackProgress?.title || mrPackProgress?.filename || 'Deploying Modpack...'}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                      {mrPackProgress?.filename ? `File: ${mrPackProgress.filename}` : mrPackProgress?.message || 'Processing files...'}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-minecraft font-bold text-sm text-[var(--color-accent)]">
                    {mrPackProgress?.percent !== undefined ? `${mrPackProgress.percent}%` : '0%'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {mrPackProgress?.current && mrPackProgress?.total
                      ? `File ${mrPackProgress.current} of ${mrPackProgress.total}`
                      : 'Processing...'}
                  </div>
                </div>
              </div>

              {/* Hang Tight Live Notification Pulse */}
              {hangTightText && (
                <div className="flex items-center gap-2 text-[11px] font-mono text-amber-300 bg-amber-950/40 border border-amber-800/50 px-3 py-1.5 rounded-xl animate-pulse">
                  <WardenIcon name="clock" size={13} className="text-amber-400 shrink-0" />
                  <span className="flex-1">{hangTightText}</span>
                </div>
              )}

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="w-full h-4 bg-[#0a0c10] rounded-full overflow-hidden border-2 border-[var(--color-border)] p-0.5 shadow-inner relative">
                  <div
                    className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(4, mrPackProgress?.percent || 0)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                  <div className="flex items-center gap-1.5 font-medium">
                    {mrPackProgress?.stage === 'downloading' && (
                      <>
                        <WardenIcon name="download" size={13} className="text-[var(--color-accent)] shrink-0" />
                        <span>Downloading from Modrinth CDN...</span>
                      </>
                    )}
                    {mrPackProgress?.stage === 'uploading' && (
                      <>
                        <WardenIcon name="upload" size={13} className="text-[var(--color-accent)] shrink-0" />
                        <span>Deploying to <code className="text-white font-mono">{mrPackProgress.targetDir || 'mods'}/</code></span>
                      </>
                    )}
                    {mrPackProgress?.stage === 'override' && (
                      <>
                        <WardenIcon name="settings" size={13} className="text-[var(--color-accent)] shrink-0" />
                        <span>Applying config overrides...</span>
                      </>
                    )}
                    {mrPackProgress?.stage === 'error' && (
                      <>
                        <WardenIcon name="triangle-alert" size={13} className="text-amber-400 shrink-0" />
                        <span className="text-amber-300">Skipped (continuing deployment)...</span>
                      </>
                    )}
                    {(!mrPackProgress?.stage || mrPackProgress?.stage === 'complete') && (
                      <>
                        <WardenIcon name="box" size={13} className="text-[var(--color-accent)] shrink-0" />
                        <span>Processing modpack archive...</span>
                      </>
                    )}
                  </div>
                  {mrPackProgress?.fileSize && (
                    <span className="text-[var(--color-accent)] font-semibold font-mono">{formatBytes(mrPackProgress.fileSize)}</span>
                  )}
                </div>
              </div>

              {/* Live Activity Ticker (Recent Completed Mods & Status) */}
              {mrPackProgressLogs.length > 0 && (
                <div className="border-t border-[var(--color-border)]/60 pt-2.5 space-y-1.5">
                  <div className="text-[10px] font-semibold text-slate-400 font-mono flex items-center gap-1.5">
                    <WardenIcon name="check" size={11} className="text-[var(--color-accent)]" />
                    <span>Live Activity Feed:</span>
                  </div>
                  <div className="space-y-1 max-h-24 overflow-hidden">
                    {mrPackProgressLogs.slice(0, 4).map((log: any) => (
                      <div
                        key={log.id}
                        className={`flex items-center justify-between text-[10px] font-mono px-2 py-1 rounded ${
                          log.isError
                            ? 'bg-amber-950/40 border border-amber-800/40 text-amber-300'
                            : 'bg-[var(--bg-main)]/60 text-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          {log.isError ? (
                            <span className="text-amber-400 font-bold">⚠️</span>
                          ) : (
                            <span className="text-[var(--color-accent)] font-bold">✓</span>
                          )}
                          <span className="truncate">{log.filename}</span>
                        </span>
                        <span className={`shrink-0 text-[9px] font-mono ${log.isError ? 'text-amber-400 font-bold' : 'text-slate-500'}`}>
                          {log.isError ? 'Skipped' : `${log.targetDir}/`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Installation Success Result Card */}
          {mrPackResult && (
            <div className="bg-[var(--accent-dim)] border border-[var(--accent-border)] rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-[var(--color-accent)] font-minecraft font-bold text-sm">
                <WardenIcon name="check" size={16} className="text-[var(--color-accent)]" />
                <span>Modpack Installed Successfully!</span>
              </div>
              <p className="text-xs text-slate-200">
                Installed <strong>{mrPackResult.installedMods.length}</strong> files and <strong>{mrPackResult.installedOverrides.length}</strong> overrides from <strong>{mrPackResult.modpackName}</strong>. Server loader confirmed to <strong>{mrPackResult.loader.toUpperCase()} (MC {mrPackResult.mcVersion})</strong>.
              </p>
              {mrPackResult.failedFiles && mrPackResult.failedFiles.length > 0 && (
                <div className="text-[11px] text-amber-400 bg-amber-950/40 p-2 rounded border border-amber-800/40">
                  {mrPackResult.failedFiles.length} non-critical files could not be downloaded.
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Custom Global Confirm Modal */}
      <Modal
        isOpen={confirmDialog.open}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        title={confirmDialog.title}
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-slate-300 font-mono leading-relaxed">
            {confirmDialog.description}
          </p>
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button
              variant={confirmDialog.variant === 'primary' ? 'primary' : 'danger'}
              size="sm"
              onClick={() => {
                const action = confirmDialog.onConfirm;
                setConfirmDialog((prev) => ({ ...prev, open: false }));
                action();
              }}
            >
              {confirmDialog.confirmText || 'Confirm'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create Server Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Minecraft Server"
      >
        <form onSubmit={handleCreateServer} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Server Name</label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Survival SMP"
              className="w-full h-8 bg-[var(--bg-main)] hover:bg-[var(--bg-card)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 font-mono transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Server Type</label>
              <Dropdown
                options={CREATE_LOADER_OPTIONS}
                selectedId={createForm.loader}
                onSelect={(opt) => setCreateForm({ ...createForm, loader: opt.id as ServerLoader })}
                title="Select Server Software"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold uppercase text-slate-400">
                  {customVersionMode ? 'MC Version (Custom)' : 'MC Version'}
                </label>
                <button
                  type="button"
                  onClick={() => setCustomVersionMode(!customVersionMode)}
                  className="text-[10px] text-[var(--color-accent)] hover:underline font-mono"
                >
                  {customVersionMode ? 'Presets' : 'Custom'}
                </button>
              </div>

              {customVersionMode ? (
                <input
                  type="text"
                  required
                  value={createForm.mcVersion}
                  onChange={(e) => setCreateForm({ ...createForm, mcVersion: e.target.value })}
                  placeholder="e.g. 1.21.1, 26.2, 25w06a"
                  className="w-full h-8 bg-[var(--bg-main)] border border-[var(--color-border)] px-3 rounded-md text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/50 font-mono"
                />
              ) : (
                <Dropdown
                  options={createAvailableVersions}
                  selectedId={createForm.mcVersion}
                  onSelect={(opt) => setCreateForm({ ...createForm, mcVersion: opt.id })}
                  title={createLoadingVersions ? 'Fetching live versions...' : 'Select Minecraft Version'}
                  placeholder={createLoadingVersions ? 'Loading...' : 'Select Version'}
                  searchable={true}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Server Port</label>
              <NumberInput
                value={createForm.port}
                onChange={(val) => setCreateForm({ ...createForm, port: parseInt(val, 10) || 25565 })}
                min={1024}
                max={65535}
                step={1}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Min RAM (Heap)</label>
              <Dropdown
                options={CREATE_MIN_RAM_OPTIONS}
                selectedId={createForm.minMemory}
                onSelect={(opt) => setCreateForm({ ...createForm, minMemory: opt.id })}
                title="Minimum Heap (Xms)"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Max RAM (Heap)</label>
              <Dropdown
                options={CREATE_MAX_RAM_OPTIONS}
                selectedId={createForm.maxMemory}
                onSelect={(opt) => setCreateForm({ ...createForm, maxMemory: opt.id })}
                title="Maximum Heap (Xmx)"
              />
            </div>
          </div>

          {/* Custom Emerald Styled Checkbox */}
          <div
            onClick={() => setCreateForm((prev) => ({ ...prev, autoStart: !prev.autoStart }))}
            className="flex items-center gap-2.5 pt-1.5 cursor-pointer select-none group"
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                createForm.autoStart
                  ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[#0d0e11]'
                  : 'border-[var(--color-border)] bg-[var(--bg-main)] group-hover:border-[var(--color-accent)]/50'
              }`}
            >
              {createForm.autoStart && (
                <svg className="w-3 h-3 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-xs text-slate-300 group-hover:text-slate-100 transition-colors font-mono">
              Auto-start server immediately after installation
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--color-border)]">
            <Button variant="outline" size="sm" type="button" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={creatingServer}>
              <WardenIcon name="download" size={14} className="text-[#0d0e11]" />
              Install & Create Server
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Server Loader Modal */}
      <Modal
        isOpen={showChangeLoaderModal}
        onClose={() => setShowChangeLoaderModal(false)}
        title="Change Server Software & Loader"
      >
        <form onSubmit={handleChangeLoader} className="space-y-4">
          <div className="bg-[var(--bg-main)] p-3 rounded-lg border border-[var(--color-border)] text-xs text-slate-300 font-mono leading-relaxed">
            Switching modloaders will download the new server JAR and update your server configuration. If the server is currently running, it will be automatically stopped.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1 font-mono">New Software</label>
              <Dropdown
                options={CREATE_LOADER_OPTIONS}
                selectedId={newLoader}
                onSelect={(opt) => setNewLoader(opt.id as ServerLoader)}
                title="Select Modloader / Software"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1 font-mono">Minecraft Version</label>
              <Dropdown
                options={changeLoaderVersions}
                selectedId={newMcVersion}
                onSelect={(opt) => setNewMcVersion(opt.id)}
                title={loadingChangeVersions ? 'Fetching live versions...' : 'Select Minecraft Version'}
                placeholder={loadingChangeVersions ? 'Loading...' : 'Select Version'}
                searchable={true}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--color-border)]">
            <Button variant="outline" size="sm" type="button" onClick={() => setShowChangeLoaderModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={changingLoader}>
              <WardenIcon name="download" size={14} className="text-[#0d0e11]" />
              Switch & Install Software
            </Button>
          </div>
        </form>
      </Modal>

    </div>
  );
}
