/**
 * AgenticToolsScreen - Configure web search and image generation APIs
 */

import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, Switch, Linking } from 'react-native';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { Search, Image as ImageIcon, Eye, EyeClosed, ExternalLink, Info, ChevronDown, Check } from 'lucide-react-native';

const SEARCH_PROVIDERS = [
  { id: 'tavily', name: 'Tavily', description: 'AI-optimized search (recommended)', freeCredits: true },
  { id: 'serpapi', name: 'SerpAPI', description: 'Google search results', freeCredits: true },
  { id: 'google', name: 'Google CSE', description: 'Google Custom Search Engine', freeCredits: false },
];

const IMAGE_PROVIDERS = [
  { id: 'openai', name: 'OpenAI DALL-E', description: 'DALL-E 3 (high quality)', models: ['dall-e-3', 'dall-e-2'] },
  { id: 'stability', name: 'Stability AI', description: 'Stable Diffusion XL', models: ['stable-diffusion-xl-1024-v1-0'] },
  { id: 'replicate', name: 'Replicate', description: 'Various models', models: ['sdxl', 'flux'] },
];

export default function AgenticToolsScreen({ onClose, dragHandlers }) {
  const { settings, updateSettings, providerApiKeys } = useApp();
  
  const [localSettings, setLocalSettings] = useState({
    webSearch: {
      enabled: settings.agenticTools?.webSearch?.enabled ?? true,
      provider: settings.agenticTools?.webSearch?.provider || 'tavily',
      apiKey: settings.agenticTools?.webSearch?.apiKey || '',
      googleCseId: settings.agenticTools?.webSearch?.googleCseId || '',
    },
    imageGeneration: {
      enabled: settings.agenticTools?.imageGeneration?.enabled ?? true,
      provider: settings.agenticTools?.imageGeneration?.provider || 'openai',
      apiKey: settings.agenticTools?.imageGeneration?.apiKey || '',
      model: settings.agenticTools?.imageGeneration?.model || 'dall-e-3',
    },
  });
  
  const [showSearchKey, setShowSearchKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [expandedSection, setExpandedSection] = useState('search'); // 'search' | 'image' | null
  
  // Auto-save settings
  useEffect(() => {
    const timer = setTimeout(() => {
      updateSettings({
        agenticTools: {
          webSearch: localSettings.webSearch,
          imageGeneration: localSettings.imageGeneration,
        },
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [localSettings]);
  
  const openLink = (url) => {
    Linking.openURL(url);
  };
  
  const selectedSearchProvider = SEARCH_PROVIDERS.find(p => p.id === localSettings.webSearch.provider);
  const selectedImageProvider = IMAGE_PROVIDERS.find(p => p.id === localSettings.imageGeneration.provider);

  return (
    <View style={styles.container}>
      <View style={styles.header} {...dragHandlers}>
        <Text style={styles.headerTitle}>Agentic Tools</Text>
      </View>
      
      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Info Banner */}
        <View style={styles.infoBanner}>
          <Info size={16} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Configure API keys for AI agent tools. These enable web search and image generation when Agentic Mode is active.
          </Text>
        </View>
        
        {/* Web Search Section */}
        <View style={styles.section}>
          <Pressable 
            style={styles.sectionHeader}
            onPress={() => setExpandedSection(expandedSection === 'search' ? null : 'search')}
          >
            <View style={styles.sectionHeaderLeft}>
              <Search size={20} color={COLORS.primary} />
              <View>
                <Text style={styles.sectionTitle}>Web Search</Text>
                <Text style={styles.sectionSubtitle}>{selectedSearchProvider?.name}</Text>
              </View>
            </View>
            <View style={styles.sectionHeaderRight}>
              <Switch
                value={localSettings.webSearch.enabled}
                onValueChange={(val) => setLocalSettings(prev => ({
                  ...prev,
                  webSearch: { ...prev.webSearch, enabled: val },
                }))}
                trackColor={{ false: COLORS.borderLight, true: COLORS.success }}
                thumbColor={COLORS.fg}
              />
              <ChevronDown 
                size={20} 
                color={COLORS.fgMuted}
                style={{ transform: [{ rotate: expandedSection === 'search' ? '180deg' : '0deg' }] }}
              />
            </View>
          </Pressable>
          
          {expandedSection === 'search' && (
            <View style={styles.sectionContent}>
              {/* Provider Selection */}
              <Text style={styles.label}>Provider</Text>
              <View style={styles.providerGrid}>
                {SEARCH_PROVIDERS.map(provider => (
                  <Pressable
                    key={provider.id}
                    style={[
                      styles.providerCard,
                      localSettings.webSearch.provider === provider.id && styles.providerCardActive,
                    ]}
                    onPress={() => setLocalSettings(prev => ({
                      ...prev,
                      webSearch: { ...prev.webSearch, provider: provider.id },
                    }))}
                  >
                    <View style={styles.providerCardHeader}>
                      <Text style={[
                        styles.providerName,
                        localSettings.webSearch.provider === provider.id && styles.providerNameActive,
                      ]}>
                        {provider.name}
                      </Text>
                      {localSettings.webSearch.provider === provider.id && (
                        <Check size={16} color={COLORS.primary} />
                      )}
                    </View>
                    <Text style={styles.providerDesc}>{provider.description}</Text>
                    {provider.freeCredits && (
                      <Text style={styles.freeTag}>Free tier available</Text>
                    )}
                  </Pressable>
                ))}
              </View>
              
              {/* API Key */}
              <Text style={styles.label}>API Key</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={localSettings.webSearch.apiKey}
                  onChangeText={(text) => setLocalSettings(prev => ({
                    ...prev,
                    webSearch: { ...prev.webSearch, apiKey: text },
                  }))}
                  placeholder={`Enter ${selectedSearchProvider?.name} API key`}
                  placeholderTextColor={COLORS.fgMuted}
                  secureTextEntry={!showSearchKey}
                  autoCapitalize="none"
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowSearchKey(!showSearchKey)}>
                  {showSearchKey ? <EyeClosed size={20} color={COLORS.fgMuted} /> : <Eye size={20} color={COLORS.fgMuted} />}
                </Pressable>
              </View>
              
              {/* Get API Key Link */}
              <Pressable 
                style={styles.linkBtn}
                onPress={() => {
                  const urls = {
                    tavily: 'https://app.tavily.com/home',
                    serpapi: 'https://serpapi.com/manage-api-key',
                    google: 'https://programmablesearchengine.google.com/',
                  };
                  openLink(urls[localSettings.webSearch.provider] || urls.tavily);
                }}
              >
                <ExternalLink size={14} color={COLORS.primary} />
                <Text style={styles.linkText}>Get {selectedSearchProvider?.name} API Key</Text>
              </Pressable>
              
              {/* Google CSE ID (only for Google) */}
              {localSettings.webSearch.provider === 'google' && (
                <>
                  <Text style={styles.label}>Custom Search Engine ID</Text>
                  <TextInput
                    style={styles.inputFull}
                    value={localSettings.webSearch.googleCseId}
                    onChangeText={(text) => setLocalSettings(prev => ({
                      ...prev,
                      webSearch: { ...prev.webSearch, googleCseId: text },
                    }))}
                    placeholder="Enter your CSE ID (cx parameter)"
                    placeholderTextColor={COLORS.fgMuted}
                    autoCapitalize="none"
                  />
                </>
              )}
            </View>
          )}
        </View>
        
        {/* Image Generation Section */}
        <View style={styles.section}>
          <Pressable 
            style={styles.sectionHeader}
            onPress={() => setExpandedSection(expandedSection === 'image' ? null : 'image')}
          >
            <View style={styles.sectionHeaderLeft}>
              <ImageIcon size={20} color={COLORS.accent} />
              <View>
                <Text style={styles.sectionTitle}>Image Generation</Text>
                <Text style={styles.sectionSubtitle}>{selectedImageProvider?.name}</Text>
              </View>
            </View>
            <View style={styles.sectionHeaderRight}>
              <Switch
                value={localSettings.imageGeneration.enabled}
                onValueChange={(val) => setLocalSettings(prev => ({
                  ...prev,
                  imageGeneration: { ...prev.imageGeneration, enabled: val },
                }))}
                trackColor={{ false: COLORS.borderLight, true: COLORS.success }}
                thumbColor={COLORS.fg}
              />
              <ChevronDown 
                size={20} 
                color={COLORS.fgMuted}
                style={{ transform: [{ rotate: expandedSection === 'image' ? '180deg' : '0deg' }] }}
              />
            </View>
          </Pressable>
          
          {expandedSection === 'image' && (
            <View style={styles.sectionContent}>
              {/* Provider Selection */}
              <Text style={styles.label}>Provider</Text>
              <View style={styles.providerGrid}>
                {IMAGE_PROVIDERS.map(provider => (
                  <Pressable
                    key={provider.id}
                    style={[
                      styles.providerCard,
                      localSettings.imageGeneration.provider === provider.id && styles.providerCardActive,
                    ]}
                    onPress={() => setLocalSettings(prev => ({
                      ...prev,
                      imageGeneration: { 
                        ...prev.imageGeneration, 
                        provider: provider.id,
                        model: provider.models[0],
                      },
                    }))}
                  >
                    <View style={styles.providerCardHeader}>
                      <Text style={[
                        styles.providerName,
                        localSettings.imageGeneration.provider === provider.id && styles.providerNameActive,
                      ]}>
                        {provider.name}
                      </Text>
                      {localSettings.imageGeneration.provider === provider.id && (
                        <Check size={16} color={COLORS.accent} />
                      )}
                    </View>
                    <Text style={styles.providerDesc}>{provider.description}</Text>
                  </Pressable>
                ))}
              </View>
              
              {/* API Key */}
              <Text style={styles.label}>API Key</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={localSettings.imageGeneration.apiKey}
                  onChangeText={(text) => setLocalSettings(prev => ({
                    ...prev,
                    imageGeneration: { ...prev.imageGeneration, apiKey: text },
                  }))}
                  placeholder={
                    localSettings.imageGeneration.provider === 'openai'
                      ? 'Leave empty to use main OpenAI key'
                      : `Enter ${selectedImageProvider?.name} API key`
                  }
                  placeholderTextColor={COLORS.fgMuted}
                  secureTextEntry={!showImageKey}
                  autoCapitalize="none"
                />
                <Pressable style={styles.eyeBtn} onPress={() => setShowImageKey(!showImageKey)}>
                  {showImageKey ? <EyeClosed size={20} color={COLORS.fgMuted} /> : <Eye size={20} color={COLORS.fgMuted} />}
                </Pressable>
              </View>
              
              {/* Info for OpenAI */}
              {localSettings.imageGeneration.provider === 'openai' && !localSettings.imageGeneration.apiKey && (
                <Text style={styles.hintText}>
                  Will use your main OpenAI API key if left empty
                </Text>
              )}
              
              {/* Get API Key Link */}
              <Pressable 
                style={styles.linkBtn}
                onPress={() => {
                  const urls = {
                    openai: 'https://platform.openai.com/api-keys',
                    stability: 'https://platform.stability.ai/account/keys',
                    replicate: 'https://replicate.com/account/api-tokens',
                  };
                  openLink(urls[localSettings.imageGeneration.provider] || urls.openai);
                }}
              >
                <ExternalLink size={14} color={COLORS.primary} />
                <Text style={styles.linkText}>Get {selectedImageProvider?.name} API Key</Text>
              </Pressable>
              
              {/* Model Selection */}
              <Text style={styles.label}>Model</Text>
              <View style={styles.modelChips}>
                {selectedImageProvider?.models.map(model => (
                  <Pressable
                    key={model}
                    style={[
                      styles.modelChip,
                      localSettings.imageGeneration.model === model && styles.modelChipActive,
                    ]}
                    onPress={() => setLocalSettings(prev => ({
                      ...prev,
                      imageGeneration: { ...prev.imageGeneration, model },
                    }))}
                  >
                    <Text style={[
                      styles.modelChipText,
                      localSettings.imageGeneration.model === model && styles.modelChipTextActive,
                    ]}>
                      {model}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
        
        {/* Usage Tips */}
        <View style={styles.tipsSection}>
          <Text style={styles.tipsTitle}>💡 How to use</Text>
          <Text style={styles.tipText}>
            1. Enable <Text style={styles.tipBold}>Agentic Mode</Text> in Model Config
          </Text>
          <Text style={styles.tipText}>
            2. Ask Clustrix to search the web or generate images
          </Text>
          <Text style={styles.tipText}>
            3. Examples: "Search for latest news about AI" or "Generate an image of a sunset"
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.bgSecondaryv2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { 
    color: COLORS.fg, 
    fontSize: 18, 
    fontFamily: FONTS.display,
  },
  content: { flex: 1 },
  contentContainer: { 
    padding: 16, 
    paddingBottom: 40,
  },
  
  // Info Banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.primary + '15',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
  },
  infoText: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 13,
    lineHeight: 20,
  },
  
  // Section
  section: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.display,
  },
  sectionSubtitle: {
    color: COLORS.fgMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sectionContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  
  // Labels
  label: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.ai,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 16,
  },
  
  // Provider Grid
  providerGrid: {
    gap: 10,
  },
  providerCard: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  providerCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '10',
  },
  providerCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  providerName: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.display,
  },
  providerNameActive: {
    color: COLORS.primary,
  },
  providerDesc: {
    color: COLORS.fgMuted,
    fontSize: 12,
  },
  freeTag: {
    color: COLORS.success,
    fontSize: 10,
    marginTop: 6,
    fontFamily: FONTS.ai,
  },
  
  // Input
  inputRow: {
    position: 'relative',
  },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 14,
    paddingRight: 50,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.mono,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  inputFull: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 14,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.mono,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 14,
  },
  hintText: {
    color: COLORS.fgMuted,
    fontSize: 11,
    marginTop: 6,
    fontStyle: 'italic',
  },
  
  // Link Button
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  linkText: {
    color: COLORS.primary,
    fontSize: 13,
  },
  
  // Model Chips
  modelChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modelChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  modelChipActive: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '20',
  },
  modelChipText: {
    color: COLORS.fgMuted,
    fontSize: 12,
  },
  modelChipTextActive: {
    color: COLORS.accent,
  },
  
  // Tips Section
  tipsSection: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  tipsTitle: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.display,
    marginBottom: 12,
  },
  tipText: {
    color: COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 22,
  },
  tipBold: {
    color: COLORS.primary,
    fontWeight: '600',
  },
});
