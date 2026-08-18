import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wardenApi } from '../services/api';
import { WardenServer } from '@warden/shared';

interface AppContextType {
  serverUrl: string;
  apiKey: string;
  isConfigured: boolean;
  servers: WardenServer[];
  selectedServerId: string;
  activeServer: WardenServer | null;
  loading: boolean;
  saveConfig: (url: string, key: string) => Promise<boolean>;
  setSelectedServerId: (id: string) => void;
  refreshServers: () => Promise<void>;
  resetConfig: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serverUrl, setServerUrl] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [servers, setServers] = useState<WardenServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadCredentials();
  }, []);

  const loadCredentials = async () => {
    try {
      const url = await AsyncStorage.getItem('warden_server_url');
      const key = await AsyncStorage.getItem('warden_api_key');
      const savedServerId = await AsyncStorage.getItem('warden_active_server_id');

      if (url && key) {
        if (url.includes('192.168.1.100')) {
          await AsyncStorage.multiRemove(['warden_server_url', 'warden_api_key', 'warden_active_server_id']);
          setIsConfigured(false);
          setLoading(false);
          return;
        }

        setServerUrl(url);
        setApiKey(key);
        wardenApi.setConfig(url, key);
        setIsConfigured(true);

        const serverList = await wardenApi.getServers().catch(() => []);
        setServers(serverList);

        if (serverList.length > 0) {
          const targetId = savedServerId && serverList.some((s) => s.id === savedServerId)
            ? savedServerId
            : serverList[0].id;
          setSelectedServerId(targetId);
        }
      }
    } catch (err) {
      console.error('[AppContext] Failed to load credentials:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (url: string, key: string): Promise<boolean> => {
    setLoading(true);
    try {
      const cleanUrl = url.trim().replace(/\/+$/, '');
      wardenApi.setConfig(cleanUrl, key);
      const isHealthy = await wardenApi.checkHealth();

      if (!isHealthy) {
        setLoading(false);
        return false;
      }

      await AsyncStorage.setItem('warden_server_url', cleanUrl);
      await AsyncStorage.setItem('warden_api_key', key);
      setServerUrl(cleanUrl);
      setApiKey(key);
      setIsConfigured(true);

      const serverList = await wardenApi.getServers();
      setServers(serverList);
      if (serverList.length > 0) {
        setSelectedServerId(serverList[0].id);
        await AsyncStorage.setItem('warden_active_server_id', serverList[0].id);
      }
      return true;
    } catch (err) {
      console.error('[AppContext] Failed saving config:', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const selectServer = (id: string) => {
    setSelectedServerId(id);
    AsyncStorage.setItem('warden_active_server_id', id).catch(() => {});
  };

  const refreshServers = async () => {
    if (!isConfigured) return;
    try {
      const list = await wardenApi.getServers();
      setServers(list);
    } catch (err) {
      console.error('[AppContext] Error refreshing servers:', err);
    }
  };

  const resetConfig = async () => {
    await AsyncStorage.multiRemove(['warden_server_url', 'warden_api_key', 'warden_active_server_id']);
    setServerUrl('');
    setApiKey('');
    setIsConfigured(false);
    setServers([]);
    setSelectedServerId('');
  };

  const activeServer = servers.find((s) => s.id === selectedServerId) || null;

  return (
    <AppContext.Provider
      value={{
        serverUrl,
        apiKey,
        isConfigured,
        servers,
        selectedServerId,
        activeServer,
        loading,
        saveConfig,
        setSelectedServerId: selectServer,
        refreshServers,
        resetConfig,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
