import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { IconSearch, IconBox, IconTrash } from '../components/ui/Icons';
import { wardenApi } from '../services/api';
import { InstalledMod, ModrinthSearchItem } from '@warden/shared';

export const ModsScreen: React.FC = () => {
  const { selectedServerId, activeServer } = useApp();
  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ModrinthSearchItem[]>([]);
  const [searching, setSearching] = useState(false);

  const loadMods = async () => {
    if (!selectedServerId) return;
    setLoading(true);
    try {
      const data = await wardenApi.getInstalledMods(selectedServerId);
      setMods(data);
    } catch (err) {
      console.error('Error fetching mods:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMods();
  }, [selectedServerId]);

  const handleSearch = async () => {
    if (!selectedServerId) return;
    setSearching(true);
    try {
      const results = await wardenApi.searchMods(selectedServerId, query);
      setSearchResults(results);
    } catch (err: any) {
      Alert.alert('Search Error', err.message);
    } finally {
      setSearching(false);
    }
  };

  const handleInstallMod = async (item: ModrinthSearchItem) => {
    if (!selectedServerId) return;
    Alert.alert(
      'Install Mod',
      `Install ${item.title} and all required dependencies for ${activeServer?.detection.loader}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Install',
          onPress: async () => {
            try {
              await wardenApi.installMod(selectedServerId, item.id, '');
              Alert.alert('Success', `${item.title} installed successfully!`);
              loadMods();
            } catch (err: any) {
              Alert.alert('Install Failed', err.message);
            }
          },
        },
      ]
    );
  };

  const handleDeleteMod = async (filename: string) => {
    if (!selectedServerId) return;
    Alert.alert('Remove Mod', `Remove ${filename} from server?`, [
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Search Header */}
      <Card title="MODRINTH SEARCH">
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search mods (Sodium, Waystones)..."
            placeholderTextColor="#475569"
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
        <Text style={styles.searchSub}>
          FILTERED BY: {activeServer?.detection.loader.toUpperCase()} • MC {activeServer?.detection.mcVersion || 'ANY'}
        </Text>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SEARCH RESULTS ({searchResults.length})</Text>
          {searchResults.map((item) => (
            <Card key={item.id}>
              <Text style={styles.modTitle}>{item.title}</Text>
              <Text style={styles.modAuthor}>by {item.author}</Text>
              <Text style={styles.modDesc} numberOfLines={2}>{item.description}</Text>

              <View style={styles.installRow}>
                <Text style={styles.modMeta}>{item.downloads.toLocaleString()} DLs</Text>
                <Button
                  title="INSTALL"
                  onPress={() => handleInstallMod(item)}
                  variant="primary"
                  size="sm"
                />
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* Installed Mods */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>INSTALLED MODS ({mods.length})</Text>
        {loading ? (
          <Text style={styles.loadingText}>LOADING INSTALLED MODS...</Text>
        ) : mods.length === 0 ? (
          <Card>
            <Text style={styles.loadingText}>No mod .jar files found on server.</Text>
          </Card>
        ) : (
          mods.map((mod) => (
            <Card key={mod.filename}>
              <View style={styles.installedRow}>
                <View style={styles.installedInfo}>
                  <View style={styles.filenameRow}>
                    <IconBox size={16} color="#f59e0b" />
                    <Text style={styles.filenameText} numberOfLines={1}>{mod.filename}</Text>
                  </View>
                  <Text style={styles.sizeText}>{(mod.size / (1024 * 1024)).toFixed(2)} MB</Text>
                </View>
                <TouchableOpacity onPress={() => handleDeleteMod(mod.filename)} style={styles.deleteBtn}>
                  <IconTrash size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16' },
  content: { padding: 16 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f8fafc',
    fontFamily: 'monospace',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchSub: { fontFamily: 'monospace', fontSize: 10, color: '#64748b' },
  section: { marginTop: 12 },
  sectionTitle: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94a3b8',
    marginBottom: 8,
    letterSpacing: 1,
  },
  modTitle: { fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold', color: '#f8fafc' },
  modAuthor: { fontFamily: 'monospace', fontSize: 10, color: '#f59e0b', marginTop: 1 },
  modDesc: { fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', marginTop: 4 },
  installRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  modMeta: { fontFamily: 'monospace', fontSize: 10, color: '#64748b' },
  loadingText: { fontFamily: 'monospace', fontSize: 12, color: '#64748b', textAlign: 'center', paddingVertical: 12 },
  installedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  installedInfo: { flex: 1 },
  filenameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filenameText: { fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', color: '#f8fafc', flex: 1 },
  sizeText: { fontFamily: 'monospace', fontSize: 10, color: '#64748b', marginTop: 2 },
  deleteBtn: { padding: 8 },
});
