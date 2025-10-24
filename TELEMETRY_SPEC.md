# Telemetry & Analytics Specification

## Overview
This document outlines the anonymous usage data collection for Clustrix AI Platform development purposes. All data collected is **completely anonymous** and used solely to improve the platform.

## Why We Collect This Data
As a **solo-developed open-source project** with no team or resources for formal user research, telemetry data is essential for:

1. **Improving Internal Reasoning Model**: Understanding how users interact with the reasoning features helps optimize the AI decision-making process
2. **Optimizing LangChain Integration**: Performance metrics and usage patterns guide improvements to the LangChain backend
3. **Bug Detection & Fixing**: Error logs and crash reports help identify and resolve issues quickly
4. **Database Optimization**: Database statistics help optimize schema, queries, and storage efficiency
5. **UX Enhancement**: Click rate analysis reveals which features are intuitive and which need improvement
6. **Feature Prioritization**: Usage patterns show which features are valuable and which need more development

Without this data, development would be based on guesswork rather than actual user behavior.

## Privacy-First Principles
- ✅ **NO personal information** (name, email, username, etc.)
- ✅ **NO location data** (GPS, IP geolocation, timezone)
- ✅ **NO device identifiers** (MAC address, device ID, hardware IDs)
- ✅ **NO content data** (chat messages, uploaded files, API keys)
- ✅ **ONLY usage patterns** and application behavior

## Data Collection Categories

### 1. Application Usage Metrics
**Purpose:** Understand feature adoption, usage patterns, and improve UX through click rate analysis

Data Points:
- Application start/stop events
- Session duration (anonymized)
- Feature usage counts (e.g., "chat sent", "file uploaded", "project created")
- Button/menu clicks (UI element IDs only, no user input) - **Critical for UX analysis**
- Modal open/close events
- Settings changed (which setting, not the value)
- Error dialogs shown

**Why we need this:** Click rate data reveals user behavior patterns, helping identify confusing UI elements, unused features, and optimization opportunities.

Example Event:
```json
{
  "event": "feature_used",
  "feature": "chat_send",
  "timestamp": "2025-10-24T10:30:00Z",
  "session_id": "anonymous_hash_xyz123"
}
```

### 2. Performance Metrics
**Purpose:** Identify performance bottlenecks, optimize LangChain integration, and improve system responsiveness

Data Points:
- Application startup time
- UI render time (for major views)
- Database query performance (query type, duration, no actual queries) - **Critical for DB optimization**
- Memory usage (general ranges: low/medium/high)
- CPU usage (general ranges: low/medium/high)
- File processing time (file type and size range, not content)
- Backup/sync operation duration
- LangChain operation timing (embeddings, reasoning, agent execution)

**Why we need this:** Performance data helps optimize the reasoning model, database queries, and overall system efficiency. Essential for maintaining smooth user experience.

Example Event:
```json
{
  "event": "performance_metric",
  "operation": "database_query",
  "duration_ms": 45,
  "query_type": "select_sessions",
  "timestamp": "2025-10-24T10:30:00Z"
}
```

### 3. Error & Crash Logs
**Purpose:** Identify and fix bugs, crashes, and errors across all system components

Data Points:
- Error type and message (sanitized - no user data)
- Stack trace (function names only, no sensitive data)
- Error context (which feature, which operation)
- Error frequency and patterns
- Application version
- Operating system version (Windows 10/11, no specific build)
- Component affected (renderer, main process, LangChain, database, etc.)

**Why we need this:** As a solo developer, error logs are critical for identifying bugs I can't reproduce locally. They help prioritize fixes and improve stability. Logs help debug issues with the reasoning model, LangChain integration, database operations, and system integrations.

Example Event:
```json
{
  "event": "error_occurred",
  "error_type": "DatabaseError",
  "error_message": "Failed to execute query",
  "function": "executeDataSourceSwitch",
  "severity": "error",
  "app_version": "1.0.0",
  "os": "Windows 11",
  "timestamp": "2025-10-24T10:30:00Z"
}
```
- Operating system version (Windows 10/11, no specific build)

Example Event:
```json
{
  "event": "error_occurred",
  "error_type": "DatabaseError",
  "error_message": "Failed to execute query",
  "function": "executeDataSourceSwitch",
  "severity": "error",
  "app_version": "1.0.0",
  "os": "Windows 11",
  "timestamp": "2025-10-24T10:30:00Z"
}
```

### 4. Feature Engagement
**Purpose:** Understand which features are valuable, how they're used together, and prioritize development efforts

Data Points:
- Feature first-use events (e.g., first time using projects, artifacts, reasoning mode)
- Feature frequency (how often a feature is used per session)
- Feature sequence (which features are used together - workflow analysis)
- Settings preferences (which AI provider, which mode - internal/cloud)
- Abandoned workflows (started but not completed actions)
- Reasoning model interactions (thinking depth, action types)
- LangChain feature usage (embeddings, memory, agents)

**Why we need this:** Understanding feature engagement helps prioritize which areas need improvement, which features to develop further, and how users actually interact with the reasoning model and LangChain capabilities.

Example Event:
```json
{
  "event": "feature_engagement",
  "action": "reasoning_mode_enabled",
  "is_first_time": true,
  "thinking_depth": "deep",
  "session_count": 5,
  "timestamp": "2025-10-24T10:30:00Z"
}
```

### 5. Database Statistics
**Purpose:** Optimize database schema, query performance, and storage efficiency

