import 'package:flutter/foundation.dart';
import '../models/session.dart';
import '../models/message.dart';
import '../models/settings.dart';
import '../constants/strings.dart';
import '../services/database.dart';

/// Main app state provider - mirrors React Native AppContext
class AppProvider extends ChangeNotifier {
  // State
  List<Session> _sessions = [];
  Session? _currentSession;
  List<Message> _messages = [];
  AppSettings _settings = AppSettings();
  bool _isStreaming = false;
  bool _isReady = false;
  bool _isLoadingSession = false;
  int _expectedMessageCount = 0;
  String _welcomeMessage = '';
  String _splashMessage = '';
  bool _splashComplete = false;

  // Pagination
  bool _hasMoreMessages = false;
  int _oldestLoadedIndex = -1;
  bool _isLoadingMore = false;

  // Getters
  List<Session> get sessions => _sessions;
  Session? get currentSession => _currentSession;
  List<Message> get messages => _messages;
  AppSettings get settings => _settings;
  bool get isStreaming => _isStreaming;
  bool get isReady => _isReady;
  bool get isLoadingSession => _isLoadingSession;
  int get expectedMessageCount => _expectedMessageCount;
  String get welcomeMessage => _welcomeMessage;
  String get splashMessage => _splashMessage;
  bool get splashComplete => _splashComplete;
  bool get hasMoreMessages => _hasMoreMessages;
  bool get isLoadingMore => _isLoadingMore;

  // Database service
  late DatabaseService _db;

  /// Initialize the provider
  Future<void> init() async {
    _db = DatabaseService();
    await _db.init();

    // Load initial data
    _sessions = await _db.getAllSessions();
    _settings = await _db.getSettings() ?? AppSettings();

    // Generate welcome message
    final personaName = _settings.persona?.name ?? 'friend';
    _splashMessage = WelcomeMessages.getWelcomeMessage(username: personaName);
    _welcomeMessage = _splashMessage;

    // Simulate splash delay
    await Future.delayed(const Duration(seconds: 2));

    _isReady = true;
    notifyListeners();
  }

  /// Select a session
  Future<void> selectSession(Session session) async {
    _isLoadingSession = true;
    notifyListeners();

    _currentSession = session;
    
    // Load messages for this session
    final result = await _db.getMessagesPaginated(session.id, 5000);
    _messages = result.messages;
    _expectedMessageCount = result.messages.length;
    _hasMoreMessages = result.hasMore;
    _oldestLoadedIndex = result.oldestLoadedIndex;

    _isLoadingSession = false;
    notifyListeners();
  }

  /// Clear current session (go to welcome)
  void clearCurrentSession() {
    _currentSession = null;
    _messages = [];
    _hasMoreMessages = false;
    _oldestLoadedIndex = -1;
    
    // Regenerate welcome message
    final personaName = _settings.persona?.name ?? 'friend';
    _welcomeMessage = WelcomeMessages.getWelcomeMessage(username: personaName);
    
    notifyListeners();
  }

  /// Create a new session
  Future<Session> createSession(String name) async {
    final session = Session(
      id: _generateId(),
      name: name,
      createdAt: DateTime.now().millisecondsSinceEpoch,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
    );

    await _db.saveSession(session);
    _sessions.insert(0, session);
    _currentSession = session;
    _messages = [];

    notifyListeners();
    return session;
  }

  /// Delete a session
  Future<void> deleteSession(String id) async {
    await _db.deleteSession(id);
    _sessions.removeWhere((s) => s.id == id);
    
    if (_currentSession?.id == id) {
      _currentSession = null;
      _messages = [];
    }

    notifyListeners();
  }

  /// Update session
  Future<void> updateSession(Session session, {Map<String, dynamic>? updates}) async {
    final updated = updates != null 
        ? session.copyWith(
            name: updates['name'] as String? ?? session.name,
            updatedAt: DateTime.now().millisecondsSinceEpoch,
          )
        : session.copyWith(updatedAt: DateTime.now().millisecondsSinceEpoch);

    await _db.saveSession(updated);
    
    final index = _sessions.indexWhere((s) => s.id == updated.id);
    if (index >= 0) {
      _sessions[index] = updated;
    }

    if (_currentSession?.id == updated.id) {
      _currentSession = updated;
    }

    notifyListeners();
  }

