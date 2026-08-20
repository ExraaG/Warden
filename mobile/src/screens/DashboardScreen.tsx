import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';
import { Dropdown } from '../components/ui/Dropdown';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import {
  IconPlay,
  IconStop,
  IconRefresh,
  IconAlert,
  IconCpu,
  IconMemory,
  IconUsers,
  IconClock,
  IconDownload,
  IconShield,
} from '../components/ui/Icons';
import { wardenApi } from '../services/api';

export const DashboardScreen: React.FC = () => {
  const { servers, selectedServerId, setSelectedServerId, activeServer, refreshServers } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const dropdownOptions = servers.map((s) => ({
    id: s.id,
    label: s.name,
    sublabel: `${s.detection.loader.toUpperCase()} • ${s.detection.mcVersion || 'Unknown MC'}`,
  }));

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshServers();
    setRefreshing(false);
  };

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!selectedServerId) return;
    setActionLoading(true);
    try {
      await wardenApi.sendAction(selectedServerId, action);
      await refreshServers();
    } catch (err: any) {
      Alert.alert('Action Error', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateNow = async () => {
    if (!selectedServerId) return;
    setActionLoading(true);
    try {
      const job = await wardenApi.triggerUpdateNow(selectedServerId);
      Alert.alert('Update Complete', job.summary || 'Server mods updated successfully.');
      await refreshServers();
    } catch (err: any) {
      Alert.alert('Update Failed', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (!activeServer) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.splashIconBox}>
          <IconShield size={36} color="#34d399" />
        </View>
        <Text style={styles.loadingText}>CONNECTING TO WARDEN HOST...</Text>
        <Text style={styles.loadingSubText}>Retrieving Minecraft telemetry</Text>
      </View>
    );
  }

  const stats = activeServer.stats || {
    cpuPercent: 0,
    memoryBytes: 0,
    maxMemoryBytes: 0,
    onlinePlayers: 0,
    maxPlayers: 20,
    uptimeSeconds: 0,
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0.0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const memoryPercent = stats.maxMemoryBytes > 0
    ? Math.min(Math.round((stats.memoryBytes / stats.maxMemoryBytes) * 100), 100)
    : 0;

  const formatUptime = (seconds: number) => {
    if (seconds === 0) return 'Offline';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    if (mins > 0) return `${mins}m`;
    return `${seconds}s`;
  };

  const getCpuColor = (percent: number) => {
    if (percent > 85) return '#ef4444';
    if (percent > 65) return '#f59e0b';
    return '#34d399';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#34d399" />}
    >
      {/* Top Header & Server Switcher */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <IconShield size={18} color="#34d399" />
          </View>
          <View>
            <Text style={styles.brandTitle}>WARDEN</Text>
            <Text style={styles.brandSub}>MOBILE OPS</Text>
          </View>
        </View>
        <Dropdown
          options={dropdownOptions}
          selectedId={selectedServerId}
          onSelect={setSelectedServerId}
        />
      </View>

      {/* Unconfirmed Warning */}
      {!activeServer.detection.isConfirmed && (
        <View style={styles.warningBanner}>
          <IconAlert size={20} color="#f59e0b" />
          <View style={styles.warningTextContainer}>
            <Text style={styles.warningTitle}>LOADER UNCONFIRMED</Text>
            <Text style={styles.warningSub}>
              MC {activeServer.detection.mcVersion || '1.21.1'} ({activeServer.detection.loader}) requires manual confirmation in web console.
            </Text>
          </View>
        </View>
      )}

      {/* Main Server Status & Controls Card */}
      <Card
        accent={activeServer.status === 'online' ? 'emerald' : 'none'}
        title="SERVER ORCHESTRATION"
        badge={<Badge status={activeServer.status} />}
      >
        <View style={styles.serverInfoRow}>
          <View style={styles.serverInfoLeft}>
            <Text style={styles.serverName}>{activeServer.name}</Text>
            <View style={styles.tagRow}>
              <View style={styles.pillTag}>
                <Text style={styles.pillTagText}>{activeServer.detection.loader.toUpperCase()}</Text>
              </View>
              <View style={[styles.pillTag, styles.pillTagVersion]}>
                <Text style={styles.pillTagVersionText}>{activeServer.detection.mcVersion || '1.21.1'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Power Actions Grid */}
        <View style={styles.actionsGrid}>
          <Button
            title="START"
            onPress={() => handleAction('start')}
            variant="primary"
            size="sm"
            disabled={actionLoading || activeServer.status === 'online'}
            icon={<IconPlay size={14} color="#090d16" />}
            style={styles.actionBtn}
          />
          <Button
            title="STOP"
            onPress={() => handleAction('stop')}
            variant="danger"
            size="sm"
            disabled={actionLoading || activeServer.status === 'offline'}
            icon={<IconStop size={14} color="#ffffff" />}
            style={styles.actionBtn}
          />
          <Button
            title="RESTART"
            onPress={() => handleAction('restart')}
            variant="cyan"
            size="sm"
            disabled={actionLoading}
            icon={<IconRefresh size={14} color="#090d16" />}
            style={styles.actionBtn}
          />
        </View>

        <Button
          title="TRIGGER MODPACK UPDATE"
          onPress={handleUpdateNow}
          variant="secondary"
          size="md"
          disabled={actionLoading || !activeServer.detection.isConfirmed}
          icon={<IconDownload size={15} color="#34d399" />}
          style={styles.updateBtn}
        />
      </Card>

      {/* Telemetry Metrics Grid */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeaderTitle}>REAL-TIME TELEMETRY</Text>
        <Text style={styles.liveIndicator}>LIVE</Text>
      </View>

      <View style={styles.statsGrid}>
        {/* CPU Utilization */}
        <View style={styles.statBox}>
          <View style={styles.statHeader}>
            <IconCpu size={16} color={getCpuColor(stats.cpuPercent)} />
            <Text style={styles.statLabel}>CPU LOAD</Text>
          </View>
          <Text style={[styles.statValue, { color: getCpuColor(stats.cpuPercent) }]}>
            {stats.cpuPercent.toFixed(1)}%
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${Math.min(stats.cpuPercent, 100)}%`, backgroundColor: getCpuColor(stats.cpuPercent) },
              ]}
            />
          </View>
        </View>

        {/* Memory Allocation */}
        <View style={styles.statBox}>
          <View style={styles.statHeader}>
            <IconMemory size={16} color="#38bdf8" />
            <Text style={styles.statLabel}>MEMORY (RAM)</Text>
          </View>
          <Text style={styles.statValue}>{formatBytes(stats.memoryBytes)}</Text>
          <Text style={styles.statSubText}>
            {memoryPercent}% of {formatBytes(stats.maxMemoryBytes)}
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${memoryPercent}%`, backgroundColor: '#38bdf8' },
              ]}
            />
          </View>
        </View>
      </View>

      <View style={styles.statsGrid}>
        {/* Online Players */}
        <View style={styles.statBox}>
          <View style={styles.statHeader}>
            <IconUsers size={16} color="#a855f7" />
            <Text style={styles.statLabel}>PLAYERS</Text>
          </View>
          <Text style={styles.statValue}>
            {stats.onlinePlayers}{' '}
            <Text style={styles.statSubText}>/ {stats.maxPlayers}</Text>
          </Text>
          <Text style={styles.statSubText}>Active Connections</Text>
        </View>

        {/* Uptime */}
        <View style={styles.statBox}>
          <View style={styles.statHeader}>
            <IconClock size={16} color="#94a3b8" />
            <Text style={styles.statLabel}>UPTIME</Text>
          </View>
          <Text style={styles.statValue}>{formatUptime(stats.uptimeSeconds)}</Text>
          <Text style={styles.statSubText}>Continuous Run</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { padding: 16, paddingBottom: 28 },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#090d16',
    padding: 24,
  },
  splashIconBox: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  loadingText: {
    fontFamily: 'monospace',
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  loadingSubText: {
    fontFamily: 'monospace',
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTitle: {
    fontFamily: 'monospace',
    fontSize: 15,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1.5,
  },
  brandSub: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: 'bold',
    color: '#34d399',
    letterSpacing: 1,
  },
  warningBanner: {
    backgroundColor: 'rgba(69, 26, 3, 0.6)',
    borderColor: 'rgba(245, 158, 11, 0.5)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  warningTextContainer: { flex: 1 },
  warningTitle: { fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold', color: '#fbbf24' },
  warningSub: { fontFamily: 'monospace', fontSize: 10, color: '#fef3c7', marginTop: 2, lineHeight: 14 },
  serverInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  serverInfoLeft: { flex: 1 },
  serverName: { fontFamily: 'monospace', fontSize: 20, fontWeight: '900', color: '#f8fafc', letterSpacing: 0.5 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  pillTag: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillTagText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#34d399',
  },
  pillTagVersion: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  pillTagVersionText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#38bdf8',
  },
  actionsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  actionBtn: { flex: 1 },
  updateBtn: { width: '100%' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 6,
    paddingHorizontal: 2,
  },
  sectionHeaderTitle: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  liveIndicator: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#34d399',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#0e1526',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    justifyContent: 'space-between',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statLabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  statValue: {
    fontFamily: 'monospace',
    fontSize: 20,
    fontWeight: '900',
    color: '#f8fafc',
  },
  statSubText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 4,
    borderRadius: 2,
  },
});
