/**
 * AgenticToolsScreen - Configure web search API
 * 
 * Follows the same pattern as CustomInstructionsContent in PersonalizationScreen
 */

import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { Eye, EyeClosed, ExternalLink, Check } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';

const SEARCH_PROVIDERS = [
  { id: 'tavily', name: 'Tavily', desc: 'AI-optimized search', url: 'https://app.tavily.com/home' },
  { id: 'serpapi', name: 'SerpAPI', desc: 'Google results via API', url: 'https://serpapi.com/manage-api-key' },
  { id: 'google', name: 'Google CSE', desc: 'Custom Search Engine', url: 'https://programmablesearchengine.google.com/' },
];

export default function AgenticToolsScreen({ onClose }) {
  const { settings, updateSettings } = useApp();
  
  const [provider, setProvider] = useState(settings.agenticTools?.webSearch?.provider || 'tavily');
  
  // Store keys for all providers
  // Initialize from settings.keys OR fallback to current apiKey for the current provider
  const [keys, setKeys] = useState(settings.agenticTools?.webSearch?.keys || {
    [settings.agenticTools?.webSearch?.provider || 'tavily']: settings.agenticTools?.webSearch?.apiKey || ''
  });

  const [googleCseId, setGoogleCseId] = useState(settings.agenticTools?.webSearch?.googleCseId || '');
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Get current key safely
  const currentApiKey = keys[provider] || '';

  // Update key for current provider
  const updateKey = (text) => {
    setKeys(prev => ({
      ...prev,
      [provider]: text
    }));
  };
  
  // Auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      updateSettings({
        agenticTools: {
          ...settings.agenticTools,
          webSearch: { 
            provider, 
            apiKey: keys[provider] || '', // Save active key for service compatibility
            keys, // Save all keys map
            googleCseId 
          },
        },
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [provider, keys, googleCseId]);
  
  const selectedProvider = SEARCH_PROVIDERS.find(p => p.id === provider);

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.subContainer} contentContainerStyle={styles.content}>
      {/* Provider Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Search Provider</Text>
        {SEARCH_PROVIDERS.map(p => (
          <Pressable
            key={p.id}
            style={[styles.providerCard, provider === p.id && styles.providerCardActive]}
            onPress={() => setProvider(p.id)}
            android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
          >
            <View style={styles.providerRow}>
              <View>
                <Text style={[styles.providerName, provider === p.id && styles.providerNameActive]}>
                  {p.name}
                </Text>
                <Text style={styles.providerDesc}>{p.desc}</Text>
              </View>
              {provider === p.id && <Check size={18} color={COLORS.primary} />}
            </View>
          </Pressable>
        ))}
      </View>

      {/* API Key */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>API Key</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputFlex}
            value={currentApiKey}
            onChangeText={updateKey}
            placeholder={`Enter ${selectedProvider?.name} API key`}
            placeholderTextColor={COLORS.fgMuted}
            secureTextEntry={!showApiKey}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable style={styles.eyeBtn} onPress={() => setShowApiKey(!showApiKey)}>
            {showApiKey ? <EyeClosed size={20} color={COLORS.fgMuted} /> : <Eye size={20} color={COLORS.fgMuted} />}
          </Pressable>
        </View>
        <Pressable 
          style={styles.linkRow}
          onPress={() => Linking.openURL(selectedProvider?.url)}
        >
          <ExternalLink size={14} color={COLORS.primary} />
          <Text style={styles.linkText}>Get {selectedProvider?.name} API Key</Text>
        </Pressable>
      </View>

      {/* Google CSE ID (only for Google) */}
      {provider === 'google' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Search Engine ID</Text>
          <TextInput
            style={styles.input}
            value={googleCseId}
            onChangeText={setGoogleCseId}
            placeholder="Enter your CSE ID (cx parameter)"
            placeholderTextColor={COLORS.fgMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.hint}>Found in your Custom Search Engine settings</Text>
        </View>
      )}

      {/* Status indicator */}
      <View style={styles.section}>
        <View style={[styles.statusRow, currentApiKey ? styles.statusOk : styles.statusWarn]}>
          <Ionicons 
            name={currentApiKey ? "checkmark-circle" : "warning"} 
            size={18} 
            color={currentApiKey ? COLORS.success : COLORS.warning} 
          />
          <Text style={[styles.statusText, currentApiKey ? styles.statusTextOk : styles.statusTextWarn]}>
            {currentApiKey ? `${selectedProvider?.name} configured` : 'No API key - web search disabled'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  subContainer: { flex: 1, paddingTop: 10 },
  content: { paddingBottom: 40 },
  section: { marginBottom: 20 },
  sectionTitle: { 
    color: COLORS.fgMuted, 
    fontSize: 12, 
    fontFamily: FONTS.ai, 
    textTransform: 'uppercase', 
    letterSpacing: 0.5, 
    paddingHorizontal: 4, 
    marginBottom: 6 
  },
  providerCard: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  providerCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  providerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerName: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  providerNameActive: {
    color: COLORS.primary,
  },
  providerDesc: {
    color: COLORS.fgMuted,
    fontSize: 12,
    marginTop: 2,
  },
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  inputFlex: {
    flex: 1,
    padding: 14,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.mono,
  },
  eyeBtn: {
    padding: 14,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  linkText: {
    color: COLORS.primary,
    fontSize: 13,
  },
  hint: {
    color: COLORS.fgMuted,
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
  },
  statusOk: {
    backgroundColor: COLORS.success + '15',
  },
  statusWarn: {
    backgroundColor: COLORS.warning + '15',
  },
  statusText: {
    fontSize: 13,
  },
  statusTextOk: {
    color: COLORS.success,
  },
  statusTextWarn: {
    color: COLORS.warning,
  },
});
