enum WorkspaceMode { chat, webDev, characters }

enum ComposerMode { chat, image }

enum ProviderId { gemini, cliproxy, openrouter }

enum ResearchStatus {
  queued,
  searching,
  reading,
  synthesizing,
  completed,
  stopped,
  failed,
}

enum ResearchPlanStatus {
  draft,
  editing,
  superseded,
  running,
  completed,
  cancelled,
}

enum ResearchPlanStepStatus { pending, active, completed, skipped }

enum ArtifactKind {
  markdown,
  code,
  html,
  svg,
  mermaid,
  json,
  yaml,
  sql,
  text,
  table,
  prompt,
}

enum ArtifactStatus { streaming, ready, failed }

enum ImageGenerationStatus { queued, generating, completed, stopped, failed }

enum ImageGenerationItemStatus {
  queued,
  generating,
  completed,
  stopped,
  failed,
}

enum DebateAgentStatus { queued, streaming, done, error, stopped }

enum WebDevProjectStatus { idle, generating, installing, running, error }

enum WebDevFileStatus { ready, streaming, created, updated, deleted, error }

enum WebDevMessageRole { user, assistant, activity, tool }

enum CharacterVisibility { private, unlisted, public }

enum CharacterMemoryType { fact, preference, relationship, lore }

extension WorkspaceModeStorage on WorkspaceMode {
  String get storageValue => switch (this) {
    WorkspaceMode.chat => 'chat',
    WorkspaceMode.webDev => 'web-dev',
    WorkspaceMode.characters => 'characters',
  };
}

WorkspaceMode workspaceModeFromStorage(String? value) => switch (value) {
  'characters' => WorkspaceMode.characters,
  _ => WorkspaceMode.chat,
};

extension ComposerModeStorage on ComposerMode {
  String get storageValue => switch (this) {
    ComposerMode.chat => 'chat',
    ComposerMode.image => 'image',
  };
}

ComposerMode composerModeFromStorage(String? value) =>
    value == 'image' ? ComposerMode.image : ComposerMode.chat;

extension ResearchStatusStorage on ResearchStatus {
  String get storageValue => name;
}

ResearchStatus? researchStatusFromStorage(String? value) {
  for (final status in ResearchStatus.values) {
    if (status.name == value) return status;
  }
  return null;
}

extension ArtifactKindStorage on ArtifactKind {
  String get storageValue => name;
}

ArtifactKind artifactKindFromStorage(String? value) {
  for (final kind in ArtifactKind.values) {
    if (kind.name == value) return kind;
  }
  return ArtifactKind.text;
}

extension ArtifactStatusStorage on ArtifactStatus {
  String get storageValue => name;
}

ArtifactStatus artifactStatusFromStorage(String? value) {
  for (final status in ArtifactStatus.values) {
    if (status.name == value) return status;
  }
  return ArtifactStatus.ready;
}

extension WebDevProjectStatusStorage on WebDevProjectStatus {
  String get storageValue => name;
}

WebDevProjectStatus webDevProjectStatusFromStorage(String? value) {
  for (final status in WebDevProjectStatus.values) {
    if (status.name == value) return status;
  }
  return WebDevProjectStatus.idle;
}

class ModelOption {
  const ModelOption({
    required this.id,
    required this.label,
    required this.provider,
    required this.description,
  });
  final String id;
  final String label;
  final ProviderId provider;
  final String description;
}

class ModelProviderGroup {
  const ModelProviderGroup({
    required this.id,
    required this.label,
    required this.description,
  });
  final ProviderId id;
  final String label;
  final String description;
}

class ResponseStyleOption {
  const ResponseStyleOption({
    required this.id,
    required this.label,
    required this.description,
  });
  final String id;
  final String label;
  final String description;
}

class ImageModelOption {
  const ImageModelOption({
    required this.id,
    required this.label,
    required this.provider,
    required this.description,
    required this.supportsPartialImages,
  });
  final String id;
  final String label;
  final String provider;
  final String description;
  final bool supportsPartialImages;
}

