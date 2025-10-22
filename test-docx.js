// Test script to verify DOCX processing improvements
const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');

async function testDocxProcessing(filePath) {
  console.log(`Testing DOCX processing for: ${filePath}`);

  try {
    // Check file signature
    const buffer = await fs.readFile(filePath);
    const isValidDocx = buffer.length > 4 &&
      buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;

    console.log(`Valid DOCX signature: ${isValidDocx}`);

    if (!isValidDocx) {
      console.log('❌ Invalid DOCX file signature');
      return;
    }

    // Extract raw text
    const result = await mammoth.extractRawText({ path: filePath });
    console.log(`Raw text length: ${result.value.length}`);
    console.log(`Messages: ${result.messages.length}`);

    // Check for base64/binary content
    const cleanContent = result.value.replace(/\s/g, '');
    const isLikelyBase64 = /^[A-Za-z0-9+/=]{100,}$/.test(cleanContent) && 
                          cleanContent.length > 100 && 
                          (cleanContent.includes('=') || cleanContent.length % 4 === 0);
    const hasBinaryChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(result.value);

    console.log(`Clean content length: ${cleanContent.length}`);
    console.log(`Likely base64: ${isLikelyBase64}`);
    console.log(`Has binary chars: ${hasBinaryChars}`);

    if (isLikelyBase64) {
      console.log('🔄 Content appears to be base64 encoded, attempting decode...');
      
      try {
        const decodedContent = Buffer.from(cleanContent, 'base64').toString('utf-8');
        const decodedHasBinary = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/.test(decodedContent);
        const decodedWordCount = decodedContent.split(/\s+/).filter(word => word.length > 0).length;
        const hasIndonesianChars = /[a-zA-Z]/.test(decodedContent) && decodedContent.length > decodedContent.replace(/[^a-zA-Z\s]/g, '').length * 0.8;
        
        console.log(`Decoded content length: ${decodedContent.length}`);
        console.log(`Decoded word count: ${decodedWordCount}`);
        console.log(`Has Indonesian chars: ${hasIndonesianChars}`);
        console.log(`Decoded has binary: ${decodedHasBinary}`);
        
        if (!decodedHasBinary && decodedWordCount > 5 && hasIndonesianChars && decodedContent.length > cleanContent.length * 0.6) {
          console.log('✅ Base64 decode successful!');
          console.log(`Decoded preview: ${decodedContent.substring(0, 200)}...`);
        } else {
          console.log('❌ Decoded content validation failed');
          console.log(`Reason: binary=${decodedHasBinary}, words=${decodedWordCount}, indonesian=${hasIndonesianChars}, ratio=${(decodedContent.length / cleanContent.length).toFixed(2)}`);
        }
      } catch (decodeError) {
        console.log(`❌ Base64 decode failed: ${decodeError.message}`);
      }
    } else if (hasBinaryChars) {
      console.log('❌ Content contains binary characters');
    } else {
      console.log('✅ Content appears to be valid text');
      console.log(`Preview: ${result.value.substring(0, 100)}...`);
    }

  } catch (error) {
    console.log(`❌ Processing failed: ${error.message}`);
  }
}

// Usage: node test-docx.js <path-to-docx-file>
if (process.argv[2]) {
  testDocxProcessing(process.argv[2]);
} else {
  console.log('Usage: node test-docx.js <path-to-docx-file>');
}