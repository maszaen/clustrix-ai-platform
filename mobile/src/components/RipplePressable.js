import { Pressable, StyleSheet } from 'react-native';

/**
 * Reusable Pressable with consistent ripple behavior and clipping.
 */
export default function RipplePressable({
  children,
  style,
  android_ripple,
  rippleColor,
  rippleBorderless = false,
  rippleForeground = false,
  clipRipple = false,
  onPress,
  disabled,
  ...rest
}) {
  const rippleConfig =
    android_ripple ??
    (rippleColor
      ? {
          color: rippleColor,
          borderless: rippleBorderless,
          foreground: rippleForeground,
        }
      : null);

  // Match standard Pressable usage while allowing optional ripple clipping.
  return (
    <Pressable
      {...rest}
      onPress={onPress}
      disabled={disabled}
      style={[clipRipple && styles.rippleClip, style]}
      android_ripple={rippleConfig}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rippleClip: {
    overflow: 'hidden',
  },
});
