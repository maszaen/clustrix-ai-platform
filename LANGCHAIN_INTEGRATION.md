# LangChain Integration in Clustrix

## Overview

Clustrix sekarang sudah terintegrasi dengan LangChain untuk memberikan kemampuan **RAG (Retrieval-Augmented Generation)** dan **multi-agent system** yang sophisticated. Integrasi ini memungkinkan:

- 📚 **Vector Database** untuk penyimpanan konteks yang efisien
- 🤖 **Specialized Agents** untuk handling complex tasks
- **Project Session** vs Regular Session differentiation
- 📄 **Enhanced File Processing** dengan chunking dan semantic search
- 🧠 **Persistent Memory** untuk project continuity

## Architecture

### Core Components

1. **langchain-service.js** - Core LangChain service
2. **langchain-agents.js** - Multi-agent orchestrator system
3. **langchain-helpers.js** - Utility functions
4. **main.js** - Enhanced dengan LangChain integration

### Service Structure

```javascript
ClustrixLangChainService
├── Vector Store (MemoryVectorStore)
├── Embeddings (OpenAI/Mock)
├── Project Memory Management
├── File Processing & Chunking
└── RAG Context Generation

MultiAgentOrchestrator
├── CodeAnalysisAgent
├── ResearchAgent  
├── DebuggingAgent
└── ProjectManagementAgent
```

## Features

### 1. **Intelligent Session Types**
- **Regular Sessions**: Enhanced dengan context yang relevan
- **Project Sessions**: Full agent system dengan persistent memory

### 2. **Advanced File Processing**
```javascript
// Automatic file chunking and vectorization
await langchainService.processUploadedFiles(files, sessionId);

// Smart context retrieval
const enhancedContext = await langchainService.generateEnhancedContext(
  query, sessionId, maxTokens
);
```

### 3. **Multi-Agent System**
```javascript
// Complex task handling
const response = await agentOrchestrator.processComplexRequest(
  userQuery, sessionId, session, model, apiKey
);
```

### 4. **Smart Context Management**
- Semantic search untuk document retrieval
- Token-aware context limiting
- Project-specific memory persistence
- Relevance scoring untuk optimal results

## Usage

### Enabling Project Mode
Untuk mengaktifkan project mode dan agent system:

```javascript
// Di session object
session.type = 'project'; // atau
session.isProject = true;
```

### File Upload Enhancement
File yang diupload akan otomatis:
- Di-chunk menjadi bagian yang manageable
- Di-vectorize menggunakan embeddings
- Disimpan di vector store untuk semantic search
- Tersedia untuk RAG context generation

### Agent Selection
Agent akan dipilih otomatis berdasarkan:
- **Code Analysis**: Debugging, review, refactoring
- **Research**: Information gathering, documentation
- **Debugging**: Error analysis, solution suggestions
- **Project Management**: Planning, organization, tracking

## Configuration

### API Keys
LangChain akan menggunakan API key yang tersedia:
1. OpenAI key untuk embeddings (preferred)
2. OpenRouter key sebagai fallback
3. Mock embeddings jika tidak ada key

### Vector Storage
```javascript
// Data disimpan di:
${userData}/vector_data.json // Vector store persistence
${userData}/project_memory.json // Project-specific memory
```

## Performance

### Smart Loading
- Lazy initialization jika tidak ada API key
- Mock embeddings untuk testing tanpa API key
- Efficient memory management dengan garbage collection

### Context Optimization
- Token-aware chunking
- Relevance-based filtering
- Configurable context limits
- Smart document retrieval

## 🔄 Workflow Example

### Regular Chat
```
User Query → LangChain Enhancement → AI Response
           ↓
    Context Enrichment (jika relevant)
```

### Project Session
```
User Query → Agent Selection → Specialized Processing
           ↓                  ↓
    File Analysis → Memory Retrieval → Complex Response
           ↓                  ↓
    Vector Search → Context Generation
```

## Benefits

1. **Reduced Context Overload**: Tidak lagi "ngirim semua konteks ke request"
2. **Intelligent Retrieval**: Hanya konteks yang relevan yang dikirim
3. **Specialized Processing**: Agents untuk task-specific handling
4. **Persistent Memory**: Project continuity across sessions
5. **Scalable Architecture**: Modular design untuk future enhancements

## Development

### Testing LangChain
```bash
# Run dengan debug mode
npm run dev

# Check logs
console.log('LangChain service initialized:', langchainService.isInitialized);
```

### Adding New Agents
```javascript
class CustomAgent extends BaseAgent {
  constructor(langchainService) {
    super('custom', 'Custom task handling', langchainService);
  }
  
  async processRequest(query, context, sessionId) {
    // Implementation
  }
  
  canHandle(query) {
    // Logic untuk detecting relevance
  }
}
```

## 🚨 Troubleshooting

### Common Issues

1. **No API Key Error**
   - Solution: Add OpenAI API key di provider settings
   - Fallback: App akan menggunakan mock embeddings

2. **Vector Store Issues**
   - Solution: Clear vector_data.json dan restart
   - Check: File permissions di userData directory

3. **Agent Not Responding**
   - Check: Session type set ke 'project'
   - Verify: LangChain service initialized

### Debug Commands
```javascript
// Check service status
console.log(langchainService.isInitialized);

// Check agent availability
console.log(agentOrchestrator.agents.map(a => a.name));

// Test vector search
const results = await langchainService.vectorStore.similaritySearch(query, 3);
```

## Success!

LangChain integration berhasil memberikan Clustrix kemampuan:
- ✅ Smart context management
- ✅ Specialized agent system
- ✅ Enhanced file processing
- ✅ Project differentiation
- ✅ Persistent memory
- ✅ Scalable architecture

Aplikasi sekarang siap untuk handling complex tasks dengan intelligent context management!