import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import { Dropdown } from '../components/ui/Dropdown';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { IconPlay, IconStop, IconRefresh, IconAlert } from '../components/ui/Icons';
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
      Alert.alert('Update Job Complete', job.summary || 'Update finished');
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
        <Text style={styles.loadingText}>LOADING MINECRAFT SERVER TELEMETRY...</Text>
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
    if (bytes === 0) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(1)} GB`;
  };

  const formatUptime = (seconds: number) => {
    if (seconds === 0) return 'Offline';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m ${secs}s`;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
    >
      {/* Top Header & Server Switcher */}
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>SERVER MANAGER</Text>
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
            <Text style={styles.warningTitle}>HUMAN CONFIRMATION REQUIRED</Text>
            <Text style={styles.warningSub}>
              Loader/MC version unconfirmed. 4 AM automated updates are suspended.
            </Text>
          </View>
        </View>
      )}

      {/* Server Status Header */}
      <Card title="SERVER OVERVIEW">
        <View style={styles.serverInfoRow}>
          <View>
            <Text style={styles.serverName}>{activeServer.name}</Text>
            <Text style={styles.serverSub}>
              {activeServer.detection.loader.toUpperCase()} • {activeServer.detection.mcVersion || 'UNCONFIRMED'}
            </Text>
          </View>
          <Badge status={activeServer.status} />
        </View>

        {/* Action Controls */}
        <View style={styles.actionsGrid}>
          <Button
            title="START"
            onPress={() => handleAction('start')}
            variant="outline"
            size="sm"
            disabled={actionLoading || activeServer.status === 'online'}
            icon={<IconPlay size={14} color="#10b981" />}
            style={styles.actionBtn}
          />
          <Button
            title="STOP"
            onPress={() => handleAction('stop')}
            variant="outline"
            size="sm"
            disabled={actionLoading || activeServer.status === 'offline'}
            icon={<IconStop size={14} color="#ef4444" />}
            style={styles.actionBtn}
          />
          <Button
            title="RESTART"
            onPress={() => handleAction('restart')}
            variant="outline"
            size="sm"
            disabled={actionLoading}
            icon={<IconRefresh size={14} color="#06b6d4" />}
            style={styles.actionBtn}
          />
        </View>

        <Button
          title="UPDATE NOW"
          onPress={handleUpdateNow}
          variant="primary"
          size="md"
          disabled={actionLoading || !activeServer.detection.isConfirmed}
          style={styles.updateBtn}
        />
      </Card>

      {/* Telemetry Stats Grid */}
      <View style={styles.statsGrid}>
        <Card title="CPU UTILIZATION" style={styles.statCard}>
          <Text style={styles.statValue}>{stats.cpuPercent.toFixed(1)}%</Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.min(stats.cpuPercent, 100)}%` }]} />
          </View>
        </Card>

        <Card title="MEMORY USAGE" style={styles.statCard}>
          <Text style={styles.statValue}>{formatBytes(stats.memoryBytes)}</Text>
          <Text style={styles.statSub}>MAX: {formatBytes(stats.maxMemoryBytes)}</Text>
        </Card>

        <Card title="ONLINE PLAYERS" style={styles.statCard}>
          <Text style={styles.statValue}>
            {stats.onlinePlayers} <Text style={styles.statSub}>/ {stats.maxPlayers}</Text>
          </Text>
        </Card>

        <Card title="RUNTIME UPTIME" style={styles.statCard}>
          <Text style={styles.statValue}>{formatUptime(stats.uptimeSeconds)}</Text>
        </Card>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { padding: 16 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#090d16' },
  loadingText: { fontFamily: 'monospace', color: '#94a3b8', fontSize: 12 },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1,
  },
  warningBanner: {
    backgroundColor: '#451a03',
    borderColor: '#78350f',
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  warningTextContainer: { flex: 1 },
  warningTitle: { fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold', color: '#fbbf24' },
  warningSub: { fontFamily: 'monospace', fontSize: 10, color: '#fef3c7', marginTop: 2 },
  serverInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  serverName: { fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold', color: '#f8fafc' },
  serverSub: { fontFamily: 'monospace', fontSize: 11, color: '#f59e0b', marginTop: 2 },
  actionsGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  actionBtn: { flex: 1 },
  updateBtn: { width: '100%' },
  statsGrid: { gap: 4 },
  statCard: { marginBottom: 8 },
  statValue: { fontFamily: 'monospace', fontSize: 24, fontWeight: '900', color: '#f8fafc' },
  statSub: { fontFamily: 'monospace', fontSize: 11, color: '#64748b', marginTop: 2 },
  progressBarBg: { height: 6, backgroundColor: '#1e293b', marginTop: 8 },
  progressBarFill: { height: 6, backgroundColor: '#f59e0b' },
});
