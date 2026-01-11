import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import RipplePressable from './RipplePressable';

/**
 * Read-only API key field that opens a secure input modal on tap.
 */
export default function ApiKeyField({ valuePresent, placeholder, onPress }) {
  return (
    <RipplePressable
      style={styles.container}
      onPress={onPress}
      android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: false, foreground: true }}
      clipRipple
    >
      <View>
        <Text style={[styles.value, !valuePresent && styles.placeholder]}>
          {valuePresent ? '**********************************' : (placeholder || 'Tap to set API key')}
        </Text>
      </View>
    </RipplePressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12,
  },
  value: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  placeholder: {
    color: COLORS.fgMuted,
  },
});
