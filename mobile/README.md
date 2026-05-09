# Clustrix Mobile App

A comprehensive React Native mobile application powered by Expo, providing AI-assisted chat capabilities across iOS, Android, and Web platforms.

## Overview

Clustrix Mobile is a feature-rich AI assistant application that supports multiple AI providers (OpenRouter, OpenAI, Gemini, Anthropic, and more). It offers seamless chat experiences with advanced features including image generation, file attachments, cloud backup, and personalized AI personas.

**Version**: 3.2.59  
**Owner**: Zaeni Ahmad  
**Package ID** (Android): `com.zaen.clustrix.mobile`

## Features

### Core Chat Features
- **Multi-Provider Support**: Integrate with OpenRouter, OpenAI, Gemini, Anthropic, and more
- **Session Management**: Create, organize, rename, and manage multiple chat sessions
- **Message History**: Persistent message storage with pagination support
- **Favorites**: Mark and filter favorite sessions for quick access
- **Search & Filter**: Search through chat history across sessions

### Advanced Capabilities
- **Image Generation**: Generate images using DALL-E 3, Imagen 4.0, and other providers
- **File Attachments**: Upload and process documents (images, PDFs, documents)
- **Image Analysis**: Analyze and extract information from images
- **PDF Extraction**: Extract text and data from PDF files
- **Message Attachments**: View and manage file attachments in conversations

### Personalization
- **AI Personas**: Create custom AI personas with specific names, work descriptions, and preferences
- **Language Support**: Multi-language support with autodetect capability
- **Theme Customization**: Personalize colors, fonts, and UI appearance
- **Think Mode**: Enable extended reasoning for complex queries
- **Agentic Mode**: Enable web search and tool use for enhanced capabilities

### Cloud & Sync Features
- **Cloud Backup**: Automatic and manual backup of all data to Clustrix Cloud
- **Cloud Restore**: Restore conversations and settings from backups
- **Reminder Sync**: Synchronize reminders across devices
- **OAuth Authentication**: Google Sign-in integration for secure authentication

### Additional Features
- **Push Notifications**: Real-time notification support
- **Secure Storage**: End-to-end encryption for sensitive credentials
- **Agentic Tools**: Web search integration (Tavily, SerpAPI, Google CSE)
- **Custom Models**: Define and manage custom AI model configurations
- **Custom Providers**: Configure custom API providers with custom base URLs
- **Mobile Optimizations**: Bottom sheet modals, gesture-based navigation, keyboard handling

## Technology Stack

### Core Framework
- **React Native** 0.81.5 - Native mobile development
- **Expo** 54.0.27 - Development platform and build system
- **React** 19.1.0 - UI framework
- **TypeScript** 5.9.2 - Type-safe development

### UI & Navigation
- **React Native Gesture Handler** 2.28.0 - Advanced gesture recognition
- **React Native Reanimated** 4.1.1 - High-performance animations
- **React Native Safe Area Context** 5.6.2 - Safe area handling
- **Lucide React Native** 0.556.0 - Icon library
- **Expo Linear Gradient** 15.0.8 - Gradient components
- **React Native Keyboard Controller** 1.20.1 - Keyboard management

### Native Features
- **Expo Notifications** 0.32.2 - Push notifications
- **Expo Image Picker** 17.0.10 - Image selection from device
- **Expo Document Picker** 14.0.8 - File selection
- **Expo File System** 19.0.21 - File operations
- **Expo SQLite** 16.0.10 - Local database
- **Expo Secure Store** 15.0.8 - Secure credential storage
- **Expo Crypto** 15.0.8 - Cryptographic operations
- **Expo Clipboard** 8.0.8 - Clipboard access
- **Expo Media Library** 18.2.1 - Access to device media

### Authentication & Cloud
- **@react-native-google-signin/google-signin** 16.0.0 - Google authentication
- **Expo Web Browser** 15.0.10 - Web authentication flows

### Data & Storage
- **@react-native-async-storage/async-storage** 2.2.0 - Async key-value storage
- **Expo SQLite** 16.0.10 - Local relational database
- **Patch Package** 8.0.1 - Patch npm dependencies

### Utilities
- **Remark** 15.0.1 - Markdown parser
- **Remark GFM** 4.0.1 - GitHub Flavored Markdown support
- **React Native SVG** 15.15.1 - SVG rendering
- **React Native WebView** 13.15.0 - WebView component
- **@shopify/flash-list** 2.2.0 - Performant list rendering
- **React Native Web** 0.21.0 - Web platform support
- **Expo Blur** 15.0.8 - Blur effect component
- **Expo Vector Icons** 15.0.3 - Icon sets
- **React Native Date Time Picker** 8.5.1 - Date/time selection

