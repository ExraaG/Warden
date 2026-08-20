import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ServerStatus } from '@warden/shared';

export interface BadgeProps {
  status?: ServerStatus | 'unconfirmed' | 'confirmed' | 'running' | 'success' | 'rolled_back' | 'skipped' | 'failed' | 'stopping';
  label?: string;
}

export const Badge: React.FC<BadgeProps> = ({ status = 'online', label }) => {
  const textLabel = label || status.toUpperCase();

  const getColors = () => {
    switch (status) {
      case 'online':
      case 'success':
      case 'confirmed':
        return { bg: 'rgba(6, 78, 59, 0.6)', text: '#34d399', border: 'rgba(52, 211, 153, 0.4)' };
      case 'starting':
        return { bg: 'rgba(8, 51, 68, 0.6)', text: '#38bdf8', border: 'rgba(56, 189, 248, 0.4)' };
      case 'stopping':
      case 'updating':
      case 'running':
      case 'unconfirmed':
        return { bg: 'rgba(69, 26, 3, 0.6)', text: '#fbbf24', border: 'rgba(251, 191, 36, 0.4)' };
      case 'error':
      case 'failed':
        return { bg: 'rgba(69, 10, 10, 0.6)', text: '#f87171', border: 'rgba(248, 113, 113, 0.4)' };
      case 'rolled_back':
        return { bg: 'rgba(59, 7, 100, 0.6)', text: '#c084fc', border: 'rgba(192, 132, 252, 0.4)' };
      default:
        return { bg: 'rgba(30, 41, 59, 0.6)', text: '#94a3b8', border: 'rgba(71, 85, 105, 0.4)' };
    }
  };

  const colors = getColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.text, { color: colors.text }]}>{textLabel}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderWidth: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.6,
  },
});
