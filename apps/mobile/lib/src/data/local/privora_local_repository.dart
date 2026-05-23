import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/privora_models.dart';
import 'privora_database.dart';

final privoraDatabaseProvider = Provider<PrivoraDatabase>((ref) {
  final database = PrivoraDatabase();
  ref.onDispose(database.close);
  return database;
});

final privoraLocalRepositoryProvider = Provider<PrivoraLocalRepository>((ref) {
  return PrivoraLocalRepository(ref.watch(privoraDatabaseProvider));
});

class PrivoraSnapshot {
  const PrivoraSnapshot({
    required this.settings,
    required this.chats,
    required this.artifacts,
    required this.webDevProjects,
    required this.webDevThreads,
    required this.characters,
    required this.characterSessions,
  });

  final UiSettings settings;
  final List<ChatRecord> chats;
  final List<ArtifactRecord> artifacts;
  final List<WebDevProjectRecord> webDevProjects;
  final List<WebDevThreadRecord> webDevThreads;
  final List<CharacterRecord> characters;
  final List<CharacterSessionRecord> characterSessions;
}

class PrivoraLocalRepository {
  const PrivoraLocalRepository(this._db);

  static const settingsId = 'default';
  final PrivoraDatabase _db;

  Future<PrivoraSnapshot> loadSnapshot() async {
    final settingsRow = await (_db.select(
      _db.uiSettingsRows,
    )..where((row) => row.id.equals(settingsId))).getSingleOrNull();
    final chatRows = await (_db.select(
      _db.chatRows,
    )..orderBy([(row) => OrderingTerm.desc(row.updatedAt)])).get();
    final messageRows = await (_db.select(
      _db.chatMessageRows,
    )..orderBy([(row) => OrderingTerm.asc(row.createdAt)])).get();
    final artifactRows = await (_db.select(
      _db.artifactRows,
    )..orderBy([(row) => OrderingTerm.desc(row.updatedAt)])).get();
    final projectRows = await (_db.select(
      _db.webDevProjectRows,
    )..orderBy([(row) => OrderingTerm.desc(row.updatedAt)])).get();
    final threadRows = await (_db.select(
      _db.webDevThreadRows,
    )..orderBy([(row) => OrderingTerm.desc(row.updatedAt)])).get();
    final characterRows = await (_db.select(
      _db.characterRows,
    )..orderBy([(row) => OrderingTerm.desc(row.updatedAt)])).get();
    final sessionRows = await (_db.select(
      _db.characterSessionRows,
    )..orderBy([(row) => OrderingTerm.desc(row.updatedAt)])).get();

    return PrivoraSnapshot(
      settings: settingsRow == null
          ? const UiSettings()
          : _settingsFromRow(settingsRow),
      chats: [
        for (final chat in chatRows)
          _chatFromRow(
            chat,
            messageRows
                .where((message) => message.chatId == chat.id)
                .map(_messageFromRow)
                .toList(),
          ),
      ],
      artifacts: artifactRows.map(_artifactRecordFromRow).toList(),
      webDevProjects: projectRows.map(_webDevProjectFromRow).toList(),
      webDevThreads: threadRows.map(_webDevThreadFromRow).toList(),
      characters: characterRows.map(_characterFromRow).toList(),
      characterSessions: sessionRows.map(_characterSessionFromRow).toList(),
    );
  }

  Future<void> saveSettings(UiSettings settings) {
    return _db
        .into(_db.uiSettingsRows)
        .insertOnConflictUpdate(_settingsToCompanion(settings));
  }

  Future<void> upsertChat(ChatRecord chat) async {
    await _db.transaction(() async {
      await _db
          .into(_db.chatRows)
          .insertOnConflictUpdate(_chatToCompanion(chat));
      await (_db.delete(
        _db.chatMessageRows,
      )..where((row) => row.chatId.equals(chat.id))).go();
      if (chat.messages.isNotEmpty) {
        await _db.batch((batch) {
          batch.insertAllOnConflictUpdate(
            _db.chatMessageRows,
            chat.messages.map(_messageToCompanion).toList(),
          );
        });
      }
    });
  }

