import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { DEFAULT_PROVIDERS } from '../services/api';
import ContextMenu from '../components/ContextMenu';
import InputModal from '../components/InputModal';
import ConfirmModal from '../components/ConfirmModal';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

const DEFAULT_PROVIDERS_LIST = [
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'google', name: 'Gemini' },
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Claude' },
  { id: 'groq', name: 'Groq' },
  { id: 'megallm', name: 'MegaLLM' },
  { id: 'custom', name: 'Custom' },
];

const DEFAULT_MODELS = [
  { provider: 'openrouter', model_id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', is_default: true },
  { provider: 'openrouter', model_id: 'openai/gpt-4o', label: 'GPT-4o', is_default: true },
  { provider: 'openrouter', model_id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', is_default: true },
  { provider: 'openrouter', model_id: 'google/gemini-2.5-pro-preview-06-05', label: 'Gemini 2.5 Pro', is_default: true },
  { provider: 'google', model_id: 'gemini-2.5-pro-preview-06-05', label: 'Gemini 2.5 Pro', is_default: true },
  { provider: 'google', model_id: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash', is_default: true },
  { provider: 'openai', model_id: 'gpt-4o-mini', label: 'GPT-4o Mini', is_default: true },
  { provider: 'openai', model_id: 'gpt-4o', label: 'GPT-4o', is_default: true },
  { provider: 'anthropic', model_id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', is_default: true },
  { provider: 'groq', model_id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', is_default: true },
  { provider: 'megallm', model_id: 'gpt-4o', label: 'GPT-4o', is_default: true },
];

// Dropdown Select Component
function DropdownSelect({ label, value, options, onSelect, renderOption }) {
  const [visible, setVisible] = useState(false);
  const selected = options.find(o => o.id === value || o.model_id === value);

  return (
    <View>
      <TouchableOpacity style={styles.dropdown} onPress={() => setVisible(true)}>
        <Text style={styles.dropdownText}>
          {renderOption ? renderOption(selected) : (selected?.name || selected?.label || 'Select...')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={COLORS.fgMuted} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setVisible(false)}>
          <View style={styles.dropdownModal}>
            <Text style={styles.dropdownModalTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => item.id || item.model_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.dropdownItem, (item.id === value || item.model_id === value) && styles.dropdownItemActive]}
                  onPress={() => { onSelect(item); setVisible(false); }}
                >
                  <Text style={[styles.dropdownItemText, (item.id === value || item.model_id === value) && styles.dropdownItemTextActive]}>
                    {renderOption ? renderOption(item) : (item.name || item.label)}
                  </Text>
                  {(item.id === value || item.model_id === value) && (
                    <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function ModelsListScreen({ onClose }) {
  const { settings, updateSettings, customModels, addCustomModel, updateCustomModel, deleteCustomModel, customProviders, addCustomProvider, updateCustomProvider, deleteCustomProvider } = useApp();

  const [localSettings, setLocalSettings] = useState({
    provider: settings.provider || 'openrouter',
    model: settings.model || '',
    apiKey: settings.apiKey || '',
    baseUrl: settings.baseUrl || '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [contextMenu, setContextMenu] = useState({ visible: false, item: null, type: null, position: { x: 0, y: 0 } });
  const [addModelModal, setAddModelModal] = useState(false);
  const [addProviderModal, setAddProviderModal] = useState(false);
  const [renameModal, setRenameModal] = useState({ visible: false, item: null, type: null });
  const [confirmDelete, setConfirmDelete] = useState({ visible: false, item: null, type: null });

  // Combine default and custom providers
  const allProviders = [...DEFAULT_PROVIDERS_LIST, ...customProviders.map(p => ({ id: p.id, name: p.name, base_url: p.base_url, is_custom: true }))];

  // Get models for current provider
  const getModelsForProvider = (providerId) => {
    const defaultModels = DEFAULT_MODELS.filter(m => m.provider === providerId);
    const custom = customModels.filter(m => m.provider === providerId);
    return [...defaultModels, ...custom];
  };

  const availableModels = getModelsForProvider(localSettings.provider);

  const handleSave = () => {
    if (!localSettings.apiKey) {
      Alert.alert('Missing API Key', 'Please enter your API key');
      return;
    }
    if (!localSettings.model) {
      Alert.alert('Missing Model', 'Please select or enter a model');
      return;
    }
    updateSettings(localSettings);
    Alert.alert('Saved', 'Model settings saved');
    onClose?.();
  };

  const handleProviderChange = (provider) => {
    const models = getModelsForProvider(provider.id);
    setLocalSettings({
      ...localSettings,
      provider: provider.id,
      model: models[0]?.model_id || '',
      baseUrl: '',
    });
  };

  const handleItemLongPress = (item, type, event) => {
    if (item.is_default) return;
    setContextMenu({
      visible: true,
      item,
      type,
      position: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY },
    });
  };

  const handleAddModel = (values) => {
    addCustomModel({
      provider: localSettings.provider,
      model_id: values.model_id,
      label: values.label || values.model_id,
    });
    setAddModelModal(false);
  };

  const handleAddProvider = (values) => {
    addCustomProvider({
      name: values.name,
      base_url: values.base_url,
    });
    setAddProviderModal(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Models</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <ContextMenu
          visible={contextMenu.visible}
          position={contextMenu.position}
          options={[
            { label: 'Rename', icon: 'pencil-outline', onPress: () => setRenameModal({ visible: true, item: contextMenu.item, type: contextMenu.type }) },
            { label: 'Delete', icon: 'trash-outline', danger: true, onPress: () => setConfirmDelete({ visible: true, item: contextMenu.item, type: contextMenu.type }) },
          ]}
          onClose={() => setContextMenu({ ...contextMenu, visible: false })}
        />

        <ConfirmModal
          visible={confirmDelete.visible}
          title={`Delete ${confirmDelete.type === 'provider' ? 'Provider' : 'Model'}`}
          message={`Delete "${confirmDelete.item?.name || confirmDelete.item?.label}"?`}
          confirmText="Delete"
          danger
          onConfirm={() => {
            if (confirmDelete.type === 'provider') {
              deleteCustomProvider(confirmDelete.item.id);
            } else {
              deleteCustomModel(confirmDelete.item.id);
            }
            setConfirmDelete({ visible: false, item: null, type: null });
          }}
          onCancel={() => setConfirmDelete({ visible: false, item: null, type: null })}
        />

        <InputModal
          visible={renameModal.visible}
          title={`Rename ${renameModal.type === 'provider' ? 'Provider' : 'Model'}`}
          fields={[{
            key: renameModal.type === 'provider' ? 'name' : 'label',
            placeholder: renameModal.type === 'provider' ? 'Provider name' : 'Model name',
            value: renameModal.item?.name || renameModal.item?.label || '',
            required: true
          }]}
          onSubmit={(values) => {
            if (renameModal.type === 'provider') {
              updateCustomProvider(renameModal.item.id, { name: values.name });
            } else {
              updateCustomModel(renameModal.item.id, { label: values.label });
            }
            setRenameModal({ visible: false, item: null, type: null });
          }}
          onCancel={() => setRenameModal({ visible: false, item: null, type: null })}
        />

        <InputModal
          visible={addModelModal}
          title="Add Custom Model"
          fields={[
            { key: 'model_id', label: 'Model ID', placeholder: 'e.g., gpt-4-turbo', required: true },
            { key: 'label', label: 'Display Name', placeholder: 'e.g., GPT-4 Turbo' },
          ]}
          submitText="Add"
          onSubmit={handleAddModel}
          onCancel={() => setAddModelModal(false)}
        />

        <InputModal
          visible={addProviderModal}
          title="Add Custom Provider"
          fields={[
            { key: 'name', label: 'Provider Name', placeholder: 'e.g., My API', required: true },
            { key: 'base_url', label: 'Base URL', placeholder: 'https://api.example.com/v1', required: true },
          ]}
          submitText="Add"
          onSubmit={handleAddProvider}
          onCancel={() => setAddProviderModal(false)}
        />

        {/* Provider Dropdown */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Provider</Text>
            <TouchableOpacity onPress={() => setAddProviderModal(true)}>
              <Ionicons name="add-circle-outline" size={19} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <DropdownSelect
            label="Select Provider"
            value={localSettings.provider}
            options={allProviders}
            onSelect={handleProviderChange}
          />
          {customProviders.length > 0 && (
            <View style={styles.modelChips}>
              {customProviders.map(provider => (
                <TouchableOpacity
                  key={provider.id}
                  style={[styles.modelChip, localSettings.provider === provider.id && styles.modelChipActive]}
                  onPress={() => handleProviderChange(provider)}
                  onLongPress={(e) => handleItemLongPress(provider, 'provider', e)}
                >
                  <Text style={[styles.modelChipText, localSettings.provider === provider.id && styles.modelChipTextActive]}>
                    {provider.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Model Dropdown */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Model</Text>
            <TouchableOpacity onPress={() => setAddModelModal(true)}>
              <Ionicons name="add-circle-outline" size={19} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
          <DropdownSelect
            label="Select Model"
            value={localSettings.model}
            options={availableModels}
            onSelect={(item) => setLocalSettings({ ...localSettings, model: item.model_id })}
            renderOption={(item) => item?.label || item?.model_id || 'Select...'}
          />
          <Text style={styles.hint}>Long press custom models to rename/delete</Text>

          {availableModels.filter(m => !m.is_default).length > 0 && (
            <View style={styles.modelChips}>
              {availableModels.filter(m => !m.is_default).map(model => (
                <TouchableOpacity
                  key={model.id || model.model_id}
                  style={[styles.modelChip, localSettings.model === model.model_id && styles.modelChipActive]}
                  onPress={() => setLocalSettings({ ...localSettings, model: model.model_id })}
                  onLongPress={(e) => handleItemLongPress(model, 'model', e)}
                >
                  <Text style={[styles.modelChipText, localSettings.model === model.model_id && styles.modelChipTextActive]}>
                    {model.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* API Key */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API Key</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={localSettings.apiKey}
              onChangeText={(text) => setLocalSettings({ ...localSettings, apiKey: text })}
              placeholder="Enter your API key"
              placeholderTextColor={COLORS.fgMuted}
              secureTextEntry={!showApiKey}
              autoCapitalize="none"
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowApiKey(!showApiKey)}>
              <Ionicons name={showApiKey ? 'eye-off' : 'eye'} size={20} color={COLORS.fgMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Base URL */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Base URL (Optional)</Text>
          <TextInput
            style={styles.input}
            value={localSettings.baseUrl}
            onChangeText={(text) => setLocalSettings({ ...localSettings, baseUrl: text })}
            placeholder={DEFAULT_PROVIDERS[localSettings.provider]?.baseUrl || 'https://api.example.com/v1'}
            placeholderTextColor={COLORS.fgMuted}
            autoCapitalize="none"
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Model Settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { color: COLORS.fg, fontSize: 18, fontFamily: FONTS.display },
  content: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0, paddingRight: 12 },
  sectionTitle: { color: COLORS.fgMuted, fontSize: 12, fontFamily: FONTS.display, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 12, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    padding: 14,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  inputRow: { position: 'relative' },
  eyeBtn: { position: 'absolute', right: 12, top: 14 },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
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
  hint: { color: COLORS.fgMuted, fontSize: 11, marginTop: 8 },
  modelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  modelChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  modelChipActive: { borderColor: COLORS.primary },
  modelChipText: { color: COLORS.fgMuted, fontSize: 12 },
  modelChipTextActive: { color: COLORS.primary },
  saveBtn: {
    backgroundColor: COLORS.accent,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: COLORS.fg, fontSize: 15, fontFamily: FONTS.display },
});
