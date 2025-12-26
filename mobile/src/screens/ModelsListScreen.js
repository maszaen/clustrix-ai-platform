import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Modal, FlatList, TouchableWithoutFeedback, Pressable, Switch, ActivityIndicator } from 'react-native';
import { Pressable as GHPressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { DEFAULT_PROVIDERS } from '../services/api';
import { getCloudModels } from '../services/clustrixCloud';
import ContextMenu from '../components/ContextMenu';
import InputModal from '../components/InputModal';
import ConfirmModal from '../components/ConfirmModal';
import AlertModal from '../components/AlertModal';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { Eye, EyeClosed, Pencil, Trash2, Cloud, CloudOff } from 'lucide-react-native';
import { DEFAULT_PROVIDERS_LIST, DEFAULT_MODELS } from '../constants/providers';


// Dropdown Select Component with optional "Add New" option
function DropdownSelect({ label, value, options, onSelect, renderOption, onAddNew, addNewLabel, disabled }) {
  const [visible, setVisible] = useState(false);
  const selected = options.find(o => o.id === value || o.model_id === value);

  const handleAddNew = () => {
    setVisible(false);
    onAddNew?.();
  };

  return (
    <View>
      <Pressable 
        style={[styles.dropdown, disabled && styles.dropdownDisabled]} 
        onPress={() => !disabled && setVisible(true)} 
        android_ripple={disabled ? null : { color: 'rgba(255,255,255,0.1)' }}
      >
        <Text style={[styles.dropdownText, disabled && styles.dropdownTextDisabled]}>
          {renderOption ? renderOption(selected) : (selected?.name || selected?.label || 'Select model')}
        </Text>
        <Ionicons name="chevron-down" size={18} color={disabled ? COLORS.fgMuted : COLORS.fgMuted} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <TouchableWithoutFeedback onPress={() => setVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.dropdownModal}>
                <Text style={styles.dropdownModalTitle}>{label}</Text>
                <FlatList
                  data={options}
                  keyExtractor={(item) => item.id || item.model_id}
                  renderItem={({ item, index }) => {
                    const isActive = item.id === value || item.model_id === value;
                    const isLast = index === options.length - 1;

                    return (
                      <Pressable
                        style={[
                          styles.dropdownItem,
                          isActive && styles.dropdownItemActive,
                          isLast && { borderBottomWidth: 0 },
                        ]}
                        onPress={() => { onSelect(item); setVisible(false); }}
                        android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                      >
                        <Text
                          style={[
                            styles.dropdownItemText,
                            isActive && styles.dropdownItemTextActive,
                          ]}
                        > 
                          {renderOption ? renderOption(item) : (item.name || item.label)}
                        </Text>
                        {isActive && (
                          <Ionicons name="checkmark" size={18} color={COLORS.primary} />
                        )}
                      </Pressable>
                    );
                  }}
                  ListHeaderComponent={onAddNew ? (
                    <Pressable style={styles.addNewItem} onPress={handleAddNew} android_ripple={{ color: 'rgba(255,255,255,0.1)' }}>
                      <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                      <Text style={styles.addNewText}>{addNewLabel || 'Add New'}</Text>
                    </Pressable>
                  ) : null}
                />
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

export default function ModelsListScreen({ onClose, dragHandlers }) {
  const { settings, updateSettings, customModels, addCustomModel, updateCustomModel, deleteCustomModel, customProviders, addCustomProvider, updateCustomProvider, deleteCustomProvider, providerApiKeys, updateProviderApiKey } = useApp();

  // Cloud mode state
  const [useCloudMode, setUseCloudMode] = useState(settings.useClustrixCloud ?? false);
  const [cloudModels, setCloudModels] = useState([]);
  const [cloudProviders, setCloudProviders] = useState([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState(null);

  const [localSettings, setLocalSettings] = useState({
    provider: settings.provider || 'openrouter',
    model: settings.model || '',
    apiKey: providerApiKeys[settings.provider] || settings.apiKey || '',
    baseUrl: settings.baseUrl || '',
    agenticMode: settings.agenticMode ?? false,
    generateImage: settings.generateImage ?? false,
  });

  // Sync cloud mode from settings
  useEffect(() => {
    setUseCloudMode(settings.useClustrixCloud ?? false);
  }, [settings.useClustrixCloud]);

  // Fetch cloud models when cloud mode is enabled
  useEffect(() => {
    if (useCloudMode) {
      setIsLoadingCloud(true);
      setCloudError(null);
      getCloudModels().then(result => {
        if (result.success) {
          setCloudModels(result.models);
          setCloudProviders(result.providers);
          
          // Auto-select first available provider/model if current is not available
          if (result.providers.length > 0) {
            const currentProviderAvailable = result.providers.some(p => p.id === localSettings.provider);
            if (!currentProviderAvailable) {
              const firstProvider = result.providers[0];
              const firstModel = result.models.find(m => m.provider === firstProvider.id);
              setLocalSettings(prev => ({
                ...prev,
                provider: firstProvider.id,
                model: firstModel?.id || '',
              }));
            }
          }
        } else {
          setCloudError(result.error || 'Failed to load cloud models');
        }
        setIsLoadingCloud(false);
      });
    } else {
      setCloudError(null);
    }
  }, [useCloudMode]);

  useEffect(() => {
    setLocalSettings(prev => ({ 
      ...prev, 
      agenticMode: settings.agenticMode,
      generateImage: settings.generateImage 
    }));
  }, [settings.agenticMode, settings.generateImage]);

  const [showApiKey, setShowApiKey] = useState(false);
  const [contextMenu, setContextMenu] = useState({ visible: false, item: null, type: null, position: { x: 0, y: 0 } });
  const [addModelModal, setAddModelModal] = useState(false);
  const [addProviderModal, setAddProviderModal] = useState(false);
  const [renameModal, setRenameModal] = useState({ visible: false, item: null, type: null });
  const [confirmDelete, setConfirmDelete] = useState({ visible: false, item: null, type: null });
  
  // Alert state
  const [alert, setAlert] = useState({ visible: false, type: '', title: '', message: '' });
  const showAlert = (type, title, message) => setAlert({ visible: true, type, title, message });
  const hideAlert = () => setAlert(prev => ({ ...prev, visible: false }));

  // Combine default and custom providers (or use cloud providers)
  const allProviders = useCloudMode 
    ? cloudProviders 
    : [...DEFAULT_PROVIDERS_LIST, ...customProviders.map(p => ({ id: p.id, name: p.name, base_url: p.base_url, is_custom: true }))];

  // Get models for current provider (or use cloud models)
  const getModelsForProvider = (providerId) => {
    if (useCloudMode) {
      return cloudModels.filter(m => m.provider === providerId).map(m => ({
        model_id: m.id,
        label: m.name,
        provider: m.provider,
      }));
    }
    const defaultModels = DEFAULT_MODELS.filter(m => m.provider === providerId);
    const custom = customModels.filter(m => m.provider === providerId);
    return [...defaultModels, ...custom];
  };

  const availableModels = getModelsForProvider(localSettings.provider);

  // Auto-save effect with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      // Allow saving even if incomplete, validation happens during chat
      await updateProviderApiKey(localSettings.provider, localSettings.apiKey);
      updateSettings({
        provider: localSettings.provider,
        model: localSettings.model,
        baseUrl: localSettings.baseUrl,
        apiKey: localSettings.apiKey,
        agenticMode: localSettings.agenticMode,
        generateImage: localSettings.generateImage,
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [localSettings.provider, localSettings.model, localSettings.baseUrl, localSettings.apiKey]); // Exclude toggles from debounce loop

  const handleProviderChange = (provider) => {
    const models = getModelsForProvider(provider.id);
    const newSettings = {
      ...localSettings,
      provider: provider.id,
      model: models[0]?.model_id || '',
      apiKey: providerApiKeys[provider.id] || '',
      baseUrl: provider.base_url || '',
    };
    setLocalSettings(newSettings);
    // Immediate save for provider change
    updateSettings(newSettings);
  };


  const handleItemLongPress = (item, type, event) => {
    if (item.is_default) return;
    setContextMenu({
      visible: true,
      item,
      type,
      position: { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY - 20 },
    });
  };

  const handleAddModel = async (values) => {
    const newModel = await addCustomModel({
      provider: localSettings.provider,
      model_id: values.model_id,
      label: values.label || values.model_id,
    });
    // Select the newly added model
    setLocalSettings({ ...localSettings, model: values.model_id });
    setAddModelModal(false);
  };

  const handleAddProvider = async (values) => {
    const newProvider = await addCustomProvider({
      name: values.name,
      base_url: values.base_url,
    });
    // Select the newly added provider
    if (newProvider) {
      setLocalSettings({
        ...localSettings,
        provider: newProvider.id,
        model: '',
        apiKey: '',
        baseUrl: values.base_url,
      });
    }
    setAddProviderModal(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header} {...dragHandlers}>
        <Text style={styles.headerTitle}>Model Configurations</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Context menu with Lucide icons */}
        <ContextMenu
          visible={contextMenu.visible}
          position={contextMenu.position}
          options={[
            { label: 'Rename', icon: Pencil, onPress: () => setRenameModal({ visible: true, item: contextMenu.item, type: contextMenu.type }) },
            { label: 'Delete', icon: Trash2, danger: true, onPress: () => setConfirmDelete({ visible: true, item: contextMenu.item, type: contextMenu.type }) },
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

        {/* Cloud Mode Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mode</Text>
          <View style={styles.toggleCard}>
            <Pressable 
              style={styles.toggleRowTop}
              onPress={() => {
                const val = !useCloudMode;
                setUseCloudMode(val);
                updateSettings({ useClustrixCloud: val });
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                {useCloudMode ? (
                  <Cloud size={25} color={COLORS.primary} style={{ marginRight: 14 }} />
                ) : (
                  <CloudOff size={25} color={COLORS.fgMuted} style={{ marginRight: 14 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Use Clustrix Cloud</Text>
                  <Text style={styles.switchDescription}>
                    {useCloudMode ? 'Using Clustrix backend (no API key needed)' : 'Using your own API keys (no limitation)'}
                  </Text>
                </View>
              </View>
              <Switch
                value={useCloudMode}
                onValueChange={(val) => {
                  setUseCloudMode(val);
                  updateSettings({ useClustrixCloud: val });
                }}
                trackColor={{ false: COLORS.borderLight, true: COLORS.primary }}
                thumbColor={COLORS.fg}
              />
            </Pressable>
          </View>
        </View>

        {/* Loading indicator for cloud mode */}
        {useCloudMode && isLoadingCloud && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading available models...</Text>
          </View>
        )}

        {/* Error message for cloud mode */}
        {useCloudMode && cloudError && !isLoadingCloud && (
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>{cloudError}</Text>
          </View>
        )}

        {/* Provider Dropdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Provider</Text>
          <DropdownSelect
            label="Select Provider"
            value={localSettings.provider}
            options={allProviders}
            onSelect={handleProviderChange}
            onAddNew={useCloudMode ? null : () => setAddProviderModal(true)}
            addNewLabel="Add Custom Provider"
            disabled={useCloudMode && (isLoadingCloud || allProviders.length === 0)}
          />
          {!useCloudMode && customProviders.length > 0 && (
            <View style={styles.modelChips}>
              {customProviders.map(provider => (
                <Pressable
                  key={provider.id}
                  style={[styles.modelChip, localSettings.provider === provider.id && styles.modelChipActive]}
                  onPress={() => handleProviderChange(provider)}
                  onLongPress={(e) => handleItemLongPress(provider, 'provider', e)}
                  delayLongPress={200}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                >
                  <Text style={[styles.modelChipText, localSettings.provider === provider.id && styles.modelChipTextActive]}>
                    {provider.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* API Key - Hidden in cloud mode */}
        {!useCloudMode && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>API Key</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.inputApiKey}
                value={localSettings.apiKey}
                onChangeText={(text) => setLocalSettings({ ...localSettings, apiKey: text })}
                placeholder="Enter your API key"
                placeholderTextColor={COLORS.fgMuted}
                secureTextEntry={!showApiKey}
                autoCapitalize="none"
              />
              <Pressable style={styles.eyeBtn} onPress={() => setShowApiKey(!showApiKey)} android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}>
                {showApiKey ? <EyeClosed size={20} color={COLORS.fgMuted} /> :
                  <Eye size={20} color={COLORS.fgMuted} />
                }
              </Pressable>
            </View>
          </View>
        )}

        {/* Base URL - Hidden in cloud mode */}
        {!useCloudMode && (
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
        )}

        {/* Model Dropdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LLM Model</Text>
          <DropdownSelect
            label="Select Model"
            value={localSettings.model}
            options={availableModels}
            onSelect={(item) => setLocalSettings({ ...localSettings, model: item.model_id })}
            renderOption={(item) => item?.label || item?.model_id || 'Select model'}
            onAddNew={useCloudMode ? null : () => setAddModelModal(true)}
            addNewLabel="Add Custom Model"
            disabled={useCloudMode && (isLoadingCloud || availableModels.length === 0)}
          />

          {!useCloudMode && availableModels.filter(m => !m.is_default).length > 0 && (
            <View style={styles.modelChips}>
              {availableModels.filter(m => !m.is_default).map(model => (
                <Pressable
                  key={model.id || model.model_id}
                  style={[styles.modelChip, localSettings.model === model.model_id && styles.modelChipActive]}
                  onPress={() => setLocalSettings({ ...localSettings, model: model.model_id })}
                  onLongPress={(e) => handleItemLongPress(model, 'model', e)}
                  delayLongPress={200}
                  android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
                >
                  <Text style={[styles.modelChipText, localSettings.model === model.model_id && styles.modelChipTextActive]}>
                    {model.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {!useCloudMode && availableModels.filter(m => !m.is_default).length > 0 && (
            <Text style={styles.hint}>Long press custom models to rename/delete</Text>
          )}
        </View>
      </ScrollView>
      
      {/* Alert Modal */}
      <AlertModal
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        primaryText="Okay"
        onPrimary={() => {
          hideAlert();
          if (alert.type === 'success') {
            onClose?.();
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSecondaryv2 },
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
  sectionTitle: { color: COLORS.fgMuted, fontSize: 12, fontFamily: FONTS.ai, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4, marginBottom: 6 },
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
  inputApiKey: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 14,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.mono,
    paddingRight: 50,
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  inputRow: { position: 'relative', alignItems: 'center', },
  eyeBtn: { position: 'absolute', right: 15, top: 16 },
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
  dropdownDisabled: {
    opacity: 0.5,
  },
  dropdownText: { color: COLORS.fg, fontSize: 14, fontFamily: FONTS.sans },
  dropdownTextDisabled: { color: COLORS.fgMuted },
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
    fontFamily: FONTS.ai,
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
  dropdownItemText: { color: COLORS.fgMuted, fontSize: 14 },
  dropdownItemTextActive: { color: COLORS.fg },
  addNewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
    // borderBottomColor: COLORS.borderLight,
    // borderBottomWidth: 1,
  },
  addNewText: { color: COLORS.primary, fontSize: 14, fontFamily: FONTS.sans },
  hint: { color: COLORS.fgMuted, fontSize: 11, marginTop: 8, marginLeft: 10 },
  modelChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, },
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
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: COLORS.fg, fontSize: 15, fontFamily: FONTS.display },
  toggleCard: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    marginTop: 0,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  toggleRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  toggleRowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  toggleDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 16,
  },
  switchDescription: { color: COLORS.fgMuted, fontSize: 12, marginTop: 0 },
  label: {
    color: COLORS.fg,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  loadingText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    fontFamily: FONTS.sans,
    textAlign: 'center',
  },
});
