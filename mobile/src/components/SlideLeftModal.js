import { useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions, BackHandler } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { FONTS } from '../constants/fonts';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Get border radius for card based on position in category
 * @param {number} index - Card index
 * @param {number} total - Total cards in category
 */
function getCardRadius(index, total) {
  if (total === 1) {
    return { borderRadius: 20 };
  }
  if (index === 0) {
    return { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 };
  }
  if (index === total - 1) {
    return { borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 };
  }
  return { borderRadius: 5 };
}

/**
 * Menu Card Item
 */
function MenuCard({ icon, title, description, onPress, style, colors }) {
  return (
    <Pressable style={[styles.card, { backgroundColor: colors.bgSecondary }, style]} onPress={onPress} android_ripple={{ color: colors.ripple }}>
      <View style={styles.cardLeft}>
        <Ionicons name={icon} size={22} color={colors.fgMuted} />
        <View style={styles.cardText}>
          <Text style={[styles.cardTitle, { color: colors.fg }]}>{title}</Text>
          {description && <Text style={[styles.cardDesc, { color: colors.fgMuted }]}>{description}</Text>}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.fgMuted} />
    </Pressable>
  );
}

/**
 * Menu Category with cards
 * @param {string} title - Category title
 * @param {Array} items - Array of { icon, title, description, onPress }
 */
function MenuCategory({ title, items }) {
  const { colors } = useTheme();
  return (
    <View style={styles.category}>
      <Text style={[styles.categoryTitle, { color: colors.fgMuted }]}>{title}</Text>
      <View style={styles.categoryCards}>
        {items.map((item, index) => (
          <MenuCard
            key={item.title}
            icon={item.icon}
            title={item.title}
            description={item.description}
            onPress={item.onPress}
            style={getCardRadius(index, items.length)}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Reusable slide-left fullscreen modal
 * @param {boolean} visible - Modal visibility
 * @param {function} onClose - Called when modal is closed
 * @param {string} title - Header title
 * @param {React.ReactNode} children - Modal content (use MenuCategory for menu screens)
 * @param {boolean} showBack - Show back button (default true)
 */
export default function SlideLeftModal({ visible, onClose, title, children, showBack = true }) {
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;

  const open = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 135,
        friction: 19,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, overlayAnim]);

  const close = useCallback(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: SCREEN_WIDTH,
        useNativeDriver: true,
        tension: 135,
        friction: 19,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 125,
        useNativeDriver: true,
      }),
    ]).start(() => onClose?.());
  }, [slideAnim, overlayAnim, onClose]);

  useEffect(() => {
    if (visible) open();
  }, [visible, open]);

  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, close]);

  if (!visible) return null;

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.overlay, { opacity: overlayAnim, backgroundColor: colors.overlay }]} />
      <Animated.View style={[styles.container, { backgroundColor: colors.bg, transform: [{ translateX: slideAnim }] }]}>
        <View style={styles.header}>
          {showBack && (
            <Pressable style={[styles.backBtn, { borderColor: colors.borderLight, backgroundColor: colors.inputBg }]} onPress={close} android_ripple={{ color: colors.rippleMedium, borderless: true }}>
              <Ionicons name="arrow-back-outline" size={23} color={colors.fg} />
            </Pressable>
          )}
          <Text style={[styles.headerTitle, { color: colors.fg }, !showBack && styles.headerTitleCenter]}>{title}</Text>
        </View>
        <View style={styles.content}>
          {children}
        </View>
      </Animated.View>
    </View>
  );
}

// Export MenuCategory for use in screens
SlideLeftModal.Category = MenuCategory;
SlideLeftModal.Card = MenuCard;

const styles = StyleSheet.create({
  wrapper: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 45,
    paddingBottom: 26,
  },
  backBtn: {
    width: 45,
    height: 45,
    borderRadius: 50,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.inputBg,
  },
  headerTitle: {
    flex: 1,
    color: COLORS.fg,
    fontSize: 18,
    fontFamily: FONTS.display,
    textAlign: 'center',
    marginRight: 45,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 0,
  },
  category: {
    marginBottom: 16,
  },
  categoryTitle: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.ai,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  categoryCards: {
    gap: 3,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bgSecondary,
    padding: 14,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cardText: {
    gap: 2,
  },
  cardTitle: {
    color: COLORS.fg,
    fontSize: 16,
    fontFamily: FONTS.sans,
  },
  cardDesc: {
    color: COLORS.fgMuted,
    fontSize: 13,
    fontFamily: FONTS.sans,
  },
});
