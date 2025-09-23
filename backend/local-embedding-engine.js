/**
 * Local Embedding System - NO AI REQUIRED
 * Pure mathematical text similarity using TF-IDF and cosine similarity
 * Leverages desktop computing power for instant, token-free processing
 */

const path = require('path');
const fs = require('fs');

class LocalEmbeddingEngine {
  constructor(app) {
    this.app = app;
    this.documentIndex = new Map(); // fileName -> TF-IDF vector
    this.vocabulary = new Map(); // word -> global frequency
    this.idfCache = new Map(); // word -> IDF score
    this.indexFile = path.join(app.getPath('userData'), 'local_index.json');
    
    // Stop words for better relevance
    this.stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
    ]);
    
    this.loadIndex();
  }

  /**
   * Load existing index from disk
   */
  loadIndex() {
    try {
      if (fs.existsSync(this.indexFile)) {
        const data = fs.readFileSync(this.indexFile, 'utf-8');
        const savedIndex = JSON.parse(data);
        
        // Restore Maps from serialized data
        this.vocabulary = new Map(savedIndex.vocabulary || []);
        this.idfCache = new Map(savedIndex.idfCache || []);
        
        // Restore documentIndex with proper Map conversion for nested properties
        this.documentIndex = new Map();
        if (savedIndex.documentIndex) {
          savedIndex.documentIndex.forEach(([fileName, docData]) => {
            // Ensure tfVector and tfidfVector are Maps
            if (!docData.tfVector) {
              docData.tfVector = new Map();
            } else if (Array.isArray(docData.tfVector)) {
              docData.tfVector = new Map(docData.tfVector);
            } else if (typeof docData.tfVector === 'object' && docData.tfVector !== null) {
              // Handle case where it's a plain object (shouldn't happen but safety check)
              docData.tfVector = new Map(Object.entries(docData.tfVector));
            } else {
              // Fallback: create empty Map
              docData.tfVector = new Map();
            }

            if (!docData.tfidfVector) {
              docData.tfidfVector = new Map();
            } else if (Array.isArray(docData.tfidfVector)) {
              docData.tfidfVector = new Map(docData.tfidfVector);
            } else if (typeof docData.tfidfVector === 'object' && docData.tfidfVector !== null) {
              // Handle case where it's a plain object (shouldn't happen but safety check)
              docData.tfidfVector = new Map(Object.entries(docData.tfidfVector));
            } else {
              // Fallback: create empty Map
              docData.tfidfVector = new Map();
            }

            this.documentIndex.set(fileName, docData);
          });
        }
        
        console.log(`📚 Local Index: Loaded ${this.documentIndex.size} documents, ${this.vocabulary.size} vocabulary terms`);
      }
    } catch (error) {
      console.error('Error loading local index:', error);
      this.initializeEmpty();
    }
  }

  /**
   * Save index to disk
   */
  saveIndex() {
    try {
      // Convert documentIndex to serializable format
      const serializableDocumentIndex = Array.from(this.documentIndex.entries()).map(([fileName, docData]) => {
        return [
          fileName,
          {
            ...docData,
            tfVector: Array.from(docData.tfVector.entries()),
            tfidfVector: Array.from(docData.tfidfVector.entries())
          }
        ];
      });
      
      const indexData = {
        vocabulary: Array.from(this.vocabulary.entries()),
        idfCache: Array.from(this.idfCache.entries()),
        documentIndex: serializableDocumentIndex,
        lastSaved: new Date().toISOString(),
        documentCount: this.documentIndex.size
      };
      
      fs.writeFileSync(this.indexFile, JSON.stringify(indexData, null, 2));
      console.log(`Local Index: Saved ${this.documentIndex.size} documents to disk`);
    } catch (error) {
      console.error('Error saving local index:', error);
    }
  }

  /**
   * Initialize empty index
   */
  initializeEmpty() {
    this.vocabulary = new Map();
    this.idfCache = new Map();
    this.documentIndex = new Map();
    console.log('🆕 Local Index: Initialized empty index');
  }

  /**
   * Tokenize and clean text
   */
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.stopWords.has(word))
      .filter(word => !/^\d+$/.test(word)); // Remove pure numbers
  }

  /**
   * Calculate term frequency for a document
   */
  calculateTF(tokens) {
    const tf = new Map();
    const totalTerms = tokens.length;
    
    // Count occurrences
    tokens.forEach(token => {
      tf.set(token, (tf.get(token) || 0) + 1);
    });
    
    // Normalize by document length
    tf.forEach((count, term) => {
      tf.set(term, count / totalTerms);
    });
    
    return tf;
  }

  /**
   * Calculate inverse document frequency
   */
  calculateIDF(term) {
    if (this.idfCache.has(term)) {
      return this.idfCache.get(term);
    }
    
    const totalDocs = this.documentIndex.size;
    if (totalDocs === 0) return 0;
    
    const docsContainingTerm = Array.from(this.documentIndex.values())
      .filter(doc => doc.tfVector.has(term)).length;
    
    const idf = docsContainingTerm > 0 ? Math.log(totalDocs / docsContainingTerm) : 0;
    this.idfCache.set(term, idf);
    
    return idf;
  }

  /**
   * Calculate TF-IDF vector for a document
   */
  calculateTFIDF(tokens, docId) {
    const tf = this.calculateTF(tokens);
    const tfidf = new Map();
    
    // Update global vocabulary
    tokens.forEach(token => {
      this.vocabulary.set(token, (this.vocabulary.get(token) || 0) + 1);
    });
    
    // Calculate TF-IDF scores
    tf.forEach((tfScore, term) => {
      const idf = this.calculateIDF(term);
      tfidf.set(term, tfScore * idf);
    });
    
    return { tfVector: tf, tfidfVector: tfidf };
  }

  /**
   * Add document to index
   */
  addDocument(fileName, content, metadata = {}) {
    console.log(`📝 Local Index: Adding document ${fileName}`);
    
    const tokens = this.tokenize(content);
    if (tokens.length === 0) {
      console.log(`No meaningful tokens found in ${fileName}`);
      return;
    }
    
    const vectors = this.calculateTFIDF(tokens, fileName);
    
    this.documentIndex.set(fileName, {
      ...vectors,
      metadata: {
        ...metadata,
        fileName,
        tokenCount: tokens.length,
        addedAt: new Date().toISOString()
      },
      content: content.slice(0, 500) // Store preview for debugging
    });
    
    // Invalidate IDF cache since document count changed
    this.idfCache.clear();
    
    console.log(`Local Index: Document ${fileName} indexed with ${tokens.length} tokens`);
  }

  /**
   * Calculate cosine similarity between two TF-IDF vectors
   */
  cosineSimilarity(vectorA, vectorB) {
    const keysA = new Set(vectorA.keys());
    const keysB = new Set(vectorB.keys());
    const commonKeys = Array.from(keysA).filter(key => keysB.has(key));
    
    if (commonKeys.length === 0) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    // Calculate dot product and norms
    commonKeys.forEach(key => {
      const valueA = vectorA.get(key) || 0;
      const valueB = vectorB.get(key) || 0;
      dotProduct += valueA * valueB;
    });
    
    vectorA.forEach(value => normA += value * value);
    vectorB.forEach(value => normB += value * value);
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (normA * normB);
  }

  /**
   * Search for relevant documents using local similarity
   */
  searchSimilar(query, maxResults = 5, minSimilarity = 0.1) {
    console.log(`Local Search: Searching for "${query.slice(0, 50)}..."`);
    
    if (this.documentIndex.size === 0) {
      console.log('📭 Local Search: No documents in index');
      return [];
    }
    
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) {
      console.log('Local Search: No meaningful query tokens');
      return [];
    }
    
    // Create query vector
    const queryVectors = this.calculateTFIDF(queryTokens, '__query__');
    const queryTFIDF = queryVectors.tfidfVector;
    
    // Calculate similarities
    const similarities = [];
    
    this.documentIndex.forEach((doc, fileName) => {
      const similarity = this.cosineSimilarity(queryTFIDF, doc.tfidfVector);
      
      if (similarity >= minSimilarity) {
        similarities.push({
          fileName,
          similarity,
          metadata: doc.metadata,
          preview: doc.content
        });
      }
    });
    
    // Sort by similarity and return top results
    const results = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
    
    console.log(`Local Search: Found ${results.length} relevant documents (${similarities.length} above threshold)`);
    
    return results;
  }

  /**
   * Get document statistics
   */
  getStats() {
    return {
      documentCount: this.documentIndex.size,
      vocabularySize: this.vocabulary.size,
      indexSize: this.getIndexSizeBytes(),
      averageTokensPerDoc: this.getAverageTokenCount()
    };
  }

  /**
   * Get index size in bytes (estimated)
   */
  getIndexSizeBytes() {
    try {
      if (fs.existsSync(this.indexFile)) {
        return fs.statSync(this.indexFile).size;
      }
    } catch (error) {
      return 0;
    }
    return 0;
  }

  /**
   * Get average token count per document
   */
  getAverageTokenCount() {
    if (this.documentIndex.size === 0) return 0;
    
    const totalTokens = Array.from(this.documentIndex.values())
      .reduce((sum, doc) => sum + (doc.metadata.tokenCount || 0), 0);
    
    return Math.round(totalTokens / this.documentIndex.size);
  }

  /**
   * Remove document from index
   */
  removeDocument(fileName) {
    if (this.documentIndex.has(fileName)) {
      this.documentIndex.delete(fileName);
      this.idfCache.clear(); // Invalidate IDF cache
      console.log(`Local Index: Removed document ${fileName}`);
      return true;
    }
    return false;
  }

  /**
   * Clear entire index
   */
  clearIndex() {
    this.initializeEmpty();
    if (fs.existsSync(this.indexFile)) {
      fs.unlinkSync(this.indexFile);
    }
    console.log('🧹 Local Index: Cleared all documents');
  }

  /**
   * Rebuild IDF cache (useful after bulk operations)
   */
  rebuildIDFCache() {
    console.log('Local Index: Rebuilding IDF cache...');
    this.idfCache.clear();
    
    // Pre-calculate IDF for all terms in vocabulary
    this.vocabulary.forEach((_, term) => {
      this.calculateIDF(term);
    });
    
    console.log(`Local Index: IDF cache rebuilt for ${this.idfCache.size} terms`);
  }

  /**
   * Get similar documents to a given document
   */
  findSimilarDocuments(fileName, maxResults = 3) {
    if (!this.documentIndex.has(fileName)) {
      return [];
    }
    
    const targetDoc = this.documentIndex.get(fileName);
    const similarities = [];
    
    this.documentIndex.forEach((doc, docName) => {
      if (docName !== fileName) {
        const similarity = this.cosineSimilarity(targetDoc.tfidfVector, doc.tfidfVector);
        similarities.push({
          fileName: docName,
          similarity,
          metadata: doc.metadata
        });
      }
    });
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
  }

  /**
   * Get all documents in the index
   */
  getAllDocuments() {
    const documents = [];
    this.documentIndex.forEach((docData, fileName) => {
      documents.push({
        name: fileName,
        content: docData.metadata.content || '',
        type: docData.metadata.fileType || 'unknown',
        lines: docData.metadata.content ? docData.metadata.content.split('\n') : []
      });
    });
    return documents;
  }
}

module.exports = LocalEmbeddingEngine;