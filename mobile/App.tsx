import React, { useState } from 'react';
import { SafeAreaView, View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { AppProvider, useApp } from './src/context/AppContext';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ModsScreen } from './src/screens/ModsScreen';
import { JobsScreen } from './src/screens/JobsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { IconDashboard, IconBox, IconHistory, IconSettings, IconShield } from './src/components/ui/Icons';

function MainApp() {
  const { isConfigured, loading } = useApp();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'mods' | 'jobs' | 'settings'>('dashboard');

  if (loading) {
    return (
      <View style={styles.splashContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#090d16" />
        <View style={styles.logoBox}>
          <IconShield size={40} color="#090d16" />
        </View>
        <Text style={styles.splashText}>WARDEN CLIENT LOADING...</Text>
      </View>
    );
  }

  if (!isConfigured) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#090d16" />
        <OnboardingScreen />
      </>
    );
  }

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen />;
      case 'mods':
        return <ModsScreen />;
      case 'jobs':
        return <JobsScreen />;
      case 'settings':
        return <SettingsScreen />;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#090d16" />
      <View style={styles.mainContainer}>
        {renderScreen()}

        {/* Bottom Navigation Bar */}
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navTab, activeTab === 'dashboard' && styles.activeNavTab]}
            onPress={() => setActiveTab('dashboard')}
          >
            <IconDashboard size={20} color={activeTab === 'dashboard' ? '#f59e0b' : '#64748b'} />
            <Text style={[styles.navText, activeTab === 'dashboard' && styles.activeNavText]}>OPS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'mods' && styles.activeNavTab]}
            onPress={() => setActiveTab('mods')}
          >
            <IconBox size={20} color={activeTab === 'mods' ? '#f59e0b' : '#64748b'} />
            <Text style={[styles.navText, activeTab === 'mods' && styles.activeNavText]}>MODS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'jobs' && styles.activeNavTab]}
            onPress={() => setActiveTab('jobs')}
          >
            <IconHistory size={20} color={activeTab === 'jobs' ? '#f59e0b' : '#64748b'} />
            <Text style={[styles.navText, activeTab === 'jobs' && styles.activeNavText]}>AUDIT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'settings' && styles.activeNavTab]}
            onPress={() => setActiveTab('settings')}
          >
            <IconSettings size={20} color={activeTab === 'settings' ? '#f59e0b' : '#64748b'} />
            <Text style={[styles.navText, activeTab === 'settings' && styles.activeNavText]}>SETTINGS</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#090d16' },
  mainContainer: { flex: 1, backgroundColor: '#090d16' },
  splashContainer: {
    flex: 1,
    backgroundColor: '#090d16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBox: {
    width: 64,
    height: 64,
    backgroundColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  splashText: { fontFamily: 'monospace', fontSize: 12, fontWeight: 'bold', color: '#94a3b8' },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingVertical: 8,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  activeNavTab: {
    backgroundColor: '#1e293b',
  },
  navText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748b',
    marginTop: 2,
  },
  activeNavText: {
    color: '#f59e0b',
  },
});
