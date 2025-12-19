import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'dart:convert';
import '../models/session.dart';
import '../models/message.dart';
import '../models/settings.dart';

/// Database service - mirrors React Native db.js
class DatabaseService {
  late Database _db;

  /// Initialize database
  Future<void> init() async {
    final databasesPath = await getDatabasesPath();
    final path = join(databasesPath, 'clustrix.db');

    _db = await openDatabase(
      path,
      version: 1,
      onCreate: (db, version) async {
        // Sessions table
        await db.execute('''
          CREATE TABLE sessions (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            is_favorite INTEGER DEFAULT 0
          )
        ''');

        // Messages table
        await db.execute('''
          CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            message_index INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            metadata TEXT,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
          )
        ''');

        // Settings table
        await db.execute('''
          CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        ''');

        // Drafts table
        await db.execute('''
          CREATE TABLE drafts (
            session_id TEXT PRIMARY KEY,
            content TEXT NOT NULL
          )
        ''');

        // Create indexes
        await db.execute('CREATE INDEX idx_messages_session ON messages(session_id)');
        await db.execute('CREATE INDEX idx_messages_index ON messages(session_id, message_index)');
      },
    );
  }

  // ==================== Sessions ====================

  /// Get all sessions
  Future<List<Session>> getAllSessions() async {
    final maps = await _db.query(
      'sessions',
      orderBy: 'updated_at DESC',
    );
    return maps.map((m) => Session.fromMap(m)).toList();
  }