const defaultModelId = 'gemini-3.1-flash-lite-preview';
const modelProviderOrder = [
  ModelProviderGroup(
    id: ProviderId.gemini,
    label: 'Gemini',
    description: 'Native Google models with search, files, and thinking.',
  ),
  ModelProviderGroup(
    id: ProviderId.cliproxy,
    label: 'GPT / CLIProxy',
    description: 'Local OpenAI-compatible routing through CLIProxy.',
  ),
  ModelProviderGroup(
    id: ProviderId.openrouter,
    label: 'OpenRouter Free',
    description: 'Community text models with per-model tools and reasoning.',
  ),
];
const modelOptions = [
  ModelOption(
    id: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite',
    provider: ProviderId.gemini,
    description: 'Fast Gemini model through Google GenAI.',
  ),
  ModelOption(
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    provider: ProviderId.gemini,
    description: 'Balanced Gemini model with native Gemini tools.',
  ),
  ModelOption(
    id: 'gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro',
    provider: ProviderId.gemini,
    description: 'Stronger Gemini model for harder prompts.',
  ),
  ModelOption(
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: ProviderId.cliproxy,
    description: 'GPT-5.5 through CLIProxy.',
  ),
  ModelOption(
    id: 'deepseek/deepseek-v4-flash:free',
    label: 'DeepSeek V4 Flash',
    provider: ProviderId.openrouter,
    description:
        'Free fast DeepSeek MoE model with 1M context for coding, chat, and agent workflows.',
  ),
  ModelOption(
    id: 'baidu/cobuddy:free',
    label: 'Baidu CoBuddy',
    provider: ProviderId.openrouter,
    description:
        'Free OpenRouter code-generation model for coding tasks and AI agent workflows.',
  ),
  ModelOption(
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 3 Super',
    provider: ProviderId.openrouter,
    description:
        'Free OpenRouter 120B hybrid MoE model for long-context reasoning and agent workflows.',
  ),
];

List<ModelOption> modelsForProvider(ProviderId provider) =>
    modelOptions.where((model) => model.provider == provider).toList();

ModelOption modelOptionFor(String modelId) => modelOptions.firstWhere(
  (model) => model.id == modelId,
  orElse: () => modelOptions.first,
);

const responseStyleOptions = [
  ResponseStyleOption(
    id: 'normal',
    label: 'Normal',
    description: 'Balanced, adaptive, and conversational.',
  ),
  ResponseStyleOption(
    id: 'human',
    label: 'Human',
    description: 'Natural, grounded, and less template-like.',
  ),
  ResponseStyleOption(
    id: 'learning',
    label: 'Learning',
    description: 'Clear teaching with simple examples and useful practice.',
  ),
  ResponseStyleOption(
    id: 'concise',
    label: 'Concise',
    description: 'Brief, direct, and complete.',
  ),
  ResponseStyleOption(
    id: 'explanatory',
    label: 'Explanatory',
    description: 'Clear reasoning that explains why and how things work.',
  ),
  ResponseStyleOption(
    id: 'formal',
    label: 'Formal',
    description: 'Professional plain English for business-safe communication.',
  ),
  ResponseStyleOption(
    id: 'creative',
    label: 'Creative',
    description: 'Useful originality with taste, range, and practical shape.',
  ),
];

ResponseStyleOption responseStyleFor(String styleId) =>
    responseStyleOptions.firstWhere(
      (style) => style.id == styleId,
      orElse: () => responseStyleOptions.first,
    );

const imageModelOptions = [
  ImageModelOption(
    id: 'gpt-image-2',
    label: 'GPT Image',
    provider: 'cliproxy',
    description:
        'GPT image generation through CLIProxy with partial image streaming.',
    supportsPartialImages: true,
  ),
  ImageModelOption(
    id: 'gemini-3.1-flash-image-preview',
    label: 'Nano Banana 2',
    provider: 'gemini',
    description: 'Gemini 3.1 Flash Image Preview through the Gemini API.',
    supportsPartialImages: false,
  ),
];

class UiSettings {
  const UiSettings({
    this.workspaceMode = WorkspaceMode.chat,
    this.selectedModel = defaultModelId,
    this.selectedStyle = 'normal',
    this.isThinkingEnabled = false,
    this.isWebSearchEnabled = false,
    this.isDeepResearchEnabled = false,
    this.isDebateModeEnabled = false,
    this.isDarkMode = false,
    this.composerMode = ComposerMode.chat,
    this.debateSettings = const DebateSettings(),
    this.imageSettings = const ImageSettings(),
  });

