/**
 * PDF Extraction Service - Native Implementation
 * 
 * Uses react-native-pdf-text-extractor for native PDF text extraction.
 * No WebView required.
 */

import { extractContent } from 'react-native-pdf-text-extractor';
import * as FileSystem from 'expo-file-system';

/**
 * Check if error indicates PDF not supported by provider
 */
export function isPdfUnsupportedError(errorMessage) {
  if (!errorMessage) return false;
  const msg = errorMessage.toLowerCase();
  return (
    msg.includes('image content must be') ||
    msg.includes('unsupported image format') ||
    msg.includes('invalid image') ||
    msg.includes('cannot process pdf') ||
    msg.includes('pdf not supported') ||
    (msg.includes('application/pdf') && (msg.includes('invalid') || msg.includes('unsupported')))
  );
}

/**
 * Extract text from PDF using native module
 * @param {string} base64Data - PDF in base64 format
 * @param {string} filename - Original filename (for temp file naming)
 * @returns {Promise<{text: string, images: [], pageCount: number}>}
 */
export async function extractPdfContent(base64Data, filename = 'temp.pdf') {
  // Save base64 to temp file
  const tempDir = FileSystem.cacheDirectory + 'pdf_extract/';
  await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true }).catch(() => {});
  
  const tempPath = tempDir + filename;
  await FileSystem.writeAsStringAsync(tempPath, base64Data, {
    encoding: FileSystem.EncodingType.Base64,
  });
  
  try {
    // Extract text using native module
    const text = await extractContent(tempPath);
    
    // Get page count estimate (rough, based on form feeds or page markers)
    const pageMarkers = text.match(/\f/g) || [];
    const pageCount = pageMarkers.length + 1;
    
    return {
      text: text.trim(),
      images: [], // Native module doesn't extract images - text only
      pageCount,
    };
  } finally {
    // Cleanup temp file
    await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});
  }
}

/**
 * Convert extracted PDF to attachment format
 */
export function convertExtractedPdfToAttachments(extracted, originalName = 'document.pdf') {
  const textContent = extracted.text 
    ? `[Extracted from ${originalName} - ${extracted.pageCount} page(s)]\n${extracted.text}\n[End extracted content]`
    : `[PDF: ${originalName} - No text content extracted]`;
  
  // Images from native extraction (not supported currently, but keeping for API compat)
  const imageAttachments = (extracted.images || []).map((img, idx) => ({
    type: 'image',
    name: `${originalName.replace('.pdf', '')}_page${img.pageNum || idx + 1}.jpg`,
    mimeType: 'image/jpeg',
    base64: img.base64,
    width: img.width,
    height: img.height,
  }));
  
  return { textContent, imageAttachments };
}

/**
 * Hook for PDF extraction - simple promise-based
 */
export function usePdfExtractor() {
  const extract = async (base64Data, filename) => {
    return extractPdfContent(base64Data, filename);
  };
  
  return { 
    extract, 
    extracting: false, // No async state tracking needed
    ExtractorComponent: null // No component needed - pure native
  };
}

export default {
  isPdfUnsupportedError,
  extractPdfContent,
  convertExtractedPdfToAttachments,
  usePdfExtractor,
};
