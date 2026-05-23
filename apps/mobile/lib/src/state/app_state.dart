import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../data/local/privora_local_repository.dart';
import '../features/chat/data/chat_generation_client.dart';
import '../features/chat/data/image_generation_client.dart';
import '../features/chat/data/research_client.dart';
import '../models/privora_models.dart';

const _unset = Object();

class PrivoraState {
  const PrivoraState({
    required this.settings,
    required this.chats,
    required this.artifacts,
    required this.webDevProjects,
    required this.webDevThreads,
    required this.characters,
    required this.characterSessions,
    this.currentChatId,
    this.currentCharacterSessionId,
    this.isGenerating = false,
  });

  final UiSettings settings;
  final List<ChatRecord> chats;
  final List<ArtifactRecord> artifacts;
  final List<WebDevProjectRecord> webDevProjects;
  final List<WebDevThreadRecord> webDevThreads;
  final List<CharacterRecord> characters;
  final List<CharacterSessionRecord> characterSessions;
  final String? currentChatId;
  final String? currentCharacterSessionId;
  final bool isGenerating;

  ChatRecord? get currentChat =>
      chats.where((chat) => chat.id == currentChatId).firstOrNull ??
      chats.firstOrNull;

  List<ChatRecord> get visibleChats {
    final characterChatIds = characterSessions
        .map((session) => session.id)
        .toSet();
    return chats.where((chat) => !characterChatIds.contains(chat.id)).toList();
  }

  CharacterSessionRecord? get currentCharacterSession => characterSessions
      .where((session) => session.id == currentCharacterSessionId)
      .firstOrNull;

  CharacterRecord? get currentCharacter {
    final session = currentCharacterSession;
    if (session == null) return null;
    return characters
        .where((character) => character.id == session.characterId)
        .firstOrNull;
  }

  PrivoraState copyWith({
    UiSettings? settings,
    List<ChatRecord>? chats,
    List<ArtifactRecord>? artifacts,
    List<WebDevProjectRecord>? webDevProjects,
    List<WebDevThreadRecord>? webDevThreads,
    List<CharacterRecord>? characters,
    List<CharacterSessionRecord>? characterSessions,
    Object? currentChatId = _unset,
    Object? currentCharacterSessionId = _unset,
    bool? isGenerating,
  }) => PrivoraState(
    settings: settings ?? this.settings,
    chats: chats ?? this.chats,
    artifacts: artifacts ?? this.artifacts,
    webDevProjects: webDevProjects ?? this.webDevProjects,
    webDevThreads: webDevThreads ?? this.webDevThreads,
    characters: characters ?? this.characters,
    characterSessions: characterSessions ?? this.characterSessions,
    currentChatId: currentChatId == _unset
        ? this.currentChatId
        : currentChatId as String?,
    currentCharacterSessionId: currentCharacterSessionId == _unset
        ? this.currentCharacterSessionId
        : currentCharacterSessionId as String?,
    isGenerating: isGenerating ?? this.isGenerating,
  );
}

final appControllerProvider =
    AsyncNotifierProvider<AppController, PrivoraState>(AppController.new);

class AppController extends AsyncNotifier<PrivoraState> {
  final _uuid = const Uuid();
  late final PrivoraLocalRepository _repository;
  late final ChatGenerationClient _generationClient;
  late final ImageGenerationClient _imageGenerationClient;
  late final ResearchClient _researchClient;
  final Map<String, DateTime> _lastArtifactPersistAt = {};
  bool _stopRequested = false;

  @override
  Future<PrivoraState> build() async {
    _repository = ref.watch(privoraLocalRepositoryProvider);
    _generationClient = ref.watch(chatGenerationClientProvider);
    _imageGenerationClient = ref.watch(imageGenerationClientProvider);
    _researchClient = ref.watch(researchClientProvider);
    final now = DateTime.now();
    final seededProjects = <WebDevProjectRecord>[];
    final seededCharacters = _seedCharacters(now);
    final seededSessions = _seedCharacterSessions(now);
    await _repository.ensureSeedData(
      projects: seededProjects,
      threads: const [],
      characters: seededCharacters,
      sessions: seededSessions,
    );

    final snapshot = await _repository.loadSnapshot();
    final chats = snapshot.chats.isEmpty
        ? [
            ChatRecord(
              id: _id('chat'),
              title: 'New Conversation',
              messages: const [],
              createdAt: now,
              updatedAt: now,
            ),
          ]
        : snapshot.chats;
    if (snapshot.chats.isEmpty) {
      await _repository.upsertChat(chats.first);
    }

    final characters = snapshot.characters.isEmpty
        ? seededCharacters
        : snapshot.characters;
    final characterSessions = snapshot.characterSessions.isEmpty
        ? seededSessions
        : snapshot.characterSessions;
    final characterChatIds = characterSessions
        .map((session) => session.id)
        .toSet();
    return PrivoraState(
      settings: snapshot.settings,
      chats: chats,
      artifacts: snapshot.artifacts,
      webDevProjects: snapshot.webDevProjects,
      webDevThreads: snapshot.webDevThreads,
      characters: characters,
      characterSessions: characterSessions,
      currentChatId:
          chats
              .where((chat) => !characterChatIds.contains(chat.id))
              .firstOrNull
              ?.id ??
          chats.first.id,
    );
  }

  List<CharacterRecord> _seedCharacters(DateTime now) => [
    CharacterRecord(
      id: 'char_mentor',
      name: 'Mentor',
      avatar: 'M',
      color: 0xFF292524,
      tagline: 'Practical senior guidance',
      category: 'Mentors',
      greeting: 'What are we improving today?',
      personality: 'Practical, direct, and senior.',
      speakingStyle: 'Concise guidance with clear tradeoffs.',
      boundaries: 'Avoids pretending uncertain details are facts.',
      exampleDialogue: 'User: Ship it? Mentor: First, verify the failure mode.',
      createdAt: now,
      updatedAt: now,
    ),
    CharacterRecord(
      id: 'char_builder',
      name: 'SaaS Builder',
      avatar: 'SB',
      color: 0xFF4B5563,
      tagline: 'Production-ready product thinking',
      category: 'Mentors',
      greeting:
          'Tell me the feature, constraints, and risk level. I will help ship it cleanly.',
      personality: 'Pragmatic, security-aware, and product-minded.',
      speakingStyle: 'Direct checklists, tradeoffs, and implementation steps.',
      boundaries:
          'Does not hand-wave security, privacy, billing, or reliability risks.',
      exampleDialogue:
          'User: Is this ready? SaaS Builder: Not until auth, rollback, logging, and abuse paths are checked.',
      createdAt: now,
      updatedAt: now,
    ),
    CharacterRecord(
      id: 'char_creative',
      name: 'Creative Partner',
      avatar: 'CP',
      color: 0xFF6B5F4D,
      tagline: 'Ideas, drafts, and polish',
      category: 'Creative Partners',
      greeting: 'Bring me the rough shape.',
      personality: 'Inventive, constructive, and grounded.',
      speakingStyle: 'Warm but precise.',
      boundaries: 'Keeps ideation useful and user-directed.',
      exampleDialogue:
          'User: This feels flat. Creative Partner: Let us sharpen the contrast.',
      createdAt: now,
      updatedAt: now,
    ),
    CharacterRecord(
      id: 'char_researcher',
      name: 'Research Analyst',
      avatar: 'RA',
      color: 0xFF57534E,
      tagline: 'Evidence, sources, and synthesis',
      category: 'Research',
      greeting: 'What question should we validate with evidence?',
      personality: 'Skeptical, precise, and source-driven.',
      speakingStyle: 'Structured synthesis with caveats and confidence levels.',
      boundaries:
          'Separates facts from assumptions and calls out stale information.',
      exampleDialogue:
          'User: Which market is best? Research Analyst: First define region, buyer, and time horizon.',
      createdAt: now,
      updatedAt: now,
    ),
    CharacterRecord(
      id: 'char_story',
      name: 'Story Architect',
      avatar: 'SA',
      color: 0xFF7C3AED,
      tagline: 'Worlds, plots, and character arcs',
      category: 'Creative Partners',
      greeting:
          'Give me the premise and the emotion you want the scene to land.',
      personality: 'Imaginative, tasteful, and continuity-focused.',
      speakingStyle: 'Vivid options with practical writing craft notes.',
      boundaries: 'Keeps tone, canon, and user constraints intact.',
      exampleDialogue:
          'User: My opening drags. Story Architect: Start at the irreversible choice.',
      createdAt: now,
      updatedAt: now,
    ),
    CharacterRecord(
      id: 'char_wellness',
      name: 'Wellness Coach',
      avatar: 'WC',
      color: 0xFF047857,
      tagline: 'Gentle routines and reflection',
      category: 'Wellness',
      greeting: 'What would make today feel a little more manageable?',
      personality: 'Calm, practical, and non-judgmental.',
      speakingStyle: 'Small steps, reflective questions, and grounded support.',
      boundaries:
          'Does not provide medical diagnosis or emergency intervention advice.',
      exampleDialogue:
          'User: I feel stuck. Wellness Coach: Let us make the next five minutes easier first.',
      createdAt: now,
      updatedAt: now,
    ),
  ];