  Future<void> deleteChat(String chatId) async {
    await (_db.delete(
      _db.chatRows,
    )..where((row) => row.id.equals(chatId))).go();
  }

  Future<void> upsertArtifact(ArtifactRecord artifact) {
    return _db
        .into(_db.artifactRows)
        .insertOnConflictUpdate(_artifactRecordToCompanion(artifact));
  }

  Future<void> upsertCharacterSession(CharacterSessionRecord session) {
    return _db
        .into(_db.characterSessionRows)
        .insertOnConflictUpdate(_characterSessionToCompanion(session));
  }

  Future<void> deleteCharacterSession(String sessionId) async {
    await (_db.delete(
      _db.characterSessionRows,
    )..where((row) => row.id.equals(sessionId))).go();
  }

  Future<void> ensureSeedData({
    required List<WebDevProjectRecord> projects,
    required List<WebDevThreadRecord> threads,
    required List<CharacterRecord> characters,
    required List<CharacterSessionRecord> sessions,
  }) async {
    await _db.transaction(() async {
      final projectCount = await _db
          .select(_db.webDevProjectRows)
          .get()
          .then((rows) => rows.length);
      if (projectCount == 0 && projects.isNotEmpty) {
        await _db.batch((batch) {
          batch.insertAllOnConflictUpdate(
            _db.webDevProjectRows,
            projects.map(_webDevProjectToCompanion).toList(),
          );
        });
      }

      final characterCount = await _db
          .select(_db.characterRows)
          .get()
          .then((rows) => rows.length);
      if (characterCount == 0 && characters.isNotEmpty) {
        await _db.batch((batch) {
          batch.insertAllOnConflictUpdate(
            _db.characterRows,
            characters.map(_characterToCompanion).toList(),
          );
          batch.insertAllOnConflictUpdate(
            _db.characterSessionRows,
            sessions.map(_characterSessionToCompanion).toList(),
          );
        });
      }

      if (threads.isNotEmpty) {
        await _db.batch((batch) {
          batch.insertAllOnConflictUpdate(
            _db.webDevThreadRows,
            threads.map(_webDevThreadToCompanion).toList(),
          );
        });
      }
    });
  }

  UiSettings _settingsFromRow(UiSettingsRow row) => UiSettings(
    workspaceMode: workspaceModeFromStorage(row.workspaceMode),
    selectedModel: row.selectedModel,
    selectedStyle: row.selectedStyle,
    isThinkingEnabled: row.isThinkingEnabled,
    isWebSearchEnabled: row.isWebSearchEnabled,
    isDeepResearchEnabled: row.isDeepResearchEnabled,
    isDebateModeEnabled: row.isDebateModeEnabled,
    isDarkMode: row.isDarkMode,
    composerMode: composerModeFromStorage(row.composerMode),
    debateSettings: DebateSettings(
      agentAModel: row.debateAgentAModel,
      agentBModel: row.debateAgentBModel,
      judgeModel: row.debateJudgeModel,
    ),
    imageSettings: ImageSettings(
      model: row.imageModel,
      sizePreset: row.imageSizePreset,
      quality: row.imageQuality,
      count: row.imageCount,
      partialImages: row.imagePartialImages,
      outputFormat: row.imageOutputFormat,
    ),
  );

  UiSettingsRowsCompanion _settingsToCompanion(UiSettings settings) =>
      UiSettingsRowsCompanion(
        id: const Value(settingsId),
        workspaceMode: Value(settings.workspaceMode.storageValue),
        selectedModel: Value(settings.selectedModel),
        selectedStyle: Value(settings.selectedStyle),
        isThinkingEnabled: Value(settings.isThinkingEnabled),
        isWebSearchEnabled: Value(settings.isWebSearchEnabled),
        isDeepResearchEnabled: Value(settings.isDeepResearchEnabled),
        isDebateModeEnabled: Value(settings.isDebateModeEnabled),
        isDarkMode: Value(settings.isDarkMode),
        composerMode: Value(settings.composerMode.storageValue),
        imageModel: Value(settings.imageSettings.model),
        imageSizePreset: Value(settings.imageSettings.sizePreset),
        imageQuality: Value(settings.imageSettings.quality),
        imageCount: Value(settings.imageSettings.count),
        imagePartialImages: Value(settings.imageSettings.partialImages),
        imageOutputFormat: Value(settings.imageSettings.outputFormat),
        debateAgentAModel: Value(settings.debateSettings.agentAModel),
        debateAgentBModel: Value(settings.debateSettings.agentBModel),
        debateJudgeModel: Value(settings.debateSettings.judgeModel),
      );

