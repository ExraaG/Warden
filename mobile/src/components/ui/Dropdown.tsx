import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, FlatList } from 'react-native';
import { IconChevronDown, IconCheck, IconServer } from './Icons';

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
          <IconServer size={14} color="#34d399" />
          <Text style={styles.buttonText} numberOfLines={1}>
            {selectedOption ? selectedOption.label : 'Select Server'}
          </Text>
        </View>
        <IconChevronDown size={16} color="#94a3b8" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.dropdownContainer} onStartShouldSetResponder={() => true}>
            <View style={styles.dropdownHeader}>
              <View style={styles.headerTitleRow}>
                <IconServer size={16} color="#34d399" />
                <Text style={styles.headerText}>SELECT ACTIVE SERVER</Text>
              </View>
              <Text style={styles.headerCount}>{options.length} INSTANCES</Text>
            </View>

            <FlatList
              data={options}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedId;
                return (
                  <TouchableOpacity
                    style={[styles.optionItem, isSelected && styles.optionSelected]}
                    activeOpacity={0.7}
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
                    {isSelected ? (
                      <View style={styles.checkBadge}>
                        <IconCheck size={14} color="#34d399" />
                      </View>
                    ) : null}
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
    backgroundColor: '#0e1526',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 160,
    gap: 8,
  },
  buttonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  buttonText: {
    fontFamily: 'monospace',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 15, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  dropdownContainer: {
    backgroundColor: '#0e1526',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 16,
    maxHeight: 380,
    overflow: 'hidden',
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#090d16',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    fontFamily: 'monospace',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#34d399',
    letterSpacing: 1,
  },
  headerCount: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: '#64748b',
    fontWeight: 'bold',
  },
  listContent: {
    padding: 8,
  },
  optionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    marginBottom: 4,
  },
  optionSelected: {
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
  },
  optionContent: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#e2e8f0',
  },
  labelSelected: {
    color: '#34d399',
  },
  optionSublabel: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