  /// Save session
  Future<void> saveSession(Session session) async {
    await _db.insert(
      'sessions',
      session.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Delete session
  Future<void> deleteSession(String id) async {
    await _db.delete('sessions', where: 'id = ?', whereArgs: [id]);
    await _db.delete('messages', where: 'session_id = ?', whereArgs: [id]);
    await _db.delete('drafts', where: 'session_id = ?', whereArgs: [id]);
  }

  // ==================== Messages ====================

  /// Get messages paginated
  Future<PaginatedMessages> getMessagesPaginated(String sessionId, int charLimit) async {
    final allMessages = await _db.query(
      'messages',
      where: 'session_id = ?',
      whereArgs: [sessionId],
      orderBy: 'message_index ASC',
    );

    if (allMessages.isEmpty) {
      return PaginatedMessages(
        messages: [],
        hasMore: false,
        oldestLoadedIndex: -1,
        totalCount: 0,
      );
    }

    // Load messages from end until char limit reached
    final List<Message> loadedMessages = [];
    int totalChars = 0;
    int oldestLoadedIndex = allMessages.length - 1;

    for (int i = allMessages.length - 1; i >= 0; i--) {
      final map = allMessages[i];
      final content = map['content'] as String;
      
      if (totalChars + content.length > charLimit && loadedMessages.isNotEmpty) {
        oldestLoadedIndex = i + 1;
        break;
      }

      final metadata = map['metadata'] != null 
          ? jsonDecode(map['metadata'] as String) as Map<String, dynamic>
          : <String, dynamic>{};

      loadedMessages.insert(0, Message(
        role: map['role'] as String,
        content: content,
        messageIndex: map['message_index'] as int,
        createdAt: map['created_at'] as int,
        model: metadata['model'] as String?,
        provider: metadata['provider'] as String?,
        thinkContent: metadata['thinkContent'] as String?,
        thinkDuration: metadata['thinkDuration'] as int?,
        usage: metadata['usage'] as Map<String, dynamic>?,
        cost: (metadata['cost'] as num?)?.toDouble(),
        isLiked: metadata['is_liked'] as bool?,
        error: metadata['error'] as bool?,
        attachments: (metadata['attachments'] as List<dynamic>?)
            ?.map((a) => Attachment.fromMap(a as Map<String, dynamic>))
            .toList(),
      ));

      totalChars += content.length;
      oldestLoadedIndex = i;
    }

    return PaginatedMessages(
      messages: loadedMessages,
      hasMore: oldestLoadedIndex > 0,
      oldestLoadedIndex: loadedMessages.isNotEmpty ? loadedMessages.first.messageIndex : -1,
      totalCount: allMessages.length,
    );
  }

  /// Get older messages
  Future<PaginatedMessages> getOlderMessages(String sessionId, int beforeIndex, int charLimit) async {
    final olderMessages = await _db.query(
      'messages',
      where: 'session_id = ? AND message_index < ?',
      whereArgs: [sessionId, beforeIndex],
      orderBy: 'message_index ASC',
    );

    if (olderMessages.isEmpty) {
      return PaginatedMessages(
        messages: [],
        hasMore: false,
        oldestLoadedIndex: 0,
        totalCount: 0,
      );
    }

    final List<Message> loadedMessages = [];
    int totalChars = 0;
    int oldestLoadedIndex = 0;

    for (int i = olderMessages.length - 1; i >= 0; i--) {
      final map = olderMessages[i];
      final content = map['content'] as String;
      
      if (totalChars + content.length > charLimit && loadedMessages.isNotEmpty) {
        oldestLoadedIndex = i + 1;
        break;
      }

      final metadata = map['metadata'] != null 
          ? jsonDecode(map['metadata'] as String) as Map<String, dynamic>
          : <String, dynamic>{};

      loadedMessages.insert(0, Message(
        role: map['role'] as String,
        content: content,
        messageIndex: map['message_index'] as int,
        createdAt: map['created_at'] as int,
        model: metadata['model'] as String?,
        provider: metadata['provider'] as String?,
        thinkContent: metadata['thinkContent'] as String?,
        thinkDuration: metadata['thinkDuration'] as int?,
        usage: metadata['usage'] as Map<String, dynamic>?,
        cost: (metadata['cost'] as num?)?.toDouble(),
        isLiked: metadata['is_liked'] as bool?,
        error: metadata['error'] as bool?,
      ));

      totalChars += content.length;
      oldestLoadedIndex = i;
    }

    return PaginatedMessages(
      messages: loadedMessages,
      hasMore: oldestLoadedIndex > 0,
      oldestLoadedIndex: loadedMessages.isNotEmpty ? loadedMessages.first.messageIndex : 0,
      totalCount: olderMessages.length,
    );
  }

  /// Add message
  Future<void> addMessage(String sessionId, Message message) async {
    final metadata = {
      'model': message.model,
      'provider': message.provider,
      'thinkContent': message.thinkContent,
      'thinkDuration': message.thinkDuration,
      'usage': message.usage,
      'cost': message.cost,
      'is_liked': message.isLiked,
      'error': message.error,
      'attachments': message.attachments?.map((a) => a.toMap()).toList(),
    };

    await _db.insert('messages', {
      'session_id': sessionId,
      'role': message.role,
      'content': message.content,
      'message_index': message.messageIndex,
      'created_at': message.createdAt,
      'metadata': jsonEncode(metadata),
    });
  }

  /// Update message metadata
  Future<void> updateMessageMetadata(String sessionId, int messageIndex, Map<String, dynamic> updates) async {
    final existing = await _db.query(
      'messages',
      where: 'session_id = ? AND message_index = ?',
      whereArgs: [sessionId, messageIndex],
    );

    if (existing.isNotEmpty) {
      final oldMetadata = existing.first['metadata'] != null
          ? jsonDecode(existing.first['metadata'] as String) as Map<String, dynamic>
          : <String, dynamic>{};
      
      final newMetadata = {...oldMetadata, ...updates};

      await _db.update(
        'messages',
        {'metadata': jsonEncode(newMetadata)},
        where: 'session_id = ? AND message_index = ?',
        whereArgs: [sessionId, messageIndex],
      );
    }
  }

  /// Delete message
  Future<void> deleteMessage(String sessionId, int messageIndex) async {
    await _db.delete(
      'messages',
      where: 'session_id = ? AND message_index = ?',
      whereArgs: [sessionId, messageIndex],
    );
  }

  // ==================== Settings ====================

  /// Get settings
  Future<AppSettings?> getSettings() async {
    final maps = await _db.query(
      'settings',
      where: 'key = ?',
      whereArgs: ['app_settings'],
    );

    if (maps.isEmpty) return null;

    final value = maps.first['value'] as String;
    return AppSettings.fromMap(jsonDecode(value) as Map<String, dynamic>);
  }

  /// Save settings
  Future<void> saveSettings(AppSettings settings) async {
    await _db.insert(
      'settings',
      {
        'key': 'app_settings',
        'value': jsonEncode(settings.toMap()),
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  // ==================== Drafts ====================

  /// Get draft
  Future<String?> getDraft(String sessionId) async {
    final maps = await _db.query(
      'drafts',
      where: 'session_id = ?',
      whereArgs: [sessionId],
    );

    if (maps.isEmpty) return null;
    return maps.first['content'] as String;
  }

  /// Save draft
  Future<void> saveDraft(String sessionId, String content) async {
    await _db.insert(
      'drafts',
      {'session_id': sessionId, 'content': content},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Delete draft
  Future<void> deleteDraft(String sessionId) async {
    await _db.delete('drafts', where: 'session_id = ?', whereArgs: [sessionId]);
  }
}

/// Paginated messages result
class PaginatedMessages {
  final List<Message> messages;
  final bool hasMore;
  final int oldestLoadedIndex;
  final int totalCount;

  PaginatedMessages({
    required this.messages,
    required this.hasMore,
    required this.oldestLoadedIndex,
    required this.totalCount,
  });
}
