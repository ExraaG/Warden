import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ServerStatus } from '@warden/shared';

export interface BadgeProps {
  status?: ServerStatus | 'unconfirmed' | 'confirmed' | 'running' | 'success' | 'rolled_back' | 'skipped' | 'failed';
  label?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status = 'online', label }) => {
  const textLabel = label || status.toUpperCase();

  const getColors = () => {
    switch (status) {
      case 'online':
      case 'success':
      case 'confirmed':
        return { bg: '#064e3b', text: '#34d399', border: '#065f46', dot: '#34d399' };
      case 'starting':
        return { bg: '#083344', text: '#38bdf8', border: '#075985', dot: '#38bdf8' };
      case 'updating':
      case 'running':
      case 'unconfirmed':
        return { bg: '#451a03', text: '#fbbf24', border: '#78350f', dot: '#fbbf24' };
      case 'error':
      case 'failed':
        return { bg: '#450a0a', text: '#f87171', border: '#7f1d1d', dot: '#f87171' };
      case 'rolled_back':
        return { bg: '#3b0764', text: '#c084fc', border: '#581c87', dot: '#c084fc' };
      default:
        return { bg: '#1e293b', text: '#94a3b8', border: '#334155', dot: '#64748b' };
    }
  };

  const colors = getColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      <Text style={[styles.text, { color: colors.text }]}>{textLabel}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 0,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
