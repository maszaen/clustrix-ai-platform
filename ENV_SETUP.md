# Environment Configuration

This document explains how to set up and use environment variables with Clustrix.

## Quick Start

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your API keys:**
   ```bash
   # Open .env in your editor and fill in the required values
   GITHUB_CLIENT_ID=your_client_id
   GITHUB_CLIENT_SECRET=your_client_secret
   OPENROUTER_API_KEY=your_api_key
   # ... etc
   ```

3. **Run the app:**
   - **Development:** `npm run dev`
   - **Build:** `npm run make`

## Environment Variables

### GitHub OAuth (Optional - for sync/backup)
- `GITHUB_CLIENT_ID` - OAuth app client ID
- `GITHUB_CLIENT_SECRET` - OAuth app client secret
- `GITHUB_CALLBACK_URL` - OAuth callback URL (default: http://localhost:2920/oauth/callback)

### AI Provider Keys (At least one required)
- `OPENROUTER_API_KEY` - OpenRouter API key (recommended for multi-model)
- `GROQ_API_KEY` - Groq API key
- `GEMINI_API_KEY` - Google Gemini API key
- `OPENAI_API_KEY` - OpenAI API key
- `Z_API_KEY` - Z.AI API key

### Search API (Optional - for web search)
- `SERPAPI_API_KEY` - SerpAPI key for web search
- `GOOGLE_CSE_ID` - Google Custom Search Engine ID
- `GOOGLE_API_KEY` - Google API key

### Debug
- `CLUSTRIX_DEBUG` - Enable debug logging (true/false)

## Building with Environment Variables

When you run `npm run make` or `npm run package`, the build script automatically:

1. **Copies `.env` to the output directory**
2. **Includes it in the built application**
3. **Loads variables on app startup**

The environment variables become part of the application bundle and are available when the app runs.

### Build Scripts

```bash
# Development (reads from .env)
npm run dev

# Build for distribution (copies .env to output)
npm run make

# Build without installer (debug)
npm run package

# Publish release (with .env)
npm run publish
```

## File Structure

```
clustrix/
├── .env                 # ← Your local config (NOT in git)
├── .env.example         # ← Template (in git)
├── build.js             # ← Build helper script
├── package.json         # ← Includes .env in files
└── out/
    └── .env             # ← Copied here during build
```

## Security Notes

⚠️ **IMPORTANT:**

1. **Never commit `.env` to git** - Add it to `.gitignore`
2. **`.env.example` should only contain dummy values** - No real secrets
3. **Keep API keys private** - Don't share `.env` files
4. **Use environment-specific `.env` files** if needed:
   - `.env` - Local development
   - `.env.production` - For release builds

## Troubleshooting

**Variables not loading?**
- Check that `.env` file exists in the root directory
- Verify variable names match `process.env.VARIABLE_NAME`
- Restart the app after changing `.env`

**Build not including `.env`?**
- Run `npm run copy-env` before building
- Check that `.env` file exists (not just `.env.example`)

**GitHub OAuth not working?**
- Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set
- Check `GITHUB_CALLBACK_URL` matches your OAuth app settings

**API calls failing?**
- Ensure at least one AI provider key is set
- Check API keys are valid and have quota remaining
