import { memo, useMemo } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Pressable } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { FileText, File, FileImage, FileVideo, FileAudio, FileCode, FileSpreadsheet, FileArchive } from 'lucide-react-native';
import { COLORS } from '../constants/colors';
import { FONTS } from '../constants/fonts';

const SCREEN_WIDTH = Dimensions.get('window').width;
const HORIZONTAL_PADDING = 32; // paddingHorizontal 16 * 2
const MAX_BUBBLE_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING) * 0.85;
const IMAGE_GAP = 4;

/**
 * Get file icon based on mime type or extension
 */
const getFileIcon = (mimeType, filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase() || '';
  
  if (mimeType?.includes('pdf') || ext === 'pdf') {
    return { icon: FileText, color: '#FF5722' };
  }
  if (mimeType?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) {
    return { icon: FileImage, color: '#4CAF50' };
  }
  if (mimeType?.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext)) {
    return { icon: FileVideo, color: '#9C27B0' };
  }
  if (mimeType?.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'flac'].includes(ext)) {
    return { icon: FileAudio, color: '#FF9800' };
  }
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'html', 'css', 'json', 'xml'].includes(ext)) {
    return { icon: FileCode, color: '#2196F3' };
  }
  if (mimeType?.includes('spreadsheet') || ['xlsx', 'xls', 'csv'].includes(ext)) {
    return { icon: FileSpreadsheet, color: '#4CAF50' };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return { icon: FileArchive, color: '#795548' };
  }
  if (mimeType?.includes('word') || ['doc', 'docx', 'txt', 'rtf'].includes(ext)) {
    return { icon: FileText, color: '#2196F3' };
  }
  
  return { icon: File, color: COLORS.fgMuted };
};

/**
 * Message attachments display component
 * Shows files and images OUTSIDE the chat bubble
 * 
 * Layout rules:
 * - Files: Always above images, full width, column layout, bgSecondary
 * - 1 image: width = max bubble width
 * - 2 images: side by side, fill width
 * - 3+ images: square thumbnails, horizontal scroll
 */
function MessageAttachments({ attachments = [], maxWidth = MAX_BUBBLE_WIDTH }) {
  if (!attachments || attachments.length === 0) return null;

  const images = useMemo(() => attachments.filter(a => a.type === 'image'), [attachments]);
  const files = useMemo(() => attachments.filter(a => a.type === 'file'), [attachments]);
  
  const imageCount = images.length;

  // Calculate image dimensions based on count
  // Calculate image dimensions based on count
  const getImageDimensions = () => {
    if (imageCount === 1) {
      const img = images[0];
      const imgW = img.width || 800;
      const imgH = img.height || 600;
      const aspect = imgW / imgH;
      
      // Default to maxWidth
      let width = maxWidth;
      let height = width / aspect;
      
      // Cap height to prevent too tall images (max 250dp)
      if (height > 250) {
        height = 250;
        // If we cap height, should we adjust width? 
        // No, keep width full and let resizeMode="cover" handle it, or correct aspect?
        // Let's constrain height and keep width full for better UI, using cover.
      }
      
      return { width, height };
    } else if (imageCount === 2) {
      // Two images: side by side
      const w = (maxWidth - IMAGE_GAP) / 2;
      return { width: w, height: w };
    } else {
      // 3+ images: square thumbnails
      return { width: 100, height: 100 };
    }
  };

  const imageDims = getImageDimensions();

  return (
    <View style={styles.container}>
      {/* Files section - always above images */}
      {files.length > 0 && (
        <View style={[styles.filesContainer, { maxWidth }]}>
          {files.map((file, idx) => {
            const { icon: FileIcon, color: iconColor } = getFileIcon(file.mimeType, file.name);
            return (
              <View key={idx} style={styles.fileItem}>
                <FileIcon size={18} color={iconColor} strokeWidth={1.8} />
                <Text style={styles.fileName} numberOfLines={1}>
                  {file.name || 'File'}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Images section */}
      {imageCount > 0 && (
        imageCount <= 2 ? (
          // 1-2 images: flex row
          <View style={[styles.imagesRow, { maxWidth }]}>
            {images.map((img, idx) => (
              <Image
                key={idx}
                source={{ uri: img.uri }}
                style={[
                  styles.image,
                  { 
                    width: imageDims.width, 
                    height: imageDims.height,
                    marginRight: idx < imageCount - 1 ? IMAGE_GAP : 0,
                  }
                ]}
                resizeMode="cover"
              />
            ))}
          </View>
        ) : (
          // 3+ images: horizontal scroll - wrap in View with fixed height
          <View style={{ height: imageDims.height + 6, overflow: 'hidden' }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.imagesScroll}
              contentContainerStyle={styles.imagesScrollContent}
            >
              {images.map((img, idx) => (
                <Image
                  key={idx}
                  source={{ uri: img.uri }}
                  style={[styles.image, { width: imageDims.width, height: imageDims.height }]}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    maxWidth: '100%',
    marginBottom: 6,
  },
  // Files container
  filesContainer: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 0,
    gap: 10,
    flexDirection: 'column',
    minWidth: '85%', // Ensure file names have space to display
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fileName: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONTS.sans,
    color: COLORS.fg,
  },
  // Images
  imagesRow: {
    flexDirection: 'row',
    marginTop: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  imagesScroll: {
    marginTop: 6,

    maxWidth: SCREEN_WIDTH - 32,
  },
  imagesScrollContent: {
    gap: IMAGE_GAP,
    flexDirection: 'row',
  },
  image: {
    
    borderRadius: 12,
    backgroundColor: COLORS.inputBg,
  },
});

export default memo(MessageAttachments);
