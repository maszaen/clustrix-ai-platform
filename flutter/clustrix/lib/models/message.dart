/// Message model - represents a chat message
class Message {
  final String role; // 'user' or 'assistant'
  final String content;
  final int messageIndex;
  final int createdAt;
  final String? model;
  final String? provider;
  final String? thinkContent;
  final int? thinkDuration;
  final Map<String, dynamic>? usage;
  final double? cost;
  final bool? isLiked;
  final bool? error;
  final List<Attachment>? attachments;
  
  // Transient state (not persisted)
  final bool isStreaming;

  Message({
    required this.role,
    required this.content,
    required this.messageIndex,
    required this.createdAt,
    this.model,
    this.provider,
    this.thinkContent,
    this.thinkDuration,
    this.usage,
    this.cost,
    this.isLiked,
    this.error,
    this.attachments,
    this.isStreaming = false,
  });

  Message copyWith({
    String? role,
    String? content,
    int? messageIndex,
    int? createdAt,
    String? model,
    String? provider,
    String? thinkContent,
    int? thinkDuration,
    Map<String, dynamic>? usage,
    double? cost,
    bool? isLiked,
    bool? error,
    List<Attachment>? attachments,
    bool? isStreaming,
  }) {
    return Message(
      role: role ?? this.role,
      content: content ?? this.content,
      messageIndex: messageIndex ?? this.messageIndex,
      createdAt: createdAt ?? this.createdAt,
      model: model ?? this.model,
      provider: provider ?? this.provider,
      thinkContent: thinkContent ?? this.thinkContent,
      thinkDuration: thinkDuration ?? this.thinkDuration,
      usage: usage ?? this.usage,
      cost: cost ?? this.cost,
      isLiked: isLiked ?? this.isLiked,
      error: error ?? this.error,
      attachments: attachments ?? this.attachments,
      isStreaming: isStreaming ?? this.isStreaming,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'role': role,
      'content': content,
      'message_index': messageIndex,
      'created_at': createdAt,
      'model': model,
      'provider': provider,
      'think_content': thinkContent,
      'think_duration': thinkDuration,
      'usage': usage,
      'cost': cost,
      'is_liked': isLiked == true ? 1 : (isLiked == false ? 0 : null),
      'error': error == true ? 1 : 0,
      'attachments': attachments?.map((a) => a.toMap()).toList(),
    };
  }

  factory Message.fromMap(Map<String, dynamic> map) {
    return Message(
      role: map['role'] as String,
      content: map['content'] as String,
      messageIndex: map['message_index'] as int,
      createdAt: map['created_at'] as int,
      model: map['model'] as String?,
      provider: map['provider'] as String?,
      thinkContent: map['think_content'] as String?,
      thinkDuration: map['think_duration'] as int?,
      usage: map['usage'] as Map<String, dynamic>?,
      cost: (map['cost'] as num?)?.toDouble(),
      isLiked: map['is_liked'] == null ? null : map['is_liked'] == 1,
      error: map['error'] == 1,
      attachments: (map['attachments'] as List<dynamic>?)
          ?.map((a) => Attachment.fromMap(a as Map<String, dynamic>))
          .toList(),
    );
  }

  bool get isUser => role == 'user';
  bool get isAssistant => role == 'assistant';
  bool get hasThinking => thinkContent != null && thinkContent!.isNotEmpty;
}

/// Attachment model for message attachments
class Attachment {
  final String type; // 'image' or 'file'
  final String? name;
  final String? mimeType;
  final int? size;
  final int? width;
  final int? height;
  final String? uri;
  final String? textContent;
  final String? base64;

  Attachment({
    required this.type,
    this.name,
    this.mimeType,
    this.size,
    this.width,
    this.height,
    this.uri,
    this.textContent,
    this.base64,
  });

  Map<String, dynamic> toMap() {
    return {
      'type': type,
      'name': name,
      'mimeType': mimeType,
      'size': size,
      'width': width,
      'height': height,
      'uri': uri,
      'textContent': textContent,
    };
  }

  factory Attachment.fromMap(Map<String, dynamic> map) {
    return Attachment(
      type: map['type'] as String,
      name: map['name'] as String?,
      mimeType: map['mimeType'] as String?,
      size: map['size'] as int?,
      width: map['width'] as int?,
      height: map['height'] as int?,
      uri: map['uri'] as String?,
      textContent: map['textContent'] as String?,
    );
  }

  bool get isImage => type == 'image';
  bool get isFile => type == 'file';
}
