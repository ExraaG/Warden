import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, FlatList } from 'react-native';
import { IconChevronDown, IconCheck } from './Icons';

export interface DropdownOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface DropdownProps {
  options: DropdownOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const Dropdown: React.FC<DropdownProps> = ({ options, selectedId, onSelect }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const selectedOption = options.find((o) => o.id === selectedId) || options[0];

  return (
    <View>
      <TouchableOpacity
        style={styles.button}
        activeOpacity={0.8}
        onPress={() => setModalVisible(true)}
      >
        <View style={styles.buttonLeft}>
          <View style={styles.indicator} />
          <Text style={styles.buttonText} numberOfLines={1}>
            {selectedOption ? selectedOption.label : 'Select Server'}
          </Text>
        </View>
        <IconChevronDown size={18} color="#94a3b8" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.dropdownContainer}>
            <Text style={styles.dropdownHeader}>SELECT MINECRAFT SERVER</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedId;
                return (
                  <TouchableOpacity
                    style={[styles.optionItem, isSelected && styles.optionSelected]}
                    onPress={() => {
                      onSelect(item.id);
                      setModalVisible(false);
                    }}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[styles.optionLabel, isSelected && styles.labelSelected]}>
                        {item.label}
                      </Text>
                      {item.sublabel ? (
                        <Text style={styles.optionSublabel}>{item.sublabel}</Text>
                      ) : null}
                    </View>
                    {isSelected && <IconCheck size={18} color="#f59e0b" />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 160,
  },
  buttonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  indicator: {
    width: 6,
    height: 6,
    backgroundColor: '#f59e0b',
  },
  buttonText: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  dropdownContainer: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    maxHeight: 320,
  },
  dropdownHeader: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#94a3b8',
    backgroundColor: '#090d16',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    letterSpacing: 1,
  },
  optionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  optionSelected: {
    backgroundColor: '#1e293b',
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#e2e8f0',
  },
  labelSelected: {
    color: '#f59e0b',
    fontWeight: 'bold',
  },
  optionSublabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
});
