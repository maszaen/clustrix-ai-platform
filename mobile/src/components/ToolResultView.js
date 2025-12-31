/**
 * ToolResultView - Display agentic tool results in chat
 * Shows web search results and generated images in a nice UI
 */

import { useState, memo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, Image, Pressable, Linking, ActivityIndicator, Dimensions } from 'react-native';
// Use gesture-handler components to prevent sidebar swipe conflicts on horizontal scroll
import { ScrollView, PanGestureHandler } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { ExternalLink, Image as ImageIcon, Search, Download, Sparkles, Maximize2 } from 'lucide-react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Gradient constants for horizontal scroll
const GRADIENT_MAX_WIDTH = 26;   // Max gradient width in pixels
const GRADIENT_THRESHOLD = 100;  // Scroll distance for full gradient (0 to full in 100px)

/**
 * Horizontal ScrollView with fade gradients on left/right edges
 * - Left gradient: 0 width initially, grows to 16px after 100px scroll
 * - Right gradient: 16px initially, shrinks to 0 when near end (100px threshold)
 * - Wrapped with PanGestureHandler to capture horizontal gestures and prevent sidebar swipe
 */
const HorizontalScrollWithGradients = memo(function HorizontalScrollWithGradients({ children, contentContainerStyle }) {
  const [leftGradientWidth, setLeftGradientWidth] = useState(0);
  const [rightGradientWidth, setRightGradientWidth] = useState(GRADIENT_MAX_WIDTH);
  const [contentWidth, setContentWidth] = useState(0);
  const [layoutWidth, setLayoutWidth] = useState(0);

  // Handle scroll to update gradient widths
  const handleScroll = useCallback((event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollX = contentOffset.x;
    const maxScroll = contentSize.width - layoutMeasurement.height;
    
    // Left gradient: 0 at start, grows as user scrolls right (max at 100px scroll)
    const leftWidth = Math.min(GRADIENT_MAX_WIDTH, (scrollX / GRADIENT_THRESHOLD) * GRADIENT_MAX_WIDTH);
    setLeftGradientWidth(Math.max(0, leftWidth));
    
    // Right gradient: full at start, shrinks as user approaches end (100px threshold)
    const distanceFromEnd = maxScroll - scrollX;
    const rightWidth = Math.min(GRADIENT_MAX_WIDTH, (distanceFromEnd / GRADIENT_THRESHOLD) * GRADIENT_MAX_WIDTH);
    setRightGradientWidth(Math.max(0, rightWidth));
  }, []);

  // Track content size to determine if scrollable
  const handleContentSizeChange = useCallback((width, height) => {
    setContentWidth(width);
  }, []);

  const handleLayout = useCallback((event) => {
    setLayoutWidth(event.nativeEvent.layout.width);
  }, []);

  // Check if content is scrollable (content wider than container)
  const isScrollable = contentWidth > layoutWidth;

  return (
    // PanGestureHandler wrapper captures horizontal gestures to prevent sidebar from intercepting
    <PanGestureHandler activeOffsetX={[-10, 10]} failOffsetY={[-20, 20]}>
      <View style={styles.horizontalScrollWrapper}>
        {/* Left gradient - fades content on left edge */}
        {isScrollable && leftGradientWidth > 0 && (
          <View style={[styles.leftGradient, { width: leftGradientWidth }]} pointerEvents="none">
            <LinearGradient
              colors={[COLORS.bg, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
        
        {/* Scrollable content */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleLayout}
          scrollEventThrottle={16}
          contentContainerStyle={[contentContainerStyle, styles.scrollContentMinHeight]}
        >
          {children}
        </ScrollView>
        
        {/* Right gradient - fades content on right edge */}
        {isScrollable && rightGradientWidth > 0 && (
          <View style={[styles.rightGradient, { width: rightGradientWidth - 10 }]} pointerEvents="none">
            <LinearGradient
              colors={['transparent', COLORS.bg]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
        )}
      </View>
    </PanGestureHandler>
  );
});

/**
 * Spacer element between cards - transparent View that handles touch
 * This ensures scrolling works even when touching the gap between cards
 */
const CardSpacer = memo(function CardSpacer() {
  return <View style={styles.cardSpacer} />;
});

/**
 * Web Search Result Card - Horizontal scroll card (unified with Perplexity style)
 * Displays agentic web search results in horizontal scrolling cards
 */
const SearchResultCard = memo(function SearchResultCard({ result, isFirst }) {
  const handlePress = useCallback(() => {
    if (result.link) {
      Linking.openURL(result.link);
    }
  }, [result.link]);

  // Extract domain from URL
  const getDomain = () => {
    try {
      return result.link ? new URL(result.link).hostname.replace('www.', '') : 'web';
    } catch {
      return 'web';
    }
  };

  // AI summary card (from Tavily) - keep as full-width card
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

  // Horizontal scroll card style (like Perplexity)
  return (
    <Pressable
      style={[styles.pplxCard, isFirst && styles.pplxCardFirst]}
      onPress={handlePress}
      android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
    >
      <View style={styles.pplxCardMeta}>
        <Text style={styles.pplxCardSource}>{getDomain()}</Text>
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

/**
 * Web Search Results Container - Horizontal scrolling cards (unified with Perplexity)
 */
export const WebSearchResults = memo(function WebSearchResults({ results, query }) {
  // Don't render anything if no results
  if (!results || results.length === 0) {
    return null;
  }

  // Separate AI summary from regular results
  const aiSummary = results.find(r => r.source === 'tavily_answer');
  const webResults = results.filter(r => r.source !== 'tavily_answer');

  return (
    <View style={styles.pplxContainer}>
      {/* Header */}
      <View style={styles.pplxHeader}>
        <View style={styles.pplxLogoPlaceholder}>
          <Search size={14} color={COLORS.primary} />
        </View>
        <Text style={styles.pplxHeaderText}>
          Search Results ({webResults.length})
        </Text>
      </View>
      
      {/* AI Summary (if available from Tavily) */}
      {aiSummary && (
        <SearchResultCard result={aiSummary} isFirst={true} />
      )}
      
      {/* Horizontal scroll container with fade gradients */}
      <HorizontalScrollWithGradients contentContainerStyle={styles.pplxScrollContainer}>
        {webResults.map((result, index) => (
          <View key={result.link || index} style={styles.cardWithSpacer}>
            <SearchResultCard
              result={result}
              isFirst={index === 0}
            />
            {/* Add spacer after each card except the last one */}
            {index < webResults.length - 1 && <CardSpacer />}
          </View>
        ))}
      </HorizontalScrollWithGradients>
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
      
      {/* Horizontal scroll container with fade gradients */}
      <HorizontalScrollWithGradients contentContainerStyle={styles.pplxScrollContainer}>
        {results.map((result, index) => (
          <View key={result.url || index} style={styles.cardWithSpacer}>
            <PerplexitySearchCard
              result={result}
              isFirst={index === 0}
            />
            {/* Add spacer after each card except the last one */}
            {index < results.length - 1 && <CardSpacer />}
          </View>
        ))}
      </HorizontalScrollWithGradients>
    </View>
  );
});


/**
 * Generated Image View
 */
export const GeneratedImageView = memo(function GeneratedImageView({ imageUrl, imageBase64, prompt, style, isLoading, onImagePress }) {
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [cachedUri, setCachedUri] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 1024, height: 1024 });

  // Save base64 to cache file on mount - so modal can use file URI instead of data URI
  useEffect(() => {
    const cacheImage = async () => {
      if (imageBase64 && !cachedUri) {
        try {
          const filename = `generated_${Date.now()}.png`;
          const fileUri = FileSystem.cacheDirectory + filename;
          await FileSystem.writeAsStringAsync(fileUri, imageBase64, {
            encoding: 'base64',
          });
          setCachedUri(fileUri);
          
          // Get actual image dimensions
          Image.getSize(fileUri, (width, height) => {
            setImageDimensions({ width, height });
          }, (err) => {
            console.log('Failed to get image size:', err);
          });
        } catch (e) {
          console.log('Failed to cache generated image:', e);
        }
      } else if (imageUrl && !cachedUri) {
        // For URL-based images, get size directly
        Image.getSize(imageUrl, (width, height) => {
          setImageDimensions({ width, height });
        }, (err) => {
          console.log('Failed to get image size from URL:', err);
        });
      }
    };
    cacheImage();
  }, [imageBase64, imageUrl]);

  // Get the image source - prefer cached file URI over data URI
  const imageSource = cachedUri
    ? { uri: cachedUri }
    : imageBase64
      ? { uri: `data:image/png;base64,${imageBase64}` }
      : imageUrl
        ? { uri: imageUrl }
        : null;

  const handleSave = useCallback(async () => {
    if (!imageSource) return;

    try {
      setSaving(true);
      setError(null);
      setSaveSuccess(false);

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
          encoding: 'base64', // Use string directly - EncodingType may not be available
        });
      } else if (imageUrl) {
        // Download image from URL
        const filename = `clustrix_image_${Date.now()}.png`;
        localUri = FileSystem.documentDirectory + filename;
        const downloadResult = await FileSystem.downloadAsync(imageUrl, localUri);
        localUri = downloadResult.uri;
      }

      if (localUri) {
        // Save to media library
        await MediaLibrary.saveToLibraryAsync(localUri);
        
        // Clean up temp file
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch (e) {
      setError('Failed to save image');
      console.error('Save image error:', e);
    } finally {
      setSaving(false);
    }
  }, [imageBase64, imageUrl]);

  // Open image in App.js level modal with download capability
  const handleImagePress = useCallback(() => {
    if (imageSource && onImagePress) {
      // Pass uri, isDownloadable, and actual dimensions from Image.getSize
      onImagePress({ 
        uri: imageSource.uri, 
        isDownloadable: true,
        width: imageDimensions.width,
        height: imageDimensions.height,
      });
    }
  }, [imageSource, onImagePress, imageDimensions]);

  if (isLoading) {
    return (
      <>
      </>
      // <View style={styles.container}>
      //   <View style={styles.toolHeader}>
      //     <ImageIcon size={18} color={COLORS.accent} />
      //     <Text style={styles.toolTitle}>Generating Image...</Text>
      //   </View>
      //   <View style={styles.imageLoadingContainer}>
      //     <ActivityIndicator size="large" color={COLORS.primary} />
      //     <Text style={styles.loadingText}>Creating your image</Text>
      //     {prompt && (
      //       <Text style={styles.promptPreview} numberOfLines={2}>
      //         "{prompt}"
      //       </Text>
      //     )}
      //   </View>
      // </View>
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
    <View style={styles.container2}>
      <View style={styles.toolHeader}>
        
        {/* Download button in header */}
        {/* <Pressable
          style={[styles.headerDownloadBtn, saving && styles.actionBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
          android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: true }}
        >
          {saving ? (
            <ActivityIndicator size="small" color={COLORS.fg} />
          ) : saveSuccess ? (
            <Sparkles size={18} color={COLORS.success} />
          ) : (
            <Download size={18} color={COLORS.fg} />
          )}
        </Pressable> */}
      </View>

      

      <Pressable
        style={styles.imageContainer}
        onPress={handleImagePress}
      >
        <Image
          source={imageSource}
          style={styles.generatedImage}
          resizeMode="cover"
        />
        <View style={styles.imageOverlay}>
          {style && (
          <View style={styles.styleBadge}>
            <Text style={styles.styleBadgeText}>{style}</Text>
          </View>
        )}
        </View>
        <View style={styles.imageTextOverlay}>
          {prompt && (
            <Text style={styles.promptText} numberOfLines={2}>
              {prompt}
            </Text>
          )}
        </View>
      </Pressable>

      {error && (
        <Text style={styles.saveError}>{error}</Text>
      )}
    </View>
  );
});

/**
 * Generic Tool Result Display
 * Automatically renders the appropriate view based on tool type
 */
export default function ToolResultView({ toolName, result, isLoading, onImagePress }) {
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
        onImagePress={onImagePress}
      />
    );
  }

  // Unknown tool - show raw output
  return
  // return (
  //   <View style={styles.container}>
  //     <View style={styles.toolHeader}>
  //       <Text style={styles.toolTitle}>{toolName}</Text>
  //     </View>
  //     <Text style={styles.rawOutput}>{result?.output || 'No output'}</Text>
  //   </View>
  // );
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
  container2: {
    marginVertical: 0,
    paddingHorizontal: 10,
    paddingBottom: 6,
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
    fontSize: 14.7,
    fontFamily: FONTS.ai,
    marginBottom: 10,
  },
  styleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  styleBadgeText: {
    color: COLORS.fg,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  headerDownloadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.inputBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
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
    borderRadius: 20,
    padding: 3,
  },

  imageTextOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    left: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 7,
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
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  // Container for card + spacer - keeps them in a row
  cardWithSpacer: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  // Spacer between cards - transparent View that handles touch for scrolling
  cardSpacer: {
    width: 10,
    backgroundColor: 'transparent',
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
  
  // Horizontal scroll with gradients
  horizontalScrollWrapper: {
    position: 'relative',
  },
  scrollContentMinHeight: {
    minHeight: 140, // Ensures touch area covers gaps between cards
  },
  leftGradient: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
  rightGradient: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 10,
  },
});