  ChatRecord _chatFromRow(ChatRow row, List<ChatMessageRecord> messages) =>
      ChatRecord(
        id: row.id,
        title: row.title,
        messages: messages,
        isStarred: row.isStarred,
        createdAt: _date(row.createdAt),
        updatedAt: _date(row.updatedAt),
        model: row.model,
        pendingResearchIntent: row.pendingResearchIntentJson == null
            ? null
            : _decodePendingResearchIntent(row.pendingResearchIntentJson!),
      );

  ChatRowsCompanion _chatToCompanion(ChatRecord chat) => ChatRowsCompanion(
    id: Value(chat.id),
    title: Value(chat.title),
    isStarred: Value(chat.isStarred),
    createdAt: Value(_millis(chat.createdAt)),
    updatedAt: Value(_millis(chat.updatedAt)),
    model: Value(chat.model),
    pendingResearchIntentJson: Value(
      chat.pendingResearchIntent == null
          ? null
          : jsonEncode(
              _pendingResearchIntentToJson(chat.pendingResearchIntent!),
            ),
    ),
  );

  ChatMessageRecord _messageFromRow(ChatMessageRow row) {
    final research = row.researchJson == null
        ? null
        : (jsonDecode(row.researchJson!) as Map<String, dynamic>);
    return ChatMessageRecord(
      id: row.id,
      chatId: row.chatId,
      role: row.role,
      content: row.content,
      thought: row.thought,
      isThinking: row.isThinking,
      webSearchStatus: row.webSearchStatus,
      webSearchQueries: _decodeStringList(row.webSearchQueriesJson),
      researchStatus: researchStatusFromStorage(row.researchStatus),
      researchSources: _decodeResearchSources(research?['sources']),
      researchPlan: research?['plan'] is Map<String, dynamic>
          ? _decodeResearchPlan(research!['plan'] as Map<String, dynamic>)
          : null,
      researchActivity: _decodeResearchActivity(research?['activity']),
      researchJobId: research?['jobId'] as String?,
      researchStartedAt: _nullableDate(research?['startedAt']),
      researchCompletedAt: _nullableDate(research?['completedAt']),
      researchTimeBudgetMs: (research?['timeBudgetMs'] as num?)?.toInt(),
      isResearchClarification: research?['isClarification'] == true,
      attachments: _decodeAttachments(row.attachmentsJson),
      artifact: row.artifactJson == null
          ? null
          : _decodeArtifact(row.artifactJson!),
      imageGeneration: row.imageGenerationJson == null
          ? null
          : _decodeImageGeneration(row.imageGenerationJson!),
      debate: row.debateJson == null ? null : _decodeDebate(row.debateJson!),
      createdAt: _date(row.createdAt),
    );
  }

  ChatMessageRowsCompanion _messageToCompanion(ChatMessageRecord message) =>
      ChatMessageRowsCompanion(
        id: Value(message.id),
        chatId: Value(message.chatId),
        role: Value(message.role),
        content: Value(message.content),
        thought: Value(message.thought),
        isThinking: Value(message.isThinking),
        webSearchStatus: Value(message.webSearchStatus),
        webSearchQueriesJson: Value(jsonEncode(message.webSearchQueries)),
        researchStatus: Value(message.researchStatus?.storageValue),
        attachmentsJson: Value(
          jsonEncode(message.attachments.map(_attachmentToJson).toList()),
        ),
        artifactJson: Value(
          message.artifact == null
              ? null
              : jsonEncode(_artifactToJson(message.artifact!)),
        ),
        imageGenerationJson: Value(
          message.imageGeneration == null
              ? null
              : jsonEncode(_imageGenerationToJson(message.imageGeneration!)),
        ),
        debateJson: Value(
          message.debate == null
              ? null
              : jsonEncode(_debateToJson(message.debate!)),
        ),
        researchJson: Value(
          message.researchStatus == null &&
                  message.researchPlan == null &&
                  message.researchSources.isEmpty &&
                  message.researchActivity.isEmpty &&
                  !message.isResearchClarification
              ? null
              : jsonEncode(_researchToJson(message)),
        ),
        createdAt: Value(_millis(message.createdAt)),
      );