Data Points:
- Database size ranges (< 10MB, 10-50MB, 50-100MB, > 100MB)
- Record count ranges (not exact counts)
- Table sizes and growth patterns
- Query patterns (which tables accessed most frequently)
- Index usage statistics
- Backup operation success/failure rates
- Sync operation success/failure rates
- Migration success/failure tracking
- Database corruption incidents

**Why we need this:** Database statistics are crucial for optimizing the storage layer that supports the entire application. This data helps improve query performance, optimize the schema for the reasoning model's memory system, ensure reliable backups, and prevent data loss. Critical for LangChain's vector store and session management.

Example Event:
```json
{
  "event": "database_stat",
  "size_range": "10-50MB",
  "session_count_range": "100-500",
  "artifact_count_range": "50-100",
  "backup_success": true,
  "last_backup_duration_ms": 2340,
  "timestamp": "2025-10-24T10:30:00Z"
}
```
```json
{
  "event": "feature_engagement",
  "action": "project_created",
  "is_first_time": true,
  "session_count": 5,
  "timestamp": "2025-10-24T10:30:00Z"
}
```

### 5. Database Statistics
**Purpose:** Optimize database performance and structure

Data Points:
- Database size ranges (< 10MB, 10-50MB, 50-100MB, > 100MB)
- Number of records (ranges, not exact counts)
- Query patterns (which tables accessed most)
- Backup operation success/failure
- Sync operation success/failure
- Migration success/failure

Example Event:
```json
{
  "event": "database_stat",
  "size_range": "10-50MB",
  "session_count_range": "100-500",
  "backup_success": true,
  "timestamp": "2025-10-24T10:30:00Z"
}
```

## Data NOT Collected

### Explicitly Excluded:
- ❌ Chat messages or conversation content
- ❌ Uploaded file names or content
- ❌ API keys, tokens, or credentials
- ❌ GitHub usernames or repository names
- ❌ User's actual data (projects, sessions, artifacts content)
- ❌ IP addresses or location data
- ❌ Device identifiers (MAC, IMEI, hardware IDs)
- ❌ Browser fingerprints or tracking cookies
- ❌ Network information (WiFi SSID, etc.)
- ❌ Personal information (name, email, etc.)

## Session Identification
- Use **anonymous session hash** (random UUID generated each app start)
- **NO persistent user ID** across sessions
- Session hashes rotate daily for privacy

## Data Transmission
- Data sent via **HTTPS** to secure analytics endpoint
- Batched transmission (every 5 minutes or on app close)
- Offline mode: data queued locally, sent when online
- Failed transmissions: retry 3 times, then discard

## Data Storage & Retention
- Server-side: Data stored in **aggregated format** only
- Individual events discarded after aggregation (24 hours)
- Aggregated statistics retained for 2 years
- No raw event logs kept long-term

## User Control & Transparency

### Opt-Out Options:
1. **Settings Toggle:** Add "Share anonymous usage data" toggle in settings
2. **Source Code:** All telemetry code clearly marked and removable
3. **Build Without Telemetry:** Provide build flag to compile without telemetry
4. **Contact Opt-Out:** Email developer to request data deletion

### Transparency Measures:
1. **Open Source:** All collection code visible on GitHub
2. **Privacy Policy:** Clear documentation of what's collected
3. **Changelog:** Any changes to telemetry documented in releases
4. **Data Dashboard:** Publicly shared aggregate statistics (future)

## Implementation Guidelines

### Code Structure:
```javascript
// backend/telemetry-service.js
class TelemetryService {
  constructor() {
    this.enabled = this.checkUserConsent();
    this.sessionId = this.generateAnonymousSessionId();
    this.eventQueue = [];
  }

  trackEvent(eventName, eventData) {
    if (!this.enabled) return;
    
    // Sanitize data - remove any PII
    const sanitized = this.sanitizeEventData(eventData);
    
    this.eventQueue.push({
      event: eventName,
      data: sanitized,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      app_version: app.getVersion()
    });
    
    this.scheduleBatchSend();
  }

  sanitizeEventData(data) {
    // Remove any potentially sensitive fields
    const blacklist = ['password', 'token', 'key', 'secret', 'email', 'username'];
    // Implementation...
  }
}
```

### Usage Example:
```javascript
// renderer/renderer.js
async function handleChatSend() {
  telemetry.trackEvent('feature_used', { 
    feature: 'chat_send',
    has_attachments: attachments.length > 0,
    message_length_range: getMessageLengthRange(message.length)
  });
  
  // ... actual chat send logic
}
```

## Testing & Validation
- Unit tests verify no PII in telemetry data
- Manual audit of all telemetry events before release
- Community review through GitHub pull requests
- Beta testing with telemetry logging to console

## Compliance
- **GDPR:** No personal data collected, anonymous usage data exempt
- **CCPA:** No sale of data, no personal information collected
- **COPPA:** No data collection from children (app 13+ recommended)

## Future Enhancements
- [ ] Add public analytics dashboard showing aggregate usage stats
- [ ] Implement A/B testing for UI improvements
- [ ] Add user feedback surveys (opt-in)
- [ ] Create telemetry data export for users who want to see their data

## Contact
For questions or concerns about telemetry:
- Email: exqeon@gmail.com
- GitHub: Open an issue with "Privacy" label
- Remove telemetry: Fork repo and modify source code

---

**Note:** This is a living document. Any changes to telemetry will be documented here and communicated through changelog and release notes.
