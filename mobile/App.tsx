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
        <View style={styles.splashIconBox}>
          <IconShield size={44} color="#34d399" />
        </View>
        <Text style={styles.splashTitle}>WARDEN</Text>
        <Text style={styles.splashSub}>MINECRAFT SERVER ORCHESTRATOR</Text>
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
        <View style={styles.screenWrapper}>
          {renderScreen()}
        </View>

        {/* Bottom Navigation Bar */}
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navTab, activeTab === 'dashboard' && styles.activeNavTab]}
            onPress={() => setActiveTab('dashboard')}
            activeOpacity={0.7}
          >
            <IconDashboard size={20} color={activeTab === 'dashboard' ? '#34d399' : '#64748b'} />
            <Text style={[styles.navText, activeTab === 'dashboard' && styles.activeNavText]}>OPS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'mods' && styles.activeNavTab]}
            onPress={() => setActiveTab('mods')}
            activeOpacity={0.7}
          >
            <IconBox size={20} color={activeTab === 'mods' ? '#34d399' : '#64748b'} />
            <Text style={[styles.navText, activeTab === 'mods' && styles.activeNavText]}>MODS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'jobs' && styles.activeNavTab]}
            onPress={() => setActiveTab('jobs')}
            activeOpacity={0.7}
          >
            <IconHistory size={20} color={activeTab === 'jobs' ? '#34d399' : '#64748b'} />
            <Text style={[styles.navText, activeTab === 'jobs' && styles.activeNavText]}>AUDIT</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navTab, activeTab === 'settings' && styles.activeNavTab]}
            onPress={() => setActiveTab('settings')}
            activeOpacity={0.7}
          >
            <IconSettings size={20} color={activeTab === 'settings' ? '#34d399' : '#64748b'} />
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
  screenWrapper: { flex: 1 },
  splashContainer: {
    flex: 1,
    backgroundColor: '#090d16',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  splashIconBox: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  splashTitle: {
    fontFamily: 'monospace',
    fontSize: 24,
    fontWeight: '900',
    color: '#f8fafc',
    letterSpacing: 2,
  },
  splashSub: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#34d399',
    letterSpacing: 1,
    marginTop: 4,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#0b111e',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 6,
  },
  navTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
  },
  activeNavTab: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.35)',
  },
  navText: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#64748b',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  activeNavText: {
    color: '#34d399',
  },
});
