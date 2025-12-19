/// App settings model
class AppSettings {
  final String provider;
  final String model;
  final String baseUrl;
  final String apiKey;
  final bool thinkMode;
  final PersonaSettings? persona;

  AppSettings({
    this.provider = 'openrouter',
    this.model = 'openai/gpt-4o-mini',
    this.baseUrl = '',
    this.apiKey = '',
    this.thinkMode = false,
    this.persona,
  });

  AppSettings copyWith({
    String? provider,
    String? model,
    String? baseUrl,
    String? apiKey,
    bool? thinkMode,
    PersonaSettings? persona,
  }) {
    return AppSettings(
      provider: provider ?? this.provider,
      model: model ?? this.model,
      baseUrl: baseUrl ?? this.baseUrl,
      apiKey: apiKey ?? this.apiKey,
      thinkMode: thinkMode ?? this.thinkMode,
      persona: persona ?? this.persona,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'provider': provider,
      'model': model,
      'baseUrl': baseUrl,
      'apiKey': apiKey,
      'thinkMode': thinkMode,
      'persona': persona?.toMap(),
    };
  }

  factory AppSettings.fromMap(Map<String, dynamic> map) {
    return AppSettings(
      provider: map['provider'] as String? ?? 'openrouter',
      model: map['model'] as String? ?? 'openai/gpt-4o-mini',
      baseUrl: map['baseUrl'] as String? ?? '',
      apiKey: map['apiKey'] as String? ?? '',
      thinkMode: map['thinkMode'] as bool? ?? false,
      persona: map['persona'] != null 
          ? PersonaSettings.fromMap(map['persona'] as Map<String, dynamic>)
          : null,
    );
  }
}

/// Persona settings for user customization
class PersonaSettings {
  final String name;
  final String? language;
  final String? personality;
  final String? additionalContext;

  PersonaSettings({
    required this.name,
    this.language,
    this.personality,
    this.additionalContext,
  });

  Map<String, dynamic> toMap() {
    return {
      'name': name,
      'language': language,
      'personality': personality,
      'additionalContext': additionalContext,
    };
  }

  factory PersonaSettings.fromMap(Map<String, dynamic> map) {
    return PersonaSettings(
      name: map['name'] as String? ?? 'friend',
      language: map['language'] as String?,
      personality: map['personality'] as String?,
      additionalContext: map['additionalContext'] as String?,
    );
  }
}
