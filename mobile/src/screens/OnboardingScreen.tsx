import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { IconShield } from '../components/ui/Icons';

export const OnboardingScreen: React.FC = () => {
  const { saveConfig } = useApp();
  const [url, setUrl] = useState<string>('https://warden.myhomelab.com');
  const [key, setKey] = useState<string>('warden_secret_key_change_me');
  const [connecting, setConnecting] = useState<boolean>(false);

  const handleConnect = async () => {
    if (!url.trim() || !key.trim()) {
      Alert.alert('Configuration Error', 'Please enter both your Warden Server Tunnel URL and API Key.');
      return;
    }

    setConnecting(true);
    const success = await saveConfig(url.trim(), key.trim());
    setConnecting(false);

    if (!success) {
      Alert.alert(
        'Connection Failed',
        'Could not connect to Warden server at the specified URL. Please check your Cloudflare Tunnel URL and API Key.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerContainer}>
          <View style={styles.iconContainer}>
            <IconShield size={36} color="#090d16" />
          </View>
          <Text style={styles.title}>WARDEN</Text>
          <Text style={styles.subtitle}>MINECRAFT SERVER & MOD OPS CLIENT</Text>
        </View>

        <Card title="SERVER CONNECTION SETTINGS" style={styles.card}>
          <View style={styles.formGroup}>
            <Text style={styles.label}>WARDEN SERVER TUNNEL URL</Text>
            <TextInput
              style={styles.input}
              value={url}
              onChangeText={setUrl}
              placeholder="https://warden.yourdomain.com"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>WARDEN API KEY</Text>
            <TextInput
              style={styles.input}
              value={key}
              onChangeText={setKey}
              placeholder="Enter Warden API Key..."
              placeholderTextColor="#475569"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>
              Authenticates thin-client calls to your Warden server.
            </Text>
          </View>

          <Button
            title="CONNECT TO WARDEN SERVER"
            onPress={handleConnect}
            variant="primary"
            size="lg"
            loading={connecting}
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
    marginBottom: 24,
  },
  iconContainer: {
    width: 60,
    height: 60,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
    color: '#94a3b8',
    letterSpacing: 1,
    marginTop: 4,
  },
  card: {
    width: '100%',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f8fafc',
    fontFamily: 'monospace',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
