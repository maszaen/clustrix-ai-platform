import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import { DEFAULT_PROVIDERS } from '../services/api';

const COLORS = {
  bg: '#1b1c1d',
  bgSecondary: '#282A2C',
  inputBg: '#1f1f1f',
  fg: '#FCFCFC',
  fgMuted: '#BDC1C6',
  accent: '#0e4bae',
  primary: '#D3E3FD',
  border: '#4a5050',
  borderLight: '#3c4141',
};

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', models: ['openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.5-pro-preview-06-05'] },
  { id: 'google', name: 'Gemini', models: ['gemini-2.5-pro-preview-06-05', 'gemini-2.5-flash-preview-05-20', 'gemini-1.5-pro'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'] },
  { id: 'anthropic', name: 'Claude', models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'] },
  { id: 'groq', name: 'Groq', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
  { id: 'megallm', name: 'MegaLLM', models: ['gpt-4o', 'claude-sonnet-4-20250514'] },
  { id: 'custom', name: 'Custom', models: [] },
];

export default function SettingsScreen({ onClose }) {
  const { settings, updateSettings } = useApp();
  const [localSettings, setLocalSettings] = useState(settings);
  const [showApiKey, setShowApiKey] = useState(false);

  const selectedProvider = PROVIDERS.find(p => p.id === localSettings.provider) || PROVIDERS[0];

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
    Alert.alert('Saved', 'Settings saved');
    onClose?.();
  };

  const handleProviderChange = (providerId) => {
    const provider = PROVIDERS.find(p => p.id === providerId);
    setLocalSettings({
      ...localSettings,
      provider: providerId,
      model: provider?.models[0] || '',
      baseUrl: '',
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.headerTitle}>Settings</Text>
      
      {/* Provider */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Provider</Text>
        <View style={styles.providerGrid}>
          {PROVIDERS.map(provider => (
            <TouchableOpacity
              key={provider.id}
              style={[styles.providerBtn, localSettings.provider === provider.id && styles.providerBtnActive]}
              onPress={() => handleProviderChange(provider.id)}
            >
              <Text style={[styles.providerBtnText, localSettings.provider === provider.id && styles.providerBtnTextActive]}>
                {provider.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Model */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Model</Text>
        {selectedProvider.id === 'custom' ? (
          <TextInput
            style={styles.input}
            value={localSettings.model}
            onChangeText={(text) => setLocalSettings({ ...localSettings, model: text })}
            placeholder="Enter model name"
            placeholderTextColor={COLORS.fgMuted}
            autoCapitalize="none"
          />
        ) : (
          <>
            <View style={styles.modelList}>
              {selectedProvider.models.map(model => (
                <TouchableOpacity
                  key={model}
                  style={[styles.modelBtn, localSettings.model === model && styles.modelBtnActive]}
                  onPress={() => setLocalSettings({ ...localSettings, model })}
                >
                  <Text style={[styles.modelBtnText, localSettings.model === model && styles.modelBtnTextActive]}>
                    {model}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              value={selectedProvider.models.includes(localSettings.model) ? '' : localSettings.model}
              onChangeText={(text) => setLocalSettings({ ...localSettings, model: text })}
              placeholder="Or enter custom model..."
              placeholderTextColor={COLORS.fgMuted}
              autoCapitalize="none"
            />
          </>
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
        <Text style={styles.sectionTitle}>
          Base URL {selectedProvider.id === 'custom' ? '' : '(Optional)'}
        </Text>
        <TextInput
          style={styles.input}
          value={localSettings.baseUrl}
          onChangeText={(text) => setLocalSettings({ ...localSettings, baseUrl: text })}
          placeholder={DEFAULT_PROVIDERS[localSettings.provider]?.baseUrl || 'https://api.example.com/v1'}
          placeholderTextColor={COLORS.fgMuted}
          autoCapitalize="none"
        />
      </View>

      {/* Save */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save Settings</Text>
      </TouchableOpacity>

      {/* Current Config */}
      <View style={styles.configBox}>
        <Text style={styles.configLabel}>Current: {selectedProvider.name} / {localSettings.model || 'Not set'}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  content: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  headerTitle: {
    color: COLORS.fg,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  providerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  providerBtnActive: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  providerBtnText: {
    color: COLORS.fgMuted,
    fontSize: 13,
  },
  providerBtnTextActive: {
    color: COLORS.fg,
    fontWeight: '500',
  },
  modelList: {
    gap: 6,
  },
  modelBtn: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  modelBtnActive: {
    borderColor: COLORS.primary,
  },
  modelBtnText: {
    color: COLORS.fgMuted,
    fontSize: 13,
  },
  modelBtnTextActive: {
    color: COLORS.primary,
  },
  inputRow: {
    position: 'relative',
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 8,
    padding: 14,
    color: COLORS.fg,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: {
    color: COLORS.fg,
    fontSize: 15,
    fontWeight: '600',
  },
  configBox: {
    marginTop: 20,
    padding: 12,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 8,
  },
  configLabel: {
    color: COLORS.fgMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
