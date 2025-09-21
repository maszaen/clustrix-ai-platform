const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { OpenAIEmbeddings } = require("@langchain/openai");
const { ChatOpenAI } = require("@langchain/openai");
const { PromptTemplate } = require("@langchain/core/prompts");
const { RunnableSequence } = require("@langchain/core/runnables");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const FileSummarizer = require('./file-summarizer');
const LocalEmbeddingEngine = require('./local-embedding-engine');
const ReasoningActionAgent = require('./reasoning-action-agent');

class ClustrixLangChainService {
  constructor(app) {
    this.app = app;
    this.vectorStore = null;
    this.embeddings = null;
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    // Vector store data file
    this.vectorDataFile = path.join(app.getPath('userData'), 'vector_data.json');
    this.sessionMemoryFile = path.join(app.getPath('userData'), 'session_memory.json');
    
    // Initialize file summarizer (LOCAL PROCESSING)
    this.fileSummarizer = new FileSummarizer(this);
    
    // Initialize local embedding engine (NO AI REQUIRED)
    this.localEmbedding = new LocalEmbeddingEngine(app);
    
    // Initialize RE+ACT agent (REASONING + ACTION)
    this.reasoningAgent = new ReasoningActionAgent(this);
    
    // Track vectorized messages to avoid duplicates
    this.vectorizedMessages = new Set();
    
    this.initialize();
  }