  final WorkspaceMode workspaceMode;
  final String selectedModel;
  final String selectedStyle;
  final bool isThinkingEnabled;
  final bool isWebSearchEnabled;
  final bool isDeepResearchEnabled;
  final bool isDebateModeEnabled;
  final bool isDarkMode;
  final ComposerMode composerMode;
  final DebateSettings debateSettings;
  final ImageSettings imageSettings;

  UiSettings copyWith({
    WorkspaceMode? workspaceMode,
    String? selectedModel,
    String? selectedStyle,
    bool? isThinkingEnabled,
    bool? isWebSearchEnabled,
    bool? isDeepResearchEnabled,
    bool? isDebateModeEnabled,
    bool? isDarkMode,
    ComposerMode? composerMode,
    DebateSettings? debateSettings,
    ImageSettings? imageSettings,
  }) => UiSettings(
    workspaceMode: workspaceMode ?? this.workspaceMode,
    selectedModel: selectedModel ?? this.selectedModel,
    selectedStyle: selectedStyle ?? this.selectedStyle,
    isThinkingEnabled: isThinkingEnabled ?? this.isThinkingEnabled,
    isWebSearchEnabled: isWebSearchEnabled ?? this.isWebSearchEnabled,
    isDeepResearchEnabled: isDeepResearchEnabled ?? this.isDeepResearchEnabled,
    isDebateModeEnabled: isDebateModeEnabled ?? this.isDebateModeEnabled,
    isDarkMode: isDarkMode ?? this.isDarkMode,
    composerMode: composerMode ?? this.composerMode,
    debateSettings: debateSettings ?? this.debateSettings,
    imageSettings: imageSettings ?? this.imageSettings,
  );
}

class DebateSettings {
  const DebateSettings({this.agentAModel, this.agentBModel, this.judgeModel});

  final String? agentAModel;
  final String? agentBModel;
  final String? judgeModel;

  DebateSettings copyWith({
    Object? agentAModel = _notSet,
    Object? agentBModel = _notSet,
    Object? judgeModel = _notSet,
  }) => DebateSettings(
    agentAModel: agentAModel == _notSet
        ? this.agentAModel
        : agentAModel as String?,
    agentBModel: agentBModel == _notSet
        ? this.agentBModel
        : agentBModel as String?,
    judgeModel: judgeModel == _notSet ? this.judgeModel : judgeModel as String?,
  );
}

const _notSet = Object();

class ImageSettings {
  const ImageSettings({
    this.model = 'gpt-image-2',
    this.sizePreset = 'square',
    this.quality = 'medium',
    this.count = 1,
    this.partialImages = 0,
    this.outputFormat = 'png',
  });
  final String model;
  final String sizePreset;
  final String quality;
  final int count;
  final int partialImages;
  final String outputFormat;

  ImageSettings copyWith({
    String? model,
    String? sizePreset,
    String? quality,
    int? count,
    int? partialImages,
    String? outputFormat,
  }) => ImageSettings(
    model: model ?? this.model,
    sizePreset: sizePreset ?? this.sizePreset,
    quality: quality ?? this.quality,
    count: count ?? this.count,
    partialImages: partialImages ?? this.partialImages,
    outputFormat: outputFormat ?? this.outputFormat,
  );
}

class AttachmentRecord {
  const AttachmentRecord({
    required this.url,
    required this.mimeType,
    required this.name,
    this.base64,
    this.size,
  });
  final String url;
  final String? base64;
  final String mimeType;
  final String name;
  final int? size;
}

class ImageGenerationItemRecord {
  const ImageGenerationItemRecord({
    required this.id,
    required this.status,
    this.partialImageBase64,
    this.outputFormat,
    this.attachmentName,
    this.error,
    this.completedAt,
  });

  final String id;
  final ImageGenerationItemStatus status;
  final String? partialImageBase64;
  final String? outputFormat;
  final String? attachmentName;
  final String? error;
  final DateTime? completedAt;

