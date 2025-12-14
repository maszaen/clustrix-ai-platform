/**
 * MarkdownWebView - High-performance WebView-based markdown renderer
 * Uses direct DOM manipulation like Electron for zero-lag streaming
 */
import React, { useRef, useEffect, useState, useCallback, memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { COLORS } from '../constants/colors';

// Minified core markdown parser (extracted from desktop md.js)
// Focused on streaming performance - handles: bold, italic, code, links, headings, lists, code blocks
const MD_PARSER_JS = `
// HTML escape
function esc(t){if(!t)return'';return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

// Inline markdown
function parseInline(text){
  if(!text)return'';
  return text
    .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g,'<pre><code>$1</code></pre>')
    .replace(/\`([^\`]+)\`/g,'<code>$1</code>')
    .replace(/\\*\\*\\*(.+?)\\*\\*\\*/g,'<strong><em>$1</em></strong>')
    .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>')
    .replace(/\\*([^*]+)\\*/g,'<em>$1</em>')
    .replace(/~~(.+?)~~/g,'<del>$1</del>')
    .replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g,'<a href="$2">$1</a>');
}

// Block-level markdown parser
function md(src){
  if(!src)return'';
  const lines=src.split('\\n');
  let html='';
  let inCodeBlock=false;
  let codeBuffer='';
  let codeLang='';
  let listStack=[];
  
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const trimmed=line.trim();
    
    // Code blocks
    if(trimmed.startsWith('\`\`\`')){
      if(inCodeBlock){
        html+='<pre class="code-block"><code class="language-'+codeLang+'">'+esc(codeBuffer.trim())+'</code></pre>';
        codeBuffer='';codeLang='';inCodeBlock=false;
      }else{
        codeLang=trimmed.slice(3).trim()||'text';
        inCodeBlock=true;
      }
      continue;
    }
    if(inCodeBlock){codeBuffer+=line+'\\n';continue;}
    
    // Empty line - close lists
    if(!trimmed){
      while(listStack.length>0)html+='</'+listStack.pop()+'>';
      html+='<br>';continue;
    }
    
    // Headers
    const hMatch=line.match(/^(#{1,6})\\s+(.*)$/);
    if(hMatch){
      while(listStack.length>0)html+='</'+listStack.pop()+'>';
      html+='<h'+hMatch[1].length+'>'+parseInline(hMatch[2])+'</h'+hMatch[1].length+'>';
      continue;
    }
    
    // HR
    if(/^---+$/.test(trimmed)){
      while(listStack.length>0)html+='</'+listStack.pop()+'>';
      html+='<hr>';continue;
    }
    
    // Blockquote
    if(trimmed.startsWith('>')){
      const content=trimmed.slice(1).trim();
      html+='<blockquote>'+parseInline(content)+'</blockquote>';
      continue;
    }
    
    // Unordered list
    const ulMatch=line.match(/^(\\s*)[-*]\\s+(.*)$/);
    if(ulMatch){
      if(listStack.length===0||listStack[listStack.length-1]!=='ul'){
        html+='<ul>';listStack.push('ul');
      }
      html+='<li>'+parseInline(ulMatch[2])+'</li>';
      continue;
    }
    
    // Ordered list
    const olMatch=line.match(/^(\\s*)\\d+\\.\\s+(.*)$/);
    if(olMatch){
      if(listStack.length===0||listStack[listStack.length-1]!=='ol'){
        html+='<ol>';listStack.push('ol');
      }
      html+='<li>'+parseInline(olMatch[2])+'</li>';
      continue;
    }
    
    // Close lists before paragraph
    while(listStack.length>0)html+='</'+listStack.pop()+'>';
    
    // Paragraph
    html+='<p>'+parseInline(trimmed)+'</p>';
  }
  
  // Close remaining code block
  if(inCodeBlock){
    html+='<pre class="code-block"><code class="language-'+codeLang+'">'+esc(codeBuffer.trim())+'</code></pre>';
  }
  
  // Close remaining lists
  while(listStack.length>0)html+='</'+listStack.pop()+'>';
  
  return html;
}

// Expose globally
window.md=md;
`;

// CSS styles matching the app theme
const CSS_STYLES = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { 
  background: transparent; 
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  color: ${COLORS.fg};
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  word-wrap: break-word;
}
#content { padding: 0; }

p { margin: 6px 0; }
h1, h2, h3, h4, h5, h6 { 
  color: ${COLORS.fg}; 
  margin: 12px 0 8px 0;
  font-weight: 600;
}
h1 { font-size: 22px; }
h2 { font-size: 19px; }
h3 { font-size: 17px; }

a { color: ${COLORS.primary}; text-decoration: none; }
strong { font-weight: 600; color: ${COLORS.fg}; }
em { font-style: italic; }
del { text-decoration: line-through; opacity: 0.7; }

code {
  background: ${COLORS.inputBg};
  border: 1px solid ${COLORS.borderLight};
  color: #8ab4f8;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Menlo, Monaco, monospace;
  font-size: 13px;
}

pre.code-block {
  background: ${COLORS.inputBg};
  border: 1px solid ${COLORS.borderLight};
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
pre.code-block code {
  background: transparent;
  border: none;
  padding: 0;
  color: #a2a9b0;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
}

blockquote {
  border-left: 3px solid ${COLORS.borderLight};
  padding-left: 12px;
  margin: 8px 0;
  opacity: 0.9;
  color: ${COLORS.fgMuted};
}

ul, ol { 
  margin: 6px 0; 
  padding-left: 24px; 
}
li { 
  margin: 4px 0; 
}

hr {
  border: none;
  height: 1px;
  background: ${COLORS.borderLight};
  margin: 12px 0;
  opacity: 0.5;
}

br { display: block; height: 8px; }
`;

// HTML template
const getHtmlTemplate = (initialContent = '') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>${CSS_STYLES}</style>
</head>
<body>
  <div id="content">${initialContent}</div>
  <script>
    ${MD_PARSER_JS}
    
    // Update content and notify height
    window.updateContent = function(markdown) {
      document.getElementById('content').innerHTML = md(markdown);
      notifyHeight();
    };
    
    // Notify React Native of content height
    function notifyHeight() {
      const height = document.getElementById('content').scrollHeight;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', value: height }));
    }
    
    // Initial height notification
    setTimeout(notifyHeight, 50);
    
    // Observe size changes
    const observer = new ResizeObserver(notifyHeight);
    observer.observe(document.getElementById('content'));
  </script>
</body>
</html>
`;

const MarkdownWebView = memo(function MarkdownWebView({ 
  content, 
  isStreaming = false,
  minHeight = 20,
  onHeightChange,
}) {
  const webViewRef = useRef(null);
  const [height, setHeight] = useState(minHeight);
  const lastContentRef = useRef('');
  const isReadyRef = useRef(false);
  const pendingContentRef = useRef(null);
  
  // Handle messages from WebView
  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'height') {
        const newHeight = Math.max(minHeight, data.value + 10);
        setHeight(newHeight);
        onHeightChange?.(newHeight);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }, [minHeight, onHeightChange]);
  
  // Inject content update when content changes
  useEffect(() => {
    if (content !== lastContentRef.current && webViewRef.current) {
      lastContentRef.current = content;
      
      if (isReadyRef.current) {
        // WebView ready - inject directly
        const escaped = JSON.stringify(content);
        webViewRef.current.injectJavaScript(`
          window.updateContent(${escaped});
          true;
        `);
      } else {
        // WebView not ready - queue for later
        pendingContentRef.current = content;
      }
    }
  }, [content]);
  
  // Handle WebView load complete
  const handleLoad = useCallback(() => {
    isReadyRef.current = true;
    
    // Process any pending content
    if (pendingContentRef.current) {
      const escaped = JSON.stringify(pendingContentRef.current);
      webViewRef.current?.injectJavaScript(`
        window.updateContent(${escaped});
        true;
      `);
      pendingContentRef.current = null;
    }
  }, []);
  
  // Pre-render initial content in HTML to avoid flash
  const initialHtml = getHtmlTemplate(content ? '' : '');
  
  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webViewRef}
        source={{ html: initialHtml }}
        style={styles.webview}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={false}
        onMessage={handleMessage}
        onLoad={handleLoad}
        androidLayerType="hardware"
        cacheEnabled={false}
        // Transparent background
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        mixedContentMode="compatibility"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default MarkdownWebView;