  WebDevProjectRecord _webDevProjectFromRow(WebDevProjectRow row) =>
      WebDevProjectRecord(
        id: row.id,
        title: row.title,
        status: webDevProjectStatusFromStorage(row.status),
        isStarred: row.isStarred,
        previewUrl: row.previewUrl,
        createdAt: _date(row.createdAt),
        updatedAt: _date(row.updatedAt),
      );

  WebDevProjectRowsCompanion _webDevProjectToCompanion(
    WebDevProjectRecord project,
  ) => WebDevProjectRowsCompanion(
    id: Value(project.id),
    title: Value(project.title),
    status: Value(project.status.storageValue),
    isStarred: Value(project.isStarred),
    previewUrl: Value(project.previewUrl),
    createdAt: Value(_millis(project.createdAt)),
    updatedAt: Value(_millis(project.updatedAt)),
  );

  WebDevThreadRecord _webDevThreadFromRow(WebDevThreadRow row) =>
      WebDevThreadRecord(
        id: row.id,
        projectId: row.projectId,
        title: row.title,
        isStarred: row.isStarred,
        createdAt: _date(row.createdAt),
        updatedAt: _date(row.updatedAt),
      );

  WebDevThreadRowsCompanion _webDevThreadToCompanion(
    WebDevThreadRecord thread,
  ) => WebDevThreadRowsCompanion(
    id: Value(thread.id),
    projectId: Value(thread.projectId),
    title: Value(thread.title),
    isStarred: Value(thread.isStarred),
    createdAt: Value(_millis(thread.createdAt)),
    updatedAt: Value(_millis(thread.updatedAt)),
  );

  CharacterRecord _characterFromRow(CharacterRow row) => CharacterRecord(
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    color: row.color,
    tagline: row.tagline,
    category: row.category,
    greeting: row.greeting,
    personality: row.personality,
    speakingStyle: row.speakingStyle,
    boundaries: row.boundaries,
    exampleDialogue: row.exampleDialogue,
    visibility: row.visibility,
    isStarred: row.isStarred,
    createdAt: _date(row.createdAt),
    updatedAt: _date(row.updatedAt),
  );

  CharacterRowsCompanion _characterToCompanion(CharacterRecord character) =>
      CharacterRowsCompanion(
        id: Value(character.id),
        name: Value(character.name),
        avatar: Value(character.avatar),
        color: Value(character.color),
        tagline: Value(character.tagline),
        category: Value(character.category),
        greeting: Value(character.greeting),
        personality: Value(character.personality),
        speakingStyle: Value(character.speakingStyle),
        boundaries: Value(character.boundaries),
        exampleDialogue: Value(character.exampleDialogue),
        visibility: Value(character.visibility),
        isStarred: Value(character.isStarred),
        createdAt: Value(_millis(character.createdAt)),
        updatedAt: Value(_millis(character.updatedAt)),
      );

  CharacterSessionRecord _characterSessionFromRow(CharacterSessionRow row) =>
      CharacterSessionRecord(
        id: row.id,
        characterId: row.characterId,
        title: row.title,
        model: row.model,
        isStarred: row.isStarred,
        memoryEnabled: row.memoryEnabled,
        createdAt: _date(row.createdAt),
        updatedAt: _date(row.updatedAt),
      );

  CharacterSessionRowsCompanion _characterSessionToCompanion(
    CharacterSessionRecord session,
  ) => CharacterSessionRowsCompanion(
    id: Value(session.id),
    characterId: Value(session.characterId),
    title: Value(session.title),
    model: Value(session.model),
    isStarred: Value(session.isStarred),
    memoryEnabled: Value(session.memoryEnabled),
    createdAt: Value(_millis(session.createdAt)),
    updatedAt: Value(_millis(session.updatedAt)),
  );

