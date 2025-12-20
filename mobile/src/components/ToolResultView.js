/**
 * ToolResultView - Display agentic tool results in chat
 * Shows web search results and generated images in a nice UI
 */

import { useState, memo, useCallback } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Linking, ActivityIndicator, Modal, Dimensions, ScrollView } from 'react-native';
import { Globe, ExternalLink, Image as ImageIcon, Search, Download, X, Sparkles, Maximize2 } from 'lucide-react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Web Search Result Card
 */
const SearchResultCard = memo(function SearchResultCard({ result, isFirst }) {
  const handlePress = useCallback(() => {
    if (result.link) {
      Linking.openURL(result.link);
    }
  }, [result.link]);

  // AI summary card (from Tavily)
  if (result.source === 'tavily_answer') {
    return (
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Sparkles size={16} color={COLORS.primary} />
          <Text style={styles.summaryTitle}>AI Summary</Text>
        </View>
        <Text style={styles.summaryText}>{result.snippet}</Text>
      </View>
    );
  }

  return (
    <Pressable
      style={[styles.resultCard, isFirst && styles.resultCardFirst]}
      onPress={handlePress}
      android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
    >
      <View style={styles.resultHeader}>
        <Globe size={14} color={COLORS.fgMuted} />
        <Text style={styles.resultDomain} numberOfLines={1}>
          {result.link ? new URL(result.link).hostname.replace('www.', '') : 'Unknown'}
        </Text>
        <ExternalLink size={12} color={COLORS.fgMuted} />
      </View>
      <Text style={styles.resultTitle} numberOfLines={2}>
        {result.title || 'Untitled'}
      </Text>
      {result.snippet && (
        <Text style={styles.resultSnippet} numberOfLines={3}>
          {result.snippet}
        </Text>
      )}
    </Pressable>
  );
});

/**
 * Web Search Results Container
 */
export const WebSearchResults = memo(function WebSearchResults({ results, query }) {
  const [showAll, setShowAll] = useState(false);
  
  if (!results || results.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.toolHeader}>
          <Search size={18} color={COLORS.primary} />
          <Text style={styles.toolTitle}>Web Search</Text>
        </View>
        <Text style={styles.noResults}>No results found</Text>
      </View>
    );
  }

  const displayResults = showAll ? results : results.slice(0, 4);

  return (
    <View style={styles.container}>
      <View style={styles.toolHeader}>
        <Search size={18} color={COLORS.primary} />
        <Text style={styles.toolTitle}>Web Search Results</Text>
        <Text style={styles.resultCount}>{results.length} results</Text>
      </View>
      
      {query && (
        <Text style={styles.queryText}>"{query}"</Text>
      )}
      
      <View style={styles.resultsContainer}>
        {displayResults.map((result, index) => (
          <SearchResultCard
            key={result.link || index}
            result={result}
            isFirst={index === 0}
          />
        ))}
      </View>
      
      {results.length > 4 && !showAll && (
        <Pressable
          style={styles.showMoreBtn}
          onPress={() => setShowAll(true)}
        >
          <Text style={styles.showMoreText}>
            Show {results.length - 4} more results
          </Text>
        </Pressable>
      )}
    </View>
  );
});

/**
 * Perplexity Search Cards - Horizontal scrolling source cards
 * Displays Perplexity's built-in web search results
 */
const PerplexitySearchCard = memo(function PerplexitySearchCard({ result, isFirst }) {
  const handlePress = useCallback(() => {
    if (result.url) {
      Linking.openURL(result.url);
    }
  }, [result.url]);

  return (
    <Pressable
      style={[styles.pplxCard, isFirst && styles.pplxCardFirst]}
      onPress={handlePress}
      android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
    >
      <View style={styles.pplxCardMeta}>
        <Text style={styles.pplxCardDate}>{result.date || 'Recent'}</Text>
        <Text style={styles.pplxCardSource}>{result.source || 'web'}</Text>
      </View>
      <Text style={styles.pplxCardTitle} numberOfLines={2}>
        {result.title || 'Untitled'}
      </Text>
      {result.snippet && (
        <Text style={styles.pplxCardSnippet} numberOfLines={3}>
          {result.snippet}
        </Text>
      )}
      <View style={styles.pplxCardLink}>
        <Text style={styles.pplxCardLinkText}>View source</Text>
        <ExternalLink size={12} color={COLORS.primary} />
      </View>
    </Pressable>
  );
});