  ImageGenerationItemRecord copyWith({
    ImageGenerationItemStatus? status,
    String? partialImageBase64,
    String? outputFormat,
    String? attachmentName,
    String? error,
    DateTime? completedAt,
  }) => ImageGenerationItemRecord(
    id: id,
    status: status ?? this.status,
    partialImageBase64: partialImageBase64 ?? this.partialImageBase64,
    outputFormat: outputFormat ?? this.outputFormat,
    attachmentName: attachmentName ?? this.attachmentName,
    error: error ?? this.error,
    completedAt: completedAt ?? this.completedAt,
  );
}

class ImageGenerationRecord {
  const ImageGenerationRecord({
    required this.status,
    required this.mode,
    required this.prompt,
    required this.model,
    required this.options,
    required this.items,
    required this.startedAt,
    this.completedAt,
    this.error,
  });

  final ImageGenerationStatus status;
  final String mode;
  final String prompt;
  final String model;
  final ImageSettings options;
  final List<ImageGenerationItemRecord> items;
  final DateTime startedAt;
  final DateTime? completedAt;
  final String? error;

  ImageGenerationRecord copyWith({
    ImageGenerationStatus? status,
    List<ImageGenerationItemRecord>? items,
    DateTime? completedAt,
    String? error,
  }) => ImageGenerationRecord(
    status: status ?? this.status,
    mode: mode,
    prompt: prompt,
    model: model,
    options: options,
    items: items ?? this.items,
    startedAt: startedAt,
    completedAt: completedAt ?? this.completedAt,
    error: error ?? this.error,
  );
}

class DebateAgentRecord {
  const DebateAgentRecord({
    required this.id,
    required this.label,
    required this.model,
    required this.status,
    this.content = '',
    this.thought,
    this.error,
  });

  final String id;
  final String label;
  final String model;
  final DebateAgentStatus status;
  final String content;
  final String? thought;
  final String? error;

  DebateAgentRecord copyWith({
    DebateAgentStatus? status,
    String? content,
    String? thought,
    String? error,
  }) => DebateAgentRecord(
    id: id,
    label: label,
    model: model,
    status: status ?? this.status,
    content: content ?? this.content,
    thought: thought ?? this.thought,
    error: error ?? this.error,
  );
}

class DebateRecord {
  const DebateRecord({
    required this.status,
    required this.prompt,
    required this.agents,
    required this.startedAt,
    this.completedAt,
  });

  final DebateAgentStatus status;
  final String prompt;
  final List<DebateAgentRecord> agents;
  final DateTime startedAt;
  final DateTime? completedAt;

  DebateRecord copyWith({
    DebateAgentStatus? status,
    List<DebateAgentRecord>? agents,
    DateTime? completedAt,
  }) => DebateRecord(
    status: status ?? this.status,
    prompt: prompt,
    agents: agents ?? this.agents,
    startedAt: startedAt,
    completedAt: completedAt ?? this.completedAt,
  );
}

class ResearchSourceRecord {
  const ResearchSourceRecord({required this.url, this.title, this.provider});

  final String url;
  final String? title;
  final String? provider;
}

class ResearchPlanStepRecord {
  const ResearchPlanStepRecord({required this.text, required this.status});

  final String text;
  final ResearchPlanStepStatus status;

  ResearchPlanStepRecord copyWith({ResearchPlanStepStatus? status}) =>
      ResearchPlanStepRecord(text: text, status: status ?? this.status);
}

class ResearchActivityRecord {
  const ResearchActivityRecord({
    required this.phase,
    required this.title,
    required this.timestamp,
    this.detail,
    this.source,
  });

  final String phase;
  final String title;
  final String? detail;
  final ResearchSourceRecord? source;
  final DateTime timestamp;
}

class ResearchPlanRecord {
  const ResearchPlanRecord({
    required this.title,
    required this.steps,
    required this.refinedPrompt,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.progress,
    this.currentActivity,
  });

  final String title;
  final List<ResearchPlanStepRecord> steps;
  final String refinedPrompt;
  final ResearchPlanStatus status;
  final double? progress;
  final String? currentActivity;
  final DateTime createdAt;
  final DateTime updatedAt;