  Map<String, Object?> _attachmentToJson(AttachmentRecord attachment) => {
    'url': attachment.url,
    'base64': attachment.base64,
    'mimeType': attachment.mimeType,
    'name': attachment.name,
    'size': attachment.size,
  };

  List<AttachmentRecord> _decodeAttachments(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded.whereType<Map>().map((item) {
      final json = item.cast<String, Object?>();
      return AttachmentRecord(
        url: json['url'] as String? ?? '',
        base64: json['base64'] as String?,
        mimeType: json['mimeType'] as String? ?? 'application/octet-stream',
        name: json['name'] as String? ?? 'attachment',
        size: json['size'] as int?,
      );
    }).toList();
  }

  Map<String, Object?> _artifactToJson(ArtifactReferenceRecord artifact) => {
    'artifactId': artifact.artifactId,
    'title': artifact.title,
    'kind': artifact.kind.storageValue,
    'status': artifact.status.storageValue,
  };

  Map<String, Object?> _researchToJson(ChatMessageRecord message) => {
    'sources': [
      for (final source in message.researchSources)
        {'title': source.title, 'url': source.url, 'provider': source.provider},
    ],
    'plan': message.researchPlan == null
        ? null
        : _researchPlanToJson(message.researchPlan!),
    'activity': [
      for (final activity in message.researchActivity)
        {
          'phase': activity.phase,
          'title': activity.title,
          'detail': activity.detail,
          'source': activity.source == null
              ? null
              : {
                  'title': activity.source!.title,
                  'url': activity.source!.url,
                  'provider': activity.source!.provider,
                },
          'timestamp': activity.timestamp.millisecondsSinceEpoch,
        },
    ],
    'jobId': message.researchJobId,
    'startedAt': message.researchStartedAt?.millisecondsSinceEpoch,
    'completedAt': message.researchCompletedAt?.millisecondsSinceEpoch,
    'timeBudgetMs': message.researchTimeBudgetMs,
    'isClarification': message.isResearchClarification,
  };

  Map<String, Object?> _researchPlanToJson(ResearchPlanRecord plan) => {
    'title': plan.title,
    'steps': [
      for (final step in plan.steps)
        {'text': step.text, 'status': step.status.name},
    ],
    'refinedPrompt': plan.refinedPrompt,
    'status': plan.status.name,
    'progress': plan.progress,
    'currentActivity': plan.currentActivity,
    'createdAt': plan.createdAt.millisecondsSinceEpoch,
    'updatedAt': plan.updatedAt.millisecondsSinceEpoch,
  };

  ResearchPlanRecord _decodeResearchPlan(Map<String, dynamic> json) =>
      ResearchPlanRecord(
        title: '${json['title'] ?? 'Deep Research'}',
        steps: [
          for (final raw in json['steps'] as List? ?? const [])
            if (raw is Map<String, dynamic>)
              ResearchPlanStepRecord(
                text: '${raw['text'] ?? ''}',
                status: ResearchPlanStepStatus.values.byName(
                  '${raw['status'] ?? 'pending'}',
                ),
              ),
        ],
        refinedPrompt: '${json['refinedPrompt'] ?? ''}',
        status: ResearchPlanStatus.values.byName(
          '${json['status'] ?? 'draft'}',
        ),
        progress: (json['progress'] as num?)?.toDouble(),
        currentActivity: json['currentActivity'] as String?,
        createdAt: _date((json['createdAt'] as num?)?.toInt() ?? 0),
        updatedAt: _date((json['updatedAt'] as num?)?.toInt() ?? 0),
      );

  List<ResearchSourceRecord> _decodeResearchSources(Object? raw) => [
    for (final item in raw as List? ?? const [])
      if (item is Map<String, dynamic> && item['url'] is String)
        ResearchSourceRecord(
          url: item['url'] as String,
          title: item['title'] as String?,
          provider: item['provider'] as String?,
        ),
  ];