## Project Structure

```
mobile/
├── src/
│   ├── components/          # Reusable React components
│   │   ├── AlertModal.js           - Alert dialog component
│   │   ├── ChatInput.js            - Message input field
│   │   ├── ChatMessage.js          - Message rendering
│   │   ├── SessionList.js          - Session list display
│   │   ├── SlideUpModal.js         - Bottom sheet modal
│   │   ├── SlideLeftModal.js       - Side drawer modal
│   │   ├── ContextMenuFixed.js     - Context menu component
│   │   ├── InputModal.js           - Text input dialog
│   │   ├── ImageViewerModal.js     - Image preview
│   │   ├── LoadingScreen.js        - Loading indicator
│   │   ├── MessageAttachments.js   - File attachment display
│   │   ├── AttachmentPreview.js    - Attachment preview
│   │   ├── ToolResultView.js       - Tool execution results
│   │   ├── CommandBlock.js         - Command rendering
│   │   ├── DropdownSelect.js       - Dropdown selector
│   │   ├── ApiKeyField.js          - API key input field
│   │   ├── RipplePressable.js      - Button with ripple effect
│   │   ├── ConfirmModal.js         - Confirmation dialog
│   │   ├── LongPressGuard.js       - Long press handler
│   │   └── CommandGroup.js         - Command grouping
│   │
│   ├── screens/             # App screens/pages
│   │   ├── ChatScreen.js           - Main chat interface
│   │   ├── PersonalizationScreen.js - Persona and settings
│   │   ├── ModelsListScreen.js     - Available models list
│   │   ├── ImageModelsScreen.js    - Image generation models
│   │   ├── AgenticToolsScreen.js   - Web search configuration
│   │   ├── AccountScreen.js        - User account and auth
│   │   └── RemindersScreen.js      - Reminder management
│   │
│   ├── services/            # Business logic and API calls
│   │   ├── api.js                  - Direct AI provider integration
│   │   ├── auth.js                 - Google OAuth authentication
│   │   ├── backup.js               - Cloud backup/restore
│   │   ├── clustrixCloud.js        - Clustrix Cloud backend calls
│   │   ├── notifications.js        - Push notification setup
│   │   ├── agenticTools.js         - Web search tool integration
│   │   ├── reminderSync.js         - Reminder synchronization
│   │   └── pdfExtractor.js         - PDF text extraction
│   │
│   ├── database/            # Local SQLite database
│   │   └── db.js                   - Database operations and schema
│   │
│   ├── context/             # React Context for state management
│   │   └── AppContext.js           - Global app state (sessions, messages, settings)
│   │
│   ├── constants/           # App-wide constants
│   │   ├── colors.js               - Color palette
│   │   ├── fonts.js                - Font definitions
│   │   ├── providers.js            - AI provider configurations
│   │   └── strings.js              - Welcome messages and static strings
│   │
│   ├── lib/                 # Custom libraries
│   │   └── streamdown.js           - Markdown-to-React streaming renderer
│   │
│   └── utils/               # Utility functions
│       └── ids.js                  - ID generation utilities
│
├── assets/                  # Images and icons
│   ├── icon.png                    - App icon
│   ├── adaptive-icon.png           - Android adaptive icon
│   └── favicon.png                 - Web favicon
│
├── App.js                   # Main app component with navigation
├── index.js                 # App entry point
├── app.json                 # Expo configuration
├── package.json             # Dependencies and scripts
├── babel.config.js          # Babel configuration
├── tsconfig.json            # TypeScript configuration
└── README.md                # This file
```

## Getting Started

### Prerequisites
- Node.js 18+ and npm or yarn
- Expo CLI: `npm install -g expo-cli`
- iOS: Xcode 15+ (macOS only)
- Android: Android Studio and Android SDK

### Installation

1. **Clone the repository** (if not already done):
   ```bash
   git clone <repository-url>
   cd clustrix-ai-platform/mobile
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure API Keys** (optional):
   - Set up `.env` or use in-app configuration for API keys
   - Supported providers: OpenRouter, OpenAI, Gemini, Anthropic, etc.

4. **Start the development server**:
   ```bash
   npm start
   # or
   yarn start
   ```

### Available Scripts

```bash
# Start Expo development server
npm start

# Run on Android emulator/device
npm run android

# Run on iOS simulator (macOS only)
npm run ios

