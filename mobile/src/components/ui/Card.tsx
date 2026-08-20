import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';

export interface CardProps {
  title?: string;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: 'emerald' | 'amber' | 'red' | 'cyan' | 'none';
  children: React.ReactNode;
  style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({ title, badge, icon, accent = 'none', children, style }) => {
  const getAccentBorder = () => {
    switch (accent) {
      case 'emerald':
        return { borderTopColor: '#34d399', borderTopWidth: 2 };
      case 'amber':
        return { borderTopColor: '#f59e0b', borderTopWidth: 2 };
      case 'red':
        return { borderTopColor: '#ef4444', borderTopWidth: 2 };
      case 'cyan':
        return { borderTopColor: '#38bdf8', borderTopWidth: 2 };
      default:
        return {};
    }
  };

  return (
    <View style={[styles.container, getAccentBorder(), style]}>
      {title || badge || icon ? (
        <View style={styles.header}>
          <View style={styles.titleRow}>
            {icon}
            {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
          </View>
          {badge}
        </View>
      ) : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0e1526',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30, 41, 59, 0.7)',
    backgroundColor: 'rgba(11, 18, 33, 0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  body: {
    padding: 16,
  },
});
