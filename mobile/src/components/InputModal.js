import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TextInput } from 'react-native';
import ReanimatedModule, { useAnimatedStyle } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';
import RipplePressable from './RipplePressable';
import { Eye, EyeClosed } from 'lucide-react-native';

/**
 * Reusable Input Modal
 * @param {boolean} visible - Modal visibility
 * @param {string} title - Modal title
 * @param {Array} fields - Array of field configs: [{ key, label, placeholder, value, multiline, secureTextEntry }]
 * @param {string} submitText - Submit button text (default: "Save")
 * @param {string} cancelText - Cancel button text (default: "Cancel")
 * @param {boolean} haveEyes - Enables secure input with eye toggle
 * @param {function} onSubmit - Called with object of { key: value } pairs
 * @param {function} onCancel - Called when cancelled
 */
export default function InputModal({ 
  visible, 
  title, 
  fields = [], 
  submitText = 'Save',
  cancelText = 'Cancel',
  haveEyes = false,
  onSubmit, 
  onCancel 
}) {
  const [values, setValues] = useState({});
  const inputRefs = useRef([]);
  const hasFocusedRef = useRef(false);
  const [showSecret, setShowSecret] = useState(false);
  // Smooth keyboard-aware translate for modal content.
  const { height: keyboardAnimatedHeight } = useReanimatedKeyboardAnimation();
  const modalAnimatedStyle = useAnimatedStyle(() => {
    // Keep modal centered when keyboard is closed.
    if (keyboardAnimatedHeight.value === 0) {
      return { transform: [{ translateY: 0 }] };
    }
    // Mirror chat screen transform behavior for consistent keyboard movement.
    // Use 40% keyboard height for a subtler lift.
    return { transform: [{ translateY: keyboardAnimatedHeight.value * 0.4 }] };
  });

  useEffect(() => {
    if (visible) {
      const initial = {};
      fields.forEach(f => { initial[f.key] = f.value || ''; });
      setValues(initial);
    }
  }, [visible, fields]);

  useEffect(() => {
    if (!visible) {
      hasFocusedRef.current = false;
      setShowSecret(false);
      return;
    }
    if (hasFocusedRef.current) return;
    const timer = setTimeout(() => {
      if (!hasFocusedRef.current) {
        inputRefs.current?.[0]?.focus?.();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [visible]);

  const handleChange = (key, text) => {
    setValues(prev => ({ ...prev, [key]: text }));
  };

  const handleSubmit = () => {
    // Check if all required fields have values
    const allFilled = fields.every(f => !f.required || values[f.key]?.trim());
    if (allFilled) {
      onSubmit(values);
    }
  };

  const isValid = fields.every(f => !f.required || values[f.key]?.trim());

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <ReanimatedModule.View style={[styles.modal, modalAnimatedStyle]}>
          <Text style={styles.title}>{title}</Text>
          
          {fields.map((field, idx) => (
            <View key={field.key} style={idx < fields.length - 1 ? styles.fieldContainer : null}>
              {/* {field.label && <Text style={styles.label}>{field.label}</Text>} */}
              {/* Optional eye toggle for sensitive fields (e.g., API keys). */}
              {haveEyes ? (
                <View style={styles.inputRow}>
                  <TextInput
                    style={[styles.inputFlex, field.multiline && styles.inputMultiline]}
                    value={values[field.key] || ''}
                    onChangeText={(text) => handleChange(field.key, text)}
                    placeholder={field.placeholder || ''}
                    placeholderTextColor={COLORS.fgMuted}
                    ref={(ref) => { inputRefs.current[idx] = ref; }}
                    onFocus={() => { hasFocusedRef.current = true; }}
                    onBlur={() => { hasFocusedRef.current = false; }}
                    selectTextOnFocus={idx === 0}
                    multiline={field.multiline}
                    numberOfLines={field.multiline ? 4 : 1}
                    secureTextEntry={!showSecret}
                    keyboardType={field.keyboardType || 'default'}
                    autoCapitalize={field.autoCapitalize || 'sentences'}
                    autoCorrect={field.autoCorrect}
                    onSubmitEditing={fields.length === 1 ? handleSubmit : undefined}
                  />
                  <RipplePressable
                    style={styles.eyeBtn}
                    onPress={() => setShowSecret(prev => !prev)}
                    android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true, foreground: true }}
                  >
                    {showSecret ? (
                      <EyeClosed size={18} color={COLORS.fgMuted} />
                    ) : (
                      <Eye size={18} color={COLORS.fgMuted} />
                    )}
                  </RipplePressable>
                </View>
              ) : (
                <TextInput
                  style={[styles.input, field.multiline && styles.inputMultiline]}
                  value={values[field.key] || ''}
                  onChangeText={(text) => handleChange(field.key, text)}
                  placeholder={field.placeholder || ''}
                  placeholderTextColor={COLORS.fgMuted}
                  ref={(ref) => { inputRefs.current[idx] = ref; }}
                  onFocus={() => { hasFocusedRef.current = true; }}
                  onBlur={() => { hasFocusedRef.current = false; }}
                  selectTextOnFocus={idx === 0}
                  multiline={field.multiline}
                  numberOfLines={field.multiline ? 4 : 1}
                  secureTextEntry={field.secureTextEntry}
                  keyboardType={field.keyboardType || 'default'}
                  autoCapitalize={field.autoCapitalize || 'sentences'}
                  autoCorrect={field.autoCorrect}
                  onSubmitEditing={fields.length === 1 ? handleSubmit : undefined}
                />
              )}
            </View>
          ))}
          
          <View style={styles.buttons}>
            <RipplePressable
              style={styles.cancelBtn}
              onPress={onCancel}
              android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: false, foreground: true }}
              clipRipple
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </RipplePressable>
            <RipplePressable 
              style={[styles.submitBtn, !isValid && styles.submitDisabled]} 
              onPress={handleSubmit}
              disabled={!isValid}
              android_ripple={{ color: 'rgba(255,255,255,0.2)', borderless: false, foreground: true }}
              clipRipple
            >
              <Text style={[styles.submitText, !isValid && styles.submitTextDisabled]}>{submitText}</Text>
            </RipplePressable>
          </View>
        </ReanimatedModule.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modal: {
    width: '100%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    color: COLORS.fg,
    fontSize: 16,
    paddingHorizontal: 6,
    fontFamily: FONTS.displayItalic,
    paddingBottom: 8,
  },
  fieldContainer: {
    marginBottom: 12,
  },
  label: {
    color: COLORS.fgMuted,
    fontSize: 12,
    fontFamily: FONTS.ai,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 12,
    marginRight: 6,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
    marginBottom: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'start',
    backgroundColor: COLORS.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    marginRight: 6,
    marginBottom: 8,
  },
  inputFlex: {
    flex: 1,
    padding: 12,
    color: COLORS.fg,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  eyeBtn: {
    paddingHorizontal: 0,
    marginRight: 12,
    justifyContent: 'center',
  },
  inputMultiline: {
    marginRight: 6,
    textAlignVertical: 'top',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    paddingRight: 6,
    marginTop: 8,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: 'transparent',
  },
  cancelText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  submitBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: COLORS.primary40,
    backgroundColor: COLORS.primaryLight,
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.sans,
  },
  submitTextDisabled: {
    color: COLORS.fgMuted,
  },
});
