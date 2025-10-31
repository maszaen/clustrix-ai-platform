# Perplexity API Integration

## 🎯 Overview

Perplexity AI has been integrated into Clustrix with special handling for its search-aware models. Unlike traditional AI models, Perplexity automatically searches the web and returns responses with citations and search results.

## ✅ What Was Implemented

### 1. **Provider Detection** (`backend/langchain-helpers.js`)
- Added `isPerplexityModel()` helper function
- Detects Perplexity based on `baseUrl` or `provider` name

### 2. **Project Session Blocking** (`backend/langchain-service.js`)
- Perplexity models are **blocked in project sessions**
- These models are optimized for web search, not file reasoning
- Clear error message guides users to use GPT-4/Claude/Gemini instead

### 3. **Non-Streaming API Handler** (`main.js`)
- Perplexity requests use **`stream: false`** (no streaming to save costs)
- Extracts `search_results`, `citations`, and `cost` from response
- Sends search results as special thinking update with `type: 'perplexity_search'`
- Simulates word-by-word streaming for user experience

### 4. **Search Results Storage** (`renderer/renderer.js`)
- Updated `appendThinkingUpdate()` to store `type` field
- Data structure: `{title, content, type, timestamp}`
- Backward compatible: existing updates default to `type: 'normal'`

### 5. **Conditional Rendering** (`renderer/renderer.js`)
- `updateThinkingUpdateUI()` checks update type
- **Perplexity results** → Horizontal scroll cards (special UI)
- **Normal updates** → Vertical list (existing UI)
- Added `createPerplexitySearchCards()` function

### 6. **Horizontal Scroll Cards UI** (`renderer/style.css`)
- Beautiful card design with:
  - Date & source metadata
  - Title (max 2 lines)
  - Snippet (max 3 lines)
  - "View source →" link
- Smooth horizontal scroll with snap points
- Hidden scrollbar for clean look
- Hover effects

### 7. **Cost Display** (`renderer/renderer.js`)
- Usage button now shows cost when available
- Format: `$0.0050 | 381 Tokens (19 Input + 362 Output)`
- Special styling with gradient background for cost indicator
- Works with Perplexity's cost breakdown in response

### 8. **Database Persistence**
- `type` field saved to `thinking_update` column (JSON)
- Both sync and async hydration updated
- Perplexity cards correctly rendered on session load

## 🚀 Usage

### For End Users:

1. **Add Perplexity API Key:**
   - Go to Settings → Switch Model
   - Select "Custom" or add "Perplexity" provider
   - Base URL: `https://api.perplexity.ai`
   - API Key: Your Perplexity API key
   - Add models like: `sonar`, `sonar-pro`, `sonar-reasoning`

2. **Use in Regular Chat:**
   - Select a Perplexity model (sonar, sonar-pro, etc.)
   - Ask questions - search happens automatically
   - See search results as horizontal cards in thinking body
   - View cost breakdown in usage button

3. **Limitations:**
   - ❌ Cannot use in Project Sessions (blocked)
   - ✅ Only works in Regular Chat sessions

### For Developers:

```javascript
// Perplexity Response Structure
{
  "usage": {
    "prompt_tokens": 19,
    "completion_tokens": 362,
    "total_tokens": 381,
    "cost": {
      "total_cost": 0.005  // $0.005
    }
  },
  "citations": ["url1", "url2", ...],
  "search_results": [
    {
      "title": "Article Title",
      "url": "https://...",
      "snippet": "Preview text...",
      "date": "2025-10-31",
      "source": "web"
    }
  ],
  "choices": [{
    "message": {
      "content": "AI response with [1] citations"
    }
  }]
}
```

## 📁 Files Modified

1. **backend/langchain-helpers.js** - Provider detection
2. **backend/langchain-service.js** - Project session blocking
3. **main.js** - Perplexity API handler (non-streaming)
4. **renderer/renderer.js** - Type field, conditional rendering, cost display
5. **renderer/style.css** - Horizontal scroll cards CSS

## 🎨 UI Components

### Search Results Card:
```
┌─────────────────────────────┐
│ Oct 31, 2025      WEB       │
│                             │
│ Claude Sonnet 4.5 —        │
│ apa yang baru...           │
│                             │
│ Claude Sonnet 4.5 adalah   │
│ rilis perbatasan...        │
│                             │
│ View source →              │
└─────────────────────────────┘
   ← Horizontal Scroll →
```

### Cost Button:
```
Normal: [📊] "381 Tokens (19 Input + 362 Output)"
With Cost: [💰] "$0.0050 | 381 Tokens (19 Input + 362 Output)"
```

## ⚙️ Technical Details

- **No Streaming**: Perplexity is expensive, streaming disabled to save costs
- **Type Discriminator**: `type` field differentiates render logic
- **Backward Compatible**: Existing thinking updates still work
- **Database Ready**: JSON structure persists correctly
- **Performance**: Cards render incrementally, no re-renders

## 🔒 Error Handling

- Project session → Clear error with model suggestions
- API errors → Logged and displayed to user
- Parse errors → Fallback to text display
- Missing fields → Safe defaults applied

## 💡 Future Enhancements

- [ ] Add citation inline references in response text
- [ ] Filter/search within results
- [ ] Copy search results to clipboard
- [ ] Export search results as JSON
- [ ] Cost tracking dashboard
- [ ] Support for more search-aware providers

---

**Built:** 2025-10-31  
**Version:** 1.0  
**Status:** ✅ Production Ready