  async initialize() {
    try {
      console.log('Initializing LangChain service...');
      
      // Check if we have any API key available
      const configPath = path.join(this.app.getPath('userData'), 'ai-model.conf.json');
      let hasApiKey = false;
      let availableProvider = null;
      
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const providers = config.providers || {};
        
        // Check available providers with API keys
        for (const [name, provider] of Object.entries(providers)) {
          if (provider.apiKey && provider.apiKey.trim() !== '') {
            hasApiKey = true;
            availableProvider = { name, ...provider };
            console.log(`🔑 Found API key for provider: ${name}`);
            break;
          }
        }
      }
      
      if (!hasApiKey) {
        console.log('No API keys found, using simple text-based similarity');
        this.useSimpleEmbeddings();
        this.isInitialized = true;
        return;
      }
      
      // Initialize embeddings based on available provider
      await this.initializeEmbeddings(availableProvider);
      
      // Initialize vector store
      this.vectorStore = new MemoryVectorStore(this.embeddings);
      
      // Load existing vector data if available
      await this.loadVectorData();
      
      this.isInitialized = true;
      console.log('LangChain service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize LangChain service:', error);
      console.log('🔄 Falling back to simple text similarity...');
      this.useSimpleEmbeddings();
      this.isInitialized = true;
    }
  }

  async initializeEmbeddings(provider) {
    console.log(`🚀 Initializing embeddings with ${provider.name} provider...`);
    
    try {
      switch (provider.name.toLowerCase()) {
        case 'openrouter':
          // Try OpenRouter, but fallback if embeddings not supported
          console.log('Attempting OpenRouter embeddings...');
          try {
            this.embeddings = new OpenAIEmbeddings({
              openAIApiKey: provider.apiKey,
              modelName: "text-embedding-3-small",
              configuration: {
                baseURL: provider.baseUrl,
                defaultHeaders: {
                  'HTTP-Referer': 'https://clustrix.local',
                  'X-Title': 'Clustrix Desktop'
                }
              }
            });
            
            // Test the embeddings with a simple query
            await this.embeddings.embedQuery("test");
            console.log('OpenRouter embeddings working!');
          } catch (error) {
            console.log('OpenRouter embeddings not supported, using text similarity');
            this.useSimpleEmbeddings();
          }
          break;
          
        case 'groq':
        case 'gemini':
        case 'zhipu':
        case 'cerebras':
        default:
          // These providers don't support embeddings, use text similarity
          console.log(`📝 Provider ${provider.name} doesn't support embeddings, using text similarity`);
          this.useSimpleEmbeddings();
          break;
      }
    } catch (error) {
      console.log('Error initializing embeddings, falling back to text similarity:', error.message);
      this.useSimpleEmbeddings();
    }
  }

  useSimpleEmbeddings() {
    console.log('📝 Using simple text-based embeddings...');
    // Simple text-based similarity using TF-IDF like approach
    this.embeddings = {
      embedDocuments: async (documents) => {
        return documents.map(doc => this.textToVector(doc));
      },
      embedQuery: async (query) => {
        return this.textToVector(query);
      }
    };
  }

  textToVector(text) {
    // Simple text to vector conversion using character frequencies
    const vector = new Array(100).fill(0);
    const words = text.toLowerCase().split(/\s+/);
    
    words.forEach((word, index) => {
      for (let i = 0; i < word.length && i < vector.length; i++) {
        vector[i] += word.charCodeAt(i) / 1000;
      }
    });
    
    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }

  async createCustomEmbeddings(provider) {
    // For providers that don't support embeddings, use text similarity
    console.log(`Creating custom embeddings for ${provider.name}...`);
    return {
      embedDocuments: async (documents) => {
        return documents.map(doc => this.textToVector(doc));
      },
      embedQuery: async (query) => {
        return this.textToVector(query);
      }
    };
  }

  async createGeminiEmbeddings(provider) {
    // Gemini embedding implementation
    console.log('Creating Gemini embeddings...');
    return {
      embedDocuments: async (documents) => {
        // For now, use simple text similarity
        // TODO: Implement actual Gemini embeddings API call
        return documents.map(doc => this.textToVector(doc));
      },
      embedQuery: async (query) => {
        return this.textToVector(query);
      }
    };
  }

  // ==================== CUSTOM VECTOR STORE ====================
  
  async customSimilaritySearch(query, k = 4) {
    console.log(`LangChain: Starting custom similarity search with k=${k}`);
    
    // Custom similarity search for text-based embeddings
    if (!this.documentStore) {
      this.documentStore = [];
      console.log(`📋 LangChain: Document store empty, returning no results`);
      return [];
    }
    
    console.log(`📚 LangChain: Searching through ${this.documentStore.length} documents in custom store`);
    
    const startTime = Date.now();
    const queryVector = this.textToVector(query);
    console.log(`🧮 LangChain: Generated query vector (${queryVector.length} dimensions)`);
    
    const similarities = this.documentStore.map((doc, index) => {
      const similarity = this.cosineSimilarity(queryVector, doc.vector);
      
      if (index < 5) { // Log first 5 for debugging
        console.log(`LangChain: Doc ${index}: similarity=${similarity.toFixed(4)} (${doc.content.substring(0, 50)}...)`);
      }
      
      return {
        ...doc,
        similarity
      };
    });
    
    const sortedResults = similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);
    
    console.log(`LangChain: Custom search completed in ${Date.now() - startTime}ms`);
    console.log(`📈 LangChain: Top ${Math.min(k, sortedResults.length)} similarity scores:`);
    
    sortedResults.forEach((result, index) => {
      console.log(`  ${index + 1}. Score: ${result.similarity.toFixed(4)} - ${result.metadata?.fileName || 'Unknown'} (chunk ${result.metadata?.chunkIndex || '?'})`);
    });
    
    return sortedResults.map(item => ({ 
      pageContent: item.content, 
      metadata: item.metadata 
    }));
  }

  cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async addDocumentToStore(content, metadata = {}) {
    if (!this.documentStore) this.documentStore = [];
    
    const vector = this.textToVector(content);
    this.documentStore.push({
      content,
      metadata,
      vector,
      id: Date.now() + Math.random()
    });
  }
  
  // ==================== FILE PROCESSING & RAG ====================
  
  async processUploadedFiles(files, sessionId) {
    if (!files || files.length === 0) {
      console.log('📋 LangChain: No files to process');
      return;
    }

    console.log(`🔄 LangChain: Starting PURE LOCAL processing of ${files.length} files for session ${sessionId}`);
    
    try {
      // Step 1: Optimize files with LOCAL summarization (NO AI)
      console.log('🧠 LangChain: Running LOCAL file optimization and summarization...');
      const optimizedResult = await this.fileSummarizer.processFiles(files);
      
      console.log(`Token optimization: ${optimizedResult.stats.totalCompressionRatio}% reduction (${optimizedResult.stats.tokenSavings} tokens saved)`);
      
      // Step 2: Add to LOCAL embedding index (NO AI)
      console.log('LangChain: Adding files to LOCAL embedding index...');
      let processedCount = 0;
      
      for (const optimizedFile of optimizedResult.files) {
        if (optimizedFile.optimizedContent && optimizedFile.optimizedContent.trim()) {
          // Add to local embedding engine
          this.localEmbedding.addDocument(
            optimizedFile.name,
            optimizedFile.optimizedContent,
            {
              sessionId,
              originalSize: optimizedFile.originalSize,
              optimizedSize: optimizedFile.optimizedSize,
              compressionMethod: optimizedFile.method,
              fileType: optimizedFile.type
            }
          );
          
          processedCount++;
          console.log(`Local Index: Added ${optimizedFile.name} (${optimizedFile.optimizedSize} chars)`);
        }
      }
      
      // Step 3: Save both summarization cache and local index
      this.localEmbedding.saveIndex();
      
      const indexStats = this.localEmbedding.getStats();
      
      console.log(`LangChain: PURE LOCAL processing complete!`);
      console.log(`Files processed: ${processedCount}/${files.length}`);
      console.log(`� Token savings: ${optimizedResult.stats.tokenSavings} tokens`);
      console.log(`Local index: ${indexStats.documentCount} docs, ${indexStats.vocabularySize} terms`);
      
      return {
        ...optimizedResult.stats,
        localIndexStats: indexStats,
        processedFiles: processedCount,
        method: 'pure-local-processing'
      };
      
    } catch (error) {
      console.error('LangChain: Error in local file processing:', error);
      return null;
    }
  }

  async addFileToVectorStore(file, sessionId) {
    try {
      console.log(`LangChain: Splitting content for ${file.name}...`);
      
      // Split file content into chunks
      const chunks = await this.textSplitter.splitText(file.content);
      console.log(`📝 LangChain: Split ${file.name} into ${chunks.length} chunks`);
      
      // Create documents with metadata
      const documents = chunks.map((chunk, index) => ({
        pageContent: chunk,
        metadata: {
          fileId: uuidv4(),
          fileName: file.name,
          fileType: file.type,
          sessionId: sessionId,
          chunkIndex: index,
          totalChunks: chunks.length,
          uploadedAt: new Date().toISOString(),
          chunkSize: chunk.length
        }
      }));

      console.log(`LangChain: Created ${documents.length} document objects for ${file.name}`);

      // Add to vector store or custom store
      if (this.vectorStore && this.vectorStore.addDocuments) {
        console.log(`🚀 LangChain: Adding documents to LangChain vector store...`);
        await this.vectorStore.addDocuments(documents);
        console.log(`LangChain: Documents added to vector store successfully`);
      } else {
        // Use custom document store
        console.log(`LangChain: Adding documents to custom text store...`);
        for (const [docIndex, doc] of documents.entries()) {
          await this.addDocumentToStore(doc.pageContent, doc.metadata);
          if (docIndex % 10 === 0) {
            console.log(`� LangChain: Progress: ${docIndex + 1}/${documents.length} documents added`);
          }
        }
        console.log(`LangChain: All documents added to custom store`);
      }
      
      console.log(`📁 LangChain: Successfully processed ${file.name} - ${chunks.length} chunks added to ${this.vectorStore ? 'vector' : 'custom'} store`);
      return chunks.length;
    } catch (error) {
      console.error(`LangChain: Error adding file ${file.name} to store:`, error);
      return 0;
    }
  }

  async searchRelevantContent(query, sessionId = null, maxResults = 5) {
    console.log(`LangChain: Searching for relevant content using LOCAL similarity...`);
    console.log(`📝 LangChain: Query: "${query.substring(0, 100)}${query.length > 100 ? '...' : ''}"`);
    console.log(`LangChain: Session filter: ${sessionId || 'All sessions'}, Max results: ${maxResults}`);
    
    try {
      const startTime = Date.now();
      
      // Use LOCAL embedding engine for similarity search (NO AI REQUIRED)
      const localResults = this.localEmbedding.searchSimilar(query, maxResults * 2, 0.05);
      
      console.log(`Local Search: Found ${localResults.length} potential matches in ${Date.now() - startTime}ms`);
      
      // Filter by session if specified
      let filteredResults = localResults;
      if (sessionId) {
        filteredResults = localResults.filter(result => 
          result.metadata.sessionId === sessionId
        );
        console.log(`LangChain: After session filtering: ${filteredResults.length} results`);
      }
      
      // Format results to match expected structure
      const finalResults = filteredResults.slice(0, maxResults).map(result => ({
        content: result.preview || 'Content preview not available',
        metadata: {
          fileName: result.fileName,
          sessionId: result.metadata.sessionId,
          similarity: result.similarity,
          fileType: result.metadata.fileType,
          compressionMethod: result.metadata.compressionMethod
        },
        relevanceScore: result.similarity
      }));

      console.log(`� LangChain: Returning ${finalResults.length} LOCAL results (no AI tokens used)`);
      
      // Log performance info
      const indexStats = this.localEmbedding.getStats();
      console.log(`📈 Local Index Performance: ${indexStats.documentCount} docs searched in ${Date.now() - startTime}ms`);
      
      return finalResults;
      
    } catch (error) {
      console.error('LangChain: Error in local content search:', error);
      return [];
    }
  }

  // ==================== REASONING + ACTION PATTERN ====================
  
  async processWithReasoningAction(userMessage, sessionId, uploadedFiles = [], model = 'gpt-4', provider = 'openai', apiKey = '', baseUrl = '') {
    console.log(`🧠 LangChain: Starting RE+ACT processing for session ${sessionId}`);
    
    try {
      // Step 1: Initialize RE+ACT agent with project files
      if (uploadedFiles && uploadedFiles.length > 0) {
        console.log(`📁 RE+ACT: Initializing with ${uploadedFiles.length} files`);
        const capabilities = this.reasoningAgent.initializeSession(sessionId, uploadedFiles, {
          provider,
          model,
          apiKey,
          baseUrl
        });
        console.log(`RE+ACT: Session initialized with capabilities:`, capabilities);
      }
      
      // Step 2: Process with reasoning and actions
      const result = await this.reasoningAgent.processWithReasoningAction(
        userMessage, 
        sessionId, 
        []
      );
      
      console.log(`RE+ACT: Completed with ${result.actionsExecuted} actions executed`);
      
      return {
        enhanced: true,
        method: 'reasoning-action',
        actionsExecuted: result.actionsExecuted,
        reasoning: result.reasoning,
        searchResults: result.searchResults,
        response: result.response
      };
      
    } catch (error) {
      console.error('RE+ACT processing failed:', error);
      throw error;
    }
  }

  /**
   * Check if session should use RE+ACT pattern
   */
  shouldUseReasoningAction(userMessage, uploadedFiles = [], sessionType = null) {
    console.log(`🤔 RE+ACT check called with: sessionType=${sessionType}, uploadedFiles=${uploadedFiles ? uploadedFiles.length : 'null'}, message="${userMessage.slice(0, 50)}..."`);
    
    // Use RE+ACT for project sessions with uploaded files by default
    if (sessionType === 'project' && uploadedFiles && uploadedFiles.length > 0) {
      console.log(`🤔 RE+ACT decision: USE (project session with ${uploadedFiles.length} files)`);
      return true;
    }

    // Use RE+ACT for sessions with uploaded files and complex queries
    if (!uploadedFiles || uploadedFiles.length === 0) {
      console.log(`🤔 RE+ACT decision: SKIP (no uploaded files)`);
      return false;
    }

    // Keywords that indicate need for code/file analysis (English and Indonesian)
    const analysisKeywords = [
      'error', 'bug', 'issue', 'problem', 'not working', 'broken',
      'find', 'search', 'locate', 'where is', 'check',
      'analyze', 'review', 'debug', 'fix', 'help',
      'function', 'class', 'method', 'variable',
      'css', 'html', 'javascript', 'style', 'layout',
      // Indonesian keywords
      'fungsi', 'kelas', 'metode', 'variabel', 'debug', 'perbaiki',
      'cek', 'lihat', 'cari', 'temukan', 'analisis', 'ulas',
      'masalah', 'error', 'bug', 'rusak', 'tidak berfungsi'
    ];

    const messageText = userMessage.toLowerCase();
    const needsAnalysis = analysisKeywords.some(keyword => messageText.includes(keyword));

    console.log(`🤔 RE+ACT decision: ${needsAnalysis ? 'USE' : 'SKIP'} (${uploadedFiles.length} files, analysis keywords: ${needsAnalysis})`);

    return needsAnalysis;
  }

  // ==================== CHAT HISTORY VECTORIZATION ====================
  
  async vectorizeChatHistory(sessionId, messages) {
    console.log(`📝 LangChain: Vectorizing chat history for session ${sessionId} (${messages.length} messages)`);
    
    try {
      let vectorizedCount = 0;
      
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        if (Array.isArray(message) && message.length >= 2) {
          const [role, content, metadata] = message;
          
          // Only vectorize user and AI messages with substantial content
          if ((role === 'user' || role === 'ai') && content && content.length > 10) {
            // Create a unique ID for this message
            const messageId = `${sessionId}-msg-${i}`;
            
            // Check if this message is already vectorized
            if (!this.vectorizedMessages.has(messageId)) {
              // Add to local embedding index
              this.localEmbedding.addDocument(
                content,
                {
                  sessionId,
                  messageIndex: i,
                  role,
                  type: 'chat_message',
                  messageId,
                  timestamp: metadata?.timestamp || Date.now(),
                  model: metadata?.model || 'unknown'
                }
              );
              
              this.vectorizedMessages.add(messageId);
              vectorizedCount++;
              
              if (vectorizedCount % 5 === 0) {
                console.log(`📝 Vectorized ${vectorizedCount} messages so far...`);
              }
            }
          }
        }
      }
      
      // Save the updated index
      this.localEmbedding.saveIndex();
      
      console.log(`📝 LangChain: Successfully vectorized ${vectorizedCount} chat messages for session ${sessionId}`);
      return vectorizedCount;
      
    } catch (error) {
      console.error('Error vectorizing chat history:', error);
      return 0;
    }
  }
  
  async generateSmartContext(userMessage, sessionId, uploadedFiles = [], tokenBudget = 2000) {
    console.log(`🧠 LangChain: Generating smart context for session ${sessionId} with ${tokenBudget} token budget`);
    
    try {
      const startTime = Date.now();
      const maxContextChars = tokenBudget * 4; // Rough estimation: 4 chars per token
      
      // Step 1: Check if we have session-specific summarized content
      const sessionMemory = await this.getSessionMemory(sessionId);
      
      // Step 2: Search vector store for relevant content
      const relevantDocs = await this.searchRelevantContent(userMessage, sessionId, 5);
      
      // Step 3: If we have new files, process them with summarization
      let newFileContext = '';
      if (uploadedFiles && uploadedFiles.length > 0) {
        const optimizedFiles = await this.fileSummarizer.processFiles(uploadedFiles);
        console.log(`📁 Smart context: Processed ${uploadedFiles.length} files with ${optimizedFiles.stats.totalCompressionRatio}% compression`);
        
        for (const file of optimizedFiles.files) {
          if (newFileContext.length + file.optimizedContent.length < maxContextChars / 2) {
            newFileContext += `\n[NEW FILE: ${file.name}]\n${file.optimizedContent}\n`;
          }
        }
      }
      
      // Step 4: Build prioritized context
      let contextParts = [];
      let totalLength = 0;
      
      // Priority 1: Session memory (if meaningful)
      if (sessionMemory && Object.keys(sessionMemory).length > 2) {
        const memoryContext = this.formatSessionContext(sessionMemory);
        if (memoryContext.length < 500) {
          contextParts.push({
            type: 'memory',
            content: `[SESSION CONTEXT]\n${memoryContext}\n`,
            priority: 1,
            length: memoryContext.length
          });
        }
      }
      
      // Priority 2: New files (summarized)
      if (newFileContext) {
        contextParts.push({
          type: 'new_files',
          content: newFileContext,
          priority: 2,
          length: newFileContext.length
        });
      }
      
      // Priority 3: Relevant existing content
      for (const doc of relevantDocs) {
        const docContext = `\n[RELEVANT: ${doc.metadata?.fileName || 'Unknown'}]\n${doc.content}\n`;
        contextParts.push({
          type: 'existing',
          content: docContext,
          priority: 3,
          length: docContext.length
        });
      }
      
      // Step 5: Select context within budget
      contextParts.sort((a, b) => a.priority - b.priority);
      
      let finalContext = '';
      for (const part of contextParts) {
        if (totalLength + part.length <= maxContextChars) {
          finalContext += part.content;
          totalLength += part.length;
          console.log(`Added ${part.type} context: ${part.length} chars`);
        } else {
          console.log(`Skipped ${part.type} context: would exceed budget`);
        }
      }
      
      const estimatedTokens = Math.ceil(totalLength / 4);
      console.log(`Smart context generated: ${totalLength} chars (~${estimatedTokens} tokens) in ${Date.now() - startTime}ms`);
      
      return {
        context: finalContext,
        stats: {
          totalLength,
          estimatedTokens,
          tokenBudget,
          efficiency: Math.round((estimatedTokens / tokenBudget) * 100),
          generationTime: Date.now() - startTime
        }
      };
      
    } catch (error) {
      console.error('Smart context generation failed:', error);
      return { context: '', stats: { totalLength: 0, estimatedTokens: 0 } };
    }
  }

  // ==================== ENHANCED CONTEXT GENERATION (Legacy) ====================
  
  async generateEnhancedContext(userMessage, sessionId, uploadedFiles = []) {
    console.log(`🧠 LangChain: Generating enhanced context for session ${sessionId}`);
    console.log(`💭 LangChain: User message: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}"`);
    console.log(`📁 LangChain: Uploaded files: ${uploadedFiles.length}`);
    
    try {
      const startTime = Date.now();
      
      // First, search existing vector store for relevant content
      console.log(`LangChain: Searching for relevant content in existing store...`);
      let relevantDocs = await this.searchRelevantContent(userMessage, sessionId, 3);
      
      // Ensure relevantDocs is always an array
      if (!Array.isArray(relevantDocs)) {
        console.log(`LangChain: searchRelevantContent returned non-array, defaulting to empty array`);
        relevantDocs = [];
      }
      
      console.log(`LangChain: Found ${relevantDocs.length} relevant documents from existing store`);
      
      // If no relevant content found and we have new files, process them
      if (relevantDocs.length === 0 && uploadedFiles && uploadedFiles.length > 0) {
        console.log(`🔄 LangChain: No existing content found, processing new uploaded files...`);
        await this.processUploadedFiles(uploadedFiles, sessionId);
        
        // Try searching again
        console.log(`LangChain: Re-searching after processing new files...`);
        const newResults = await this.searchRelevantContent(userMessage, sessionId, 3);
        
        // Ensure newResults is also an array before pushing
        if (Array.isArray(newResults)) {
          relevantDocs.push(...newResults);
          console.log(`LangChain: Found ${newResults.length} additional documents after processing new files`);
        } else {
          console.log(`LangChain: Re-search returned non-array, skipping`);
        }
      }

      // Build enhanced context with size limiting
      let enhancedContext = '';
      let totalContextLength = 0;
      const MAX_CONTEXT_TOKENS = 8000; // Conservative limit to leave room for conversation
      const CHARS_PER_TOKEN = 4; // Rough estimate: 1 token ≈ 4 characters
      const maxContextChars = MAX_CONTEXT_TOKENS * CHARS_PER_TOKEN;
      
      if (relevantDocs.length > 0) {
        console.log(`📝 LangChain: Building enhanced context from ${relevantDocs.length} documents...`);
        console.log(`📏 LangChain: Context limit: ${maxContextChars} chars (~${MAX_CONTEXT_TOKENS} tokens)`);
        
        enhancedContext += '\n=== RELEVANT CONTEXT FROM UPLOADED FILES ===\n';
        
        for (let index = 0; index < relevantDocs.length; index++) {
          const doc = relevantDocs[index];
          const contextChunk = `\n[${index + 1}] From ${doc.metadata?.fileName || 'Unknown'} (chunk ${doc.metadata?.chunkIndex || '?'}):\n${doc.content}\n`;
          
          // Check if adding this chunk would exceed limit
          if (totalContextLength + contextChunk.length > maxContextChars) {
            console.log(`LangChain: Context limit reached at chunk ${index + 1}, truncating remaining content`);
            
            // Add as much as we can from this chunk
            const remainingSpace = maxContextChars - totalContextLength;
            if (remainingSpace > 100) { // Only add if we have meaningful space
              const truncatedChunk = `\n[${index + 1}] From ${doc.metadata?.fileName || 'Unknown'} (TRUNCATED):\n${doc.content.substring(0, remainingSpace - 50)}...\n`;
              enhancedContext += truncatedChunk;
              totalContextLength += truncatedChunk.length;
              console.log(`📄 LangChain: Added truncated chunk ${index + 1}: ${doc.metadata?.fileName} (${truncatedChunk.length} chars)`);
            }
            break;
          }
          
          enhancedContext += contextChunk;
          totalContextLength += contextChunk.length;
          
          console.log(`📄 LangChain: Added context chunk ${index + 1}: ${doc.metadata?.fileName || 'Unknown'} (${contextChunk.length} chars)`);
        }
        
        enhancedContext += '\n=== END CONTEXT ===\n';
        
        const estimatedTokens = Math.ceil(totalContextLength / CHARS_PER_TOKEN);
        console.log(`LangChain: Enhanced context generated in ${Date.now() - startTime}ms`);
        console.log(`📏 LangChain: Total context length: ${totalContextLength} characters (~${estimatedTokens} tokens)`);
        
        if (estimatedTokens > MAX_CONTEXT_TOKENS) {
          console.log(`LangChain: Warning: Context size (${estimatedTokens} tokens) still exceeds target limit`);
        }
      } else {
        console.log(`📭 LangChain: No relevant context found for this query`);
      }

      return enhancedContext;
    } catch (error) {
      console.error('LangChain: Error generating enhanced context:', error);
      return '';
    }
  }

  // ==================== MESSAGE TRUNCATION SYSTEM ====================
  
  truncateMessages(messages) {
    // Conservative token limits to prevent API errors
    const MAX_TOTAL_TOKENS = 30000; // Conservative limit for most models
    const CHARS_PER_TOKEN = 4; // Rough estimate
    const maxTotalChars = MAX_TOTAL_TOKENS * CHARS_PER_TOKEN;
    
    // Always keep the last user message
    if (messages.length === 0) return messages;
    
    const lastMessage = messages[messages.length - 1];
    let totalChars = lastMessage.content.length;
    let keptMessages = [lastMessage];
    
    // Work backwards through messages, keeping as many as fit
    for (let i = messages.length - 2; i >= 0; i--) {
      const message = messages[i];
      const messageChars = message.content.length;
      
      if (totalChars + messageChars <= maxTotalChars) {
        totalChars += messageChars;
        keptMessages.unshift(message);
      } else {
        // Try to partially include this message if it's important (system message)
        if (message.role === 'system' && totalChars < maxTotalChars * 0.8) {
          const remainingSpace = maxTotalChars - totalChars;
          if (remainingSpace > 200) { // Only if we have meaningful space
            const truncatedContent = message.content.substring(0, remainingSpace - 100) + '... [TRUNCATED]';
            keptMessages.unshift({
              ...message,
              content: truncatedContent
            });
            totalChars += truncatedContent.length;
          }
        }
        break;
      }
    }
    
    const estimatedTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
    console.log(`LangChain: Message truncation completed`);
    console.log(`LangChain: Kept ${keptMessages.length}/${messages.length} messages`);
    console.log(`📏 LangChain: Total chars: ${totalChars} (~${estimatedTokens} tokens)`);
    
    return keptMessages;
  }

  // ==================== PROJECT vs REGULAR CHAT DIFFERENTIATION ====================
  
  getSessionType(session) {
    // Check if this is a project session
    return session.type === 'project' || session.isProject || false;
  }

  async processMessage(messages, model, options, sessionId, session) {
    console.log(`🚀 LangChain: Processing message for session ${sessionId}`);
    console.log(`LangChain: Message count: ${messages.length}, Model: ${model}`);
    
    const isProject = this.getSessionType(session);
    console.log(`📋 LangChain: Session type: ${isProject ? 'PROJECT' : 'REGULAR'}`);
    
    const startTime = Date.now();
    let result;
    
    if (isProject) {
      console.log(`LangChain: Using PROJECT processing mode with agents...`);
      result = await this.processProjectMessage(messages, model, options, sessionId, session);
    } else {
      console.log(`💬 LangChain: Using REGULAR processing mode...`);
      result = await this.processRegularMessage(messages, model, options, sessionId, session);
    }
    
    console.log(`LangChain: Message processing completed in ${Date.now() - startTime}ms`);
    console.log(`LangChain: Output message count: ${result.length}`);
    
    return result;
  }

  async processRegularMessage(messages, model, options, sessionId, session) {
    console.log(`💬 LangChain: Starting regular message processing...`);
    
    // Check if we already have context messages to avoid duplication
    const hasExistingContext = messages.some(msg => 
      msg.role === 'system' && 
      msg.content && 
      msg.content.includes('=== RELEVANT CONTEXT FROM UPLOADED FILES ===')
    );
    
    if (hasExistingContext) {
      console.log(`🔄 LangChain: Context already exists in message chain, skipping enhancement`);
      return messages;
    }

    // Truncate messages to prevent token limit issues
    const truncatedMessages = this.truncateMessages(messages);
    console.log(`LangChain: Truncated messages from ${messages.length} to ${truncatedMessages.length} to prevent token limit issues`);
    
    // Extract and save session insights for enhanced memory
    await this.extractSessionInsights(truncatedMessages, sessionId);
    
    // Regular chat: lightweight processing, just add basic file context if available
    const lastMessage = truncatedMessages[truncatedMessages.length - 1];
    console.log(`📝 LangChain: Last message: "${lastMessage.content.substring(0, 100)}${lastMessage.content.length > 100 ? '...' : ''}"`);
    console.log(`📁 LangChain: Available uploaded files: ${session.uploadedFiles?.length || 0}`);
    
    // Skip if the message is too short (like "p")
    if (lastMessage.content.trim().length < 3) {
      console.log(`LangChain: Message too short for context enhancement, skipping`);
      return truncatedMessages;
    }
    
    const enhancedContext = await this.generateEnhancedContext(
      lastMessage.content, 
      sessionId, 
      session.uploadedFiles || []
    );

    if (enhancedContext && enhancedContext.trim().length > 0) {
      console.log(`LangChain: Enhanced context generated, adding to message chain`);
      
      // Create a copy of messages to avoid mutation
      const enhancedMessages = [...truncatedMessages];
      
      // Add session memory context
      const sessionMemory = await this.getSessionMemory(sessionId);
      let contextMessage = `You have access to the following uploaded file content. Use it to provide more accurate and contextual responses:\n${enhancedContext}`;
      
      if (Object.keys(sessionMemory).length > 0) {
        contextMessage += `\n\nSESSION MEMORY:\n${this.formatSessionMemory(sessionMemory)}`;
      }
      
      // Insert context before last user message
      const systemMessage = {
        role: 'system',
        content: contextMessage
      };
      
      enhancedMessages.splice(-1, 0, systemMessage);
      console.log(`📋 LangChain: Inserted context message at position ${enhancedMessages.length - 2}`);
      
      return enhancedMessages;
    } else {
      console.log(`📭 LangChain: No enhanced context available, using original messages`);
    }

    return truncatedMessages;
  }

  async processProjectMessage(messages, model, options, sessionId, session) {
    console.log(`LangChain: Starting PROJECT message processing with full agent capabilities...`);
    
    const truncatedMessages = this.truncateMessages(messages);
    console.log(`LangChain: Truncated messages from ${messages.length} to ${truncatedMessages.length} for project processing`);
    
    const lastMessage = truncatedMessages[truncatedMessages.length - 1];
    console.log(`📝 LangChain: Project query: "${lastMessage.content.substring(0, 100)}${lastMessage.content.length > 100 ? '...' : ''}"`);
    
    console.log(`LangChain: Step 1 - Generating enhanced context for project...`);
    const enhancedContext = await this.generateEnhancedContext(
      lastMessage.content, 
      sessionId, 
      session.uploadedFiles || []
    );

    console.log(`🧠 LangChain: Step 2 - Detecting intent and selecting agent...`);
    const intent = await this.detectIntent(lastMessage.content);
    console.log(`LangChain: Detected intent: ${intent}`);
    
    console.log(`⚡ LangChain: Step 3 - Applying project-specific enhancements...`);
    const systemPrompt = this.getProjectSystemPrompt(intent, enhancedContext);
    
    console.log(`🔗 LangChain: Step 4 - Building enhanced message chain...`);
    const enhancedMessages = [
      { role: 'system', content: systemPrompt },
      ...truncatedMessages.slice(0, -1),
      lastMessage
    ];

    return enhancedMessages;
  }

  async detectIntent(userMessage) {
    const message = userMessage.toLowerCase();
    
    if (message.includes('code') || message.includes('implement') || message.includes('function')) {
      return 'coding';
    } else if (message.includes('analyze') || message.includes('explain') || message.includes('understand')) {
      return 'analysis';
    } else if (message.includes('research') || message.includes('find') || message.includes('search')) {
      return 'research';
    } else if (message.includes('debug') || message.includes('error') || message.includes('fix')) {
      return 'debugging';
    } else {
      return 'general';
    }
  }

  getProjectSystemPrompt(intent, context) {
    const basePrompt = `You are Clustrix AI, an advanced AI assistant specialized in project development and analysis. You have access to the user's project files and should provide comprehensive, professional responses.`;
    
    const intentPrompts = {
      coding: `${basePrompt}

FOCUS: Code implementation and development
- Analyze the provided code/files thoroughly
- Suggest best practices and optimizations
- Provide working, production-ready code
- Consider security, performance, and maintainability
- Include error handling and edge cases`,

      analysis: `${basePrompt}

FOCUS: Code/project analysis and explanation
- Break down complex concepts clearly
- Identify patterns, issues, and opportunities
- Provide structured analysis with actionable insights
- Reference specific parts of the uploaded files
- Suggest improvements and next steps`,

      research: `${basePrompt}

FOCUS: Information gathering and research
- Synthesize information from multiple sources
- Provide comprehensive, well-organized findings
- Include references and citations where possible
- Suggest additional research directions
- Connect findings to the user's project context`,

      debugging: `${basePrompt}

FOCUS: Problem solving and debugging
- Systematically analyze the issue
- Provide step-by-step debugging approach
- Suggest multiple potential solutions
- Include preventive measures for the future
- Test your suggestions against the provided code`,

      general: `${basePrompt}

FOCUS: General project assistance
- Provide helpful, contextual responses
- Use uploaded files to inform your answers
- Maintain professional project management perspective
- Suggest relevant tools, resources, or approaches`
    };

    let systemPrompt = intentPrompts[intent] || intentPrompts.general;
    
    if (context) {
      systemPrompt += `\n\nPROJECT CONTEXT:\n${context}`;
    }

    return systemPrompt;
  }

  // ==================== ENHANCED SESSION MEMORY ====================
  
  async extractSessionInsights(messages, sessionId) {
    try {
      console.log(`🧠 LangChain: Extracting session insights for ${sessionId}...`);
      
      // Only analyze if we have enough conversation
      if (messages.length < 3) {
        console.log(`📝 LangChain: Not enough messages for insight extraction`);
        return;
      }
      
      // Get the last few messages for analysis
      const recentMessages = messages.slice(-6); // Last 6 messages
      const conversationText = recentMessages
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');
      
      // Try AI-powered analysis first, fallback to simple patterns
      let insights;
      if (this.isInitialized && messages.length >= 4) {
        console.log(`LangChain: Using AI-powered conversation analysis...`);
        insights = await this.analyzeConversationWithAI(conversationText);
      } else {
        console.log(`📝 LangChain: Using simple pattern analysis...`);
        insights = this.analyzeConversationPatterns(conversationText);
      }
      
      if (insights) {
        // Load existing memory
        const existingMemory = await this.getSessionMemory(sessionId);
        
        // Merge with new insights
        const updatedMemory = this.mergeSessionInsights(existingMemory, insights);
        
        // Save updated memory
        await this.saveSessionMemory(sessionId, updatedMemory);
        
        console.log(`LangChain: Session insights extracted and saved for ${sessionId}`);
      }
    } catch (error) {
      console.error('Error extracting session insights:', error);
    }
  }

  async analyzeConversationWithAI(conversationText) {
    try {
      // Create a lightweight analysis prompt
      const analysisPrompt = `Analyze this conversation and extract key insights in JSON format:

CONVERSATION:
${conversationText}

Extract:
1. Programming languages mentioned
2. Frameworks/tools discussed  
3. Project type (backend/frontend/fullstack/data/mobile)
4. Main topics/domains
5. User preferences or patterns

Respond with ONLY a JSON object in this format:
{
  "codeLanguages": ["javascript", "python"],
  "frameworks": ["react", "express"],
  "projectType": "fullstack",
  "topics": ["authentication", "database"],
  "userPreferences": {
    "style": "modern",
    "approach": "security-focused"
  }
}`;

      // Use a small, fast model for analysis (if available)
      const response = await this.getQuickAIAnalysis(analysisPrompt);
      
      if (response) {
        const insights = JSON.parse(response);
        insights.lastAnalyzed = new Date().toISOString();
        insights.analysisMethod = 'ai-powered';
        console.log(`LangChain: AI analysis completed: ${insights.codeLanguages?.length || 0} languages, ${insights.topics?.length || 0} topics`);
        return insights;
      }
    } catch (error) {
      console.log(`LangChain: AI analysis failed, falling back to pattern matching:`, error.message);
    }
    
    // Fallback to simple pattern analysis
    return this.analyzeConversationPatterns(conversationText);
  }

  async getQuickAIAnalysis(prompt) {
    try {
      // Use the existing embeddings provider for quick analysis
      const provider = this.getAvailableProvider();
      if (!provider) return null;

      // Create a simple chat completion request
      const messages = [
        { role: 'system', content: 'You are a conversation analyzer. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
      ];

      // This would use the same API but with a very short response
      // For now, return null to use pattern matching
      // TODO: Implement lightweight API call for analysis
      return null;
    } catch (error) {
      console.log(`LangChain: Quick AI analysis failed:`, error.message);
      return null;
    }
  }
  
  analyzeConversationPatterns(conversationText) {
    // Simple pattern analysis (faster but less accurate)
    const insights = {
      topics: [],
      codeLanguages: [],
      frameworks: [],
      userPreferences: {},
      projectType: null,
      lastAnalyzed: new Date().toISOString(),
      analysisMethod: 'pattern-matching'
    };
    
    const text = conversationText.toLowerCase();
    
    // Detect programming languages
    const languages = ['javascript', 'python', 'java', 'react', 'vue', 'angular', 'node.js', 'express', 'typescript'];
    languages.forEach(lang => {
      if (text.includes(lang) && !insights.codeLanguages.includes(lang)) {
        insights.codeLanguages.push(lang);
      }
    });
    
    // Detect frameworks and tools
    const frameworks = ['express', 'fastapi', 'django', 'spring', 'laravel', 'mongodb', 'mysql', 'postgresql'];
    frameworks.forEach(framework => {
      if (text.includes(framework) && !insights.frameworks.includes(framework)) {
        insights.frameworks.push(framework);
      }
    });
    
    // Detect project types
    if (text.includes('api') || text.includes('backend') || text.includes('server')) {
      insights.projectType = 'backend';
    } else if (text.includes('frontend') || text.includes('ui') || text.includes('component')) {
      insights.projectType = 'frontend';
    } else if (text.includes('database') || text.includes('data')) {
      insights.projectType = 'database';
    }
    
    // Detect common topics
    const topics = ['authentication', 'security', 'database', 'api', 'frontend', 'backend', 'testing', 'deployment'];
    topics.forEach(topic => {
      if (text.includes(topic) && !insights.topics.includes(topic)) {
        insights.topics.push(topic);
      }
    });
    
    return insights;
  }
  
  mergeSessionInsights(existingMemory, newInsights) {
    const merged = { ...existingMemory };
    
    // Merge arrays without duplicates
    merged.topics = [...new Set([...(merged.topics || []), ...newInsights.topics])];
    merged.codeLanguages = [...new Set([...(merged.codeLanguages || []), ...newInsights.codeLanguages])];
    merged.frameworks = [...new Set([...(merged.frameworks || []), ...newInsights.frameworks])];
    
    // Update project type if detected
    if (newInsights.projectType) {
      merged.projectType = newInsights.projectType;
    }
    
    // Update preferences
    merged.userPreferences = { ...(merged.userPreferences || {}), ...(newInsights.userPreferences || {}) };
    
    // Update timestamp
    merged.lastAnalyzed = newInsights.lastAnalyzed;
    
    return merged;
  }
  
  formatSessionMemory(sessionMemory) {
    let formatted = '';
    
    if (sessionMemory.topics && sessionMemory.topics.length > 0) {
      formatted += `Topics discussed: ${sessionMemory.topics.join(', ')}\n`;
    }
    
    if (sessionMemory.codeLanguages && sessionMemory.codeLanguages.length > 0) {
      formatted += `Programming languages: ${sessionMemory.codeLanguages.join(', ')}\n`;
    }
    
    if (sessionMemory.frameworks && sessionMemory.frameworks.length > 0) {
      formatted += `Frameworks/Tools: ${sessionMemory.frameworks.join(', ')}\n`;
    }
    
    if (sessionMemory.projectType) {
      formatted += `Project type: ${sessionMemory.projectType}\n`;
    }
    
    return formatted.trim();
  }

  // ==================== PERSISTENT MEMORY ====================
  
  async saveSessionMemory(sessionId, memory) {
    try {
      let sessionMemories = {};
      
      if (fs.existsSync(this.sessionMemoryFile)) {
        const data = fs.readFileSync(this.sessionMemoryFile, 'utf-8');
        sessionMemories = JSON.parse(data);
      }

      sessionMemories[sessionId] = {
        ...sessionMemories[sessionId],
        ...memory,
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(this.sessionMemoryFile, JSON.stringify(sessionMemories, null, 2));
    } catch (error) {
      console.error('Error saving session memory:', error);
    }
  }

  async getSessionMemory(sessionId) {
    try {
      if (!fs.existsSync(this.sessionMemoryFile)) return {};
      
      const data = fs.readFileSync(this.sessionMemoryFile, 'utf-8');
      const sessionMemories = JSON.parse(data);
      
      return sessionMemories[sessionId] || {};
    } catch (error) {
      console.error('Error loading session memory:', error);
      return {};
    }
  }

  // ==================== VECTOR DATA PERSISTENCE ====================
  
  async saveVectorData() {
    try {
      console.log('LangChain: Saving vector store to disk...');
      
      // Save the full vector store data including embeddings and metadata
      const vectorData = {
        lastSaved: new Date().toISOString(),
        documentsCount: this.vectorStore?.memoryVectors?.length || 0,
        documents: [],
        embeddings: []
      };

      // Extract documents and embeddings from MemoryVectorStore
      if (this.vectorStore && this.vectorStore.memoryVectors) {
        for (let i = 0; i < this.vectorStore.memoryVectors.length; i++) {
          const vector = this.vectorStore.memoryVectors[i];
          vectorData.documents.push({
            content: vector.content,
            metadata: vector.metadata
          });
          vectorData.embeddings.push(vector.embedding);
        }
      }
      
      fs.writeFileSync(this.vectorDataFile, JSON.stringify(vectorData, null, 2));
      console.log(`LangChain: Saved ${vectorData.documentsCount} documents with embeddings to ${this.vectorDataFile}`);
    } catch (error) {
      console.error('Error saving vector data:', error);
    }
  }

  async loadVectorData() {
    try {
      if (fs.existsSync(this.vectorDataFile)) {
        console.log('📂 LangChain: Loading vector store from disk...');
        const data = fs.readFileSync(this.vectorDataFile, 'utf-8');
        const vectorData = JSON.parse(data);
        
        console.log(`Vector store info: ${vectorData.documentsCount} documents from ${vectorData.lastSaved}`);
        
        // Restore documents and embeddings to vector store
        if (vectorData.documents && vectorData.embeddings && vectorData.documents.length > 0) {
          console.log(`🔄 LangChain: Restoring ${vectorData.documents.length} documents to vector store...`);
          
          // Create new vector store with restored data
          const restoredVectors = [];
          for (let i = 0; i < vectorData.documents.length; i++) {
            restoredVectors.push({
              content: vectorData.documents[i].content,
              embedding: vectorData.embeddings[i],
              metadata: vectorData.documents[i].metadata
            });
          }
          
          // Recreate vector store with restored data
          this.vectorStore = await MemoryVectorStore.fromTexts(
            vectorData.documents.map(doc => doc.content),
            vectorData.documents.map(doc => doc.metadata),
            this.embeddings
          );
          
          // Manually set the embeddings since we have them cached
          this.vectorStore.memoryVectors = restoredVectors;
          
          console.log(`LangChain: Successfully restored ${restoredVectors.length} documents to vector store`);
        } else {
          console.log('📭 LangChain: No documents to restore from vector store file');
        }
      } else {
        console.log('📝 LangChain: No existing vector store file found, starting fresh');
      }
    } catch (error) {
      console.error('Error loading vector data:', error);
    }
  }

  // ==================== PROJECT UTILITIES ====================
  
  markSessionAsProject(sessionId, isProject = true) {
    // This will be used to differentiate project vs regular sessions
    console.log(`Session ${sessionId} marked as ${isProject ? 'PROJECT' : 'REGULAR'} session`);
  }

  async getProjectStats(sessionId) {
    try {
      const relevantDocs = await this.searchRelevantContent('', sessionId, 100);
      const memory = await this.getSessionMemory(sessionId);
      
      return {
        documentsCount: relevantDocs.length,
        filesProcessed: [...new Set(relevantDocs.map(doc => doc.metadata.fileName))].length,
        sessionMemory: Object.keys(memory).length,
        lastActivity: memory.lastUpdated || 'Never'
      };
    } catch (error) {
      console.error('Error getting project stats:', error);
      return {};
    }
  }

  // ==================== UTILITY METHODS ====================
  
  getAvailableProvider() {
    try {
      const configPath = path.join(this.app.getPath('userData'), 'ai-model.conf.json');
      if (!fs.existsSync(configPath)) return null;
      
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const providers = config.providers || {};
      
      // Priority order: OpenRouter > Groq > Gemini > others
      const priority = ['openrouter', 'groq', 'gemini', 'zhipu', 'cerebras'];
      
      for (const providerName of priority) {
        if (providers[providerName]?.apiKey && providers[providerName].apiKey.trim() !== '') {
          return { name: providerName, ...providers[providerName] };
        }
      }
      
      // Check any other provider
      for (const [name, provider] of Object.entries(providers)) {
        if (provider.apiKey && provider.apiKey.trim() !== '') {
          return { name, ...provider };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting available provider:', error);
      return null;
    }
  }

  /**
   * Process user query with RE+ACT pattern (Reasoning + Action)
   */
  async processWithReasoningAction(userMessage, sessionId, uploadedFiles = [], model = 'glm-4.5-flash', provider = 'zhipu', apiKey = '', baseUrl = '', progressCallback = null) {
    console.log(`LangChain: Processing with RE+ACT pattern for session ${sessionId}`);
    
    // Initialize session with uploaded files and model information if not already done
    if (uploadedFiles && uploadedFiles.length > 0) {
      const modelInfo = { provider, model, apiKey, baseUrl };
      this.reasoningAgent.initializeSession(sessionId, uploadedFiles, modelInfo);
    }
    
    // Process with reasoning action agent
    const result = await this.reasoningAgent.processWithReasoningAction(userMessage, sessionId, [], progressCallback);
    
    return {
      response: result.finalResponse || result,
      actionsExecuted: result.actionHistory?.length || 0,
      sessionId
    };
  }

  getOpenAIKey() {
    // Legacy method - now uses getAvailableProvider
    const provider = this.getAvailableProvider();
    return provider?.apiKey || null;
  }
}

module.exports = ClustrixLangChainService;