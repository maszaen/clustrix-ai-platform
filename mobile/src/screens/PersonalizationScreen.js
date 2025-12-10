import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import SlideLeftModal from '../components/SlideLeftModal';
import AccountScreen from './AccountScreen';

const LANGUAGES = [
  { id: 'autodetect', name: 'Auto-detect' },
  { id: 'english', name: 'English' },
  { id: 'indonesia', name: 'Indonesian' },
];

// Dropdown Select Component
function DropdownSelect({ label, value, options, onSelect }) {
  const [visible, setVisible] = useState(false);
  const selected = options.find(o => o.id === value);

  return (
    <View>
      <TouchableOpacity style={styles.dropdown} onPress={() => setVisible(true)}>
        <Text style={styles.dropdownText}>{selected?.name || 'Select...'}</Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.fgMuted} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.dropdownItem, item.id === value && styles.dropdownItemActive]}
                  onPress={() => { onSelect(item); setVisible(false); }}
                >
                  <Text style={[styles.dropdownItemText, item.id === value && styles.dropdownItemTextActive]}>
                    {item.name}
                  </Text>
                  {item.id === value && <Ionicons name="checkmark" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Custom Instructions Content (rendered inside SlideLeftModal)
function CustomInstructionsContent({ settings, onUpdate, onClose }) {
  const [persona, setPersona] = useState(settings.persona || { name: '', work: '', prefs: '' });
  const [language, setLanguage] = useState(settings.language || 'autodetect');

  const handleSave = () => {
    onUpdate({ persona, language });
    Alert.alert('Saved', 'Custom instructions saved');
    onClose();
  };

  return (
    <ScrollView style={styles.subContainer} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Name</Text>
        <TextInput
          style={styles.input}
          value={persona.name}
          onChangeText={(text) => setPersona({ ...persona, name: text })}
          placeholder="What should I call you?"
          placeholderTextColor={COLORS.fgMuted}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Work</Text>
        <TextInput
          style={styles.input}
          value={persona.work}
          onChangeText={(text) => setPersona({ ...persona, work: text })}
          placeholder="What do you do? (e.g., Software Engineer)"
          placeholderTextColor={COLORS.fgMuted}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={persona.prefs}
          onChangeText={(text) => setPersona({ ...persona, prefs: text })}
          placeholder="How should I respond? (e.g., Be concise, use examples)"
          placeholderTextColor={COLORS.fgMuted}
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Response Language</Text>
        <DropdownSelect
          label="Select Language"
          value={language}
          options={LANGUAGES}
          onSelect={(item) => setLanguage(item.id)}
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Instructions</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Settings Menu Content
function SettingsMenuContent({ onOpenCustomInstructions, onOpenAccount }) {
  return (
    <ScrollView contentContainerStyle={styles.menuContent}>
      <SlideLeftModal.Category
        title="Personal Preferences"
        items={[
          { icon: 'receipt-outline', title: 'Custom Instructions', description: 'Persona and preferences', onPress: onOpenCustomInstructions },
          { icon: 'language-outline', title: 'Language', description: 'App language' },
        ]}
      />

      <SlideLeftModal.Category
        title="Appearances"
        items={[
          { icon: 'color-palette-outline', title: 'Theme', description: 'Light or dark mode' },
          { icon: 'brush-outline', title: 'Accent Color', description: 'Customize accent color' },
        ]}
      />

      <SlideLeftModal.Category
        title="Storage"
        items={[
          { icon: 'person-outline', title: 'Account', description: 'User credentials', onPress: onOpenAccount },
          { icon: 'file-tray-full-outline', title: 'Memory', description: 'Manage memories' },
        ]}
      />

      <SlideLeftModal.Category
        title="Privacy"
        items={[
          { icon: 'shield-outline', title: 'Privacy Policy', description: 'How we handle your data' },
          { icon: 'document-text-outline', title: 'License', description: 'Open source licenses' },
          { icon: 'information-circle-outline', title: 'Learn More', description: 'About Clustrix' },
        ]}
      />
    </ScrollView>
  );
}

export default function PersonalizationScreen({ visible, onClose }) {
  const { settings, updateSettings } = useApp();
  const [showCustomInstructions, setShowCustomInstructions] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  

  return (
    <>
      {/* Main Settings Modal */}
      <SlideLeftModal visible={visible} onClose={onClose} title="Settings">
        <SettingsMenuContent 
        onOpenCustomInstructions={() => setShowCustomInstructions(true)} 
        onOpenAccount={() => setShowAccount(true)}
        />
      </SlideLeftModal>

      {/* Custom Instructions Submenu - rendered at same level, fullscreen */}
      <SlideLeftModal 
        visible={showCustomInstructions} 
        onClose={() => setShowCustomInstructions(false)} 
        title="Custom Instructions"
      >
        <CustomInstructionsContent 
          settings={settings} 
          onUpdate={updateSettings} 
          onClose={() => setShowCustomInstructions(false)} 
        />
      </SlideLeftModal>

      <AccountScreen visible={showAccount} onClose={() => setShowAccount(false)} />
      
    </>
  );
}

const styles = StyleSheet.create({
  menuContent: { paddingBottom: 40 },
  subContainer: { flex: 1 },
  content: { paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { color: COLORS.fgMuted, fontSize: 12, fontFamily: FONTS.ai, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 12, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 14,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
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
    padding: 24,
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
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dropdownItemActive: {},
  dropdownItemText: { color: COLORS.fgMuted, fontSize: 14 },
  dropdownItemTextActive: { color: COLORS.fg },
  saveBtn: {
    backgroundColor: COLORS.accent,
    padding: 14,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: COLORS.fg, fontSize: 15, fontFamily: FONTS.display },
});
