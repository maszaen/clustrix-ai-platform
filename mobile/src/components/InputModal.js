import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, Pressable } from 'react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

/**
 * Reusable Input Modal
 * @param {boolean} visible - Modal visibility
 * @param {string} title - Modal title
 * @param {Array} fields - Array of field configs: [{ key, label, placeholder, value, multiline, secureTextEntry }]
 * @param {string} submitText - Submit button text (default: "Save")
 * @param {string} cancelText - Cancel button text (default: "Cancel")
 * @param {function} onSubmit - Called with object of { key: value } pairs
 * @param {function} onCancel - Called when cancelled
 */
export default function InputModal({ 
  visible, 
  title, 
  fields = [], 
  submitText = 'Save',
  cancelText = 'Cancel',
  onSubmit, 
  onCancel 
}) {
  const [values, setValues] = useState({});

  useEffect(() => {
    if (visible) {
      const initial = {};
      fields.forEach(f => { initial[f.key] = f.value || ''; });
      setValues(initial);
    }
  }, [visible, fields]);

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
        <View style={styles.modal}>
          <Text style={styles.title}>{title}</Text>
          
          {fields.map((field, idx) => (
            <View key={field.key} style={idx < fields.length - 1 ? styles.fieldContainer : null}>
              {field.label && <Text style={styles.label}>{field.label}</Text>}
              <TextInput
                style={[styles.input, field.multiline && styles.inputMultiline]}
                value={values[field.key] || ''}
                onChangeText={(text) => handleChange(field.key, text)}
                placeholder={field.placeholder || ''}
                placeholderTextColor={COLORS.fgMuted}
                autoFocus={idx === 0}
                selectTextOnFocus={idx === 0}
                multiline={field.multiline}
                numberOfLines={field.multiline ? 4 : 1}
                secureTextEntry={field.secureTextEntry}
                keyboardType={field.keyboardType || 'default'}
                autoCapitalize={field.autoCapitalize || 'sentences'}
                onSubmitEditing={fields.length === 1 ? handleSubmit : undefined}
              />
            </View>
          ))}
          
          <View style={styles.buttons}>
            <Pressable style={styles.cancelBtn} onPress={onCancel} android_ripple={{ color: 'rgba(255,255,255,0.1)' }}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </Pressable>
            <Pressable 
              style={[styles.submitBtn, !isValid && styles.submitDisabled]} 
              onPress={handleSubmit}
              disabled={!isValid}
              android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
            >
              <Text style={[styles.submitText, !isValid && styles.submitTextDisabled]}>{submitText}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    width: '100%',
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    color: COLORS.fg,
    fontSize: 18,
    fontFamily: FONTS.display,
    marginBottom: 16,
  },
  fieldContainer: {
    marginBottom: 12,
  },
  label: {
    color: COLORS.fgMuted,
    fontSize: 14,
    fontFamily: FONTS.display,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 14,
    color: COLORS.fg,
    fontSize: 16,
    fontFamily: FONTS.sans,
    marginBottom: 8,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
  },
  cancelText: {
    color: COLORS.fgMuted,
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  submitBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
  },
  submitDisabled: {
    backgroundColor: COLORS.borderLight,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONTS.sans,
  },
  submitTextDisabled: {
    color: COLORS.fgMuted,
  },
});