  /// Toggle favorite
  Future<void> toggleFavorite(String sessionId) async {
    final session = _sessions.firstWhere((s) => s.id == sessionId);
    final updated = session.copyWith(
      isFavorite: !session.isFavorite,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
    );

    await _db.saveSession(updated);
    
    final index = _sessions.indexWhere((s) => s.id == sessionId);
    if (index >= 0) {
      _sessions[index] = updated;
    }

    if (_currentSession?.id == sessionId) {
      _currentSession = updated;
    }

    notifyListeners();
  }

  /// Rename session
  Future<void> renameSession(String sessionId, String newName) async {
    final session = _sessions.firstWhere((s) => s.id == sessionId);
    final updated = session.copyWith(
      name: newName,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
    );

    await _db.saveSession(updated);
    
    final index = _sessions.indexWhere((s) => s.id == sessionId);
    if (index >= 0) {
      _sessions[index] = updated;
    }

    if (_currentSession?.id == sessionId) {
      _currentSession = updated;
    }

    notifyListeners();
  }

  /// Add a message
  Future<void> appendMessage(Message message, {Session? targetSession}) async {
    final session = targetSession ?? _currentSession;
    if (session == null) return;

    await _db.addMessage(session.id, message);
    _messages.add(message);

    // Update session timestamp
    await updateSession(session);

    notifyListeners();
  }

  /// Update message metadata
  Future<void> setMessageMetadata(String sessionId, int messageIndex, Map<String, dynamic> updates) async {
    await _db.updateMessageMetadata(sessionId, messageIndex, updates);
    
    final index = _messages.indexWhere((m) => m.messageIndex == messageIndex);
    if (index >= 0) {
      _messages[index] = _messages[index].copyWith(
        isLiked: updates['is_liked'] as bool?,
        usage: updates['usage'] as Map<String, dynamic>?,
        cost: updates['cost'] as double?,
      );
    }

    notifyListeners();
  }

  /// Remove a message
  Future<void> removeMessage(String sessionId, int messageIndex) async {
    await _db.deleteMessage(sessionId, messageIndex);
    _messages.removeWhere((m) => m.messageIndex == messageIndex);
    notifyListeners();
  }

  /// Load more older messages
  Future<int> loadMoreMessages() async {
    if (_currentSession == null || !_hasMoreMessages || _isLoadingMore || _oldestLoadedIndex <= 0) {
      return 0;
    }

    _isLoadingMore = true;
    notifyListeners();

    try {
      final result = await _db.getOlderMessages(_currentSession!.id, _oldestLoadedIndex, 5000);
      
      if (result.messages.isNotEmpty) {
        _messages.insertAll(0, result.messages);
        _hasMoreMessages = result.hasMore;
        _oldestLoadedIndex = result.oldestLoadedIndex;
        notifyListeners();
        return result.messages.length;
      } else {
        _hasMoreMessages = false;
        notifyListeners();
        return 0;
      }
    } finally {
      _isLoadingMore = false;
      notifyListeners();
    }
  }

  /// Update settings
  Future<void> updateSettings(AppSettings newSettings) async {
    _settings = newSettings;
    await _db.saveSettings(newSettings);
    notifyListeners();
  }

  /// Set streaming state
  void setStreaming(bool streaming) {
    _isStreaming = streaming;
    notifyListeners();
  }

  /// Set splash complete
  void setSplashComplete(bool complete) {
    _splashComplete = complete;
    notifyListeners();
  }

  /// Generate unique ID
  String _generateId() {
    final now = DateTime.now();
    final random = now.microsecondsSinceEpoch % 1000000;
    return '${now.millisecondsSinceEpoch}-$random';
  }
}