  ResearchPlanRecord copyWith({
    String? title,
    List<ResearchPlanStepRecord>? steps,
    String? refinedPrompt,
    ResearchPlanStatus? status,
    double? progress,
    String? currentActivity,
    DateTime? updatedAt,
  }) => ResearchPlanRecord(
    title: title ?? this.title,
    steps: steps ?? this.steps,
    refinedPrompt: refinedPrompt ?? this.refinedPrompt,
    status: status ?? this.status,
    progress: progress ?? this.progress,
    currentActivity: currentActivity ?? this.currentActivity,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
}

class PendingResearchIntentRecord {
  const PendingResearchIntentRecord({
    required this.originalGoal,
    required this.createdAt,
    required this.updatedAt,
    this.clarificationQuestions = const [],
    this.userAnswers = const [],
    this.researchPlan,
    this.refinedPrompt,
  });

  final String originalGoal;
  final List<String> clarificationQuestions;
  final List<String> userAnswers;
  final String? researchPlan;
  final String? refinedPrompt;
  final DateTime createdAt;
  final DateTime updatedAt;
}

class ChatMessageRecord {
  const ChatMessageRecord({
    required this.id,
    required this.chatId,
    required this.role,
    required this.content,
    required this.createdAt,
    this.thought,
    this.isThinking,
    this.webSearchStatus,
    this.webSearchQueries = const [],
    this.researchStatus,
    this.researchSources = const [],
    this.researchPlan,
    this.researchActivity = const [],
    this.researchJobId,
    this.researchStartedAt,
    this.researchCompletedAt,
    this.researchTimeBudgetMs,
    this.isResearchClarification = false,
    this.attachments = const [],
    this.artifact,
    this.imageGeneration,
    this.debate,
  });

  final String id;
  final String chatId;
  final String role;
  final String content;
  final DateTime createdAt;
  final String? thought;
  final bool? isThinking;
  final String? webSearchStatus;
  final List<String> webSearchQueries;
  final ResearchStatus? researchStatus;
  final List<ResearchSourceRecord> researchSources;
  final ResearchPlanRecord? researchPlan;
  final List<ResearchActivityRecord> researchActivity;
  final String? researchJobId;
  final DateTime? researchStartedAt;
  final DateTime? researchCompletedAt;
  final int? researchTimeBudgetMs;
  final bool isResearchClarification;
  final List<AttachmentRecord> attachments;
  final ArtifactReferenceRecord? artifact;
  final ImageGenerationRecord? imageGeneration;
  final DebateRecord? debate;

  ChatMessageRecord copyWith({
    String? content,
    String? thought,
    bool? isThinking,
    String? webSearchStatus,
    List<String>? webSearchQueries,
    ResearchStatus? researchStatus,
    List<ResearchSourceRecord>? researchSources,
    ResearchPlanRecord? researchPlan,
    List<ResearchActivityRecord>? researchActivity,
    String? researchJobId,
    DateTime? researchStartedAt,
    DateTime? researchCompletedAt,
    int? researchTimeBudgetMs,
    bool? isResearchClarification,
    List<AttachmentRecord>? attachments,
    ArtifactReferenceRecord? artifact,
    ImageGenerationRecord? imageGeneration,
    DebateRecord? debate,
  }) => ChatMessageRecord(
    id: id,
    chatId: chatId,
    role: role,
    content: content ?? this.content,
    createdAt: createdAt,
    thought: thought ?? this.thought,
    isThinking: isThinking ?? this.isThinking,
    webSearchStatus: webSearchStatus ?? this.webSearchStatus,
    webSearchQueries: webSearchQueries ?? this.webSearchQueries,
    researchStatus: researchStatus ?? this.researchStatus,
    researchSources: researchSources ?? this.researchSources,
    researchPlan: researchPlan ?? this.researchPlan,
    researchActivity: researchActivity ?? this.researchActivity,
    researchJobId: researchJobId ?? this.researchJobId,
    researchStartedAt: researchStartedAt ?? this.researchStartedAt,
    researchCompletedAt: researchCompletedAt ?? this.researchCompletedAt,
    researchTimeBudgetMs: researchTimeBudgetMs ?? this.researchTimeBudgetMs,
    isResearchClarification:
        isResearchClarification ?? this.isResearchClarification,
    attachments: attachments ?? this.attachments,
    artifact: artifact ?? this.artifact,
    imageGeneration: imageGeneration ?? this.imageGeneration,
    debate: debate ?? this.debate,
  );
}

class ChatRecord {
  const ChatRecord({
    required this.id,
    required this.title,
    required this.messages,
    required this.createdAt,
    required this.updatedAt,
    this.isStarred = false,
    this.model,
    this.pendingResearchIntent,
  });
  final String id;
  final String title;
  final List<ChatMessageRecord> messages;
  final bool isStarred;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? model;
  final PendingResearchIntentRecord? pendingResearchIntent;