  List<CharacterSessionRecord> _seedCharacterSessions(DateTime now) => [
    CharacterSessionRecord(
      id: _id('session'),
      characterId: 'char_mentor',
      title: 'Product strategy',
      createdAt: now,
      updatedAt: now,
    ),
  ];

  void setMode(WorkspaceMode mode) {
    final current = state.value;
    if (current == null) return;
    final normalized = mode == WorkspaceMode.webDev ? WorkspaceMode.chat : mode;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(workspaceMode: normalized),
      ),
    );
    _persistSettings();
  }

  void openCharactersHome() {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(
          workspaceMode: WorkspaceMode.characters,
        ),
        currentCharacterSessionId: null,
        currentChatId: current.visibleChats.firstOrNull?.id,
      ),
    );
    _persistSettings();
  }

  void toggleDarkMode() {
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(
          isDarkMode: !current.settings.isDarkMode,
        ),
      ),
    );
    _persistSettings();
  }

  void toggleThinking() {
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(
          isThinkingEnabled: !current.settings.isThinkingEnabled,
        ),
      ),
    );
    _persistSettings();
  }

  void toggleWebSearch() {
    final current = state.requireValue;
    final next = !current.settings.isWebSearchEnabled;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(
          isWebSearchEnabled: next,
          isDeepResearchEnabled: next
              ? current.settings.isDeepResearchEnabled
              : false,
        ),
      ),
    );
    _persistSettings();
  }

  void toggleDeepResearch() {
    final current = state.requireValue;
    final next = !current.settings.isDeepResearchEnabled;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(
          isDeepResearchEnabled: next,
          isWebSearchEnabled: next || current.settings.isWebSearchEnabled,
          isDebateModeEnabled: next
              ? false
              : current.settings.isDebateModeEnabled,
        ),
      ),
    );
    _persistSettings();
  }

  void toggleDebate() {
    final current = state.requireValue;
    final next = !current.settings.isDebateModeEnabled;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(
          isDebateModeEnabled: next,
          isDeepResearchEnabled: false,
        ),
      ),
    );
    _persistSettings();
  }

  void setComposerMode(ComposerMode mode) {
    final current = state.requireValue;
    final imageMode = mode == ComposerMode.image;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(
          composerMode: mode,
          isWebSearchEnabled: imageMode
              ? false
              : current.settings.isWebSearchEnabled,
          isDeepResearchEnabled: imageMode
              ? false
              : current.settings.isDeepResearchEnabled,
          isDebateModeEnabled: imageMode
              ? false
              : current.settings.isDebateModeEnabled,
        ),
      ),
    );
    _persistSettings();
  }

  void selectModel(String modelId) {
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(selectedModel: modelId),
      ),
    );
    _persistSettings();
  }

  void selectStyle(String styleId) {
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(selectedStyle: styleId),
      ),
    );
    _persistSettings();
  }

  void updateImageSettings(ImageSettings settings) {
    final current = state.requireValue;
    final count = effectiveImageCount(settings);
    final normalized = settings.copyWith(count: count, partialImages: 0);
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(imageSettings: normalized),
      ),
    );
    _persistSettings();
  }

  void updateDebateSettings(DebateSettings settings) {
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(
        settings: current.settings.copyWith(debateSettings: settings),
      ),
    );
    _persistSettings();
  }

  void newChat() {
    final current = state.requireValue;
    final now = DateTime.now();
    final chat = ChatRecord(
      id: _id('chat'),
      title: 'New Conversation',
      messages: const [],
      createdAt: now,
      updatedAt: now,
    );
    state = AsyncData(
      current.copyWith(
        chats: [chat, ...current.chats],
        currentChatId: chat.id,
        currentCharacterSessionId: null,
        settings: current.settings.copyWith(workspaceMode: WorkspaceMode.chat),
      ),
    );
    _persistChat(chat);
  }

  Future<String?> createCharacterSession(String characterId) async {
    final current = state.requireValue;
    final character = current.characters
        .where((item) => item.id == characterId)
        .firstOrNull;
    if (character == null) return null;
    final now = DateTime.now();
    final session = CharacterSessionRecord(
      id: _id('char_session'),
      characterId: character.id,
      title: character.name,
      model: current.settings.selectedModel,
      createdAt: now,
      updatedAt: now,
    );
    final chat = _chatForCharacterSession(session, character, now);
    state = AsyncData(
      current.copyWith(
        chats: [chat, ...current.chats],
        characterSessions: [session, ...current.characterSessions],
        currentChatId: chat.id,
        currentCharacterSessionId: session.id,
        settings: current.settings.copyWith(
          workspaceMode: WorkspaceMode.characters,
        ),
      ),
    );
    await Future.wait([
      _repository.upsertCharacterSession(session),
      _repository.upsertChat(chat),
      _repository.saveSettings(state.requireValue.settings),
    ]);
    return session.id;
  }

  Future<void> selectCharacterSession(String sessionId) async {
    final current = state.requireValue;
    final session = current.characterSessions
        .where((item) => item.id == sessionId)
        .firstOrNull;
    if (session == null) {
      openCharactersHome();
      return;
    }
    final existingChat = current.chats
        .where((chat) => chat.id == session.id)
        .firstOrNull;
    final character = current.characters
        .where((item) => item.id == session.characterId)
        .firstOrNull;
    final chat =
        existingChat ??
        (character == null
            ? ChatRecord(
                id: session.id,
                title: session.title,
                messages: const [],
                createdAt: DateTime.now(),
                updatedAt: DateTime.now(),
                model: session.model,
              )
            : _chatForCharacterSession(session, character, DateTime.now()));
    state = AsyncData(
      current.copyWith(
        chats: existingChat == null ? [chat, ...current.chats] : current.chats,
        currentChatId: chat.id,
        currentCharacterSessionId: session.id,
        settings: current.settings.copyWith(
          workspaceMode: WorkspaceMode.characters,
        ),
      ),
    );
    if (existingChat == null) await _repository.upsertChat(chat);
    _persistSettings();
  }

  Future<void> deleteCharacterSession(String sessionId) async {
    final current = state.requireValue;
    final remainingSessions = current.characterSessions
        .where((session) => session.id != sessionId)
        .toList();
    final remainingChats = current.chats
        .where((chat) => chat.id != sessionId)
        .toList();
    final nextVisibleChatId = remainingChats
        .where(
          (chat) => !remainingSessions.any((session) => session.id == chat.id),
        )
        .firstOrNull
        ?.id;
    state = AsyncData(
      current.copyWith(
        characterSessions: remainingSessions,
        chats: remainingChats,
        currentCharacterSessionId:
            current.currentCharacterSessionId == sessionId
            ? null
            : current.currentCharacterSessionId,
        currentChatId: current.currentChatId == sessionId
            ? nextVisibleChatId
            : current.currentChatId,
      ),
    );
    await Future.wait([
      _repository.deleteCharacterSession(sessionId),
      _repository.deleteChat(sessionId),
    ]);
  }

  void selectChat(String chatId) {
    final current = state.requireValue;
    state = AsyncData(
      current.copyWith(
        currentChatId: chatId,
        currentCharacterSessionId: null,
        settings: current.settings.copyWith(workspaceMode: WorkspaceMode.chat),
      ),
    );
    _persistSettings();
  }

  void toggleStarChat(String chatId) {
    final current = state.requireValue;
    final updatedChats = [
      for (final chat in current.chats)
        if (chat.id == chatId)
          chat.copyWith(isStarred: !chat.isStarred, updatedAt: DateTime.now())
        else
          chat,
    ];
    state = AsyncData(current.copyWith(chats: updatedChats));
    final chat = updatedChats.where((item) => item.id == chatId).firstOrNull;
    if (chat != null) _persistChat(chat);
  }

  void renameChat(String chatId, String title) {
    final normalized = title.trim();
    if (normalized.isEmpty) return;
    final current = state.requireValue;
    final updatedChats = [
      for (final chat in current.chats)
        if (chat.id == chatId)
          chat.copyWith(title: normalized, updatedAt: DateTime.now())
        else
          chat,
    ];
    state = AsyncData(current.copyWith(chats: updatedChats));
    final chat = updatedChats.where((item) => item.id == chatId).firstOrNull;
    if (chat != null) _persistChat(chat);
  }

  void deleteChat(String chatId) {
    final current = state.requireValue;
    final remaining = current.chats.where((chat) => chat.id != chatId).toList();
    state = AsyncData(
      current.copyWith(
        chats: remaining,
        currentChatId: remaining
            .where(
              (chat) => !current.characterSessions.any(
                (session) => session.id == chat.id,
              ),
            )
            .firstOrNull
            ?.id,
      ),
    );
    _repository.deleteChat(chatId);
  }

  Future<void> sendMessage(
    String content, {
    List<AttachmentRecord> attachments = const [],
  }) async {
    final current = state.requireValue;
    final chat = current.currentChat;
    if (chat == null ||
        current.isGenerating ||
        (content.trim().isEmpty && attachments.isEmpty)) {
      return;
    }
    if (current.settings.composerMode == ComposerMode.image) {
      await _sendImageMessage(content.trim(), attachments);
      return;
    }
    if (current.settings.isDeepResearchEnabled) {
      await _sendResearchRequest(content.trim(), attachments);
      return;
    }
    if (current.settings.isDebateModeEnabled &&
        !current.settings.isDeepResearchEnabled) {
      await _sendDebateMessage(content.trim(), attachments);
      return;
    }
    final now = DateTime.now();
    final userMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'user',
      content: content.trim(),
      attachments: attachments,
      createdAt: now,
    );
    final modelMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'model',
      content: '',
      isThinking: current.settings.isThinkingEnabled,
      webSearchStatus: current.settings.isWebSearchEnabled ? 'searching' : null,
      createdAt: now.add(const Duration(milliseconds: 1)),
    );
    final updated = chat.copyWith(
      title: chat.messages.isEmpty ? _titleFrom(content) : chat.title,
      messages: [...chat.messages, userMessage, modelMessage],
      updatedAt: now,
      model: current.settings.selectedModel,
    );
    state = AsyncData(
      current.copyWith(
        chats: [updated, ...current.chats.where((item) => item.id != chat.id)],
        isGenerating: true,
      ),
    );
    await _repository.upsertChat(updated);
    _stopRequested = false;

    try {
      await for (final event in _generationClient.stream(
        ChatGenerationRequest(
          model: current.settings.selectedModel,
          styleId: current.settings.selectedStyle,
          history: [...chat.messages, userMessage],
          thinkingEnabled: current.settings.isThinkingEnabled,
          webSearchEnabled: true,
          webSearchForced: current.settings.isWebSearchEnabled,
          deepResearchEnabled: current.settings.isDeepResearchEnabled,
          artifactToolsEnabled: true,
          instructionSuffix: _characterInstruction(),
        ),
      )) {
        final active = state.value;
        if (active == null || _stopRequested) break;
        final activeChat = active.chats
            .where((item) => item.id == chat.id)
            .firstOrNull;
        if (activeChat == null) break;
        final nextMessages = [
          for (final message in activeChat.messages)
            if (message.id == modelMessage.id)
              switch (event.type) {
                ChatStreamEventType.text => message.copyWith(
                  content: message.content + event.text,
                ),
                ChatStreamEventType.thought => message.copyWith(
                  thought: (message.thought ?? '') + event.text,
                  isThinking: true,
                ),
                ChatStreamEventType.webSearch => message.copyWith(
                  webSearchStatus: event.status,
                  webSearchQueries: [
                    ...message.webSearchQueries,
                    ...event.queries.where(
                      (query) => !message.webSearchQueries.contains(query),
                    ),
                  ],
                ),
                ChatStreamEventType.artifact => _messageWithArtifact(
                  activeChat,
                  message,
                  event.artifact!,
                ),
              }
            else
              message,
        ];
        _replaceChat(
          activeChat.copyWith(
            messages: nextMessages,
            updatedAt: DateTime.now(),
          ),
        );
      }
    } catch (error) {
      if (!_stopRequested) {
        final activeChat = state.value?.chats
            .where((item) => item.id == chat.id)
            .firstOrNull;
        if (activeChat != null) {
          _replaceChat(
            activeChat.copyWith(
              messages: [
                for (final message in activeChat.messages)
                  if (message.id == modelMessage.id)
                    message.copyWith(
                      content: message.content.isEmpty
                          ? 'Could not generate a response. $error'
                          : '${message.content}\n\nGeneration interrupted: $error',
                      isThinking: false,
                    )
                  else
                    message,
              ],
            ),
          );
        }
      }
    } finally {
      final finalState = state.value;
      final finalChat = finalState?.chats
          .where((item) => item.id == chat.id)
          .firstOrNull;
      if (finalState != null && finalChat != null) {
        final artifactIdsInTurn = {
          ...finalChat.messages
              .where((message) => message.id == modelMessage.id)
              .map((message) => message.artifact?.artifactId)
              .whereType<String>(),
          ...finalState.artifacts
              .where((artifact) => artifact.messageId == modelMessage.id)
              .map((artifact) => artifact.id),
        };
        final finalizedArtifacts = [
          for (final artifact in finalState.artifacts)
            if (artifactIdsInTurn.contains(artifact.id) &&
                artifact.status == ArtifactStatus.streaming)
              ArtifactRecord(
                id: artifact.id,
                chatId: artifact.chatId,
                messageId: artifact.messageId,
                kind: artifact.kind,
                title: artifact.title,
                language: artifact.language,
                content: artifact.content,
                status: ArtifactStatus.ready,
                createdAt: artifact.createdAt,
                updatedAt: DateTime.now(),
              )
            else
              artifact,
        ];
        for (final artifact in finalizedArtifacts.where(
          (artifact) => artifactIdsInTurn.contains(artifact.id),
        )) {
          await _repository.upsertArtifact(artifact);
        }
        final completed = finalChat.copyWith(
          messages: [
            for (final message in finalChat.messages)
              if (message.id == modelMessage.id)
                _finalizeArtifactMessage(message).copyWith(isThinking: false)
              else
                message,
          ],
          updatedAt: DateTime.now(),
        );
        state = AsyncData(
          finalState.copyWith(
            chats: [
              completed,
              ...finalState.chats.where((item) => item.id != completed.id),
            ],
            artifacts: finalizedArtifacts,
            isGenerating: false,
          ),
        );
        await _repository.upsertChat(completed);
      }
    }
  }

  void stopGeneration() {
    final current = state.value;
    if (current == null || !current.isGenerating) return;
    _stopRequested = true;
    _generationClient.stop();
    _imageGenerationClient.stop();
    _researchClient.stop();
    final chat = current.currentChat;
    if (chat == null) {
      state = AsyncData(current.copyWith(isGenerating: false));
      return;
    }
    final stopped = chat.copyWith(
      messages: [
        for (final message in chat.messages)
          if (message.researchPlan?.status == ResearchPlanStatus.running)
            message.copyWith(
              isThinking: false,
              researchStatus: ResearchStatus.stopped,
              researchCompletedAt: DateTime.now(),
              researchPlan: message.researchPlan!.copyWith(
                status: ResearchPlanStatus.cancelled,
                currentActivity: 'Stopped',
                updatedAt: DateTime.now(),
              ),
            )
          else if (message.imageGeneration?.status ==
              ImageGenerationStatus.generating)
            message.copyWith(
              imageGeneration: message.imageGeneration!.copyWith(
                status: ImageGenerationStatus.stopped,
                completedAt: DateTime.now(),
                items: [
                  for (final item in message.imageGeneration!.items)
                    if (item.status == ImageGenerationItemStatus.generating)
                      item.copyWith(status: ImageGenerationItemStatus.stopped)
                    else
                      item,
                ],
              ),
            )
          else if (message.debate?.status == DebateAgentStatus.streaming)
            message.copyWith(
              isThinking: false,
              debate: message.debate!.copyWith(
                status: DebateAgentStatus.stopped,
                completedAt: DateTime.now(),
                agents: [
                  for (final agent in message.debate!.agents)
                    if (agent.status == DebateAgentStatus.streaming ||
                        agent.status == DebateAgentStatus.queued)
                      agent.copyWith(status: DebateAgentStatus.stopped)
                    else
                      agent,
                ],
              ),
            )
          else if (message.role == 'model' && message.isThinking == true)
            message.copyWith(isThinking: false)
          else
            message,
      ],
      updatedAt: DateTime.now(),
    );
    final activeResearchJob = chat.messages
        .where(
          (message) =>
              message.researchPlan?.status == ResearchPlanStatus.running,
        )
        .map((message) => message.researchJobId)
        .whereType<String>()
        .firstOrNull;
    if (activeResearchJob != null) {
      unawaited(_researchClient.cancelJob(activeResearchJob));
    }
    state = AsyncData(
      current.copyWith(
        chats: [
          stopped,
          ...current.chats.where((item) => item.id != stopped.id),
        ],
        isGenerating: false,
      ),
    );
    _persistChat(stopped);
  }

  Future<void> _sendResearchRequest(
    String prompt,
    List<AttachmentRecord> attachments,
  ) async {
    final current = state.requireValue;
    final chat = current.currentChat;
    if (chat == null || prompt.isEmpty) return;
    final now = DateTime.now();
    final userMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'user',
      content: prompt,
      attachments: attachments,
      createdAt: now,
    );
    final modelMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'model',
      content: '',
      isThinking: true,
      createdAt: now.add(const Duration(milliseconds: 1)),
    );
    final history = [...chat.messages, userMessage];
    final updated = chat.copyWith(
      title: chat.messages.isEmpty ? _titleFrom(prompt) : chat.title,
      messages: [...history, modelMessage],
      updatedAt: now,
      model: current.settings.selectedModel,
    );
    state = AsyncData(
      current.copyWith(
        chats: [updated, ...current.chats.where((item) => item.id != chat.id)],
        isGenerating: true,
      ),
    );
    await _repository.upsertChat(updated);
    _stopRequested = false;

    try {
      final result = await _researchClient.preflight(
        model: current.settings.selectedModel,
        provider: modelOptionFor(current.settings.selectedModel).provider,
        styleId: current.settings.selectedStyle,
        history: history,
        pendingIntent: chat.pendingResearchIntent,
      );
      if (_stopRequested) return;
      final activeChat = state.value?.chats
          .where((item) => item.id == chat.id)
          .firstOrNull;
      if (activeChat == null) return;
      final timestamp = DateTime.now();
      if (result.decision == 'ready') {
        final stepText = result.steps.isEmpty
            ? const [
                'Collect authoritative sources.',
                'Compare the strongest available evidence.',
                'Check contradictions and stale information.',
                'Synthesize a cited answer.',
              ]
            : result.steps;
        final plan = ResearchPlanRecord(
          title: result.title ?? 'Deep Research',
          refinedPrompt: result.refinedPrompt ?? prompt,
          steps: [
            for (final step in stepText)
              ResearchPlanStepRecord(
                text: step,
                status: ResearchPlanStepStatus.pending,
              ),
          ],
          status: ResearchPlanStatus.draft,
          currentActivity: 'Ready to start',
          createdAt: timestamp,
          updatedAt: timestamp,
        );
        _replaceResearchMessage(
          activeChat.copyWith(pendingResearchIntent: null),
          modelMessage.id,
          (message) => message.copyWith(
            isThinking: false,
            researchPlan: plan,
            researchTimeBudgetMs: deepResearchTimeBudgetMs,
            researchActivity: [
              ResearchActivityRecord(
                phase: 'planning',
                title: 'Created research plan',
                detail: '${plan.steps.length} steps ready to review.',
                timestamp: timestamp,
              ),
            ],
          ),
        );
      } else if (result.decision == 'clarify') {
        final existing = chat.pendingResearchIntent;
        final questions = result.questions;
        final text = _formatPreflightClarification(
          result.assistantMessage,
          questions,
        );
        final intent = PendingResearchIntentRecord(
          originalGoal: existing?.originalGoal ?? prompt,
          clarificationQuestions: questions,
          userAnswers: existing == null
              ? const []
              : [...existing.userAnswers, prompt],
          researchPlan: result.steps.isEmpty ? null : result.steps.join('\n'),
          refinedPrompt: result.refinedPrompt,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        );
        _replaceResearchMessage(
          activeChat.copyWith(pendingResearchIntent: intent),
          modelMessage.id,
          (message) => message.copyWith(
            content: text,
            isThinking: false,
            isResearchClarification: true,
          ),
        );
      } else {
        _replaceResearchMessage(
          activeChat.copyWith(pendingResearchIntent: null),
          modelMessage.id,
          (message) => message.copyWith(
            content: _formatPreflightClarification(
              result.assistantMessage,
              result.questions,
            ),
            isThinking: false,
          ),
        );
      }
    } catch (error) {
      if (!_stopRequested) {
        final activeChat = state.value?.chats
            .where((item) => item.id == chat.id)
            .firstOrNull;
        if (activeChat != null) {
          _replaceResearchMessage(
            activeChat,
            modelMessage.id,
            (message) => message.copyWith(
              content: 'Deep Research could not prepare a plan. $error',
              isThinking: false,
              researchStatus: ResearchStatus.failed,
            ),
          );
        }
      }
    } finally {
      final active = state.value;
      if (active != null) {
        state = AsyncData(active.copyWith(isGenerating: false));
        final finalChat = active.chats
            .where((item) => item.id == chat.id)
            .firstOrNull;
        if (finalChat != null) await _repository.upsertChat(finalChat);
      }
    }
  }

  Future<void> startResearchPlan(String messageId) async {
    final current = state.requireValue;
    final chat = current.currentChat;
    if (current.isGenerating || chat == null) return;
    final messageIndex = chat.messages.indexWhere(
      (message) => message.id == messageId,
    );
    if (messageIndex < 0) return;
    final target = chat.messages[messageIndex];
    final plan = target.researchPlan;
    if (plan == null ||
        (plan.status != ResearchPlanStatus.draft &&
            plan.status != ResearchPlanStatus.editing)) {
      return;
    }
    final timestamp = DateTime.now();
    final runningPlan = plan.copyWith(
      status: ResearchPlanStatus.running,
      steps: [
        for (var index = 0; index < plan.steps.length; index++)
          plan.steps[index].copyWith(
            status: index == 0
                ? ResearchPlanStepStatus.active
                : ResearchPlanStepStatus.pending,
          ),
      ],
      progress: 0,
      currentActivity: 'Starting research',
      updatedAt: timestamp,
    );
    _replaceResearchMessage(
      chat,
      messageId,
      (message) => message.copyWith(
        isThinking: false,
        researchStatus: ResearchStatus.queued,
        researchPlan: runningPlan,
        researchStartedAt: timestamp,
        researchTimeBudgetMs: deepResearchTimeBudgetMs,
      ),
    );
    state = AsyncData(state.requireValue.copyWith(isGenerating: true));
    _stopRequested = false;
    try {
      final jobId = await _researchClient.startJob(
        model: current.settings.selectedModel,
        provider: modelOptionFor(current.settings.selectedModel).provider,
        styleId: current.settings.selectedStyle,
        history: _readyResearchHistory(
          chat.messages.take(messageIndex).toList(),
          runningPlan,
        ),
        plan: runningPlan,
      );
      var activeChat = state.requireValue.currentChat;
      if (activeChat == null || _stopRequested) return;
      _replaceResearchMessage(
        activeChat,
        messageId,
        (message) => message.copyWith(researchJobId: jobId),
      );
      await for (final event in _researchClient.streamJob(jobId)) {
        if (_stopRequested) break;
        activeChat = state.value?.currentChat;
        if (activeChat == null) break;
        _applyResearchEvent(activeChat, messageId, event);
      }
    } catch (error) {
      if (!_stopRequested) {
        final activeChat = state.value?.currentChat;
        if (activeChat != null) {
          _replaceResearchMessage(
            activeChat,
            messageId,
            (message) => message.copyWith(
              researchStatus: ResearchStatus.failed,
              content: message.content.isEmpty
                  ? 'Deep Research failed. $error'
                  : message.content,
              researchPlan: message.researchPlan?.copyWith(
                status: ResearchPlanStatus.cancelled,
                currentActivity: 'Failed',
                updatedAt: DateTime.now(),
              ),
              researchCompletedAt: DateTime.now(),
            ),
          );
        }
      }
    } finally {
      final active = state.value;
      if (active != null) {
        state = AsyncData(active.copyWith(isGenerating: false));
        final finalChat = active.currentChat;
        if (finalChat != null) await _repository.upsertChat(finalChat);
      }
    }
  }

  void cancelResearchPlan(String messageId) {
    final chat = state.value?.currentChat;
    if (chat == null) return;
    _replaceResearchMessage(
      chat,
      messageId,
      (message) => message.copyWith(
        researchStatus: ResearchStatus.stopped,
        researchPlan: message.researchPlan?.copyWith(
          status: ResearchPlanStatus.cancelled,
          currentActivity: 'Cancelled',
          updatedAt: DateTime.now(),
        ),
        researchCompletedAt: DateTime.now(),
      ),
    );
  }

  void updateResearchPlan(String messageId, ResearchPlanRecord plan) {
    unawaited(_updateResearchPlanWithAi(messageId, plan));
  }

  Future<void> _updateResearchPlanWithAi(
    String messageId,
    ResearchPlanRecord editedPlan,
  ) async {
    final current = state.value;
    final chat = current?.currentChat;
    if (current == null || chat == null || current.isGenerating) return;
    final messageIndex = chat.messages.indexWhere(
      (message) => message.id == messageId,
    );
    if (messageIndex < 0) return;
    final originalMessage = chat.messages[messageIndex];
    final originalPlan = originalMessage.researchPlan;
    if (originalPlan == null ||
        originalPlan.status == ResearchPlanStatus.running ||
        originalPlan.status == ResearchPlanStatus.completed) {
      return;
    }
    final now = DateTime.now();
    final adjustment = [
      'Revise the Deep Research plan with these user edits.',
      'Edited title: ${editedPlan.title}',
      'Edited research goal: ${editedPlan.refinedPrompt}',
      'Edited steps:',
      for (var index = 0; index < editedPlan.steps.length; index++)
        '${index + 1}. ${editedPlan.steps[index].text}',
    ].join('\n');
    final userMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'user',
      content: adjustment,
      createdAt: now,
    );
    final modelMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'model',
      content: 'Updating the research plan...',
      isThinking: true,
      createdAt: now.add(const Duration(milliseconds: 1)),
    );
    final supersededPlan = originalPlan.copyWith(
      status: ResearchPlanStatus.superseded,
      currentActivity: 'Superseded by edited plan',
      updatedAt: now,
    );
    final updatedMessages = [
      for (final message in chat.messages)
        if (message.id == messageId)
          message.copyWith(researchPlan: supersededPlan)
        else
          message,
      userMessage,
      modelMessage,
    ];
    final updatedChat = chat.copyWith(
      messages: updatedMessages,
      updatedAt: now,
    );
    _replaceChat(updatedChat);
    state = AsyncData(state.requireValue.copyWith(isGenerating: true));
    await _repository.upsertChat(updatedChat);

    try {
      final result = await _researchClient.preflight(
        model: current.settings.selectedModel,
        provider: modelOptionFor(current.settings.selectedModel).provider,
        styleId: current.settings.selectedStyle,
        history: [...chat.messages.take(messageIndex), userMessage],
        pendingIntent: PendingResearchIntentRecord(
          originalGoal: originalPlan.refinedPrompt,
          clarificationQuestions: const [],
          userAnswers: [adjustment],
          researchPlan: originalPlan.steps.map((step) => step.text).join('\n'),
          refinedPrompt: originalPlan.refinedPrompt,
          createdAt: originalPlan.createdAt,
          updatedAt: now,
        ),
      );
      final activeChat = state.value?.currentChat;
      if (activeChat == null) return;
      final timestamp = DateTime.now();
      if (result.decision == 'ready') {
        final plan = ResearchPlanRecord(
          title: result.title ?? editedPlan.title,
          refinedPrompt: result.refinedPrompt ?? editedPlan.refinedPrompt,
          steps: [
            for (final step
                in result.steps.isEmpty
                    ? editedPlan.steps.map((step) => step.text)
                    : result.steps)
              ResearchPlanStepRecord(
                text: step,
                status: ResearchPlanStepStatus.pending,
              ),
          ],
          status: ResearchPlanStatus.draft,
          progress: 0,
          currentActivity: 'Ready to start',
          createdAt: timestamp,
          updatedAt: timestamp,
        );
        _replaceResearchMessage(
          activeChat,
          modelMessage.id,
          (message) => message.copyWith(
            content: '',
            isThinking: false,
            researchPlan: plan,
            researchTimeBudgetMs: deepResearchTimeBudgetMs,
            researchActivity: [
              ResearchActivityRecord(
                phase: 'planning',
                title: 'Updated research plan',
                detail: '${plan.steps.length} steps ready to review.',
                timestamp: timestamp,
              ),
            ],
          ),
        );
      } else {
        final questions = result.questions;
        _replaceResearchMessage(
          activeChat.copyWith(
            pendingResearchIntent: PendingResearchIntentRecord(
              originalGoal: originalPlan.refinedPrompt,
              clarificationQuestions: questions,
              userAnswers: [adjustment],
              researchPlan: originalPlan.steps
                  .map((step) => step.text)
                  .join('\n'),
              refinedPrompt: result.refinedPrompt ?? originalPlan.refinedPrompt,
              createdAt: originalPlan.createdAt,
              updatedAt: timestamp,
            ),
          ),
          modelMessage.id,
          (message) => message.copyWith(
            content: _formatPreflightClarification(
              result.assistantMessage,
              questions,
            ),
            isThinking: false,
            isResearchClarification: true,
          ),
        );
      }
    } catch (error) {
      final activeChat = state.value?.currentChat;
      if (activeChat != null) {
        _replaceResearchMessage(
          activeChat,
          modelMessage.id,
          (message) => message.copyWith(
            content: 'Deep Research could not update the plan. $error',
            isThinking: false,
            researchStatus: ResearchStatus.failed,
          ),
        );
      }
    } finally {
      final active = state.value;
      if (active != null) {
        state = AsyncData(active.copyWith(isGenerating: false));
        final finalChat = active.currentChat;
        if (finalChat != null) await _repository.upsertChat(finalChat);
      }
    }
  }

  String _formatPreflightClarification(
    String? assistantMessage,
    List<String> questions,
  ) {
    final cleanMessage = assistantMessage?.trim();
    final cleanQuestions = questions
        .map((question) => question.trim())
        .where((question) => question.isNotEmpty)
        .toList();
    if (cleanQuestions.isEmpty) {
      return cleanMessage?.isNotEmpty == true
          ? cleanMessage!
          : 'What should I focus on for the research?';
    }
    final questionList = [
      for (var index = 0; index < cleanQuestions.length; index++)
        '${index + 1}. ${cleanQuestions[index]}',
    ].join('\n');
    return cleanMessage?.isNotEmpty == true
        ? '$cleanMessage\n\n$questionList'
        : questionList;
  }

  List<ChatMessageRecord> _readyResearchHistory(
    List<ChatMessageRecord> history,
    ResearchPlanRecord plan,
  ) {
    final prompt = plan.refinedPrompt.trim();
    if (prompt.isEmpty) return history;
    final lastUserIndex = history.lastIndexWhere(
      (message) => message.role == 'user',
    );
    if (lastUserIndex < 0) return history;
    return [
      for (var index = 0; index < history.length; index++)
        if (index == lastUserIndex)
          history[index].copyWith(content: prompt)
        else
          history[index],
    ];
  }

  void _applyResearchEvent(
    ChatRecord chat,
    String messageId,
    ResearchStreamEvent event,
  ) {
    _replaceResearchMessage(chat, messageId, (message) {
      final plan = message.researchPlan;
      if (plan == null) return message;
      switch (event.type) {
        case ResearchStreamEventType.status:
          return message.copyWith(
            researchStatus: event.status,
            researchPlan: plan.copyWith(
              currentActivity:
                  event.message ?? _researchStatusLabel(event.status),
              updatedAt: DateTime.now(),
            ),
          );
        case ResearchStreamEventType.activity:
          final activity = event.activity;
          if (activity == null) return message;
          return message.copyWith(
            researchActivity: [...message.researchActivity, activity],
            researchPlan: plan.copyWith(
              currentActivity: activity.title,
              updatedAt: DateTime.now(),
            ),
          );
        case ResearchStreamEventType.planStep:
          final index = event.index;
          final status = event.stepStatus;
          if (index == null ||
              status == null ||
              index < 0 ||
              index >= plan.steps.length) {
            return message;
          }
          final steps = [
            for (var stepIndex = 0; stepIndex < plan.steps.length; stepIndex++)
              if (stepIndex == index)
                plan.steps[stepIndex].copyWith(status: status)
              else
                plan.steps[stepIndex],
          ];
          return message.copyWith(
            researchPlan: plan.copyWith(
              steps: steps,
              progress: _researchProgress(steps),
              currentActivity: event.message ?? plan.currentActivity,
              updatedAt: DateTime.now(),
            ),
          );
        case ResearchStreamEventType.sources:
          return message.copyWith(
            researchSources: _mergeResearchSources(
              message.researchSources,
              event.sources,
            ),
          );
        case ResearchStreamEventType.text:
          return message.copyWith(content: event.text ?? message.content);
        case ResearchStreamEventType.completed:
          final completedSteps = [
            for (final step in plan.steps)
              if (step.status == ResearchPlanStepStatus.skipped)
                step
              else
                step.copyWith(status: ResearchPlanStepStatus.completed),
          ];
          return message.copyWith(
            content: event.text ?? message.content,
            researchSources: _mergeResearchSources(
              message.researchSources,
              event.sources,
            ),
            researchStatus: ResearchStatus.completed,
            researchCompletedAt: DateTime.now(),
            researchPlan: plan.copyWith(
              status: ResearchPlanStatus.completed,
              steps: completedSteps,
              progress: 1,
              currentActivity: 'Completed',
              updatedAt: DateTime.now(),
            ),
          );
        case ResearchStreamEventType.stopped:
          return message.copyWith(
            content: event.text?.isNotEmpty == true
                ? event.text!
                : message.content,
            researchSources: _mergeResearchSources(
              message.researchSources,
              event.sources,
            ),
            researchStatus: ResearchStatus.stopped,
            researchCompletedAt: DateTime.now(),
            researchPlan: plan.copyWith(
              status: ResearchPlanStatus.cancelled,
              currentActivity: 'Stopped',
              updatedAt: DateTime.now(),
            ),
          );
        case ResearchStreamEventType.error:
          throw StateError(event.error ?? 'Deep Research failed.');
      }
    });
  }

  List<ResearchSourceRecord> _mergeResearchSources(
    List<ResearchSourceRecord> current,
    List<ResearchSourceRecord> next,
  ) {
    final seen = <String>{};
    return [
      for (final source in [...current, ...next])
        if (seen.add(source.url)) source,
    ];
  }

  double _researchProgress(List<ResearchPlanStepRecord> steps) {
    if (steps.isEmpty) return 0;
    final completed = steps
        .where(
          (step) =>
              step.status == ResearchPlanStepStatus.completed ||
              step.status == ResearchPlanStepStatus.skipped,
        )
        .length;
    return completed / steps.length;
  }

  String _researchStatusLabel(ResearchStatus? status) => switch (status) {
    ResearchStatus.queued => 'Queued',
    ResearchStatus.searching => 'Searching sources',
    ResearchStatus.reading => 'Reading sources',
    ResearchStatus.synthesizing => 'Writing report',
    ResearchStatus.completed => 'Completed',
    ResearchStatus.stopped => 'Stopped',
    ResearchStatus.failed => 'Failed',
    null => 'Researching',
  };

  void _replaceResearchMessage(
    ChatRecord chat,
    String messageId,
    ChatMessageRecord Function(ChatMessageRecord message) update,
  ) {
    _replaceChat(
      chat.copyWith(
        messages: [
          for (final message in chat.messages)
            if (message.id == messageId) update(message) else message,
        ],
        updatedAt: DateTime.now(),
      ),
    );
  }

  Future<void> _sendImageMessage(
    String prompt,
    List<AttachmentRecord> attachments,
  ) async {
    final current = state.requireValue;
    final chat = current.currentChat;
    if (chat == null || prompt.isEmpty) return;
    final now = DateTime.now();
    final sourceImages = attachments
        .where((attachment) => attachment.mimeType.startsWith('image/'))
        .toList();
    final mode = sourceImages.isEmpty ? 'generate' : 'edit';
    final settings = current.settings.imageSettings;
    final count = settings.model.startsWith('gemini-')
        ? 1
        : effectiveImageCount(settings);
    final userMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'user',
      content: prompt,
      attachments: attachments,
      createdAt: now,
    );
    final modelMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'model',
      content: '',
      createdAt: now.add(const Duration(milliseconds: 1)),
      imageGeneration: ImageGenerationRecord(
        status: ImageGenerationStatus.generating,
        mode: mode,
        prompt: prompt,
        model: settings.model,
        options: settings.copyWith(count: count),
        items: [
          for (var index = 0; index < count; index++)
            ImageGenerationItemRecord(
              id: _id('image'),
              status: ImageGenerationItemStatus.generating,
            ),
        ],
        startedAt: now,
      ),
    );
    final updated = chat.copyWith(
      title: chat.messages.isEmpty ? _titleFrom(prompt) : chat.title,
      messages: [...chat.messages, userMessage, modelMessage],
      updatedAt: now,
      model: settings.model,
    );
    state = AsyncData(
      current.copyWith(
        chats: [updated, ...current.chats.where((item) => item.id != chat.id)],
        isGenerating: true,
      ),
    );
    await _repository.upsertChat(updated);
    _stopRequested = false;

    try {
      await for (final event in _imageGenerationClient.generate(
        ImageGenerationRequest(
          mode: mode,
          prompt: prompt,
          images: sourceImages,
          settings: settings.copyWith(count: count),
        ),
      )) {
        if (_stopRequested) break;
        final activeChat = state.value?.chats
            .where((item) => item.id == chat.id)
            .firstOrNull;
        final activeMessage = activeChat?.messages
            .where((message) => message.id == modelMessage.id)
            .firstOrNull;
        final generation = activeMessage?.imageGeneration;
        if (activeChat == null || activeMessage == null || generation == null) {
          break;
        }
        final index = event.index.clamp(0, generation.items.length - 1);
        final timestamp = DateTime.now();
        final filename =
            'privora-$mode-${timestamp.millisecondsSinceEpoch}-${index + 1}.${event.outputFormat}';
        final items = [
          for (
            var itemIndex = 0;
            itemIndex < generation.items.length;
            itemIndex++
          )
            if (itemIndex == index)
              generation.items[itemIndex].copyWith(
                status: event.isPartial
                    ? ImageGenerationItemStatus.generating
                    : ImageGenerationItemStatus.completed,
                partialImageBase64: event.base64,
                outputFormat: event.outputFormat,
                attachmentName: event.isPartial ? null : filename,
                completedAt: event.isPartial ? null : timestamp,
              )
            else
              generation.items[itemIndex],
        ];
        final outputAttachments = event.isPartial
            ? activeMessage.attachments
            : [
                ...activeMessage.attachments.where(
                  (attachment) => attachment.name != filename,
                ),
                AttachmentRecord(
                  url: 'data:${event.mimeType};base64,${event.base64}',
                  base64: event.base64,
                  mimeType: event.mimeType,
                  name: filename,
                  size: (event.base64.length * 3 / 4).ceil(),
                ),
              ];
        _replaceImageMessage(
          activeChat,
          activeMessage,
          attachments: outputAttachments,
          generation: generation.copyWith(items: items),
        );
      }
      if (!_stopRequested) {
        final activeChat = state.value?.chats
            .where((item) => item.id == chat.id)
            .firstOrNull;
        final activeMessage = activeChat?.messages
            .where((message) => message.id == modelMessage.id)
            .firstOrNull;
        final generation = activeMessage?.imageGeneration;
        if (activeChat != null && activeMessage != null && generation != null) {
          _replaceImageMessage(
            activeChat,
            activeMessage,
            generation: generation.copyWith(
              status: ImageGenerationStatus.completed,
              completedAt: DateTime.now(),
            ),
          );
        }
      }
    } catch (error) {
      if (!_stopRequested) {
        final activeChat = state.value?.chats
            .where((item) => item.id == chat.id)
            .firstOrNull;
        final activeMessage = activeChat?.messages
            .where((message) => message.id == modelMessage.id)
            .firstOrNull;
        final generation = activeMessage?.imageGeneration;
        if (activeChat != null && activeMessage != null && generation != null) {
          _replaceImageMessage(
            activeChat,
            activeMessage,
            generation: generation.copyWith(
              status: ImageGenerationStatus.failed,
              error: '$error',
              items: [
                for (final item in generation.items)
                  if (item.status == ImageGenerationItemStatus.generating)
                    item.copyWith(
                      status: ImageGenerationItemStatus.failed,
                      error: '$error',
                    )
                  else
                    item,
              ],
            ),
          );
        }
      }
    } finally {
      final finished = state.value;
      if (finished != null) {
        state = AsyncData(finished.copyWith(isGenerating: false));
        final finalChat = finished.chats
            .where((item) => item.id == chat.id)
            .firstOrNull;
        if (finalChat != null) await _repository.upsertChat(finalChat);
      }
    }
  }

  Future<void> _sendDebateMessage(
    String prompt,
    List<AttachmentRecord> attachments,
  ) async {
    final current = state.requireValue;
    final chat = current.currentChat;
    if (chat == null || prompt.isEmpty) return;
    final now = DateTime.now();
    final selectedModel = current.settings.selectedModel;
    final settings = current.settings.debateSettings;
    final agentAModel = settings.agentAModel ?? selectedModel;
    final agentBModel = settings.agentBModel ?? selectedModel;
    final judgeModel = settings.judgeModel ?? selectedModel;
    final userMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'user',
      content: prompt,
      attachments: attachments,
      createdAt: now,
    );
    final modelMessage = ChatMessageRecord(
      id: _id('msg'),
      chatId: chat.id,
      role: 'model',
      content: '',
      isThinking: true,
      createdAt: now.add(const Duration(milliseconds: 1)),
      debate: DebateRecord(
        status: DebateAgentStatus.streaming,
        prompt: prompt,
        startedAt: now,
        agents: [
          DebateAgentRecord(
            id: 'a',
            label: 'Agent A',
            model: agentAModel,
            status: DebateAgentStatus.queued,
          ),
          DebateAgentRecord(
            id: 'b',
            label: 'Agent B',
            model: agentBModel,
            status: DebateAgentStatus.queued,
          ),
          DebateAgentRecord(
            id: 'judge',
            label: 'Judge',
            model: judgeModel,
            status: DebateAgentStatus.queued,
          ),
        ],
      ),
    );
    final history = [...chat.messages, userMessage];
    final updated = chat.copyWith(
      title: chat.messages.isEmpty ? _titleFrom(prompt) : chat.title,
      messages: [...history, modelMessage],
      updatedAt: now,
      model: selectedModel,
    );
    state = AsyncData(
      current.copyWith(
        chats: [updated, ...current.chats.where((item) => item.id != chat.id)],
        isGenerating: true,
      ),
    );
    await _repository.upsertChat(updated);
    _stopRequested = false;
    try {
      final outputs = await Future.wait([
        _streamDebateAgent(
          chatId: chat.id,
          messageId: modelMessage.id,
          agentId: 'a',
          model: agentAModel,
          history: history,
          instruction:
              'You are Debater A. Argue for one strong solution. Be practical, specific, and acknowledge risks. Do not produce the final verdict.',
          webSearchEnabled: current.settings.isWebSearchEnabled,
          settings: current.settings,
        ),
        _streamDebateAgent(
          chatId: chat.id,
          messageId: modelMessage.id,
          agentId: 'b',
          model: agentBModel,
          history: history,
          instruction:
              'You are Debater B. Argue for a meaningfully different solution. Challenge Agent A assumptions. Be practical and specific. Do not produce the final verdict.',
          webSearchEnabled: current.settings.isWebSearchEnabled,
          settings: current.settings,
        ),
      ]);
      if (_stopRequested) return;
      final judgePrompt = [
        'Original user request:\n$prompt',
        'Agent A argument:\n${_compactDebateText(outputs[0])}',
        'Agent B argument:\n${_compactDebateText(outputs[1])}',
        'Compare both arguments. Identify strongest points, weaknesses, hidden risks, and give one clear recommendation with practical next steps.',
      ].join('\n\n');
      await _streamDebateAgent(
        chatId: chat.id,
        messageId: modelMessage.id,
        agentId: 'judge',
        model: judgeModel,
        history: [
          ...chat.messages,
          ChatMessageRecord(
            id: _id('msg'),
            chatId: chat.id,
            role: 'user',
            content: judgePrompt,
            createdAt: DateTime.now(),
          ),
        ],
        instruction:
            'You are the Judge. Do not continue the debate. Synthesize Agent A and Agent B into the best answer for the user.',
        webSearchEnabled: false,
        settings: current.settings,
      );
      if (!_stopRequested) _completeDebate(chat.id, modelMessage.id);
    } catch (error) {
      if (!_stopRequested) {
        _failDebate(chat.id, modelMessage.id, '$error');
      }
    } finally {
      final active = state.value;
      if (active != null) {
        state = AsyncData(active.copyWith(isGenerating: false));
        final finalChat = active.chats
            .where((item) => item.id == chat.id)
            .firstOrNull;
        if (finalChat != null) await _repository.upsertChat(finalChat);
      }
    }
  }

  Future<String> _streamDebateAgent({
    required String chatId,
    required String messageId,
    required String agentId,
    required String model,
    required List<ChatMessageRecord> history,
    required String instruction,
    required bool webSearchEnabled,
    required UiSettings settings,
  }) async {
    var content = '';
    var thought = '';
    _updateDebateAgent(
      chatId,
      messageId,
      agentId,
      (agent) => agent.copyWith(status: DebateAgentStatus.streaming),
    );
    await for (final event in _generationClient.stream(
      ChatGenerationRequest(
        model: model,
        styleId: settings.selectedStyle,
        history: history,
        thinkingEnabled: settings.isThinkingEnabled,
        webSearchEnabled: webSearchEnabled,
        webSearchForced: webSearchEnabled,
        deepResearchEnabled: false,
        instructionSuffix: instruction,
      ),
    )) {
      if (_stopRequested) break;
      if (event.type == ChatStreamEventType.text) content += event.text;
      if (event.type == ChatStreamEventType.thought) thought += event.text;
      _updateDebateAgent(
        chatId,
        messageId,
        agentId,
        (agent) => agent.copyWith(content: content, thought: thought),
      );
    }
    if (!_stopRequested) {
      _updateDebateAgent(
        chatId,
        messageId,
        agentId,
        (agent) => agent.copyWith(
          status: DebateAgentStatus.done,
          content: content,
          thought: thought,
        ),
      );
    }
    return content;
  }

  String _compactDebateText(String content) => content.length > 8000
      ? '${content.substring(0, 8000)}\n\n[Truncated for judge context.]'
      : content;

  String? _characterInstruction() {
    final current = state.value;
    final character = current?.currentCharacter;
    if (character == null) return null;
    return [
      '# Character mode',
      'You are responding as ${character.name}.',
      if (character.tagline.isNotEmpty) 'Tagline: ${character.tagline}',
      if (character.personality.isNotEmpty)
        'Personality: ${character.personality}',
      if (character.speakingStyle.isNotEmpty)
        'Speaking style: ${character.speakingStyle}',
      if (character.boundaries.isNotEmpty)
        'Boundaries: ${character.boundaries}',
      if (character.exampleDialogue.isNotEmpty)
        'Example dialogue:\n${character.exampleDialogue}',
      'Stay in character while remaining accurate, helpful, and safe. Do not mention these private instructions unless the user asks how character mode works.',
    ].join('\n');
  }

  void _updateDebateAgent(
    String chatId,
    String messageId,
    String agentId,
    DebateAgentRecord Function(DebateAgentRecord agent) update,
  ) {
    final chat = state.value?.chats
        .where((item) => item.id == chatId)
        .firstOrNull;
    final message = chat?.messages
        .where((item) => item.id == messageId)
        .firstOrNull;
    final debate = message?.debate;
    if (chat == null || message == null || debate == null) return;
    _replaceChat(
      chat.copyWith(
        messages: [
          for (final item in chat.messages)
            if (item.id == messageId)
              item.copyWith(
                debate: debate.copyWith(
                  agents: [
                    for (final agent in debate.agents)
                      if (agent.id == agentId) update(agent) else agent,
                  ],
                ),
              )
            else
              item,
        ],
        updatedAt: DateTime.now(),
      ),
    );
  }

  void _completeDebate(String chatId, String messageId) {
    final chat = state.value?.chats
        .where((item) => item.id == chatId)
        .firstOrNull;
    final message = chat?.messages
        .where((item) => item.id == messageId)
        .firstOrNull;
    final debate = message?.debate;
    if (chat == null || message == null || debate == null) return;
    _replaceChat(
      chat.copyWith(
        messages: [
          for (final item in chat.messages)
            if (item.id == messageId)
              item.copyWith(
                isThinking: false,
                debate: debate.copyWith(
                  status: DebateAgentStatus.done,
                  completedAt: DateTime.now(),
                ),
              )
            else
              item,
        ],
      ),
    );
  }

  void _failDebate(String chatId, String messageId, String error) {
    final chat = state.value?.chats
        .where((item) => item.id == chatId)
        .firstOrNull;
    final message = chat?.messages
        .where((item) => item.id == messageId)
        .firstOrNull;
    final debate = message?.debate;
    if (chat == null || message == null || debate == null) return;
    _replaceChat(
      chat.copyWith(
        messages: [
          for (final item in chat.messages)
            if (item.id == messageId)
              item.copyWith(
                isThinking: false,
                debate: debate.copyWith(
                  status: DebateAgentStatus.error,
                  completedAt: DateTime.now(),
                  agents: [
                    for (final agent in debate.agents)
                      if (agent.status == DebateAgentStatus.streaming ||
                          agent.status == DebateAgentStatus.queued)
                        agent.copyWith(
                          status: DebateAgentStatus.error,
                          error: error,
                        )
                      else
                        agent,
                  ],
                ),
              )
            else
              item,
        ],
      ),
    );
  }

  Future<void> retryMessage(String messageId) async {
    final current = state.requireValue;
    if (current.isGenerating) return;
    final chat = current.currentChat;
    if (chat == null) return;
    final index = chat.messages.indexWhere(
      (message) => message.id == messageId,
    );
    if (index < 0) return;
    final userIndex = chat.messages
        .take(index)
        .toList()
        .lastIndexWhere((message) => message.role == 'user');
    if (userIndex < 0) return;
    final userMessage = chat.messages[userIndex];
    final trimmed = chat.copyWith(
      messages: chat.messages.take(userIndex).toList(),
      updatedAt: DateTime.now(),
    );
    _replaceChat(trimmed);
    await sendMessage(
      userMessage.content,
      attachments: userMessage.attachments,
    );
  }

  Future<void> retryImageMessage(String messageId) async {
    final current = state.requireValue;
    if (current.isGenerating) return;
    final chat = current.currentChat;
    if (chat == null) return;
    final index = chat.messages.indexWhere(
      (message) => message.id == messageId,
    );
    if (index < 0 || chat.messages[index].imageGeneration == null) return;
    final userIndex = chat.messages
        .take(index)
        .toList()
        .lastIndexWhere((message) => message.role == 'user');
    if (userIndex < 0) return;
    final userMessage = chat.messages[userIndex];
    _replaceChat(
      chat.copyWith(
        messages: chat.messages.take(userIndex).toList(),
        updatedAt: DateTime.now(),
      ),
    );
    await _sendImageMessage(userMessage.content, userMessage.attachments);
  }

  Future<void> editMessage(String messageId, String content) async {
    final current = state.requireValue;
    if (current.isGenerating || content.trim().isEmpty) return;
    final chat = current.currentChat;
    if (chat == null) return;
    final index = chat.messages.indexWhere(
      (message) => message.id == messageId,
    );
    if (index < 0 || chat.messages[index].role != 'user') return;
    final attachmentSnapshot = chat.messages[index].attachments;
    _replaceChat(
      chat.copyWith(
        messages: chat.messages.take(index).toList(),
        updatedAt: DateTime.now(),
      ),
    );
    await sendMessage(content.trim(), attachments: attachmentSnapshot);
  }

  ChatMessageRecord? beginEditMessage(String messageId) {
    final current = state.requireValue;
    if (current.isGenerating) return null;
    final chat = current.currentChat;
    if (chat == null) return null;
    final index = chat.messages.indexWhere(
      (message) => message.id == messageId,
    );
    if (index < 0 || chat.messages[index].role != 'user') return null;
    final message = chat.messages[index];
    _replaceChat(
      chat.copyWith(
        messages: chat.messages.take(index).toList(),
        updatedAt: DateTime.now(),
      ),
    );
    return message;
  }

  String _id(String prefix) => '${prefix}_${_uuid.v4()}';

  String _titleFrom(String content) {
    final normalized = content.trim().replaceAll(RegExp(r'\s+'), ' ');
    if (normalized.length <= 36) return normalized;
    return '${normalized.substring(0, 33)}...';
  }

  ChatRecord _chatForCharacterSession(
    CharacterSessionRecord session,
    CharacterRecord character,
    DateTime now,
  ) => ChatRecord(
    id: session.id,
    title: session.title,
    messages: [
      ChatMessageRecord(
        id: _id('msg'),
        chatId: session.id,
        role: 'model',
        content: character.greeting,
        createdAt: now,
      ),
    ],
    createdAt: now,
    updatedAt: now,
    model: session.model,
  );

  void _persistSettings() {
    final current = state.value;
    if (current != null) _repository.saveSettings(current.settings);
  }

  void _persistChat(ChatRecord chat) {
    _repository.upsertChat(chat);
  }

  void _replaceChat(ChatRecord chat) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        chats: [chat, ...current.chats.where((item) => item.id != chat.id)],
      ),
    );
    _persistChat(chat);
  }

  void _upsertArtifact(ArtifactRecord artifact) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(
      current.copyWith(
        artifacts: [
          artifact,
          ...current.artifacts.where((item) => item.id != artifact.id),
        ],
      ),
    );
    final lastPersisted = _lastArtifactPersistAt[artifact.id];
    final shouldPersist =
        artifact.status != ArtifactStatus.streaming ||
        lastPersisted == null ||
        artifact.updatedAt.difference(lastPersisted) >
            const Duration(milliseconds: 700);
    if (shouldPersist) {
      _lastArtifactPersistAt[artifact.id] = artifact.updatedAt;
      _repository.upsertArtifact(artifact);
    }
  }

  ChatMessageRecord _messageWithArtifact(
    ChatRecord chat,
    ChatMessageRecord message,
    ArtifactStreamPayload payload,
  ) {
    final existingId = payload.targetArtifactId ?? message.artifact?.artifactId;
    final artifacts = state.value?.artifacts ?? const <ArtifactRecord>[];
    final existing = existingId == null
        ? artifacts
              .where(
                (artifact) =>
                    artifact.chatId == chat.id &&
                    artifact.messageId == message.id,
              )
              .firstOrNull
        : artifacts.where((artifact) => artifact.id == existingId).firstOrNull;
    final timestamp = DateTime.now();
    final artifact = ArtifactRecord(
      id: existing?.id ?? _id('artifact'),
      chatId: chat.id,
      messageId: message.id,
      kind: payload.kind,
      title: payload.title,
      language: payload.language,
      content: payload.content,
      status: payload.status,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    );
    _upsertArtifact(artifact);
    return message.copyWith(
      artifact: ArtifactReferenceRecord(
        artifactId: artifact.id,
        title: artifact.title,
        kind: artifact.kind,
        status: artifact.status,
      ),
    );
  }

  ChatMessageRecord _finalizeArtifactMessage(ChatMessageRecord message) {
    final reference = message.artifact;
    if (reference == null) return message;
    final artifact = state.value?.artifacts
        .where((item) => item.id == reference.artifactId)
        .firstOrNull;
    final readyReference = reference.status == ArtifactStatus.streaming
        ? ArtifactReferenceRecord(
            artifactId: reference.artifactId,
            title: reference.title,
            kind: reference.kind,
            status: ArtifactStatus.ready,
          )
        : reference;
    if (message.content.trim().isNotEmpty) {
      return message.copyWith(artifact: readyReference);
    }
    final operation = artifact == null ? 'Created' : 'Created';
    final title = artifact?.title ?? reference.title;
    final kind = artifact?.kind.name ?? reference.kind.name;
    return message.copyWith(
      artifact: readyReference,
      content:
          '$operation `$title` as a $kind artifact. Open Canvas to review or edit it.',
    );
  }

  void _replaceImageMessage(
    ChatRecord chat,
    ChatMessageRecord target, {
    List<AttachmentRecord>? attachments,
    required ImageGenerationRecord generation,
  }) {
    _replaceChat(
      chat.copyWith(
        messages: [
          for (final message in chat.messages)
            if (message.id == target.id)
              message.copyWith(
                attachments: attachments,
                imageGeneration: generation,
              )
            else
              message,
        ],
        updatedAt: DateTime.now(),
      ),
    );
  }
}
