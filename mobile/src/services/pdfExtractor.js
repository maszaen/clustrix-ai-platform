/**
 * PDF Extraction Service - WebView + pdf.js
 * 
 * Extracts text and renders pages as images from PDF files.
 * Uses hidden WebView with pdf.js for reliable extraction.
 */

import { useRef, useCallback, useState, memo, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

// pdf.js CDN
const PDFJS_VERSION = '4.4.168';
const PDFJS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.mjs`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;

/**
 * Check if error indicates PDF not supported by provider
 */
export function isPdfUnsupportedError(errorMessage) {
  if (!errorMessage) return false;
  const msg = errorMessage.toLowerCase();
  return (
    msg.includes('image content must be') ||
    msg.includes('must be a url') ||
    msg.includes('starting with') ||
    msg.includes('unsupported image format') ||
    msg.includes('unsupported format') ||
    msg.includes('invalid image') ||
    msg.includes('invalid file') ||
    msg.includes('cannot process pdf') ||
    msg.includes('pdf not supported') ||
    msg.includes('pdf is not') ||
    msg.includes('application/pdf') ||
    (msg.includes('pdf') && (msg.includes('error') || msg.includes('invalid') || msg.includes('unsupported') || msg.includes('cannot')))
  );
}

/**
 * Convert extracted PDF to attachment format
 */
export function convertExtractedPdfToAttachments(extracted, originalName = 'document.pdf') {
  const textContent = extracted.text 
    ? `[Extracted from ${originalName} - ${extracted.pageCount || 1} page(s)]\n${extracted.text}\n[End extracted content]`
    : `[PDF: ${originalName} - No text extracted]`;
  
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

// HTML template for PDF extraction
function createExtractorHtml(base64) {
  // Escape base64 for safe embedding
  const safeBase64 = base64.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
<canvas id="c" style="display:none"></canvas>
<script type="module">
(async function() {
  try {
    // Import pdf.js
    const pdfjsLib = await import('${PDFJS_CDN}');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDFJS_WORKER}';
    
    // Decode base64 PDF
    const base64 = '${safeBase64}';
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    
    // Load PDF
    const pdf = await pdfjsLib.getDocument({ data: arr }).promise;
    const result = { text: '', images: [], pageCount: pdf.numPages };
    
    // Process each page
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      
      // Add page separator
      if (p > 1) result.text += '\\n\\n--- Page ' + p + ' ---\\n\\n';
      
      // Extract text
      const tc = await page.getTextContent();
      let lastY = null;
      for (const item of tc.items) {
        if (item.str) {
          if (lastY !== null && Math.abs(lastY - item.transform[5]) > 5) {
            result.text += '\\n';
          }
          result.text += item.str;
          lastY = item.transform[5];
        }
      }
      
      // Render page to image
      const scale = 1.2;
      const vp = page.getViewport({ scale });
      const canvas = document.getElementById('c');
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      
      // Convert to JPEG
      const imgData = canvas.toDataURL('image/jpeg', 0.65).split(',')[1];
      result.images.push({
        pageNum: p,
        base64: imgData,
        width: Math.round(vp.width),
        height: Math.round(vp.height)
      });
    }
    
    // Clean up text
    result.text = result.text.replace(/\\n{3,}/g, '\\n\\n').trim();
    
    // Send result
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, data: result }));
    
  } catch (err) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, err: err.message || 'Failed' }));
  }
})();
</script>
</body>
</html>`;
}

// Hidden WebView for extraction
const Extractor = memo(function Extractor({ base64, onDone, onFail }) {
  const done = useRef(false);
  const timer = useRef(null);
  
  useEffect(() => {
    done.current = false;
    // 60 second timeout for large PDFs
    timer.current = setTimeout(() => {
      if (!done.current) {
        done.current = true;
        onFail?.('Extraction timed out');
      }
    }, 60000);
    
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [base64, onFail]);
  
  const onMessage = useCallback((e) => {
    if (done.current) return;
    done.current = true;
    if (timer.current) clearTimeout(timer.current);
    
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.ok) {
        onDone?.(msg.data);
      } else {
        onFail?.(msg.err || 'Extraction failed');
      }
    } catch (err) {
      onFail?.('Invalid response');
    }
  }, [onDone, onFail]);
  
  if (!base64) return null;
  
  return (
    <View style={styles.wrapper}>
      <WebView
        source={{ html: createExtractorHtml(base64) }}
        onMessage={onMessage}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        onError={(e) => {
          if (!done.current) {
            done.current = true;
            onFail?.(e.nativeEvent?.description || 'WebView error');
          }
        }}
        style={styles.webview}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  webview: {
    width: 1,
    height: 1,
  },
});

/**
 * Hook for PDF extraction with promise-based API
 */
export function usePdfExtractor() {
  const [state, setState] = useState({ active: false, base64: null });
  const resolverRef = useRef(null);
  
  const extract = useCallback((base64) => {
    return new Promise((resolve, reject) => {
      resolverRef.current = { resolve, reject };
      setState({ active: true, base64 });
    });
  }, []);
  
  const onDone = useCallback((data) => {
    setState({ active: false, base64: null });
    resolverRef.current?.resolve(data);
    resolverRef.current = null;
  }, []);
  
  const onFail = useCallback((err) => {
    setState({ active: false, base64: null });
    resolverRef.current?.reject(new Error(err));
    resolverRef.current = null;
  }, []);
  
  const ExtractorComponent = state.active && state.base64 
    ? <Extractor base64={state.base64} onDone={onDone} onFail={onFail} />
    : null;
  
  return { extract, extracting: state.active, ExtractorComponent };
}

/**
 * Direct async extraction (for use without hook)
 * Note: This won't work - needs component mounted. Use usePdfExtractor hook instead.
 */
export async function extractPdfContent(base64, filename, uri) {
  // This is a placeholder - actual extraction requires WebView component
  // The ChatScreen should use usePdfExtractor hook and pass base64 to extract()
  throw new Error('Use usePdfExtractor hook instead of extractPdfContent');
}

export default {
  isPdfUnsupportedError,
  convertExtractedPdfToAttachments,
  usePdfExtractor,
};