# Run web version
npm run web
```

## Platform Configuration

### Android
- **Minimum SDK**: 21+
- **Target SDK**: Latest stable
- **Permissions**: Notifications, Camera, File access, etc.
- **Features**: Hardware acceleration support, edge-to-edge display

### iOS
- **Minimum Version**: 12.0+
- **iPad Support**: Yes (supportsTablet: true)
- **Features**: Safe area handling, biometric authentication ready

### Web
- **Supported**: Yes (via React Native Web)
- **Features**: Responsive design, touch and mouse support

## Database Schema

The app uses SQLite with the following tables:

- **sessions** - Chat session metadata
- **messages** - Chat messages with metadata
- **settings** - User preferences and configurations
- **custom_models** - User-defined AI models
- **custom_providers** - User-defined API providers
- **provider_api_keys** - API key storage
- **drafts** - Message drafts for sessions
- **persona_drafts** - AI persona drafts
- **backup_history** - Cloud backup history

## Architecture Overview

### State Management
- **React Context** (`AppContext.js`) - Global application state
- **Local SQLite Database** - Persistent data storage
- **Async Storage** - Key-value pairs and preferences
- **Secure Storage** - Sensitive credentials (API keys, auth tokens)

### API Integration
- **Direct Provider Calls** - `api.js` handles streaming responses
- **Clustrix Cloud Mode** - Backend forwarding via `clustrixCloud.js`
- **EventSource** - Server-sent events for streaming
- **Token Normalization** - Unified token counting across providers

### Authentication
- **Google OAuth** - Primary authentication method
- **JWT Storage** - Secure token storage
- **Auto-refresh** - Automatic token refresh logic

### Features Architecture

#### Chat System
- Session-based conversation management
- Paginated message loading for performance
- Markdown rendering with GFM support
- Real-time streaming responses
- Image and file attachment handling

#### Personalization
- Persona-based system prompts
- Dynamic prompt generation
- Language-aware responses
- Custom model/provider support

#### Agentic Mode
- Tool calling support
- Web search integration (Tavily, SerpAPI, Google CSE)
- Structured output parsing
- Tool result formatting

#### Cloud Services
- Automatic backup scheduling
- Encrypted data transmission
- Conflict resolution for synced data
- Reminder synchronization

## Development Guidelines

### Code Style
- Always use reusable components for UI elements
- Add comments for complex logic and maintainability
- Follow React/React Native best practices
- Use TypeScript for type safety where applicable

### Performance
- Use `FlatList`/`FlashList` for long lists
- Memoize expensive components with `useMemo`/`useCallback`
- Optimize re-renders with proper dependency arrays
- Handle keyboard interruptions gracefully

### UI/UX
- Implement smooth animations with Reanimated
- Use gesture handlers for natural interactions
- Maintain safe area padding on all screens
- Support both light and dark themes

### Testing
- Test on multiple device sizes
- Verify performance on low-end devices
- Test network failure scenarios
- Validate data persistence and sync

## Building for Production

### Using EAS Build
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to your Expo account
eas login

# Build for Android
eas build -p android

# Build for iOS
eas build -p ios
```

### Environment Configuration
- Project ID: `ae926762-a774-4e92-b8a0-353c8345620d`
- Owner: `zaeniahmad`
- Engine: Hermes (optimized for React Native)
- New Architecture: Enabled

## Contributing

When contributing to the mobile app:
1. Follow the code style guidelines above
2. Test changes on multiple platforms
3. Update relevant documentation
4. Keep commits focused and descriptive
5. Ensure no console warnings or errors

## Troubleshooting

### Common Issues

**App not starting**
- Clear node_modules: `rm -rf node_modules && npm install`
- Reset Expo cache: `expo start -c`

**Build failures**
- Check Node.js version compatibility
- Verify all native dependencies are linked
- Review platform-specific build logs

**Database issues**
- Clear app data and reinstall
- Check database migration status
- Review SQLite version compatibility

**Push notifications not working**
- Verify notification permissions are granted
- Check notification channel configuration
- Review OS-specific notification settings

## Performance Notes

- **JS Engine**: Hermes (optimized for mobile)
- **New Architecture**: Enabled for better performance
- **Build Optimization**: ProGuard/R8 for Android, bitcode for iOS

## Privacy & Security

- API keys stored in secure storage (not plain text)
- Cloud backups use encrypted transmission
- User data synchronized securely
- Google OAuth for safe authentication

## License

This mobile app is part of the Clustrix AI Platform and follows the same licensing terms as the main project.

## Support & Feedback

For issues, feature requests, or questions:
- Check existing GitHub issues
- Create a new issue with detailed reproduction steps
- Contact the maintainer: Zaeni Ahmad

---

**Last Updated**: May 2026  
**Maintained by**: Zaeni Ahmad
