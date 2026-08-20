import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, TouchableOpacity, RefreshControl } from 'react-native';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { IconSearch, IconBox, IconTrash, IconDownload, IconCheckCircle } from '../components/ui/Icons';
import { wardenApi } from '../services/api';
import { InstalledMod, ModrinthSearchItem } from '@warden/shared';

export const ModsScreen: React.FC = () => {
  const { selectedServerId, activeServer } = useApp();
  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ModrinthSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);

  const loadMods = async () => {
    if (!selectedServerId) return;
    setLoading(true);
    try {
      const data = await wardenApi.getInstalledMods(selectedServerId);
      setMods(data);
    } catch (err) {
      console.error('failed fetching mods', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMods();
  }, [selectedServerId]);

  const handleSearch = async () => {
    if (!selectedServerId || !query.trim()) return;
    setSearching(true);
    try {
      const results = await wardenApi.searchMods(selectedServerId, query.trim());
      setSearchResults(results);
    } catch (err: any) {
      Alert.alert('Search Error', err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleInstallMod = async (item: ModrinthSearchItem) => {
    if (!selectedServerId) return;
    setInstallingId(item.id);
    try {
      await wardenApi.installMod(selectedServerId, item.id, '');
      Alert.alert('Installed', `${item.title} has been installed with required dependencies.`);
      loadMods();
    } catch (err: any) {
      Alert.alert('Install Error', err.message);
    } finally {
      setInstallingId(null);
    }
  };

  const handleDeleteMod = async (filename: string) => {
    if (!selectedServerId) return;
    Alert.alert('Remove Mod', `Are you sure you want to remove ${filename}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await wardenApi.deleteMod(selectedServerId, filename);
            loadMods();
          } catch (err: any) {
            Alert.alert('Delete Failed', err.message);
          }
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={loadMods} tintColor="#34d399" />}
    >
      <Card title="MODRINTH REPOSITORY SEARCH" icon={<IconSearch size={16} color="#34d399" />}>
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            placeholder="Search mods & plugins (Sodium, Lithium)..."
            placeholderTextColor="#64748b"
            autoCapitalize="none"
          />
          <Button
            title="SEARCH"
            onPress={handleSearch}
            variant="primary"
            size="sm"
            loading={searching}
            icon={<IconSearch size={14} color="#090d16" />}
          />
        </View>
        <View style={styles.filterPill}>
          <Text style={styles.filterPillText}>
            FILTERED FOR: {activeServer?.detection.loader.toUpperCase()} • MC {activeServer?.detection.mcVersion || 'LATEST'}
          </Text>
        </View>
      </Card>

      {searchResults.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>MODRINTH RESULTS ({searchResults.length})</Text>
          </View>
          {searchResults.map((item) => {
            const isInstalling = installingId === item.id;
            return (
              <Card key={item.id} style={styles.resultCard}>
                <View style={styles.resultHeader}>
                  <View style={styles.resultTitleCol}>
                    <Text style={styles.modTitle}>{item.title}</Text>
                    <Text style={styles.modAuthor}>by {item.author}</Text>
                  </View>
                  <View style={styles.dlBadge}>
                    <IconDownload size={11} color="#34d399" />
                    <Text style={styles.dlText}>{item.downloads.toLocaleString()}</Text>
                  </View>
                </View>

                <Text style={styles.modDesc} numberOfLines={2}>
                  {item.description}
                </Text>

                <View style={styles.installRow}>
                  <View style={styles.compatPill}>
                    <IconCheckCircle size={12} color="#34d399" />
                    <Text style={styles.compatText}>Compatible</Text>
                  </View>
                  <Button
                    title={isInstalling ? 'INSTALLING...' : 'INSTALL MOD'}
                    onPress={() => handleInstallMod(item)}
                    variant="primary"
                    size="sm"
                    loading={isInstalling}
                    icon={<IconDownload size={13} color="#090d16" />}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>INSTALLED MODS ({mods.length})</Text>
          <Text style={styles.sectionSub}>Server JAR Files</Text>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.loadingText}>Loading installed mods...</Text>
          </View>
        ) : mods.length === 0 ? (
          <Card>
            <View style={styles.emptyState}>
              <IconBox size={32} color="#64748b" />
              <Text style={styles.emptyTitle}>No Mods Installed</Text>
              <Text style={styles.emptySub}>Search Modrinth above to install mods and plugins with 1 click.</Text>
            </View>
          </Card>
        ) : (
          mods.map((mod) => (
            <View key={mod.filename} style={styles.installedItem}>
              <View style={styles.installedLeft}>
                <View style={styles.modIconBox}>
                  <IconBox size={16} color="#34d399" />
                </View>
                <View style={styles.installedTextCol}>
                  <Text style={styles.filenameText} numberOfLines={1}>
                    {mod.filename}
                  </Text>
                  <Text style={styles.sizeText}>{(mod.size / (1024 * 1024)).toFixed(2)} MB</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteMod(mod.filename)}
                style={styles.deleteBtn}
                activeOpacity={0.7}
              >
                <IconTrash size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { padding: 16, paddingBottom: 28 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  searchInput: {
    flex: 1,
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#f8fafc',
    fontFamily: 'monospace',
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterPill: {
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderColor: 'rgba(52, 211, 153, 0.25)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  filterPillText: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: 'bold',
    color: '#34d399',
    letterSpacing: 0.5,
  },
  section: { marginTop: 16 },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  sectionSub: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#64748b',
  },
  resultCard: {
    marginBottom: 10,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  resultTitleCol: { flex: 1, marginRight: 8 },
  modTitle: { fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold', color: '#f8fafc' },
  modAuthor: { fontFamily: 'monospace', fontSize: 10, color: '#38bdf8', marginTop: 1 },
  dlBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dlText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#34d399',
  },
  modDesc: { fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', lineHeight: 16, marginBottom: 12 },
  installRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  compatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compatText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#34d399',
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: 6,
  },
  emptySub: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },
  loadingText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#64748b',
  },
  installedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0e1526',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  installedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  modIconBox: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  installedTextCol: {
    flex: 1,
  },
  filenameText: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  sizeText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
});
