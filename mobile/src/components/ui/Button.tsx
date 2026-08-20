import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'cyan' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  style,
}) => {
  const getContainerStyle = (): ViewStyle => {
    let base: ViewStyle = styles.baseContainer;

    if (size === 'sm') base = { ...base, ...styles.smContainer };
    else if (size === 'lg') base = { ...base, ...styles.lgContainer };

    if (variant === 'primary') base = { ...base, ...styles.primaryContainer };
    else if (variant === 'secondary') base = { ...base, ...styles.secondaryContainer };
    else if (variant === 'danger') base = { ...base, ...styles.dangerContainer };
    else if (variant === 'outline') base = { ...base, ...styles.outlineContainer };
    else if (variant === 'cyan') base = { ...base, ...styles.cyanContainer };
    else if (variant === 'amber') base = { ...base, ...styles.amberContainer };

    if (disabled || loading) base = { ...base, opacity: 0.45 };

    return base;
  };

  const getTextStyle = (): TextStyle => {
    let base: TextStyle = styles.baseText;

    if (size === 'sm') base = { ...base, fontSize: 11 };
    else if (size === 'lg') base = { ...base, fontSize: 15 };

    if (variant === 'primary') base = { ...base, color: '#090d16' };
    else if (variant === 'secondary') base = { ...base, color: '#f8fafc' };
    else if (variant === 'danger') base = { ...base, color: '#ffffff' };
    else if (variant === 'outline') base = { ...base, color: '#94a3b8' };
    else if (variant === 'cyan') base = { ...base, color: '#090d16' };
    else if (variant === 'amber') base = { ...base, color: '#090d16' };

    return base;
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[getContainerStyle(), style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' || variant === 'cyan' || variant === 'amber' ? '#090d16' : '#34d399'} />
      ) : (
        <>
          {icon}
          <Text style={getTextStyle()}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  baseContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 10,
    gap: 8,
  },
  smContainer: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  lgContainer: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
    gap: 10,
  },
  primaryContainer: {
    backgroundColor: '#34d399',
    borderColor: '#34d399',
  },
  secondaryContainer: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  dangerContainer: {
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
  },
  outlineContainer: {
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderColor: '#334155',
  },
  cyanContainer: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },
  amberContainer: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  baseText: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
