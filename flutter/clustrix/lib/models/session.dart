/// Session model - represents a chat session
class Session {
  final String id;
  final String name;
  final int createdAt;
  final int updatedAt;
  final bool isFavorite;

  Session({
    required this.id,
    required this.name,
    required this.createdAt,
    required this.updatedAt,
    this.isFavorite = false,
  });

  Session copyWith({
    String? id,
    String? name,
    int? createdAt,
    int? updatedAt,
    bool? isFavorite,
  }) {
    return Session(
      id: id ?? this.id,
      name: name ?? this.name,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      isFavorite: isFavorite ?? this.isFavorite,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'created_at': createdAt,
      'updated_at': updatedAt,
      'is_favorite': isFavorite ? 1 : 0,
    };
  }

  factory Session.fromMap(Map<String, dynamic> map) {
    return Session(
      id: map['id'] as String,
      name: map['name'] as String,
      createdAt: map['created_at'] as int,
      updatedAt: map['updated_at'] as int,
      isFavorite: (map['is_favorite'] as int?) == 1,
    );
  }
}