export const PerplexitySearchCards = memo(function PerplexitySearchCards({ searchResults }) {
  if (!searchResults?.results || searchResults.results.length === 0) {
    return null;
  }

  const { results } = searchResults;

  return (
    <View style={styles.pplxContainer}>
      <View style={styles.pplxHeader}>
        {/* Perplexity Logo SVG equivalent */}
        <View style={styles.pplxLogoPlaceholder}>
          <Search size={14} color={COLORS.primary} />
        </View>
        <Text style={styles.pplxHeaderText}>
          Search Results ({results.length})
        </Text>
      </View>
      
      {/* Horizontal scroll container */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pplxScrollContainer}
      >
        {results.map((result, index) => (
          <PerplexitySearchCard
            key={result.url || index}
            result={result}
            isFirst={index === 0}
          />
        ))}
      </ScrollView>
    </View>
  );
});


/**
 * Generated Image View
 */
export const GeneratedImageView = memo(function GeneratedImageView({ imageUrl, imageBase64, prompt, style, isLoading }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Get the image source
  const imageSource = imageBase64
    ? { uri: `data:image/png;base64,${imageBase64}` }
    : imageUrl
      ? { uri: imageUrl }
      : null;

  const handleSave = useCallback(async () => {
    if (!imageSource) return;

    try {
      setSaving(true);

      // Request permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission denied to save image');
        return;
      }

      let localUri;

      if (imageBase64) {
        // Save base64 to file
        const filename = `clustrix_image_${Date.now()}.png`;
        localUri = FileSystem.documentDirectory + filename;
        await FileSystem.writeAsStringAsync(localUri, imageBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } else if (imageUrl) {
        // Download image
        const filename = `clustrix_image_${Date.now()}.png`;
        localUri = FileSystem.documentDirectory + filename;
        const downloadResult = await FileSystem.downloadAsync(imageUrl, localUri);
        localUri = downloadResult.uri;
      }

      // Save to media library
      await MediaLibrary.saveToLibraryAsync(localUri);
      
      // Clean up temp file
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      
      setError(null);
    } catch (e) {
      setError('Failed to save image');
      console.error('Save image error:', e);
    } finally {
      setSaving(false);
    }
  }, [imageSource, imageBase64, imageUrl]);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.toolHeader}>
          <ImageIcon size={18} color={COLORS.accent} />
          <Text style={styles.toolTitle}>Generating Image...</Text>
        </View>
        <View style={styles.imageLoadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Creating your image</Text>
          {prompt && (
            <Text style={styles.promptPreview} numberOfLines={2}>
              "{prompt}"
            </Text>
          )}
        </View>
      </View>
    );
  }

  if (!imageSource) {
    return (
      <View style={styles.container}>
        <View style={styles.toolHeader}>
          <ImageIcon size={18} color={COLORS.error} />
          <Text style={styles.toolTitle}>Image Generation Failed</Text>
        </View>
        <Text style={styles.errorText}>No image was generated</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolHeader}>
        <ImageIcon size={18} color={COLORS.accent} />
        <Text style={styles.toolTitle}>Generated Image</Text>
        {style && (
          <View style={styles.styleBadge}>
            <Text style={styles.styleBadgeText}>{style}</Text>
          </View>
        )}
      </View>

      {prompt && (
        <Text style={styles.promptText} numberOfLines={2}>
          "{prompt}"
        </Text>
      )}

      <Pressable
        style={styles.imageContainer}
        onPress={() => setModalVisible(true)}
      >
        <Image
          source={imageSource}
          style={styles.generatedImage}
          resizeMode="cover"
        />
        <View style={styles.imageOverlay}>
          <Maximize2 size={24} color={COLORS.fg} />
        </View>
      </Pressable>

      <View style={styles.imageActions}>
        <Pressable
          style={[styles.actionBtn, saving && styles.actionBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.fg} />
          ) : (
            <>
              <Download size={16} color={COLORS.fg} />
              <Text style={styles.actionBtnText}>Save</Text>
            </>
          )}
        </Pressable>
      </View>

      {error && (
        <Text style={styles.saveError}>{error}</Text>
      )}

      {/* Full screen modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable
            style={styles.modalCloseBtn}
            onPress={() => setModalVisible(false)}
          >
            <X size={24} color={COLORS.fg} />
          </Pressable>
          
          <Image
            source={imageSource}
            style={styles.modalImage}
            resizeMode="contain"
          />
          
          <View style={styles.modalActions}>
            <Pressable
              style={styles.modalActionBtn}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.fg} />
              ) : (
                <>
                  <Download size={20} color={COLORS.fg} />
                  <Text style={styles.modalActionText}>Save to Gallery</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
});

/**
 * Generic Tool Result Display
 * Automatically renders the appropriate view based on tool type
 */
export default function ToolResultView({ toolName, result, isLoading }) {
  if (toolName === 'web_search') {
    return (
      <WebSearchResults
        results={result?.results}
        query={result?.query}
      />
    );
  }

  if (toolName === 'generate_image') {
    return (
      <GeneratedImageView
        imageUrl={result?.imageUrl}
        imageBase64={result?.imageBase64}
        prompt={result?.prompt}
        style={result?.style}
        isLoading={isLoading}
      />
    );
  }

  // Unknown tool - show raw output
  return (
    <View style={styles.container}>
      <View style={styles.toolHeader}>
        <Text style={styles.toolTitle}>{toolName}</Text>
      </View>
      <Text style={styles.rawOutput}>{result?.output || 'No output'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  
  // Tool Header
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  toolTitle: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.display,
    flex: 1,
  },
  resultCount: {
    color: COLORS.fgMuted,
    fontSize: 12,
  },
  
  // Search Results
  queryText: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  resultsContainer: {
    gap: 8,
  },
  resultCard: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  resultCardFirst: {
    borderColor: COLORS.primary + '40',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  resultDomain: {
    color: COLORS.fgMuted,
    fontSize: 11,
    flex: 1,
  },
  resultTitle: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.display,
    marginBottom: 4,
  },
  resultSnippet: {
    color: COLORS.fgMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  noResults: {
    color: COLORS.fgMuted,
    fontSize: 13,
    textAlign: 'center',
    padding: 20,
  },
  showMoreBtn: {
    marginTop: 10,
    padding: 10,
    alignItems: 'center',
  },
  showMoreText: {
    color: COLORS.primary,
    fontSize: 13,
  },
  
  // AI Summary (Tavily)
  summaryCard: {
    backgroundColor: COLORS.primary + '15',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.primary + '30',
    marginBottom: 8,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  summaryTitle: {
    color: COLORS.primary,
    fontSize: 13,
    fontFamily: FONTS.display,
  },
  summaryText: {
    color: COLORS.fg,
    fontSize: 13,
    lineHeight: 20,
  },
  
  // Generated Image
  imageLoadingContainer: {
    alignItems: 'center',
    padding: 40,
    gap: 12,
  },
  loadingText: {
    color: COLORS.fgMuted,
    fontSize: 14,
  },
  promptPreview: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    maxWidth: '80%',
  },
  promptText: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  styleBadge: {
    backgroundColor: COLORS.accent + '30',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  styleBadgeText: {
    color: COLORS.accent,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.bg,
  },
  generatedImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
  },
  imageOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 6,
  },
  imageActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    color: COLORS.fg,
    fontSize: 13,
  },
  saveError: {
    color: COLORS.error,
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  errorText: {
    color: COLORS.error,
    fontSize: 13,
    textAlign: 'center',
    padding: 20,
  },
  
  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  modalImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  modalActions: {
    position: 'absolute',
    bottom: 50,
    flexDirection: 'row',
    gap: 20,
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
  },
  modalActionText: {
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.display,
  },
  
  // Raw output
  rawOutput: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.mono,
  },
  
  // Perplexity Search Cards
  pplxContainer: {
    marginTop: 12,
    marginBottom: 8,
  },
  pplxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  pplxLogoPlaceholder: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pplxHeaderText: {
    color: COLORS.fg,
    fontSize: 13,
    fontFamily: FONTS.display,
  },
  pplxScrollContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
  },
  pplxCard: {
    width: 220,
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  pplxCardFirst: {
    marginLeft: 0,
  },
  pplxCardMeta: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  pplxCardDate: {
    color: COLORS.fgMuted,
    fontSize: 10,
    backgroundColor: COLORS.primary + '15',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pplxCardSource: {
    color: COLORS.fgMuted,
    fontSize: 10,
    backgroundColor: COLORS.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pplxCardTitle: {
    color: COLORS.fg,
    fontSize: 13,
    fontFamily: FONTS.display,
    lineHeight: 18,
    marginBottom: 4,
  },
  pplxCardSnippet: {
    color: COLORS.fgMuted,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  pplxCardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 'auto',
  },
  pplxCardLinkText: {
    color: COLORS.primary,
    fontSize: 11,
    fontFamily: FONTS.display,
  },
});
