import { memo } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Reanimated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { X, FileText, File, FileImage, FileVideo, FileAudio, FileCode, FileSpreadsheet, FileArchive } from 'lucide-react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

// Animation config
const ANIM_DURATION = 100;
const LAYOUT_SPRING_CONFIG = { damping: 30, stiffness: 350, mass: 1 };

/**
 * Get file icon based on mime type or extension
 */
const getFileIcon = (mimeType, filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  
  // PDF
  if (mimeType?.includes('pdf') || ext === 'pdf') {
    return { icon: FileText, color: '#FF5722' };
  }
  // Images
  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) {
    return { icon: FileImage, color: '#4CAF50' };
  }
  // Videos
  if (mimeType?.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
    return { icon: FileVideo, color: '#9C27B0' };
  }
  // Audio
  if (mimeType?.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'flac'].includes(ext)) {
    return { icon: FileAudio, color: '#FF9800' };
  }
  // Code
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'xml'].includes(ext)) {
    return { icon: FileCode, color: '#2196F3' };
  }
  // Spreadsheet
  if (mimeType?.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext)) {
    return { icon: FileSpreadsheet, color: '#4CAF50' };
  }
  // Archive
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { icon: FileArchive, color: '#8c6051ff' };
  }
  // Word/Text
  if (mimeType?.includes('word') || ['doc', 'docx', 'txt', 'rtf'].includes(ext)) {
    return { icon: FileText, color: '#2196F3' };
  }
  
  return { icon: File, color: COLORS.fgMuted };
};

/**
 * Attachment preview bar - shows selected files/images before sending
 * Inside input container, horizontal scrollable
 * Images: max 4:3 aspect, Files: square with icon
 */
function AttachmentPreview({ attachments = [], onRemove }) {
  if (!attachments || attachments.length === 0) return null;

  // Truncate filename
  const truncateName = (name, maxLen = 12) => {
    if (!name) return 'File';
    if (name.length <= maxLen) return name;
    const ext = name.split('.').pop();
    const baseName = name.slice(0, maxLen - ext.length - 3);
    return `${baseName}..${ext}`;
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
      nestedScrollEnabled={true}
      scrollEventThrottle={16}
      onTouchStart={(e) => e.stopPropagation()}
      onMoveShouldSetResponder={() => true}
      onMoveShouldSetResponderCapture={() => true}
    >
      {[...attachments].reverse().map((attachment) => {
        const originalIndex = attachments.indexOf(attachment);
        const key = attachment.id || originalIndex;
        const isImage = attachment.type === 'image';
        
        if (isImage) {
          // Dynamic aspect ratio logic
          // Default to square if dimensions missing
          const w = attachment.width || 0;
          const h = attachment.height || 0;
          const ratio = (w > 0 && h > 0) ? w / h : 1;
          
          let targetWidth = IMAGE_HEIGHT; // Default 1:1
          
          if (ratio > 1.2) {
             // Landscape -> 4:3
             targetWidth = Math.round(IMAGE_HEIGHT * (4/3));
          } else if (ratio < 0.8) {
             // Portrait -> 3:4
             targetWidth = Math.round(IMAGE_HEIGHT * (3/4));
          } else {
             // Square-ish -> 1:1
             targetWidth = IMAGE_HEIGHT;
          }

          return (
            <Reanimated.View 
              key={key} 
              style={[styles.imageItem, { width: targetWidth }]}
              entering={FadeIn.duration(ANIM_DURATION)}
              exiting={FadeOut.duration(ANIM_DURATION)}
              layout={LinearTransition.springify().damping(30).stiffness(350).mass(1)}
            >
              <Image 
                source={{ uri: attachment.uri }} 
                style={styles.imagePreview}
                resizeMode="cover"
              />
              {/* Remove button - top right */}
              <Pressable
                style={styles.removeBtn}
                onPress={() => onRemove?.(attachment.id || originalIndex)}
                hitSlop={8}
              >
                <X size={12} color={COLORS.fg} strokeWidth={2.5} />
              </Pressable>
            </Reanimated.View>
          );
        } else {
          // File preview - square with icon and filename
          const { icon: FileIcon, color: iconColor } = getFileIcon(attachment.mimeType, attachment.name);
          
          return (
            <Reanimated.View 
              key={key} 
              style={styles.fileItem}
              entering={FadeIn.duration(ANIM_DURATION)}
              exiting={FadeOut.duration(ANIM_DURATION)}
              layout={LinearTransition.springify().damping(30).stiffness(350).mass(1)}
            >
              {/* File icon - top left */}
              <View style={styles.fileIconContainer}>
                <FileIcon size={20} color={iconColor} strokeWidth={1.8} />
              </View>
              
              {/* Filename - bottom left */}
              <Text style={styles.fileName} numberOfLines={2}>
                {truncateName(attachment.name)}
              </Text>
              
              {/* Remove button - top right */}
              <Pressable
                style={styles.removeBtn}
                onPress={() => onRemove?.(attachment.id || originalIndex)}
                hitSlop={8}
              >
                <X size={12} color={COLORS.fg} strokeWidth={2.5} />
              </Pressable>
            </Reanimated.View>
          );
        }
      })}
    </ScrollView>
  );
}

const IMAGE_HEIGHT = 129;
const FILE_SIZE = 129;

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
    marginTop: 4,
  },
  content: {
    paddingHorizontal: 8,
    gap: 8,
    flexDirection: 'row',
  },
  // Image item styles
  imageItem: {
    height: IMAGE_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.inputBg,
  },
  // File item styles
  fileItem: {
    width: FILE_SIZE,
    height: FILE_SIZE,
    borderRadius: 12,
    backgroundColor: COLORS.bg70,
    borderWidth: 1,
    borderColor: COLORS.bg70,
    padding: 8,
    position: 'relative',
    justifyContent: 'space-between',
  },
  fileIconContainer: {
    alignSelf: 'flex-start',
  },
  fileName: {
    fontSize: 10,
    fontFamily: FONTS.sans,
    color: COLORS.fg,
    lineHeight: 12,
  },
  // Remove button - positioned top right
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(AttachmentPreview);