  List<ResearchActivityRecord> _decodeResearchActivity(Object? raw) => [
    for (final item in raw as List? ?? const [])
      if (item is Map<String, dynamic>)
        ResearchActivityRecord(
          phase: '${item['phase'] ?? ''}',
          title: '${item['title'] ?? ''}',
          detail: item['detail'] as String?,
          source: item['source'] is Map<String, dynamic>
              ? _decodeResearchSources([item['source']]).firstOrNull
              : null,
          timestamp: _date((item['timestamp'] as num?)?.toInt() ?? 0),
        ),
  ];

  Map<String, Object?> _pendingResearchIntentToJson(
    PendingResearchIntentRecord intent,
  ) => {
    'originalGoal': intent.originalGoal,
    'clarificationQuestions': intent.clarificationQuestions,
    'userAnswers': intent.userAnswers,
    'researchPlan': intent.researchPlan,
    'refinedPrompt': intent.refinedPrompt,
    'createdAt': intent.createdAt.millisecondsSinceEpoch,
    'updatedAt': intent.updatedAt.millisecondsSinceEpoch,
  };

  PendingResearchIntentRecord _decodePendingResearchIntent(String raw) {
    final json = jsonDecode(raw) as Map<String, dynamic>;
    return PendingResearchIntentRecord(
      originalGoal: '${json['originalGoal'] ?? ''}',
      clarificationQuestions: [
        for (final value in json['clarificationQuestions'] as List? ?? const [])
          if (value is String) value,
      ],
      userAnswers: [
        for (final value in json['userAnswers'] as List? ?? const [])
          if (value is String) value,
      ],
      researchPlan: json['researchPlan'] as String?,
      refinedPrompt: json['refinedPrompt'] as String?,
      createdAt: _date((json['createdAt'] as num?)?.toInt() ?? 0),
      updatedAt: _date((json['updatedAt'] as num?)?.toInt() ?? 0),
    );
  }

  Map<String, Object?> _imageGenerationToJson(ImageGenerationRecord record) => {
    'status': record.status.name,
    'mode': record.mode,
    'prompt': record.prompt,
    'model': record.model,
    'options': {
      'model': record.options.model,
      'sizePreset': record.options.sizePreset,
      'quality': record.options.quality,
      'count': record.options.count,
      'partialImages': record.options.partialImages,
      'outputFormat': record.options.outputFormat,
    },
    'items': [
      for (final item in record.items)
        {
          'id': item.id,
          'status': item.status.name,
          'partialImageBase64': item.partialImageBase64,
          'outputFormat': item.outputFormat,
          'attachmentName': item.attachmentName,
          'error': item.error,
          'completedAt': item.completedAt?.millisecondsSinceEpoch,
        },
    ],
    'startedAt': record.startedAt.millisecondsSinceEpoch,
    'completedAt': record.completedAt?.millisecondsSinceEpoch,
    'error': record.error,
  };

  ImageGenerationRecord _decodeImageGeneration(String source) {
    final map = jsonDecode(source) as Map<String, dynamic>;
    final options = map['options'] as Map<String, dynamic>? ?? const {};
    return ImageGenerationRecord(
      status: ImageGenerationStatus.values.byName(
        '${map['status'] ?? 'failed'}',
      ),
      mode: '${map['mode'] ?? 'generate'}',
      prompt: '${map['prompt'] ?? ''}',
      model: '${map['model'] ?? 'gpt-image-2'}',
      options: ImageSettings(
        model: '${options['model'] ?? map['model'] ?? 'gpt-image-2'}',
        sizePreset: '${options['sizePreset'] ?? 'square'}',
        quality: '${options['quality'] ?? 'medium'}',
        count: (options['count'] as num?)?.toInt() ?? 1,
        partialImages: (options['partialImages'] as num?)?.toInt() ?? 0,
        outputFormat: '${options['outputFormat'] ?? 'png'}',
      ),
      items: [
        for (final item in map['items'] as List? ?? const [])
          if (item is Map<String, dynamic>)
            ImageGenerationItemRecord(
              id: '${item['id']}',
              status: ImageGenerationItemStatus.values.byName(
                '${item['status'] ?? 'failed'}',
              ),
              partialImageBase64: item['partialImageBase64'] as String?,
              outputFormat: item['outputFormat'] as String?,
              attachmentName: item['attachmentName'] as String?,
              error: item['error'] as String?,
              completedAt: item['completedAt'] == null
                  ? null
                  : DateTime.fromMillisecondsSinceEpoch(
                      (item['completedAt'] as num).toInt(),
                    ),
            ),
      ],
      startedAt: DateTime.fromMillisecondsSinceEpoch(
        (map['startedAt'] as num?)?.toInt() ?? 0,
      ),
      completedAt: map['completedAt'] == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(
              (map['completedAt'] as num).toInt(),
            ),
      error: map['error'] as String?,
    );
  }

