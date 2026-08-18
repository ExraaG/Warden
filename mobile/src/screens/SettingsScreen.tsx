import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useApp } from '../context/AppContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export const SettingsScreen: React.FC = () => {
  const { serverUrl, resetConfig } = useApp();

  const handleDisconnect = () => {
    Alert.alert('Disconnect Server', 'Are you sure you want to reset connection credentials?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: resetConfig,
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Card title="WARDEN CLIENT CONNECTION">
        <Text style={styles.label}>CONNECTED SERVER TUNNEL URL</Text>
        <Text style={styles.val}>{serverUrl}</Text>

        <Text style={styles.label}>STATUS</Text>
        <Text style={styles.statusVal}>ACTIVE THIN CLIENT SESSION</Text>

        <Button
          title="DISCONNECT / RESET CREDENTIALS"
          onPress={handleDisconnect}
          variant="danger"
          size="md"
          style={styles.disconnectBtn}
        />
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090d16', padding: 16 },
  label: { fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', color: '#64748b', marginTop: 8 },
  val: { fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold', color: '#f8fafc', marginTop: 2 },
  statusVal: { fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', color: '#34d399', marginTop: 2 },
  disconnectBtn: { marginTop: 20 },
});
