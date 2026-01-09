/**
 * ImageModelsScreen - Configure image generation model
 * 
 * Default: Auto (uses provider's best available model)
 * User can override with specific model
 * 
 * Only OpenAI and Google support image generation.
 */
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useApp } from '../context/AppContext';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import { Check, AlertCircle } from 'lucide-react-native';
import DropdownSelect from '../components/DropdownSelect';

// Image models by provider (2025 latest)
const IMAGE_MODELS = {
  openai: [
    { id: 'auto', name: 'Auto', desc: 'Best available (GPT Image 1.5)', isAuto: true },
    { id: 'gpt-image-1.5', name: 'GPT Image 1.5', desc: 'Latest - Dec 2025, best quality' },
    { id: 'gpt-image-1', name: 'GPT Image 1', desc: 'Multimodal, good balance' },
    { id: 'dall-e-3', name: 'DALL-E 3', desc: 'Legacy, detailed HD images' },
    { id: 'dall-e-2', name: 'DALL-E 2', desc: 'Legacy, faster & cheaper' },
  ],
  google: [
    { id: 'auto', name: 'Auto', desc: 'Best available (Imagen 4)', isAuto: true },
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4', desc: 'Latest - best text rendering' },
    { id: 'imagen-3.0-generate-002', name: 'Imagen 3', desc: 'High quality, artifact-free' },
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', desc: 'Native generation, free tier' },
  ],
  gemini: [ // Legacy alias for google
    { id: 'auto', name: 'Auto', desc: 'Best available (Imagen 4)', isAuto: true },
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4', desc: 'Latest - best text rendering' },
    { id: 'imagen-3.0-generate-002', name: 'Imagen 3', desc: 'High quality, artifact-free' },
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image', desc: 'Native generation, free tier' },
  ],
  xai: [
    { id: 'auto', name: 'Auto', desc: 'Best available (Grok Aurora)', isAuto: true },
    { id: 'grok-2-image-1212', name: 'Grok 2 Image (Aurora)', desc: 'Photorealistic, $0.07/image' },
  ],
  zhipu: [
    { id: 'auto', name: 'Auto', desc: 'Best available (CogView 4)', isAuto: true },
    { id: 'cogview-4', name: 'CogView 4', desc: 'Latest - Chinese/English text support' },
    { id: 'cogview-3-flash', name: 'CogView 3 Flash', desc: 'Free tier, fast generation' },
  ],
  bigmodel: [
    { id: 'auto', name: 'Auto', desc: 'Best available (CogView 4)', isAuto: true },
    { id: 'cogview-4-250304', name: 'CogView 4', desc: 'HD quality, ¥0.06/image' },
    { id: 'cogview-3-flash', name: 'CogView 3 Flash', desc: 'Free tier, fast generation' },
  ],
  openrouter: [
    { id: 'auto', name: 'Auto', desc: 'Best available', isAuto: true },
    { id: 'black-forest-labs/flux-1.1-pro', name: 'Flux 1.1 Pro', desc: 'SOTA Quality, very fast' },
    { id: 'black-forest-labs/flux-1-schnell', name: 'Flux 1 Schnell', desc: 'Fastest, good quality' },
    { id: 'recraft-ai/recraft-v3', name: 'Recraft V3', desc: 'Best for vector/design/text' },
    { id: 'stability-ai/stable-diffusion-3.5-large', name: 'SD 3.5 Large', desc: 'Stable Diffusion latest' },
    { id: 'midjourney/midjourney-v6.1', name: 'Midjourney 6.1', desc: 'Via proxy, high artistic quality' },
  ],
};

// Providers that DON'T support image generation or are not configured
const UNSUPPORTED_PROVIDERS = ['anthropic', 'mistral', 'deepseek', 'perplexity', 'cerebras', 'groq', 'megallm'];

export default function ImageModelsScreen({ onClose }) {
  const { settings, updateSettings } = useApp();
  
  const currentProvider = (settings.provider || 'openai').toLowerCase();
  const isSupported = !UNSUPPORTED_PROVIDERS.includes(currentProvider);
  
  // Get available models for current provider
  const availableModels = IMAGE_MODELS[currentProvider] || IMAGE_MODELS.openai;
  
  // Check if current imageModel is valid for this provider
  const currentModelValid = availableModels.some(m => m.id === settings.imageModel);
  
  const [selectedModel, setSelectedModel] = useState(
    currentModelValid ? settings.imageModel : 'auto'
  );
  
  // Reset to auto when provider changes and model becomes invalid
  useEffect(() => {
    const isValid = availableModels.some(m => m.id === selectedModel);
    if (!isValid) {
      setSelectedModel('auto');
    }
  }, [currentProvider]);
  
  // Auto-save
  useEffect(() => {
    const timer = setTimeout(() => {
      updateSettings({ imageModel: selectedModel });
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedModel]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} style={styles.subContainer} contentContainerStyle={styles.content}>
      {/* Current Provider Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Provider</Text>
        <View style={[styles.providerBadge, !isSupported && styles.providerBadgeWarn]}>
          <Text style={styles.providerName}>
            {settings.provider?.charAt(0).toUpperCase() + settings.provider?.slice(1) || 'OpenAI'}
          </Text>
          {isSupported ? (
            <View style={styles.supportedTag}>
              <Check size={12} color={COLORS.success} />
              <Text style={styles.supportedText}>Image Gen Supported</Text>
            </View>
          ) : (
            <View style={styles.unsupportedTag}>
              <AlertCircle size={12} color={COLORS.danger} />
              <Text style={styles.unsupportedText}>No Image Generation</Text>
            </View>
          )}
        </View>
      </View>

      {isSupported ? (
        <>
          {/* Model Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Image Model</Text>
            <DropdownSelect
              label="Select Image Model"
              value={selectedModel}
              options={availableModels}
              onSelect={(item) => setSelectedModel(item.id)}
            />
          </View>

          {/* Info */}
          <View style={styles.section}>
            <Text style={styles.infoText}>
              "Auto" uses the best available model for your provider. You can select a specific model if needed.
            </Text>
          </View>
        </>
      ) : (
        /* Unsupported Provider Message */
        <View style={styles.section}>
          <View style={styles.warningCard}>
            <AlertCircle size={20} color={COLORS.warning} />
            <Text style={styles.warningText}>
              Your current provider ({settings.provider}) does not support image generation.
              {'\n\n'}
              Switch to <Text style={styles.highlight}>OpenAI</Text>, <Text style={styles.highlight}>Google</Text>, or <Text style={styles.highlight}>OpenRouter</Text> in Model Settings to use this feature.
            </Text>
          </View>
        </View>
      )}
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
  providerBadge: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 15,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerBadgeWarn: {
    borderColor: COLORS.danger + '50',
    backgroundColor: COLORS.danger + '10',
  },
  providerName: {
    color: COLORS.fg,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  supportedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.success + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  supportedText: {
    color: COLORS.success,
    fontSize: 11,
  },
  unsupportedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.danger + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  unsupportedText: {
    color: COLORS.danger,
    fontSize: 11,
  },
  infoText: {
    color: COLORS.fgMuted,
    fontSize: 13,
    lineHeight: 20,
    paddingHorizontal: 4,
  },
  warningCard: {
    backgroundColor: COLORS.warning + '15',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 13,
    lineHeight: 20,
  },
  highlight: {
    color: COLORS.primary,
    fontFamily: FONTS.display,
  },
});
