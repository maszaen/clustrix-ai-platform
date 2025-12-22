import React, { useState } from 'react';
import { View, Text, Modal, FlatList, Pressable, TouchableWithoutFeedback, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

// Dropdown Select Component
export default function DropdownSelect({ label, value, options, onSelect }) {
  const [visible, setVisible] = useState(false);
  const selected = options.find(o => o.id === value);

  return (
    <View>
      <Pressable style={styles.dropdown} onPress={() => setVisible(true)} android_ripple={{ color: 'rgba(255,255,255,0.1)' }}>
        <Text style={styles.dropdownText}>{selected?.name || 'Select...'}</Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.fgMuted} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.dropdownModal}>
                <Text style={styles.dropdownModalTitle}>{label}</Text>
                <FlatList
                  data={options}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <Pressable
                      style={[styles.dropdownItem, item.id === value && styles.dropdownItemActive]}
                      onPress={() => { onSelect(item); setVisible(false); }}
                      android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                    >
                      <View>
                        <Text style={[styles.dropdownItemText, item.id === value && styles.dropdownItemTextActive]}>
                          {item.name}
                        </Text>
                        {item.desc && (
                            <Text style={styles.dropdownItemDesc}>{item.desc}</Text>
                        )}
                      </View>
                      {item.id === value && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                    </Pressable>
                  )}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  dropdownText: { color: COLORS.fg, fontSize: 14, fontFamily: FONTS.sans },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  dropdownModal: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    maxHeight: 400,
    overflow: 'hidden',
  },
  dropdownModalTitle: {
    color: COLORS.fg,
    fontSize: 16,
    fontWeight: '600',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    
  },
  dropdownItemActive: {},
  dropdownItemText: { color: COLORS.fgMuted, fontSize: 14, fontFamily: FONTS.sans },
  dropdownItemTextActive: { color: COLORS.fg, fontWeight: '500' },
  dropdownItemDesc: { color: COLORS.fgMuted, fontSize: 11, marginTop: 2, marginRight: 10, maxWidth: 250 },
});
