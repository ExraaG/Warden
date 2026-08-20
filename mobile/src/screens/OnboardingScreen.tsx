import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { IconShield, IconGlobe, IconKey } from '../components/ui/Icons';

export const OnboardingScreen: React.FC = () => {
  const { saveConfig } = useApp();
  const [url, setUrl] = useState<string>('http://192.168.1.231:22313');
  const [key, setKey] = useState<string>('warden_secret_key_change_me');
  const [connecting, setConnecting] = useState<boolean>(false);

  const handleConnect = async () => {
    if (!url.trim() || !key.trim()) {
      Alert.alert('Configuration Error', 'Please enter both your Warden Server URL and API Key.');
      return;
    }

    setConnecting(true);
    const success = await saveConfig(url.trim(), key.trim());
    setConnecting(false);

    if (!success) {
      Alert.alert(
        'Connection Failed',
        'Could not connect to Warden server at the specified URL. Please check that Warden is running and reachable on your network (Port 22313).'
      );
    }
  };

  const handleApplyPreset = (presetUrl: string) => {
    setUrl(presetUrl);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerContainer}>
          <View style={styles.iconContainer}>
            <IconShield size={40} color="#34d399" />
          </View>
          <Text style={styles.title}>WARDEN</Text>
          <Text style={styles.subtitle}>MINECRAFT SERVER ORCHESTRATOR</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>MOBILE CLIENT</Text>
          </View>
        </View>

        <Card title="SERVER CONNECTION" accent="emerald" style={styles.card}>
          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <IconGlobe size={13} color="#34d399" />
              <Text style={styles.label}>WARDEN SERVER ENDPOINT</Text>
            </View>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={setUrl}
              placeholder="http://192.168.1.x:22313"
              placeholderTextColor="#64748b"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <View style={styles.presetRow}>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => handleApplyPreset('http://10.0.2.2:22313')}
              >
                <Text style={styles.presetText}>Emulator (10.0.2.2)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetBtn}
                onPress={() => handleApplyPreset('http://192.168.1.231:22313')}
              >
                <Text style={styles.presetText}>LAN Host (:22313)</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.formGroup}>
            <View style={styles.labelRow}>
              <IconKey size={13} color="#34d399" />
              <Text style={styles.label}>API AUTHENTICATION KEY</Text>
            </View>
            <TextInput
              style={styles.input}
              value={key}
              onChangeText={setKey}
              placeholder="Enter your Warden API key..."
              placeholderTextColor="#64748b"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Configured in Warden settings or environment.
            </Text>
          </View>

          <Button
            title={connecting ? 'AUTHENTICATING...' : 'CONNECT TO WARDEN'}
            onPress={handleConnect}
            variant="primary"
            size="lg"
            loading={connecting}
            icon={<IconShield size={18} color="#090d16" />}
            style={styles.submitBtn}
          />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#090d16' },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#090d16',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontFamily: 'monospace',
    fontSize: 28,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#34d399',
    letterSpacing: 1,
    marginTop: 4,
  },
  badge: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 8,
  },
  badgeText: {
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: 'bold',
    color: '#38bdf8',
    letterSpacing: 0.5,
  },
  card: {
    width: '100%',
  },
  formGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    color: '#f8fafc',
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  presetBtn: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderColor: '#334155',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  presetText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#94a3b8',
  },
  hint: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  submitBtn: {
    marginTop: 8,
  },
});