  ChatRecord copyWith({
    String? title,
    List<ChatMessageRecord>? messages,
    bool? isStarred,
    DateTime? updatedAt,
    String? model,
    Object? pendingResearchIntent = _notSet,
  }) => ChatRecord(
    id: id,
    title: title ?? this.title,
    messages: messages ?? this.messages,
    isStarred: isStarred ?? this.isStarred,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
    model: model ?? this.model,
    pendingResearchIntent: pendingResearchIntent == _notSet
        ? this.pendingResearchIntent
        : pendingResearchIntent as PendingResearchIntentRecord?,
  );
}

class ArtifactReferenceRecord {
  const ArtifactReferenceRecord({
    required this.artifactId,
    required this.title,
    required this.kind,
    this.status = ArtifactStatus.ready,
  });
  final String artifactId;
  final String title;
  final ArtifactKind kind;
  final ArtifactStatus status;
}

class ArtifactRecord {
  const ArtifactRecord({
    required this.id,
    required this.chatId,
    required this.kind,
    required this.title,
    required this.content,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.messageId,
    this.language,
  });

  final String id;
  final String chatId;
  final String? messageId;
  final ArtifactKind kind;
  final String title;
  final String? language;
  final String content;
  final ArtifactStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;

  ArtifactRecord copyWith({
    String? messageId,
    ArtifactKind? kind,
    String? title,
    String? language,
    String? content,
    ArtifactStatus? status,
    DateTime? updatedAt,
  }) => ArtifactRecord(
    id: id,
    chatId: chatId,
    messageId: messageId ?? this.messageId,
    kind: kind ?? this.kind,
    title: title ?? this.title,
    language: language ?? this.language,
    content: content ?? this.content,
    status: status ?? this.status,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
}

class WebDevProjectRecord {
  const WebDevProjectRecord({
    required this.id,
    required this.title,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
    this.isStarred = false,
    this.previewUrl,
  });
  final String id;
  final String title;
  final WebDevProjectStatus status;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool isStarred;
  final String? previewUrl;
}

class WebDevThreadRecord {
  const WebDevThreadRecord({
    required this.id,
    required this.projectId,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.isStarred = false,
  });
  final String id;
  final String projectId;
  final String title;
  final DateTime createdAt;
  final DateTime updatedAt;
  final bool isStarred;
}

class CharacterRecord {
  const CharacterRecord({
    required this.id,
    required this.name,
    required this.avatar,
    required this.color,
    required this.tagline,
    required this.category,
    required this.greeting,
    this.personality = '',
    this.speakingStyle = '',
    this.boundaries = '',
    this.exampleDialogue = '',
    this.visibility = 'private',
    this.isStarred = false,
    required this.createdAt,
    required this.updatedAt,
  });
  final String id;
  final String name;
  final String avatar;
  final int color;
  final String tagline;
  final String category;
  final String greeting;
  final String personality;
  final String speakingStyle;
  final String boundaries;
  final String exampleDialogue;
  final String visibility;
  final bool isStarred;
  final DateTime createdAt;
  final DateTime updatedAt;
}

class CharacterSessionRecord {
  const CharacterSessionRecord({
    required this.id,
    required this.characterId,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.model,
    this.isStarred = false,
    this.memoryEnabled = true,
  });
  final String id;
  final String characterId;
  final String title;
  final DateTime createdAt;
  final DateTime updatedAt;
  final String? model;
  final bool isStarred;
  final bool memoryEnabled;
}
