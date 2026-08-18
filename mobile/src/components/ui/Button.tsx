import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';

export interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
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

    if (disabled || loading) base = { ...base, opacity: 0.5 };

    return base;
  };

  const getTextStyle = (): TextStyle => {
    let base: TextStyle = styles.baseText;

    if (size === 'sm') base = { ...base, fontSize: 12 };
    else if (size === 'lg') base = { ...base, fontSize: 16 };

    if (variant === 'primary') base = { ...base, color: '#090d16' };
    else if (variant === 'secondary') base = { ...base, color: '#f8fafc' };
    else if (variant === 'danger') base = { ...base, color: '#ffffff' };
    else if (variant === 'outline') base = { ...base, color: '#f59e0b' };

    return base;
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[getContainerStyle(), style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'primary' ? '#090d16' : '#f59e0b'} />
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
    borderRadius: 0,
    gap: 8,
  },
  smContainer: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  lgContainer: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  primaryContainer: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b',
  },
  secondaryContainer: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  dangerContainer: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderColor: '#334155',
  },
  baseText: {
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