  Map<String, Object?> _debateToJson(DebateRecord record) => {
    'status': record.status.name,
    'prompt': record.prompt,
    'agents': [
      for (final agent in record.agents)
        {
          'id': agent.id,
          'label': agent.label,
          'model': agent.model,
          'status': agent.status.name,
          'content': agent.content,
          'thought': agent.thought,
          'error': agent.error,
        },
    ],
    'startedAt': record.startedAt.millisecondsSinceEpoch,
    'completedAt': record.completedAt?.millisecondsSinceEpoch,
  };

  DebateRecord _decodeDebate(String source) {
    final map = jsonDecode(source) as Map<String, dynamic>;
    return DebateRecord(
      status: DebateAgentStatus.values.byName('${map['status'] ?? 'error'}'),
      prompt: '${map['prompt'] ?? ''}',
      agents: [
        for (final agent in map['agents'] as List? ?? const [])
          if (agent is Map<String, dynamic>)
            DebateAgentRecord(
              id: '${agent['id']}',
              label: '${agent['label']}',
              model: '${agent['model']}',
              status: DebateAgentStatus.values.byName(
                '${agent['status'] ?? 'error'}',
              ),
              content: '${agent['content'] ?? ''}',
              thought: agent['thought'] as String?,
              error: agent['error'] as String?,
            ),
      ],
      startedAt: DateTime.fromMillisecondsSinceEpoch(
        (map['startedAt'] as num?)?.toInt() ?? 0,
      ),
      completedAt: map['completedAt'] == null
          ? null
          : DateTime.fromMillisecondsSinceEpoch(
              (map['completedAt'] as num).toInt(),
            ),
    );
  }

  ArtifactReferenceRecord _decodeArtifact(String raw) {
    final json = (jsonDecode(raw) as Map).cast<String, Object?>();
    return ArtifactReferenceRecord(
      artifactId: json['artifactId'] as String? ?? '',
      title: json['title'] as String? ?? 'Artifact',
      kind: artifactKindFromStorage(json['kind'] as String?),
      status: artifactStatusFromStorage(json['status'] as String?),
    );
  }

  ArtifactRecord _artifactRecordFromRow(ArtifactRow row) => ArtifactRecord(
    id: row.id,
    chatId: row.chatId,
    messageId: row.messageId,
    kind: artifactKindFromStorage(row.kind),
    title: row.title,
    language: row.language,
    content: row.content,
    status: artifactStatusFromStorage(row.status),
    createdAt: _date(row.createdAt),
    updatedAt: _date(row.updatedAt),
  );

  ArtifactRowsCompanion _artifactRecordToCompanion(ArtifactRecord artifact) =>
      ArtifactRowsCompanion.insert(
        id: artifact.id,
        chatId: artifact.chatId,
        messageId: Value(artifact.messageId),
        kind: artifact.kind.storageValue,
        title: artifact.title,
        language: Value(artifact.language),
        content: artifact.content,
        status: artifact.status.storageValue,
        createdAt: _millis(artifact.createdAt),
        updatedAt: _millis(artifact.updatedAt),
      );

  List<String> _decodeStringList(String raw) {
    final decoded = jsonDecode(raw);
    if (decoded is! List) return const [];
    return decoded.whereType<String>().toList();
  }

  int _millis(DateTime date) => date.millisecondsSinceEpoch;
  DateTime _date(int millis) => DateTime.fromMillisecondsSinceEpoch(millis);
  DateTime? _nullableDate(Object? value) =>
      value is num ? DateTime.fromMillisecondsSinceEpoch(value.toInt()) : null;
}
