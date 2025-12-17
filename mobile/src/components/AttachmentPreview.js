import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Image, ScrollView } from 'react-native';
import { X, FileText, Image as ImageIcon } from 'lucide-react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

/**
 * Attachment preview bar - shows selected files/images before sending
 * Displayed above the input field
 */
function AttachmentPreview({ attachments = [], onRemove }) {
  if (!attachments || attachments.length === 0) return null;

  // Truncate filename if too long
  const truncateName = (name, maxLen = 20) => {
    if (!name) return 'File';
    if (name.length <= maxLen) return name;
    const ext = name.split('.').pop();
    const baseName = name.slice(0, maxLen - ext.length - 4);
    return `${baseName}...${ext}`;
  };

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {attachments.map((attachment, index) => (
        <View key={attachment.id || index} style={styles.item}>
          {/* Preview */}
          {attachment.type === 'image' && attachment.uri ? (
            <Image source={{ uri: attachment.uri }} style={styles.imagePreview} />
          ) : (
            <View style={styles.filePreview}>
              <FileText size={20} color={COLORS.accent} strokeWidth={1.8} />
            </View>
          )}

          {/* Info */}
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>
              {truncateName(attachment.name)}
            </Text>
            {attachment.size && (
              <Text style={styles.size}>{formatSize(attachment.size)}</Text>
            )}
          </View>

          {/* Remove button */}
          <Pressable
            style={styles.removeBtn}
            onPress={() => onRemove?.(attachment.id || index)}
            hitSlop={8}
          >
            <X size={14} color={COLORS.fg} strokeWidth={2.5} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 80,
    marginBottom: 8,
  },
  content: {
    paddingHorizontal: 4,
    gap: 8,
    flexDirection: 'row',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 4,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    maxWidth: 180,
  },
  imagePreview: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
  },
  filePreview: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: COLORS.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    marginLeft: 10,
    marginRight: 4,
  },
  name: {
    fontSize: 13,
    fontFamily: FONTS.sans,
    color: COLORS.fg,
    marginBottom: 2,
  },
  size: {
    fontSize: 11,
    fontFamily: FONTS.sans,
    color: COLORS.fgMuted,
  },
  removeBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(AttachmentPreview);
