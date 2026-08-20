import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { IconGlobe, IconTrash, IconSettings, IconShield, IconKey } from '../components/ui/Icons';
import { wardenApi } from '../services/api';

export const SettingsScreen: React.FC = () => {
  const { serverUrl, resetConfig, refreshServers } = useApp();
  const [deletingAll, setDeletingAll] = useState(false);

  const handleDisconnect = () => {
    Alert.alert('Disconnect Server', 'Are you sure you want to reset your connection and API credentials?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: resetConfig,
      },
    ]);
  };

  const handleDeleteAllMyServers = () => {
    Alert.alert(
      'Delete All My Servers',
      'Are you sure you want to permanently delete all Minecraft servers owned by your account? All worlds, configs, and player files will be destroyed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setDeletingAll(true);
            try {
              const res = await wardenApi.deleteAllMyServers();
              Alert.alert('Purge Complete', `Successfully deleted ${res.deletedCount || 0} servers.`);
              await refreshServers();
            } catch (err: any) {
              Alert.alert('Deletion Failed', err.message);
            } finally {
              setDeletingAll(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <IconSettings size={18} color="#34d399" />
          <Text style={styles.headerTitle}>CLIENT &amp; SYSTEM SETTINGS</Text>
        </View>
      </View>

      {/* Connection Info Card */}
      <Card
        title="WARDEN HOST CONNECTION"
        accent="emerald"
        icon={<IconGlobe size={15} color="#34d399" />}
      >
        <Text style={styles.label}>CONNECTED SERVER ENDPOINT</Text>
        <View style={styles.urlBox}>
          <Text style={styles.urlText} numberOfLines={1}>{serverUrl}</Text>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.label}>SESSION STATUS</Text>
          <View style={styles.liveStatusPill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveStatusText}>ACTIVE THIN CLIENT</Text>
          </View>
        </View>

        <Button
          title="DISCONNECT / CHANGE HOST"
          onPress={handleDisconnect}
          variant="outline"
          size="md"
          icon={<IconKey size={14} color="#94a3b8" />}
          style={styles.disconnectBtn}
        />
      </Card>

      {/* Danger Zone: Bulk Operations */}
      <Card
        title="DANGER ZONE: BULK OPERATIONS"
        accent="red"
        icon={<IconTrash size={15} color="#ef4444" />}
      >
        <Text style={styles.dangerLabel}>BATCH SERVER MANAGEMENT</Text>
        <Text style={styles.dangerDesc}>
          Permanently delete all Minecraft server instances owned by your account on this Warden host.
        </Text>

        <Button
          title={deletingAll ? 'DELETING ALL SERVERS...' : 'DELETE ALL MY SERVERS'}
          onPress={handleDeleteAllMyServers}
          disabled={deletingAll}
          variant="danger"
          size="md"
          icon={<IconTrash size={15} color="#ffffff" />}
          style={styles.dangerBtn}
        />
      </Card>

      {/* App Info Card */}
      <Card title="WARDEN MOBILE CLIENT INFO" icon={<IconShield size={15} color="#38bdf8" />}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Client Version</Text>
          <Text style={styles.infoValue}>1.0.0 (Dev Branch)</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Runtime Engine</Text>
          <Text style={styles.infoValue}>React Native + Hermes</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Architecture</Text>
          <Text style={styles.infoValue}>Android Native Thin-Client</Text>
        </View>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { padding: 16, paddingBottom: 28 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 1,
  },
  label: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748b',
    marginTop: 6,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  urlBox: {
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  urlText: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#34d399',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  liveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderColor: 'rgba(52, 211, 153, 0.35)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34d399',
  },
  liveStatusText: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: 'bold',
    color: '#34d399',
    letterSpacing: 0.5,
  },
  disconnectBtn: {
    marginTop: 6,
  },
  dangerLabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 4,
  },
  dangerDesc: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 16,
    marginBottom: 14,
  },
  dangerBtn: {
    width: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30, 41, 59, 0.4)',
  },
  infoLabel: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#64748b',
  },
  infoValue: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
});
