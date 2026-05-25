// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'privora_database.dart';

// ignore_for_file: type=lint
class $UiSettingsRowsTable extends UiSettingsRows
    with TableInfo<$UiSettingsRowsTable, UiSettingsRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $UiSettingsRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _workspaceModeMeta = const VerificationMeta(
    'workspaceMode',
  );
  @override
  late final GeneratedColumn<String> workspaceMode = GeneratedColumn<String>(
    'workspace_mode',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('chat'),
  );
  static const VerificationMeta _selectedModelMeta = const VerificationMeta(
    'selectedModel',
  );
  @override
  late final GeneratedColumn<String> selectedModel = GeneratedColumn<String>(
    'selected_model',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _selectedStyleMeta = const VerificationMeta(
    'selectedStyle',
  );
  @override
  late final GeneratedColumn<String> selectedStyle = GeneratedColumn<String>(
    'selected_style',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('normal'),
  );
  static const VerificationMeta _isThinkingEnabledMeta = const VerificationMeta(
    'isThinkingEnabled',
  );
  @override
  late final GeneratedColumn<bool> isThinkingEnabled = GeneratedColumn<bool>(
    'is_thinking_enabled',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_thinking_enabled" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _isWebSearchEnabledMeta =
      const VerificationMeta('isWebSearchEnabled');
  @override
  late final GeneratedColumn<bool> isWebSearchEnabled = GeneratedColumn<bool>(
    'is_web_search_enabled',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_web_search_enabled" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _isDeepResearchEnabledMeta =
      const VerificationMeta('isDeepResearchEnabled');
  @override
  late final GeneratedColumn<bool> isDeepResearchEnabled =
      GeneratedColumn<bool>(
        'is_deep_research_enabled',
        aliasedName,
        false,
        type: DriftSqlType.bool,
        requiredDuringInsert: false,
        defaultConstraints: GeneratedColumn.constraintIsAlways(
          'CHECK ("is_deep_research_enabled" IN (0, 1))',
        ),
        defaultValue: const Constant(false),
      );
  static const VerificationMeta _isDebateModeEnabledMeta =
      const VerificationMeta('isDebateModeEnabled');
  @override
  late final GeneratedColumn<bool> isDebateModeEnabled = GeneratedColumn<bool>(
    'is_debate_mode_enabled',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_debate_mode_enabled" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _isClashModeEnabledMeta =
      const VerificationMeta('isClashModeEnabled');
  @override
  late final GeneratedColumn<bool> isClashModeEnabled = GeneratedColumn<bool>(
    'is_clash_mode_enabled',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_clash_mode_enabled" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _isDarkModeMeta = const VerificationMeta(
    'isDarkMode',
  );
  @override
  late final GeneratedColumn<bool> isDarkMode = GeneratedColumn<bool>(
    'is_dark_mode',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_dark_mode" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _composerModeMeta = const VerificationMeta(
    'composerMode',
  );
  @override
  late final GeneratedColumn<String> composerMode = GeneratedColumn<String>(
    'composer_mode',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('chat'),
  );
  static const VerificationMeta _imageModelMeta = const VerificationMeta(
    'imageModel',
  );
  @override
  late final GeneratedColumn<String> imageModel = GeneratedColumn<String>(
    'image_model',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _imageSizePresetMeta = const VerificationMeta(
    'imageSizePreset',
  );
  @override
  late final GeneratedColumn<String> imageSizePreset = GeneratedColumn<String>(
    'image_size_preset',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('square'),
  );
  static const VerificationMeta _imageQualityMeta = const VerificationMeta(
    'imageQuality',
  );
  @override
  late final GeneratedColumn<String> imageQuality = GeneratedColumn<String>(
    'image_quality',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('medium'),
  );
  static const VerificationMeta _imageCountMeta = const VerificationMeta(
    'imageCount',
  );
  @override
  late final GeneratedColumn<int> imageCount = GeneratedColumn<int>(
    'image_count',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(1),
  );
  static const VerificationMeta _imagePartialImagesMeta =
      const VerificationMeta('imagePartialImages');
  @override
  late final GeneratedColumn<int> imagePartialImages = GeneratedColumn<int>(
    'image_partial_images',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: false,
    defaultValue: const Constant(0),
  );
  static const VerificationMeta _imageOutputFormatMeta = const VerificationMeta(
    'imageOutputFormat',
  );
  @override
  late final GeneratedColumn<String> imageOutputFormat =
      GeneratedColumn<String>(
        'image_output_format',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
        defaultValue: const Constant('png'),
      );
  static const VerificationMeta _debateAgentAModelMeta = const VerificationMeta(
    'debateAgentAModel',
  );
  @override
  late final GeneratedColumn<String> debateAgentAModel =
      GeneratedColumn<String>(
        'debate_agent_a_model',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _debateAgentBModelMeta = const VerificationMeta(
    'debateAgentBModel',
  );
  @override
  late final GeneratedColumn<String> debateAgentBModel =
      GeneratedColumn<String>(
        'debate_agent_b_model',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _debateJudgeModelMeta = const VerificationMeta(
    'debateJudgeModel',
  );
  @override
  late final GeneratedColumn<String> debateJudgeModel = GeneratedColumn<String>(
    'debate_judge_model',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _clashAgentAModelMeta = const VerificationMeta(
    'clashAgentAModel',
  );
  @override
  late final GeneratedColumn<String> clashAgentAModel = GeneratedColumn<String>(
    'clash_agent_a_model',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _clashAgentBModelMeta = const VerificationMeta(
    'clashAgentBModel',
  );
  @override
  late final GeneratedColumn<String> clashAgentBModel = GeneratedColumn<String>(
    'clash_agent_b_model',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    workspaceMode,
    selectedModel,
    selectedStyle,
    isThinkingEnabled,
    isWebSearchEnabled,
    isDeepResearchEnabled,
    isDebateModeEnabled,
    isClashModeEnabled,
    isDarkMode,
    composerMode,
    imageModel,
    imageSizePreset,
    imageQuality,
    imageCount,
    imagePartialImages,
    imageOutputFormat,
    debateAgentAModel,
    debateAgentBModel,
    debateJudgeModel,
    clashAgentAModel,
    clashAgentBModel,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'ui_settings_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<UiSettingsRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('workspace_mode')) {
      context.handle(
        _workspaceModeMeta,
        workspaceMode.isAcceptableOrUnknown(
          data['workspace_mode']!,
          _workspaceModeMeta,
        ),
      );
    }
    if (data.containsKey('selected_model')) {
      context.handle(
        _selectedModelMeta,
        selectedModel.isAcceptableOrUnknown(
          data['selected_model']!,
          _selectedModelMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_selectedModelMeta);
    }
    if (data.containsKey('selected_style')) {
      context.handle(
        _selectedStyleMeta,
        selectedStyle.isAcceptableOrUnknown(
          data['selected_style']!,
          _selectedStyleMeta,
        ),
      );
    }
    if (data.containsKey('is_thinking_enabled')) {
      context.handle(
        _isThinkingEnabledMeta,
        isThinkingEnabled.isAcceptableOrUnknown(
          data['is_thinking_enabled']!,
          _isThinkingEnabledMeta,
        ),
      );
    }
    if (data.containsKey('is_web_search_enabled')) {
      context.handle(
        _isWebSearchEnabledMeta,
        isWebSearchEnabled.isAcceptableOrUnknown(
          data['is_web_search_enabled']!,
          _isWebSearchEnabledMeta,
        ),
      );
    }
    if (data.containsKey('is_deep_research_enabled')) {
      context.handle(
        _isDeepResearchEnabledMeta,
        isDeepResearchEnabled.isAcceptableOrUnknown(
          data['is_deep_research_enabled']!,
          _isDeepResearchEnabledMeta,
        ),
      );
    }
    if (data.containsKey('is_debate_mode_enabled')) {
      context.handle(
        _isDebateModeEnabledMeta,
        isDebateModeEnabled.isAcceptableOrUnknown(
          data['is_debate_mode_enabled']!,
          _isDebateModeEnabledMeta,
        ),
      );
    }
    if (data.containsKey('is_clash_mode_enabled')) {
      context.handle(
        _isClashModeEnabledMeta,
        isClashModeEnabled.isAcceptableOrUnknown(
          data['is_clash_mode_enabled']!,
          _isClashModeEnabledMeta,
        ),
      );
    }
    if (data.containsKey('is_dark_mode')) {
      context.handle(
        _isDarkModeMeta,
        isDarkMode.isAcceptableOrUnknown(
          data['is_dark_mode']!,
          _isDarkModeMeta,
        ),
      );
    }
    if (data.containsKey('composer_mode')) {
      context.handle(
        _composerModeMeta,
        composerMode.isAcceptableOrUnknown(
          data['composer_mode']!,
          _composerModeMeta,
        ),
      );
    }
    if (data.containsKey('image_model')) {
      context.handle(
        _imageModelMeta,
        imageModel.isAcceptableOrUnknown(data['image_model']!, _imageModelMeta),
      );
    } else if (isInserting) {
      context.missing(_imageModelMeta);
    }
    if (data.containsKey('image_size_preset')) {
      context.handle(
        _imageSizePresetMeta,
        imageSizePreset.isAcceptableOrUnknown(
          data['image_size_preset']!,
          _imageSizePresetMeta,
        ),
      );
    }
    if (data.containsKey('image_quality')) {
      context.handle(
        _imageQualityMeta,
        imageQuality.isAcceptableOrUnknown(
          data['image_quality']!,
          _imageQualityMeta,
        ),
      );
    }
    if (data.containsKey('image_count')) {
      context.handle(
        _imageCountMeta,
        imageCount.isAcceptableOrUnknown(data['image_count']!, _imageCountMeta),
      );
    }
    if (data.containsKey('image_partial_images')) {
      context.handle(
        _imagePartialImagesMeta,
        imagePartialImages.isAcceptableOrUnknown(
          data['image_partial_images']!,
          _imagePartialImagesMeta,
        ),
      );
    }
    if (data.containsKey('image_output_format')) {
      context.handle(
        _imageOutputFormatMeta,
        imageOutputFormat.isAcceptableOrUnknown(
          data['image_output_format']!,
          _imageOutputFormatMeta,
        ),
      );
    }
    if (data.containsKey('debate_agent_a_model')) {
      context.handle(
        _debateAgentAModelMeta,
        debateAgentAModel.isAcceptableOrUnknown(
          data['debate_agent_a_model']!,
          _debateAgentAModelMeta,
        ),
      );
    }
    if (data.containsKey('debate_agent_b_model')) {
      context.handle(
        _debateAgentBModelMeta,
        debateAgentBModel.isAcceptableOrUnknown(
          data['debate_agent_b_model']!,
          _debateAgentBModelMeta,
        ),
      );
    }
    if (data.containsKey('debate_judge_model')) {
      context.handle(
        _debateJudgeModelMeta,
        debateJudgeModel.isAcceptableOrUnknown(
          data['debate_judge_model']!,
          _debateJudgeModelMeta,
        ),
      );
    }
    if (data.containsKey('clash_agent_a_model')) {
      context.handle(
        _clashAgentAModelMeta,
        clashAgentAModel.isAcceptableOrUnknown(
          data['clash_agent_a_model']!,
          _clashAgentAModelMeta,
        ),
      );
    }
    if (data.containsKey('clash_agent_b_model')) {
      context.handle(
        _clashAgentBModelMeta,
        clashAgentBModel.isAcceptableOrUnknown(
          data['clash_agent_b_model']!,
          _clashAgentBModelMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  UiSettingsRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return UiSettingsRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      workspaceMode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}workspace_mode'],
      )!,
      selectedModel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}selected_model'],
      )!,
      selectedStyle: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}selected_style'],
      )!,
      isThinkingEnabled: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_thinking_enabled'],
      )!,
      isWebSearchEnabled: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_web_search_enabled'],
      )!,
      isDeepResearchEnabled: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_deep_research_enabled'],
      )!,
      isDebateModeEnabled: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_debate_mode_enabled'],
      )!,
      isClashModeEnabled: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_clash_mode_enabled'],
      )!,
      isDarkMode: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_dark_mode'],
      )!,
      composerMode: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}composer_mode'],
      )!,
      imageModel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}image_model'],
      )!,
      imageSizePreset: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}image_size_preset'],
      )!,
      imageQuality: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}image_quality'],
      )!,
      imageCount: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}image_count'],
      )!,
      imagePartialImages: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}image_partial_images'],
      )!,
      imageOutputFormat: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}image_output_format'],
      )!,
      debateAgentAModel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}debate_agent_a_model'],
      ),
      debateAgentBModel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}debate_agent_b_model'],
      ),
      debateJudgeModel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}debate_judge_model'],
      ),
      clashAgentAModel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}clash_agent_a_model'],
      ),
      clashAgentBModel: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}clash_agent_b_model'],
      ),
    );
  }

  @override
  $UiSettingsRowsTable createAlias(String alias) {
    return $UiSettingsRowsTable(attachedDatabase, alias);
  }
}

class UiSettingsRow extends DataClass implements Insertable<UiSettingsRow> {
  final String id;
  final String workspaceMode;
  final String selectedModel;
  final String selectedStyle;
  final bool isThinkingEnabled;
  final bool isWebSearchEnabled;
  final bool isDeepResearchEnabled;
  final bool isDebateModeEnabled;
  final bool isClashModeEnabled;
  final bool isDarkMode;
  final String composerMode;
  final String imageModel;
  final String imageSizePreset;
  final String imageQuality;
  final int imageCount;
  final int imagePartialImages;
  final String imageOutputFormat;
  final String? debateAgentAModel;
  final String? debateAgentBModel;
  final String? debateJudgeModel;
  final String? clashAgentAModel;
  final String? clashAgentBModel;
  const UiSettingsRow({
    required this.id,
    required this.workspaceMode,
    required this.selectedModel,
    required this.selectedStyle,
    required this.isThinkingEnabled,
    required this.isWebSearchEnabled,
    required this.isDeepResearchEnabled,
    required this.isDebateModeEnabled,
    required this.isClashModeEnabled,
    required this.isDarkMode,
    required this.composerMode,
    required this.imageModel,
    required this.imageSizePreset,
    required this.imageQuality,
    required this.imageCount,
    required this.imagePartialImages,
    required this.imageOutputFormat,
    this.debateAgentAModel,
    this.debateAgentBModel,
    this.debateJudgeModel,
    this.clashAgentAModel,
    this.clashAgentBModel,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['workspace_mode'] = Variable<String>(workspaceMode);
    map['selected_model'] = Variable<String>(selectedModel);
    map['selected_style'] = Variable<String>(selectedStyle);
    map['is_thinking_enabled'] = Variable<bool>(isThinkingEnabled);
    map['is_web_search_enabled'] = Variable<bool>(isWebSearchEnabled);
    map['is_deep_research_enabled'] = Variable<bool>(isDeepResearchEnabled);
    map['is_debate_mode_enabled'] = Variable<bool>(isDebateModeEnabled);
    map['is_clash_mode_enabled'] = Variable<bool>(isClashModeEnabled);
    map['is_dark_mode'] = Variable<bool>(isDarkMode);
    map['composer_mode'] = Variable<String>(composerMode);
    map['image_model'] = Variable<String>(imageModel);
    map['image_size_preset'] = Variable<String>(imageSizePreset);
    map['image_quality'] = Variable<String>(imageQuality);
    map['image_count'] = Variable<int>(imageCount);
    map['image_partial_images'] = Variable<int>(imagePartialImages);
    map['image_output_format'] = Variable<String>(imageOutputFormat);
    if (!nullToAbsent || debateAgentAModel != null) {
      map['debate_agent_a_model'] = Variable<String>(debateAgentAModel);
    }
    if (!nullToAbsent || debateAgentBModel != null) {
      map['debate_agent_b_model'] = Variable<String>(debateAgentBModel);
    }
    if (!nullToAbsent || debateJudgeModel != null) {
      map['debate_judge_model'] = Variable<String>(debateJudgeModel);
    }
    if (!nullToAbsent || clashAgentAModel != null) {
      map['clash_agent_a_model'] = Variable<String>(clashAgentAModel);
    }
    if (!nullToAbsent || clashAgentBModel != null) {
      map['clash_agent_b_model'] = Variable<String>(clashAgentBModel);
    }
    return map;
  }

  UiSettingsRowsCompanion toCompanion(bool nullToAbsent) {
    return UiSettingsRowsCompanion(
      id: Value(id),
      workspaceMode: Value(workspaceMode),
      selectedModel: Value(selectedModel),
      selectedStyle: Value(selectedStyle),
      isThinkingEnabled: Value(isThinkingEnabled),
      isWebSearchEnabled: Value(isWebSearchEnabled),
      isDeepResearchEnabled: Value(isDeepResearchEnabled),
      isDebateModeEnabled: Value(isDebateModeEnabled),
      isClashModeEnabled: Value(isClashModeEnabled),
      isDarkMode: Value(isDarkMode),
      composerMode: Value(composerMode),
      imageModel: Value(imageModel),
      imageSizePreset: Value(imageSizePreset),
      imageQuality: Value(imageQuality),
      imageCount: Value(imageCount),
      imagePartialImages: Value(imagePartialImages),
      imageOutputFormat: Value(imageOutputFormat),
      debateAgentAModel: debateAgentAModel == null && nullToAbsent
          ? const Value.absent()
          : Value(debateAgentAModel),
      debateAgentBModel: debateAgentBModel == null && nullToAbsent
          ? const Value.absent()
          : Value(debateAgentBModel),
      debateJudgeModel: debateJudgeModel == null && nullToAbsent
          ? const Value.absent()
          : Value(debateJudgeModel),
      clashAgentAModel: clashAgentAModel == null && nullToAbsent
          ? const Value.absent()
          : Value(clashAgentAModel),
      clashAgentBModel: clashAgentBModel == null && nullToAbsent
          ? const Value.absent()
          : Value(clashAgentBModel),
    );
  }

  factory UiSettingsRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return UiSettingsRow(
      id: serializer.fromJson<String>(json['id']),
      workspaceMode: serializer.fromJson<String>(json['workspaceMode']),
      selectedModel: serializer.fromJson<String>(json['selectedModel']),
      selectedStyle: serializer.fromJson<String>(json['selectedStyle']),
      isThinkingEnabled: serializer.fromJson<bool>(json['isThinkingEnabled']),
      isWebSearchEnabled: serializer.fromJson<bool>(json['isWebSearchEnabled']),
      isDeepResearchEnabled: serializer.fromJson<bool>(
        json['isDeepResearchEnabled'],
      ),
      isDebateModeEnabled: serializer.fromJson<bool>(
        json['isDebateModeEnabled'],
      ),
      isClashModeEnabled: serializer.fromJson<bool>(json['isClashModeEnabled']),
      isDarkMode: serializer.fromJson<bool>(json['isDarkMode']),
      composerMode: serializer.fromJson<String>(json['composerMode']),
      imageModel: serializer.fromJson<String>(json['imageModel']),
      imageSizePreset: serializer.fromJson<String>(json['imageSizePreset']),
      imageQuality: serializer.fromJson<String>(json['imageQuality']),
      imageCount: serializer.fromJson<int>(json['imageCount']),
      imagePartialImages: serializer.fromJson<int>(json['imagePartialImages']),
      imageOutputFormat: serializer.fromJson<String>(json['imageOutputFormat']),
      debateAgentAModel: serializer.fromJson<String?>(
        json['debateAgentAModel'],
      ),
      debateAgentBModel: serializer.fromJson<String?>(
        json['debateAgentBModel'],
      ),
      debateJudgeModel: serializer.fromJson<String?>(json['debateJudgeModel']),
      clashAgentAModel: serializer.fromJson<String?>(json['clashAgentAModel']),
      clashAgentBModel: serializer.fromJson<String?>(json['clashAgentBModel']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'workspaceMode': serializer.toJson<String>(workspaceMode),
      'selectedModel': serializer.toJson<String>(selectedModel),
      'selectedStyle': serializer.toJson<String>(selectedStyle),
      'isThinkingEnabled': serializer.toJson<bool>(isThinkingEnabled),
      'isWebSearchEnabled': serializer.toJson<bool>(isWebSearchEnabled),
      'isDeepResearchEnabled': serializer.toJson<bool>(isDeepResearchEnabled),
      'isDebateModeEnabled': serializer.toJson<bool>(isDebateModeEnabled),
      'isClashModeEnabled': serializer.toJson<bool>(isClashModeEnabled),
      'isDarkMode': serializer.toJson<bool>(isDarkMode),
      'composerMode': serializer.toJson<String>(composerMode),
      'imageModel': serializer.toJson<String>(imageModel),
      'imageSizePreset': serializer.toJson<String>(imageSizePreset),
      'imageQuality': serializer.toJson<String>(imageQuality),
      'imageCount': serializer.toJson<int>(imageCount),
      'imagePartialImages': serializer.toJson<int>(imagePartialImages),
      'imageOutputFormat': serializer.toJson<String>(imageOutputFormat),
      'debateAgentAModel': serializer.toJson<String?>(debateAgentAModel),
      'debateAgentBModel': serializer.toJson<String?>(debateAgentBModel),
      'debateJudgeModel': serializer.toJson<String?>(debateJudgeModel),
      'clashAgentAModel': serializer.toJson<String?>(clashAgentAModel),
      'clashAgentBModel': serializer.toJson<String?>(clashAgentBModel),
    };
  }

  UiSettingsRow copyWith({
    String? id,
    String? workspaceMode,
    String? selectedModel,
    String? selectedStyle,
    bool? isThinkingEnabled,
    bool? isWebSearchEnabled,
    bool? isDeepResearchEnabled,
    bool? isDebateModeEnabled,
    bool? isClashModeEnabled,
    bool? isDarkMode,
    String? composerMode,
    String? imageModel,
    String? imageSizePreset,
    String? imageQuality,
    int? imageCount,
    int? imagePartialImages,
    String? imageOutputFormat,
    Value<String?> debateAgentAModel = const Value.absent(),
    Value<String?> debateAgentBModel = const Value.absent(),
    Value<String?> debateJudgeModel = const Value.absent(),
    Value<String?> clashAgentAModel = const Value.absent(),
    Value<String?> clashAgentBModel = const Value.absent(),
  }) => UiSettingsRow(
    id: id ?? this.id,
    workspaceMode: workspaceMode ?? this.workspaceMode,
    selectedModel: selectedModel ?? this.selectedModel,
    selectedStyle: selectedStyle ?? this.selectedStyle,
    isThinkingEnabled: isThinkingEnabled ?? this.isThinkingEnabled,
    isWebSearchEnabled: isWebSearchEnabled ?? this.isWebSearchEnabled,
    isDeepResearchEnabled: isDeepResearchEnabled ?? this.isDeepResearchEnabled,
    isDebateModeEnabled: isDebateModeEnabled ?? this.isDebateModeEnabled,
    isClashModeEnabled: isClashModeEnabled ?? this.isClashModeEnabled,
    isDarkMode: isDarkMode ?? this.isDarkMode,
    composerMode: composerMode ?? this.composerMode,
    imageModel: imageModel ?? this.imageModel,
    imageSizePreset: imageSizePreset ?? this.imageSizePreset,
    imageQuality: imageQuality ?? this.imageQuality,
    imageCount: imageCount ?? this.imageCount,
    imagePartialImages: imagePartialImages ?? this.imagePartialImages,
    imageOutputFormat: imageOutputFormat ?? this.imageOutputFormat,
    debateAgentAModel: debateAgentAModel.present
        ? debateAgentAModel.value
        : this.debateAgentAModel,
    debateAgentBModel: debateAgentBModel.present
        ? debateAgentBModel.value
        : this.debateAgentBModel,
    debateJudgeModel: debateJudgeModel.present
        ? debateJudgeModel.value
        : this.debateJudgeModel,
    clashAgentAModel: clashAgentAModel.present
        ? clashAgentAModel.value
        : this.clashAgentAModel,
    clashAgentBModel: clashAgentBModel.present
        ? clashAgentBModel.value
        : this.clashAgentBModel,
  );
  UiSettingsRow copyWithCompanion(UiSettingsRowsCompanion data) {
    return UiSettingsRow(
      id: data.id.present ? data.id.value : this.id,
      workspaceMode: data.workspaceMode.present
          ? data.workspaceMode.value
          : this.workspaceMode,
      selectedModel: data.selectedModel.present
          ? data.selectedModel.value
          : this.selectedModel,
      selectedStyle: data.selectedStyle.present
          ? data.selectedStyle.value
          : this.selectedStyle,
      isThinkingEnabled: data.isThinkingEnabled.present
          ? data.isThinkingEnabled.value
          : this.isThinkingEnabled,
      isWebSearchEnabled: data.isWebSearchEnabled.present
          ? data.isWebSearchEnabled.value
          : this.isWebSearchEnabled,
      isDeepResearchEnabled: data.isDeepResearchEnabled.present
          ? data.isDeepResearchEnabled.value
          : this.isDeepResearchEnabled,
      isDebateModeEnabled: data.isDebateModeEnabled.present
          ? data.isDebateModeEnabled.value
          : this.isDebateModeEnabled,
      isClashModeEnabled: data.isClashModeEnabled.present
          ? data.isClashModeEnabled.value
          : this.isClashModeEnabled,
      isDarkMode: data.isDarkMode.present
          ? data.isDarkMode.value
          : this.isDarkMode,
      composerMode: data.composerMode.present
          ? data.composerMode.value
          : this.composerMode,
      imageModel: data.imageModel.present
          ? data.imageModel.value
          : this.imageModel,
      imageSizePreset: data.imageSizePreset.present
          ? data.imageSizePreset.value
          : this.imageSizePreset,
      imageQuality: data.imageQuality.present
          ? data.imageQuality.value
          : this.imageQuality,
      imageCount: data.imageCount.present
          ? data.imageCount.value
          : this.imageCount,
      imagePartialImages: data.imagePartialImages.present
          ? data.imagePartialImages.value
          : this.imagePartialImages,
      imageOutputFormat: data.imageOutputFormat.present
          ? data.imageOutputFormat.value
          : this.imageOutputFormat,
      debateAgentAModel: data.debateAgentAModel.present
          ? data.debateAgentAModel.value
          : this.debateAgentAModel,
      debateAgentBModel: data.debateAgentBModel.present
          ? data.debateAgentBModel.value
          : this.debateAgentBModel,
      debateJudgeModel: data.debateJudgeModel.present
          ? data.debateJudgeModel.value
          : this.debateJudgeModel,
      clashAgentAModel: data.clashAgentAModel.present
          ? data.clashAgentAModel.value
          : this.clashAgentAModel,
      clashAgentBModel: data.clashAgentBModel.present
          ? data.clashAgentBModel.value
          : this.clashAgentBModel,
    );
  }

  @override
  String toString() {
    return (StringBuffer('UiSettingsRow(')
          ..write('id: $id, ')
          ..write('workspaceMode: $workspaceMode, ')
          ..write('selectedModel: $selectedModel, ')
          ..write('selectedStyle: $selectedStyle, ')
          ..write('isThinkingEnabled: $isThinkingEnabled, ')
          ..write('isWebSearchEnabled: $isWebSearchEnabled, ')
          ..write('isDeepResearchEnabled: $isDeepResearchEnabled, ')
          ..write('isDebateModeEnabled: $isDebateModeEnabled, ')
          ..write('isClashModeEnabled: $isClashModeEnabled, ')
          ..write('isDarkMode: $isDarkMode, ')
          ..write('composerMode: $composerMode, ')
          ..write('imageModel: $imageModel, ')
          ..write('imageSizePreset: $imageSizePreset, ')
          ..write('imageQuality: $imageQuality, ')
          ..write('imageCount: $imageCount, ')
          ..write('imagePartialImages: $imagePartialImages, ')
          ..write('imageOutputFormat: $imageOutputFormat, ')
          ..write('debateAgentAModel: $debateAgentAModel, ')
          ..write('debateAgentBModel: $debateAgentBModel, ')
          ..write('debateJudgeModel: $debateJudgeModel, ')
          ..write('clashAgentAModel: $clashAgentAModel, ')
          ..write('clashAgentBModel: $clashAgentBModel')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hashAll([
    id,
    workspaceMode,
    selectedModel,
    selectedStyle,
    isThinkingEnabled,
    isWebSearchEnabled,
    isDeepResearchEnabled,
    isDebateModeEnabled,
    isClashModeEnabled,
    isDarkMode,
    composerMode,
    imageModel,
    imageSizePreset,
    imageQuality,
    imageCount,
    imagePartialImages,
    imageOutputFormat,
    debateAgentAModel,
    debateAgentBModel,
    debateJudgeModel,
    clashAgentAModel,
    clashAgentBModel,
  ]);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is UiSettingsRow &&
          other.id == this.id &&
          other.workspaceMode == this.workspaceMode &&
          other.selectedModel == this.selectedModel &&
          other.selectedStyle == this.selectedStyle &&
          other.isThinkingEnabled == this.isThinkingEnabled &&
          other.isWebSearchEnabled == this.isWebSearchEnabled &&
          other.isDeepResearchEnabled == this.isDeepResearchEnabled &&
          other.isDebateModeEnabled == this.isDebateModeEnabled &&
          other.isClashModeEnabled == this.isClashModeEnabled &&
          other.isDarkMode == this.isDarkMode &&
          other.composerMode == this.composerMode &&
          other.imageModel == this.imageModel &&
          other.imageSizePreset == this.imageSizePreset &&
          other.imageQuality == this.imageQuality &&
          other.imageCount == this.imageCount &&
          other.imagePartialImages == this.imagePartialImages &&
          other.imageOutputFormat == this.imageOutputFormat &&
          other.debateAgentAModel == this.debateAgentAModel &&
          other.debateAgentBModel == this.debateAgentBModel &&
          other.debateJudgeModel == this.debateJudgeModel &&
          other.clashAgentAModel == this.clashAgentAModel &&
          other.clashAgentBModel == this.clashAgentBModel);
}

class UiSettingsRowsCompanion extends UpdateCompanion<UiSettingsRow> {
  final Value<String> id;
  final Value<String> workspaceMode;
  final Value<String> selectedModel;
  final Value<String> selectedStyle;
  final Value<bool> isThinkingEnabled;
  final Value<bool> isWebSearchEnabled;
  final Value<bool> isDeepResearchEnabled;
  final Value<bool> isDebateModeEnabled;
  final Value<bool> isClashModeEnabled;
  final Value<bool> isDarkMode;
  final Value<String> composerMode;
  final Value<String> imageModel;
  final Value<String> imageSizePreset;
  final Value<String> imageQuality;
  final Value<int> imageCount;
  final Value<int> imagePartialImages;
  final Value<String> imageOutputFormat;
  final Value<String?> debateAgentAModel;
  final Value<String?> debateAgentBModel;
  final Value<String?> debateJudgeModel;
  final Value<String?> clashAgentAModel;
  final Value<String?> clashAgentBModel;
  final Value<int> rowid;
  const UiSettingsRowsCompanion({
    this.id = const Value.absent(),
    this.workspaceMode = const Value.absent(),
    this.selectedModel = const Value.absent(),
    this.selectedStyle = const Value.absent(),
    this.isThinkingEnabled = const Value.absent(),
    this.isWebSearchEnabled = const Value.absent(),
    this.isDeepResearchEnabled = const Value.absent(),
    this.isDebateModeEnabled = const Value.absent(),
    this.isClashModeEnabled = const Value.absent(),
    this.isDarkMode = const Value.absent(),
    this.composerMode = const Value.absent(),
    this.imageModel = const Value.absent(),
    this.imageSizePreset = const Value.absent(),
    this.imageQuality = const Value.absent(),
    this.imageCount = const Value.absent(),
    this.imagePartialImages = const Value.absent(),
    this.imageOutputFormat = const Value.absent(),
    this.debateAgentAModel = const Value.absent(),
    this.debateAgentBModel = const Value.absent(),
    this.debateJudgeModel = const Value.absent(),
    this.clashAgentAModel = const Value.absent(),
    this.clashAgentBModel = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  UiSettingsRowsCompanion.insert({
    required String id,
    this.workspaceMode = const Value.absent(),
    required String selectedModel,
    this.selectedStyle = const Value.absent(),
    this.isThinkingEnabled = const Value.absent(),
    this.isWebSearchEnabled = const Value.absent(),
    this.isDeepResearchEnabled = const Value.absent(),
    this.isDebateModeEnabled = const Value.absent(),
    this.isClashModeEnabled = const Value.absent(),
    this.isDarkMode = const Value.absent(),
    this.composerMode = const Value.absent(),
    required String imageModel,
    this.imageSizePreset = const Value.absent(),
    this.imageQuality = const Value.absent(),
    this.imageCount = const Value.absent(),
    this.imagePartialImages = const Value.absent(),
    this.imageOutputFormat = const Value.absent(),
    this.debateAgentAModel = const Value.absent(),
    this.debateAgentBModel = const Value.absent(),
    this.debateJudgeModel = const Value.absent(),
    this.clashAgentAModel = const Value.absent(),
    this.clashAgentBModel = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       selectedModel = Value(selectedModel),
       imageModel = Value(imageModel);
  static Insertable<UiSettingsRow> custom({
    Expression<String>? id,
    Expression<String>? workspaceMode,
    Expression<String>? selectedModel,
    Expression<String>? selectedStyle,
    Expression<bool>? isThinkingEnabled,
    Expression<bool>? isWebSearchEnabled,
    Expression<bool>? isDeepResearchEnabled,
    Expression<bool>? isDebateModeEnabled,
    Expression<bool>? isClashModeEnabled,
    Expression<bool>? isDarkMode,
    Expression<String>? composerMode,
    Expression<String>? imageModel,
    Expression<String>? imageSizePreset,
    Expression<String>? imageQuality,
    Expression<int>? imageCount,
    Expression<int>? imagePartialImages,
    Expression<String>? imageOutputFormat,
    Expression<String>? debateAgentAModel,
    Expression<String>? debateAgentBModel,
    Expression<String>? debateJudgeModel,
    Expression<String>? clashAgentAModel,
    Expression<String>? clashAgentBModel,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (workspaceMode != null) 'workspace_mode': workspaceMode,
      if (selectedModel != null) 'selected_model': selectedModel,
      if (selectedStyle != null) 'selected_style': selectedStyle,
      if (isThinkingEnabled != null) 'is_thinking_enabled': isThinkingEnabled,
      if (isWebSearchEnabled != null)
        'is_web_search_enabled': isWebSearchEnabled,
      if (isDeepResearchEnabled != null)
        'is_deep_research_enabled': isDeepResearchEnabled,
      if (isDebateModeEnabled != null)
        'is_debate_mode_enabled': isDebateModeEnabled,
      if (isClashModeEnabled != null)
        'is_clash_mode_enabled': isClashModeEnabled,
      if (isDarkMode != null) 'is_dark_mode': isDarkMode,
      if (composerMode != null) 'composer_mode': composerMode,
      if (imageModel != null) 'image_model': imageModel,
      if (imageSizePreset != null) 'image_size_preset': imageSizePreset,
      if (imageQuality != null) 'image_quality': imageQuality,
      if (imageCount != null) 'image_count': imageCount,
      if (imagePartialImages != null)
        'image_partial_images': imagePartialImages,
      if (imageOutputFormat != null) 'image_output_format': imageOutputFormat,
      if (debateAgentAModel != null) 'debate_agent_a_model': debateAgentAModel,
      if (debateAgentBModel != null) 'debate_agent_b_model': debateAgentBModel,
      if (debateJudgeModel != null) 'debate_judge_model': debateJudgeModel,
      if (clashAgentAModel != null) 'clash_agent_a_model': clashAgentAModel,
      if (clashAgentBModel != null) 'clash_agent_b_model': clashAgentBModel,
      if (rowid != null) 'rowid': rowid,
    });
  }

  UiSettingsRowsCompanion copyWith({
    Value<String>? id,
    Value<String>? workspaceMode,
    Value<String>? selectedModel,
    Value<String>? selectedStyle,
    Value<bool>? isThinkingEnabled,
    Value<bool>? isWebSearchEnabled,
    Value<bool>? isDeepResearchEnabled,
    Value<bool>? isDebateModeEnabled,
    Value<bool>? isClashModeEnabled,
    Value<bool>? isDarkMode,
    Value<String>? composerMode,
    Value<String>? imageModel,
    Value<String>? imageSizePreset,
    Value<String>? imageQuality,
    Value<int>? imageCount,
    Value<int>? imagePartialImages,
    Value<String>? imageOutputFormat,
    Value<String?>? debateAgentAModel,
    Value<String?>? debateAgentBModel,
    Value<String?>? debateJudgeModel,
    Value<String?>? clashAgentAModel,
    Value<String?>? clashAgentBModel,
    Value<int>? rowid,
  }) {
    return UiSettingsRowsCompanion(
      id: id ?? this.id,
      workspaceMode: workspaceMode ?? this.workspaceMode,
      selectedModel: selectedModel ?? this.selectedModel,
      selectedStyle: selectedStyle ?? this.selectedStyle,
      isThinkingEnabled: isThinkingEnabled ?? this.isThinkingEnabled,
      isWebSearchEnabled: isWebSearchEnabled ?? this.isWebSearchEnabled,
      isDeepResearchEnabled:
          isDeepResearchEnabled ?? this.isDeepResearchEnabled,
      isDebateModeEnabled: isDebateModeEnabled ?? this.isDebateModeEnabled,
      isClashModeEnabled: isClashModeEnabled ?? this.isClashModeEnabled,
      isDarkMode: isDarkMode ?? this.isDarkMode,
      composerMode: composerMode ?? this.composerMode,
      imageModel: imageModel ?? this.imageModel,
      imageSizePreset: imageSizePreset ?? this.imageSizePreset,
      imageQuality: imageQuality ?? this.imageQuality,
      imageCount: imageCount ?? this.imageCount,
      imagePartialImages: imagePartialImages ?? this.imagePartialImages,
      imageOutputFormat: imageOutputFormat ?? this.imageOutputFormat,
      debateAgentAModel: debateAgentAModel ?? this.debateAgentAModel,
      debateAgentBModel: debateAgentBModel ?? this.debateAgentBModel,
      debateJudgeModel: debateJudgeModel ?? this.debateJudgeModel,
      clashAgentAModel: clashAgentAModel ?? this.clashAgentAModel,
      clashAgentBModel: clashAgentBModel ?? this.clashAgentBModel,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (workspaceMode.present) {
      map['workspace_mode'] = Variable<String>(workspaceMode.value);
    }
    if (selectedModel.present) {
      map['selected_model'] = Variable<String>(selectedModel.value);
    }
    if (selectedStyle.present) {
      map['selected_style'] = Variable<String>(selectedStyle.value);
    }
    if (isThinkingEnabled.present) {
      map['is_thinking_enabled'] = Variable<bool>(isThinkingEnabled.value);
    }
    if (isWebSearchEnabled.present) {
      map['is_web_search_enabled'] = Variable<bool>(isWebSearchEnabled.value);
    }
    if (isDeepResearchEnabled.present) {
      map['is_deep_research_enabled'] = Variable<bool>(
        isDeepResearchEnabled.value,
      );
    }
    if (isDebateModeEnabled.present) {
      map['is_debate_mode_enabled'] = Variable<bool>(isDebateModeEnabled.value);
    }
    if (isClashModeEnabled.present) {
      map['is_clash_mode_enabled'] = Variable<bool>(isClashModeEnabled.value);
    }
    if (isDarkMode.present) {
      map['is_dark_mode'] = Variable<bool>(isDarkMode.value);
    }
    if (composerMode.present) {
      map['composer_mode'] = Variable<String>(composerMode.value);
    }
    if (imageModel.present) {
      map['image_model'] = Variable<String>(imageModel.value);
    }
    if (imageSizePreset.present) {
      map['image_size_preset'] = Variable<String>(imageSizePreset.value);
    }
    if (imageQuality.present) {
      map['image_quality'] = Variable<String>(imageQuality.value);
    }
    if (imageCount.present) {
      map['image_count'] = Variable<int>(imageCount.value);
    }
    if (imagePartialImages.present) {
      map['image_partial_images'] = Variable<int>(imagePartialImages.value);
    }
    if (imageOutputFormat.present) {
      map['image_output_format'] = Variable<String>(imageOutputFormat.value);
    }
    if (debateAgentAModel.present) {
      map['debate_agent_a_model'] = Variable<String>(debateAgentAModel.value);
    }
    if (debateAgentBModel.present) {
      map['debate_agent_b_model'] = Variable<String>(debateAgentBModel.value);
    }
    if (debateJudgeModel.present) {
      map['debate_judge_model'] = Variable<String>(debateJudgeModel.value);
    }
    if (clashAgentAModel.present) {
      map['clash_agent_a_model'] = Variable<String>(clashAgentAModel.value);
    }
    if (clashAgentBModel.present) {
      map['clash_agent_b_model'] = Variable<String>(clashAgentBModel.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('UiSettingsRowsCompanion(')
          ..write('id: $id, ')
          ..write('workspaceMode: $workspaceMode, ')
          ..write('selectedModel: $selectedModel, ')
          ..write('selectedStyle: $selectedStyle, ')
          ..write('isThinkingEnabled: $isThinkingEnabled, ')
          ..write('isWebSearchEnabled: $isWebSearchEnabled, ')
          ..write('isDeepResearchEnabled: $isDeepResearchEnabled, ')
          ..write('isDebateModeEnabled: $isDebateModeEnabled, ')
          ..write('isClashModeEnabled: $isClashModeEnabled, ')
          ..write('isDarkMode: $isDarkMode, ')
          ..write('composerMode: $composerMode, ')
          ..write('imageModel: $imageModel, ')
          ..write('imageSizePreset: $imageSizePreset, ')
          ..write('imageQuality: $imageQuality, ')
          ..write('imageCount: $imageCount, ')
          ..write('imagePartialImages: $imagePartialImages, ')
          ..write('imageOutputFormat: $imageOutputFormat, ')
          ..write('debateAgentAModel: $debateAgentAModel, ')
          ..write('debateAgentBModel: $debateAgentBModel, ')
          ..write('debateJudgeModel: $debateJudgeModel, ')
          ..write('clashAgentAModel: $clashAgentAModel, ')
          ..write('clashAgentBModel: $clashAgentBModel, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ChatRowsTable extends ChatRows with TableInfo<$ChatRowsTable, ChatRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ChatRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _isStarredMeta = const VerificationMeta(
    'isStarred',
  );
  @override
  late final GeneratedColumn<bool> isStarred = GeneratedColumn<bool>(
    'is_starred',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_starred" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _modelMeta = const VerificationMeta('model');
  @override
  late final GeneratedColumn<String> model = GeneratedColumn<String>(
    'model',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _pendingResearchIntentJsonMeta =
      const VerificationMeta('pendingResearchIntentJson');
  @override
  late final GeneratedColumn<String> pendingResearchIntentJson =
      GeneratedColumn<String>(
        'pending_research_intent_json',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    title,
    isStarred,
    createdAt,
    updatedAt,
    model,
    pendingResearchIntentJson,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'chat_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<ChatRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('is_starred')) {
      context.handle(
        _isStarredMeta,
        isStarred.isAcceptableOrUnknown(data['is_starred']!, _isStarredMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    if (data.containsKey('model')) {
      context.handle(
        _modelMeta,
        model.isAcceptableOrUnknown(data['model']!, _modelMeta),
      );
    }
    if (data.containsKey('pending_research_intent_json')) {
      context.handle(
        _pendingResearchIntentJsonMeta,
        pendingResearchIntentJson.isAcceptableOrUnknown(
          data['pending_research_intent_json']!,
          _pendingResearchIntentJsonMeta,
        ),
      );
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ChatRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ChatRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      isStarred: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_starred'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
      model: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}model'],
      ),
      pendingResearchIntentJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}pending_research_intent_json'],
      ),
    );
  }

  @override
  $ChatRowsTable createAlias(String alias) {
    return $ChatRowsTable(attachedDatabase, alias);
  }
}

class ChatRow extends DataClass implements Insertable<ChatRow> {
  final String id;
  final String title;
  final bool isStarred;
  final int createdAt;
  final int updatedAt;
  final String? model;
  final String? pendingResearchIntentJson;
  const ChatRow({
    required this.id,
    required this.title,
    required this.isStarred,
    required this.createdAt,
    required this.updatedAt,
    this.model,
    this.pendingResearchIntentJson,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['title'] = Variable<String>(title);
    map['is_starred'] = Variable<bool>(isStarred);
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    if (!nullToAbsent || model != null) {
      map['model'] = Variable<String>(model);
    }
    if (!nullToAbsent || pendingResearchIntentJson != null) {
      map['pending_research_intent_json'] = Variable<String>(
        pendingResearchIntentJson,
      );
    }
    return map;
  }

  ChatRowsCompanion toCompanion(bool nullToAbsent) {
    return ChatRowsCompanion(
      id: Value(id),
      title: Value(title),
      isStarred: Value(isStarred),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
      model: model == null && nullToAbsent
          ? const Value.absent()
          : Value(model),
      pendingResearchIntentJson:
          pendingResearchIntentJson == null && nullToAbsent
          ? const Value.absent()
          : Value(pendingResearchIntentJson),
    );
  }

  factory ChatRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ChatRow(
      id: serializer.fromJson<String>(json['id']),
      title: serializer.fromJson<String>(json['title']),
      isStarred: serializer.fromJson<bool>(json['isStarred']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
      model: serializer.fromJson<String?>(json['model']),
      pendingResearchIntentJson: serializer.fromJson<String?>(
        json['pendingResearchIntentJson'],
      ),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'title': serializer.toJson<String>(title),
      'isStarred': serializer.toJson<bool>(isStarred),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
      'model': serializer.toJson<String?>(model),
      'pendingResearchIntentJson': serializer.toJson<String?>(
        pendingResearchIntentJson,
      ),
    };
  }

  ChatRow copyWith({
    String? id,
    String? title,
    bool? isStarred,
    int? createdAt,
    int? updatedAt,
    Value<String?> model = const Value.absent(),
    Value<String?> pendingResearchIntentJson = const Value.absent(),
  }) => ChatRow(
    id: id ?? this.id,
    title: title ?? this.title,
    isStarred: isStarred ?? this.isStarred,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
    model: model.present ? model.value : this.model,
    pendingResearchIntentJson: pendingResearchIntentJson.present
        ? pendingResearchIntentJson.value
        : this.pendingResearchIntentJson,
  );
  ChatRow copyWithCompanion(ChatRowsCompanion data) {
    return ChatRow(
      id: data.id.present ? data.id.value : this.id,
      title: data.title.present ? data.title.value : this.title,
      isStarred: data.isStarred.present ? data.isStarred.value : this.isStarred,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
      model: data.model.present ? data.model.value : this.model,
      pendingResearchIntentJson: data.pendingResearchIntentJson.present
          ? data.pendingResearchIntentJson.value
          : this.pendingResearchIntentJson,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ChatRow(')
          ..write('id: $id, ')
          ..write('title: $title, ')
          ..write('isStarred: $isStarred, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('model: $model, ')
          ..write('pendingResearchIntentJson: $pendingResearchIntentJson')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    title,
    isStarred,
    createdAt,
    updatedAt,
    model,
    pendingResearchIntentJson,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ChatRow &&
          other.id == this.id &&
          other.title == this.title &&
          other.isStarred == this.isStarred &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt &&
          other.model == this.model &&
          other.pendingResearchIntentJson == this.pendingResearchIntentJson);
}

class ChatRowsCompanion extends UpdateCompanion<ChatRow> {
  final Value<String> id;
  final Value<String> title;
  final Value<bool> isStarred;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<String?> model;
  final Value<String?> pendingResearchIntentJson;
  final Value<int> rowid;
  const ChatRowsCompanion({
    this.id = const Value.absent(),
    this.title = const Value.absent(),
    this.isStarred = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.model = const Value.absent(),
    this.pendingResearchIntentJson = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ChatRowsCompanion.insert({
    required String id,
    required String title,
    this.isStarred = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.model = const Value.absent(),
    this.pendingResearchIntentJson = const Value.absent(),
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       title = Value(title),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<ChatRow> custom({
    Expression<String>? id,
    Expression<String>? title,
    Expression<bool>? isStarred,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<String>? model,
    Expression<String>? pendingResearchIntentJson,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (title != null) 'title': title,
      if (isStarred != null) 'is_starred': isStarred,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (model != null) 'model': model,
      if (pendingResearchIntentJson != null)
        'pending_research_intent_json': pendingResearchIntentJson,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ChatRowsCompanion copyWith({
    Value<String>? id,
    Value<String>? title,
    Value<bool>? isStarred,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<String?>? model,
    Value<String?>? pendingResearchIntentJson,
    Value<int>? rowid,
  }) {
    return ChatRowsCompanion(
      id: id ?? this.id,
      title: title ?? this.title,
      isStarred: isStarred ?? this.isStarred,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      model: model ?? this.model,
      pendingResearchIntentJson:
          pendingResearchIntentJson ?? this.pendingResearchIntentJson,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (isStarred.present) {
      map['is_starred'] = Variable<bool>(isStarred.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (model.present) {
      map['model'] = Variable<String>(model.value);
    }
    if (pendingResearchIntentJson.present) {
      map['pending_research_intent_json'] = Variable<String>(
        pendingResearchIntentJson.value,
      );
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ChatRowsCompanion(')
          ..write('id: $id, ')
          ..write('title: $title, ')
          ..write('isStarred: $isStarred, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('model: $model, ')
          ..write('pendingResearchIntentJson: $pendingResearchIntentJson, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ChatMessageRowsTable extends ChatMessageRows
    with TableInfo<$ChatMessageRowsTable, ChatMessageRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ChatMessageRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _chatIdMeta = const VerificationMeta('chatId');
  @override
  late final GeneratedColumn<String> chatId = GeneratedColumn<String>(
    'chat_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES chat_rows (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _roleMeta = const VerificationMeta('role');
  @override
  late final GeneratedColumn<String> role = GeneratedColumn<String>(
    'role',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _contentMeta = const VerificationMeta(
    'content',
  );
  @override
  late final GeneratedColumn<String> content = GeneratedColumn<String>(
    'content',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _thoughtMeta = const VerificationMeta(
    'thought',
  );
  @override
  late final GeneratedColumn<String> thought = GeneratedColumn<String>(
    'thought',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _isThinkingMeta = const VerificationMeta(
    'isThinking',
  );
  @override
  late final GeneratedColumn<bool> isThinking = GeneratedColumn<bool>(
    'is_thinking',
    aliasedName,
    true,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_thinking" IN (0, 1))',
    ),
  );
  static const VerificationMeta _webSearchStatusMeta = const VerificationMeta(
    'webSearchStatus',
  );
  @override
  late final GeneratedColumn<String> webSearchStatus = GeneratedColumn<String>(
    'web_search_status',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _webSearchQueriesJsonMeta =
      const VerificationMeta('webSearchQueriesJson');
  @override
  late final GeneratedColumn<String> webSearchQueriesJson =
      GeneratedColumn<String>(
        'web_search_queries_json',
        aliasedName,
        false,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
        defaultValue: const Constant('[]'),
      );
  static const VerificationMeta _researchStatusMeta = const VerificationMeta(
    'researchStatus',
  );
  @override
  late final GeneratedColumn<String> researchStatus = GeneratedColumn<String>(
    'research_status',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _attachmentsJsonMeta = const VerificationMeta(
    'attachmentsJson',
  );
  @override
  late final GeneratedColumn<String> attachmentsJson = GeneratedColumn<String>(
    'attachments_json',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('[]'),
  );
  static const VerificationMeta _artifactJsonMeta = const VerificationMeta(
    'artifactJson',
  );
  @override
  late final GeneratedColumn<String> artifactJson = GeneratedColumn<String>(
    'artifact_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _imageGenerationJsonMeta =
      const VerificationMeta('imageGenerationJson');
  @override
  late final GeneratedColumn<String> imageGenerationJson =
      GeneratedColumn<String>(
        'image_generation_json',
        aliasedName,
        true,
        type: DriftSqlType.string,
        requiredDuringInsert: false,
      );
  static const VerificationMeta _debateJsonMeta = const VerificationMeta(
    'debateJson',
  );
  @override
  late final GeneratedColumn<String> debateJson = GeneratedColumn<String>(
    'debate_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _clashJsonMeta = const VerificationMeta(
    'clashJson',
  );
  @override
  late final GeneratedColumn<String> clashJson = GeneratedColumn<String>(
    'clash_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _researchJsonMeta = const VerificationMeta(
    'researchJson',
  );
  @override
  late final GeneratedColumn<String> researchJson = GeneratedColumn<String>(
    'research_json',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    chatId,
    role,
    content,
    thought,
    isThinking,
    webSearchStatus,
    webSearchQueriesJson,
    researchStatus,
    attachmentsJson,
    artifactJson,
    imageGenerationJson,
    debateJson,
    clashJson,
    researchJson,
    createdAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'chat_message_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<ChatMessageRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('chat_id')) {
      context.handle(
        _chatIdMeta,
        chatId.isAcceptableOrUnknown(data['chat_id']!, _chatIdMeta),
      );
    } else if (isInserting) {
      context.missing(_chatIdMeta);
    }
    if (data.containsKey('role')) {
      context.handle(
        _roleMeta,
        role.isAcceptableOrUnknown(data['role']!, _roleMeta),
      );
    } else if (isInserting) {
      context.missing(_roleMeta);
    }
    if (data.containsKey('content')) {
      context.handle(
        _contentMeta,
        content.isAcceptableOrUnknown(data['content']!, _contentMeta),
      );
    } else if (isInserting) {
      context.missing(_contentMeta);
    }
    if (data.containsKey('thought')) {
      context.handle(
        _thoughtMeta,
        thought.isAcceptableOrUnknown(data['thought']!, _thoughtMeta),
      );
    }
    if (data.containsKey('is_thinking')) {
      context.handle(
        _isThinkingMeta,
        isThinking.isAcceptableOrUnknown(data['is_thinking']!, _isThinkingMeta),
      );
    }
    if (data.containsKey('web_search_status')) {
      context.handle(
        _webSearchStatusMeta,
        webSearchStatus.isAcceptableOrUnknown(
          data['web_search_status']!,
          _webSearchStatusMeta,
        ),
      );
    }
    if (data.containsKey('web_search_queries_json')) {
      context.handle(
        _webSearchQueriesJsonMeta,
        webSearchQueriesJson.isAcceptableOrUnknown(
          data['web_search_queries_json']!,
          _webSearchQueriesJsonMeta,
        ),
      );
    }
    if (data.containsKey('research_status')) {
      context.handle(
        _researchStatusMeta,
        researchStatus.isAcceptableOrUnknown(
          data['research_status']!,
          _researchStatusMeta,
        ),
      );
    }
    if (data.containsKey('attachments_json')) {
      context.handle(
        _attachmentsJsonMeta,
        attachmentsJson.isAcceptableOrUnknown(
          data['attachments_json']!,
          _attachmentsJsonMeta,
        ),
      );
    }
    if (data.containsKey('artifact_json')) {
      context.handle(
        _artifactJsonMeta,
        artifactJson.isAcceptableOrUnknown(
          data['artifact_json']!,
          _artifactJsonMeta,
        ),
      );
    }
    if (data.containsKey('image_generation_json')) {
      context.handle(
        _imageGenerationJsonMeta,
        imageGenerationJson.isAcceptableOrUnknown(
          data['image_generation_json']!,
          _imageGenerationJsonMeta,
        ),
      );
    }
    if (data.containsKey('debate_json')) {
      context.handle(
        _debateJsonMeta,
        debateJson.isAcceptableOrUnknown(data['debate_json']!, _debateJsonMeta),
      );
    }
    if (data.containsKey('clash_json')) {
      context.handle(
        _clashJsonMeta,
        clashJson.isAcceptableOrUnknown(data['clash_json']!, _clashJsonMeta),
      );
    }
    if (data.containsKey('research_json')) {
      context.handle(
        _researchJsonMeta,
        researchJson.isAcceptableOrUnknown(
          data['research_json']!,
          _researchJsonMeta,
        ),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ChatMessageRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ChatMessageRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      chatId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}chat_id'],
      )!,
      role: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}role'],
      )!,
      content: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}content'],
      )!,
      thought: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}thought'],
      ),
      isThinking: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_thinking'],
      ),
      webSearchStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}web_search_status'],
      ),
      webSearchQueriesJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}web_search_queries_json'],
      )!,
      researchStatus: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}research_status'],
      ),
      attachmentsJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}attachments_json'],
      )!,
      artifactJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}artifact_json'],
      ),
      imageGenerationJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}image_generation_json'],
      ),
      debateJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}debate_json'],
      ),
      clashJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}clash_json'],
      ),
      researchJson: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}research_json'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
    );
  }

  @override
  $ChatMessageRowsTable createAlias(String alias) {
    return $ChatMessageRowsTable(attachedDatabase, alias);
  }
}

class ChatMessageRow extends DataClass implements Insertable<ChatMessageRow> {
  final String id;
  final String chatId;
  final String role;
  final String content;
  final String? thought;
  final bool? isThinking;
  final String? webSearchStatus;
  final String webSearchQueriesJson;
  final String? researchStatus;
  final String attachmentsJson;
  final String? artifactJson;
  final String? imageGenerationJson;
  final String? debateJson;
  final String? clashJson;
  final String? researchJson;
  final int createdAt;
  const ChatMessageRow({
    required this.id,
    required this.chatId,
    required this.role,
    required this.content,
    this.thought,
    this.isThinking,
    this.webSearchStatus,
    required this.webSearchQueriesJson,
    this.researchStatus,
    required this.attachmentsJson,
    this.artifactJson,
    this.imageGenerationJson,
    this.debateJson,
    this.clashJson,
    this.researchJson,
    required this.createdAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['chat_id'] = Variable<String>(chatId);
    map['role'] = Variable<String>(role);
    map['content'] = Variable<String>(content);
    if (!nullToAbsent || thought != null) {
      map['thought'] = Variable<String>(thought);
    }
    if (!nullToAbsent || isThinking != null) {
      map['is_thinking'] = Variable<bool>(isThinking);
    }
    if (!nullToAbsent || webSearchStatus != null) {
      map['web_search_status'] = Variable<String>(webSearchStatus);
    }
    map['web_search_queries_json'] = Variable<String>(webSearchQueriesJson);
    if (!nullToAbsent || researchStatus != null) {
      map['research_status'] = Variable<String>(researchStatus);
    }
    map['attachments_json'] = Variable<String>(attachmentsJson);
    if (!nullToAbsent || artifactJson != null) {
      map['artifact_json'] = Variable<String>(artifactJson);
    }
    if (!nullToAbsent || imageGenerationJson != null) {
      map['image_generation_json'] = Variable<String>(imageGenerationJson);
    }
    if (!nullToAbsent || debateJson != null) {
      map['debate_json'] = Variable<String>(debateJson);
    }
    if (!nullToAbsent || clashJson != null) {
      map['clash_json'] = Variable<String>(clashJson);
    }
    if (!nullToAbsent || researchJson != null) {
      map['research_json'] = Variable<String>(researchJson);
    }
    map['created_at'] = Variable<int>(createdAt);
    return map;
  }

  ChatMessageRowsCompanion toCompanion(bool nullToAbsent) {
    return ChatMessageRowsCompanion(
      id: Value(id),
      chatId: Value(chatId),
      role: Value(role),
      content: Value(content),
      thought: thought == null && nullToAbsent
          ? const Value.absent()
          : Value(thought),
      isThinking: isThinking == null && nullToAbsent
          ? const Value.absent()
          : Value(isThinking),
      webSearchStatus: webSearchStatus == null && nullToAbsent
          ? const Value.absent()
          : Value(webSearchStatus),
      webSearchQueriesJson: Value(webSearchQueriesJson),
      researchStatus: researchStatus == null && nullToAbsent
          ? const Value.absent()
          : Value(researchStatus),
      attachmentsJson: Value(attachmentsJson),
      artifactJson: artifactJson == null && nullToAbsent
          ? const Value.absent()
          : Value(artifactJson),
      imageGenerationJson: imageGenerationJson == null && nullToAbsent
          ? const Value.absent()
          : Value(imageGenerationJson),
      debateJson: debateJson == null && nullToAbsent
          ? const Value.absent()
          : Value(debateJson),
      clashJson: clashJson == null && nullToAbsent
          ? const Value.absent()
          : Value(clashJson),
      researchJson: researchJson == null && nullToAbsent
          ? const Value.absent()
          : Value(researchJson),
      createdAt: Value(createdAt),
    );
  }

  factory ChatMessageRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ChatMessageRow(
      id: serializer.fromJson<String>(json['id']),
      chatId: serializer.fromJson<String>(json['chatId']),
      role: serializer.fromJson<String>(json['role']),
      content: serializer.fromJson<String>(json['content']),
      thought: serializer.fromJson<String?>(json['thought']),
      isThinking: serializer.fromJson<bool?>(json['isThinking']),
      webSearchStatus: serializer.fromJson<String?>(json['webSearchStatus']),
      webSearchQueriesJson: serializer.fromJson<String>(
        json['webSearchQueriesJson'],
      ),
      researchStatus: serializer.fromJson<String?>(json['researchStatus']),
      attachmentsJson: serializer.fromJson<String>(json['attachmentsJson']),
      artifactJson: serializer.fromJson<String?>(json['artifactJson']),
      imageGenerationJson: serializer.fromJson<String?>(
        json['imageGenerationJson'],
      ),
      debateJson: serializer.fromJson<String?>(json['debateJson']),
      clashJson: serializer.fromJson<String?>(json['clashJson']),
      researchJson: serializer.fromJson<String?>(json['researchJson']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'chatId': serializer.toJson<String>(chatId),
      'role': serializer.toJson<String>(role),
      'content': serializer.toJson<String>(content),
      'thought': serializer.toJson<String?>(thought),
      'isThinking': serializer.toJson<bool?>(isThinking),
      'webSearchStatus': serializer.toJson<String?>(webSearchStatus),
      'webSearchQueriesJson': serializer.toJson<String>(webSearchQueriesJson),
      'researchStatus': serializer.toJson<String?>(researchStatus),
      'attachmentsJson': serializer.toJson<String>(attachmentsJson),
      'artifactJson': serializer.toJson<String?>(artifactJson),
      'imageGenerationJson': serializer.toJson<String?>(imageGenerationJson),
      'debateJson': serializer.toJson<String?>(debateJson),
      'clashJson': serializer.toJson<String?>(clashJson),
      'researchJson': serializer.toJson<String?>(researchJson),
      'createdAt': serializer.toJson<int>(createdAt),
    };
  }

  ChatMessageRow copyWith({
    String? id,
    String? chatId,
    String? role,
    String? content,
    Value<String?> thought = const Value.absent(),
    Value<bool?> isThinking = const Value.absent(),
    Value<String?> webSearchStatus = const Value.absent(),
    String? webSearchQueriesJson,
    Value<String?> researchStatus = const Value.absent(),
    String? attachmentsJson,
    Value<String?> artifactJson = const Value.absent(),
    Value<String?> imageGenerationJson = const Value.absent(),
    Value<String?> debateJson = const Value.absent(),
    Value<String?> clashJson = const Value.absent(),
    Value<String?> researchJson = const Value.absent(),
    int? createdAt,
  }) => ChatMessageRow(
    id: id ?? this.id,
    chatId: chatId ?? this.chatId,
    role: role ?? this.role,
    content: content ?? this.content,
    thought: thought.present ? thought.value : this.thought,
    isThinking: isThinking.present ? isThinking.value : this.isThinking,
    webSearchStatus: webSearchStatus.present
        ? webSearchStatus.value
        : this.webSearchStatus,
    webSearchQueriesJson: webSearchQueriesJson ?? this.webSearchQueriesJson,
    researchStatus: researchStatus.present
        ? researchStatus.value
        : this.researchStatus,
    attachmentsJson: attachmentsJson ?? this.attachmentsJson,
    artifactJson: artifactJson.present ? artifactJson.value : this.artifactJson,
    imageGenerationJson: imageGenerationJson.present
        ? imageGenerationJson.value
        : this.imageGenerationJson,
    debateJson: debateJson.present ? debateJson.value : this.debateJson,
    clashJson: clashJson.present ? clashJson.value : this.clashJson,
    researchJson: researchJson.present ? researchJson.value : this.researchJson,
    createdAt: createdAt ?? this.createdAt,
  );
  ChatMessageRow copyWithCompanion(ChatMessageRowsCompanion data) {
    return ChatMessageRow(
      id: data.id.present ? data.id.value : this.id,
      chatId: data.chatId.present ? data.chatId.value : this.chatId,
      role: data.role.present ? data.role.value : this.role,
      content: data.content.present ? data.content.value : this.content,
      thought: data.thought.present ? data.thought.value : this.thought,
      isThinking: data.isThinking.present
          ? data.isThinking.value
          : this.isThinking,
      webSearchStatus: data.webSearchStatus.present
          ? data.webSearchStatus.value
          : this.webSearchStatus,
      webSearchQueriesJson: data.webSearchQueriesJson.present
          ? data.webSearchQueriesJson.value
          : this.webSearchQueriesJson,
      researchStatus: data.researchStatus.present
          ? data.researchStatus.value
          : this.researchStatus,
      attachmentsJson: data.attachmentsJson.present
          ? data.attachmentsJson.value
          : this.attachmentsJson,
      artifactJson: data.artifactJson.present
          ? data.artifactJson.value
          : this.artifactJson,
      imageGenerationJson: data.imageGenerationJson.present
          ? data.imageGenerationJson.value
          : this.imageGenerationJson,
      debateJson: data.debateJson.present
          ? data.debateJson.value
          : this.debateJson,
      clashJson: data.clashJson.present ? data.clashJson.value : this.clashJson,
      researchJson: data.researchJson.present
          ? data.researchJson.value
          : this.researchJson,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ChatMessageRow(')
          ..write('id: $id, ')
          ..write('chatId: $chatId, ')
          ..write('role: $role, ')
          ..write('content: $content, ')
          ..write('thought: $thought, ')
          ..write('isThinking: $isThinking, ')
          ..write('webSearchStatus: $webSearchStatus, ')
          ..write('webSearchQueriesJson: $webSearchQueriesJson, ')
          ..write('researchStatus: $researchStatus, ')
          ..write('attachmentsJson: $attachmentsJson, ')
          ..write('artifactJson: $artifactJson, ')
          ..write('imageGenerationJson: $imageGenerationJson, ')
          ..write('debateJson: $debateJson, ')
          ..write('clashJson: $clashJson, ')
          ..write('researchJson: $researchJson, ')
          ..write('createdAt: $createdAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    chatId,
    role,
    content,
    thought,
    isThinking,
    webSearchStatus,
    webSearchQueriesJson,
    researchStatus,
    attachmentsJson,
    artifactJson,
    imageGenerationJson,
    debateJson,
    clashJson,
    researchJson,
    createdAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ChatMessageRow &&
          other.id == this.id &&
          other.chatId == this.chatId &&
          other.role == this.role &&
          other.content == this.content &&
          other.thought == this.thought &&
          other.isThinking == this.isThinking &&
          other.webSearchStatus == this.webSearchStatus &&
          other.webSearchQueriesJson == this.webSearchQueriesJson &&
          other.researchStatus == this.researchStatus &&
          other.attachmentsJson == this.attachmentsJson &&
          other.artifactJson == this.artifactJson &&
          other.imageGenerationJson == this.imageGenerationJson &&
          other.debateJson == this.debateJson &&
          other.clashJson == this.clashJson &&
          other.researchJson == this.researchJson &&
          other.createdAt == this.createdAt);
}

class ChatMessageRowsCompanion extends UpdateCompanion<ChatMessageRow> {
  final Value<String> id;
  final Value<String> chatId;
  final Value<String> role;
  final Value<String> content;
  final Value<String?> thought;
  final Value<bool?> isThinking;
  final Value<String?> webSearchStatus;
  final Value<String> webSearchQueriesJson;
  final Value<String?> researchStatus;
  final Value<String> attachmentsJson;
  final Value<String?> artifactJson;
  final Value<String?> imageGenerationJson;
  final Value<String?> debateJson;
  final Value<String?> clashJson;
  final Value<String?> researchJson;
  final Value<int> createdAt;
  final Value<int> rowid;
  const ChatMessageRowsCompanion({
    this.id = const Value.absent(),
    this.chatId = const Value.absent(),
    this.role = const Value.absent(),
    this.content = const Value.absent(),
    this.thought = const Value.absent(),
    this.isThinking = const Value.absent(),
    this.webSearchStatus = const Value.absent(),
    this.webSearchQueriesJson = const Value.absent(),
    this.researchStatus = const Value.absent(),
    this.attachmentsJson = const Value.absent(),
    this.artifactJson = const Value.absent(),
    this.imageGenerationJson = const Value.absent(),
    this.debateJson = const Value.absent(),
    this.clashJson = const Value.absent(),
    this.researchJson = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ChatMessageRowsCompanion.insert({
    required String id,
    required String chatId,
    required String role,
    required String content,
    this.thought = const Value.absent(),
    this.isThinking = const Value.absent(),
    this.webSearchStatus = const Value.absent(),
    this.webSearchQueriesJson = const Value.absent(),
    this.researchStatus = const Value.absent(),
    this.attachmentsJson = const Value.absent(),
    this.artifactJson = const Value.absent(),
    this.imageGenerationJson = const Value.absent(),
    this.debateJson = const Value.absent(),
    this.clashJson = const Value.absent(),
    this.researchJson = const Value.absent(),
    required int createdAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       chatId = Value(chatId),
       role = Value(role),
       content = Value(content),
       createdAt = Value(createdAt);
  static Insertable<ChatMessageRow> custom({
    Expression<String>? id,
    Expression<String>? chatId,
    Expression<String>? role,
    Expression<String>? content,
    Expression<String>? thought,
    Expression<bool>? isThinking,
    Expression<String>? webSearchStatus,
    Expression<String>? webSearchQueriesJson,
    Expression<String>? researchStatus,
    Expression<String>? attachmentsJson,
    Expression<String>? artifactJson,
    Expression<String>? imageGenerationJson,
    Expression<String>? debateJson,
    Expression<String>? clashJson,
    Expression<String>? researchJson,
    Expression<int>? createdAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (chatId != null) 'chat_id': chatId,
      if (role != null) 'role': role,
      if (content != null) 'content': content,
      if (thought != null) 'thought': thought,
      if (isThinking != null) 'is_thinking': isThinking,
      if (webSearchStatus != null) 'web_search_status': webSearchStatus,
      if (webSearchQueriesJson != null)
        'web_search_queries_json': webSearchQueriesJson,
      if (researchStatus != null) 'research_status': researchStatus,
      if (attachmentsJson != null) 'attachments_json': attachmentsJson,
      if (artifactJson != null) 'artifact_json': artifactJson,
      if (imageGenerationJson != null)
        'image_generation_json': imageGenerationJson,
      if (debateJson != null) 'debate_json': debateJson,
      if (clashJson != null) 'clash_json': clashJson,
      if (researchJson != null) 'research_json': researchJson,
      if (createdAt != null) 'created_at': createdAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ChatMessageRowsCompanion copyWith({
    Value<String>? id,
    Value<String>? chatId,
    Value<String>? role,
    Value<String>? content,
    Value<String?>? thought,
    Value<bool?>? isThinking,
    Value<String?>? webSearchStatus,
    Value<String>? webSearchQueriesJson,
    Value<String?>? researchStatus,
    Value<String>? attachmentsJson,
    Value<String?>? artifactJson,
    Value<String?>? imageGenerationJson,
    Value<String?>? debateJson,
    Value<String?>? clashJson,
    Value<String?>? researchJson,
    Value<int>? createdAt,
    Value<int>? rowid,
  }) {
    return ChatMessageRowsCompanion(
      id: id ?? this.id,
      chatId: chatId ?? this.chatId,
      role: role ?? this.role,
      content: content ?? this.content,
      thought: thought ?? this.thought,
      isThinking: isThinking ?? this.isThinking,
      webSearchStatus: webSearchStatus ?? this.webSearchStatus,
      webSearchQueriesJson: webSearchQueriesJson ?? this.webSearchQueriesJson,
      researchStatus: researchStatus ?? this.researchStatus,
      attachmentsJson: attachmentsJson ?? this.attachmentsJson,
      artifactJson: artifactJson ?? this.artifactJson,
      imageGenerationJson: imageGenerationJson ?? this.imageGenerationJson,
      debateJson: debateJson ?? this.debateJson,
      clashJson: clashJson ?? this.clashJson,
      researchJson: researchJson ?? this.researchJson,
      createdAt: createdAt ?? this.createdAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (chatId.present) {
      map['chat_id'] = Variable<String>(chatId.value);
    }
    if (role.present) {
      map['role'] = Variable<String>(role.value);
    }
    if (content.present) {
      map['content'] = Variable<String>(content.value);
    }
    if (thought.present) {
      map['thought'] = Variable<String>(thought.value);
    }
    if (isThinking.present) {
      map['is_thinking'] = Variable<bool>(isThinking.value);
    }
    if (webSearchStatus.present) {
      map['web_search_status'] = Variable<String>(webSearchStatus.value);
    }
    if (webSearchQueriesJson.present) {
      map['web_search_queries_json'] = Variable<String>(
        webSearchQueriesJson.value,
      );
    }
    if (researchStatus.present) {
      map['research_status'] = Variable<String>(researchStatus.value);
    }
    if (attachmentsJson.present) {
      map['attachments_json'] = Variable<String>(attachmentsJson.value);
    }
    if (artifactJson.present) {
      map['artifact_json'] = Variable<String>(artifactJson.value);
    }
    if (imageGenerationJson.present) {
      map['image_generation_json'] = Variable<String>(
        imageGenerationJson.value,
      );
    }
    if (debateJson.present) {
      map['debate_json'] = Variable<String>(debateJson.value);
    }
    if (clashJson.present) {
      map['clash_json'] = Variable<String>(clashJson.value);
    }
    if (researchJson.present) {
      map['research_json'] = Variable<String>(researchJson.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ChatMessageRowsCompanion(')
          ..write('id: $id, ')
          ..write('chatId: $chatId, ')
          ..write('role: $role, ')
          ..write('content: $content, ')
          ..write('thought: $thought, ')
          ..write('isThinking: $isThinking, ')
          ..write('webSearchStatus: $webSearchStatus, ')
          ..write('webSearchQueriesJson: $webSearchQueriesJson, ')
          ..write('researchStatus: $researchStatus, ')
          ..write('attachmentsJson: $attachmentsJson, ')
          ..write('artifactJson: $artifactJson, ')
          ..write('imageGenerationJson: $imageGenerationJson, ')
          ..write('debateJson: $debateJson, ')
          ..write('clashJson: $clashJson, ')
          ..write('researchJson: $researchJson, ')
          ..write('createdAt: $createdAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $ArtifactRowsTable extends ArtifactRows
    with TableInfo<$ArtifactRowsTable, ArtifactRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $ArtifactRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _chatIdMeta = const VerificationMeta('chatId');
  @override
  late final GeneratedColumn<String> chatId = GeneratedColumn<String>(
    'chat_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES chat_rows (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _messageIdMeta = const VerificationMeta(
    'messageId',
  );
  @override
  late final GeneratedColumn<String> messageId = GeneratedColumn<String>(
    'message_id',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _kindMeta = const VerificationMeta('kind');
  @override
  late final GeneratedColumn<String> kind = GeneratedColumn<String>(
    'kind',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _languageMeta = const VerificationMeta(
    'language',
  );
  @override
  late final GeneratedColumn<String> language = GeneratedColumn<String>(
    'language',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _contentMeta = const VerificationMeta(
    'content',
  );
  @override
  late final GeneratedColumn<String> content = GeneratedColumn<String>(
    'content',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    chatId,
    messageId,
    kind,
    title,
    language,
    content,
    status,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'artifact_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<ArtifactRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('chat_id')) {
      context.handle(
        _chatIdMeta,
        chatId.isAcceptableOrUnknown(data['chat_id']!, _chatIdMeta),
      );
    } else if (isInserting) {
      context.missing(_chatIdMeta);
    }
    if (data.containsKey('message_id')) {
      context.handle(
        _messageIdMeta,
        messageId.isAcceptableOrUnknown(data['message_id']!, _messageIdMeta),
      );
    }
    if (data.containsKey('kind')) {
      context.handle(
        _kindMeta,
        kind.isAcceptableOrUnknown(data['kind']!, _kindMeta),
      );
    } else if (isInserting) {
      context.missing(_kindMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('language')) {
      context.handle(
        _languageMeta,
        language.isAcceptableOrUnknown(data['language']!, _languageMeta),
      );
    }
    if (data.containsKey('content')) {
      context.handle(
        _contentMeta,
        content.isAcceptableOrUnknown(data['content']!, _contentMeta),
      );
    } else if (isInserting) {
      context.missing(_contentMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  ArtifactRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return ArtifactRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      chatId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}chat_id'],
      )!,
      messageId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}message_id'],
      ),
      kind: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}kind'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      language: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}language'],
      ),
      content: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}content'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $ArtifactRowsTable createAlias(String alias) {
    return $ArtifactRowsTable(attachedDatabase, alias);
  }
}

class ArtifactRow extends DataClass implements Insertable<ArtifactRow> {
  final String id;
  final String chatId;
  final String? messageId;
  final String kind;
  final String title;
  final String? language;
  final String content;
  final String status;
  final int createdAt;
  final int updatedAt;
  const ArtifactRow({
    required this.id,
    required this.chatId,
    this.messageId,
    required this.kind,
    required this.title,
    this.language,
    required this.content,
    required this.status,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['chat_id'] = Variable<String>(chatId);
    if (!nullToAbsent || messageId != null) {
      map['message_id'] = Variable<String>(messageId);
    }
    map['kind'] = Variable<String>(kind);
    map['title'] = Variable<String>(title);
    if (!nullToAbsent || language != null) {
      map['language'] = Variable<String>(language);
    }
    map['content'] = Variable<String>(content);
    map['status'] = Variable<String>(status);
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  ArtifactRowsCompanion toCompanion(bool nullToAbsent) {
    return ArtifactRowsCompanion(
      id: Value(id),
      chatId: Value(chatId),
      messageId: messageId == null && nullToAbsent
          ? const Value.absent()
          : Value(messageId),
      kind: Value(kind),
      title: Value(title),
      language: language == null && nullToAbsent
          ? const Value.absent()
          : Value(language),
      content: Value(content),
      status: Value(status),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory ArtifactRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return ArtifactRow(
      id: serializer.fromJson<String>(json['id']),
      chatId: serializer.fromJson<String>(json['chatId']),
      messageId: serializer.fromJson<String?>(json['messageId']),
      kind: serializer.fromJson<String>(json['kind']),
      title: serializer.fromJson<String>(json['title']),
      language: serializer.fromJson<String?>(json['language']),
      content: serializer.fromJson<String>(json['content']),
      status: serializer.fromJson<String>(json['status']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'chatId': serializer.toJson<String>(chatId),
      'messageId': serializer.toJson<String?>(messageId),
      'kind': serializer.toJson<String>(kind),
      'title': serializer.toJson<String>(title),
      'language': serializer.toJson<String?>(language),
      'content': serializer.toJson<String>(content),
      'status': serializer.toJson<String>(status),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  ArtifactRow copyWith({
    String? id,
    String? chatId,
    Value<String?> messageId = const Value.absent(),
    String? kind,
    String? title,
    Value<String?> language = const Value.absent(),
    String? content,
    String? status,
    int? createdAt,
    int? updatedAt,
  }) => ArtifactRow(
    id: id ?? this.id,
    chatId: chatId ?? this.chatId,
    messageId: messageId.present ? messageId.value : this.messageId,
    kind: kind ?? this.kind,
    title: title ?? this.title,
    language: language.present ? language.value : this.language,
    content: content ?? this.content,
    status: status ?? this.status,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  ArtifactRow copyWithCompanion(ArtifactRowsCompanion data) {
    return ArtifactRow(
      id: data.id.present ? data.id.value : this.id,
      chatId: data.chatId.present ? data.chatId.value : this.chatId,
      messageId: data.messageId.present ? data.messageId.value : this.messageId,
      kind: data.kind.present ? data.kind.value : this.kind,
      title: data.title.present ? data.title.value : this.title,
      language: data.language.present ? data.language.value : this.language,
      content: data.content.present ? data.content.value : this.content,
      status: data.status.present ? data.status.value : this.status,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('ArtifactRow(')
          ..write('id: $id, ')
          ..write('chatId: $chatId, ')
          ..write('messageId: $messageId, ')
          ..write('kind: $kind, ')
          ..write('title: $title, ')
          ..write('language: $language, ')
          ..write('content: $content, ')
          ..write('status: $status, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    chatId,
    messageId,
    kind,
    title,
    language,
    content,
    status,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is ArtifactRow &&
          other.id == this.id &&
          other.chatId == this.chatId &&
          other.messageId == this.messageId &&
          other.kind == this.kind &&
          other.title == this.title &&
          other.language == this.language &&
          other.content == this.content &&
          other.status == this.status &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class ArtifactRowsCompanion extends UpdateCompanion<ArtifactRow> {
  final Value<String> id;
  final Value<String> chatId;
  final Value<String?> messageId;
  final Value<String> kind;
  final Value<String> title;
  final Value<String?> language;
  final Value<String> content;
  final Value<String> status;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const ArtifactRowsCompanion({
    this.id = const Value.absent(),
    this.chatId = const Value.absent(),
    this.messageId = const Value.absent(),
    this.kind = const Value.absent(),
    this.title = const Value.absent(),
    this.language = const Value.absent(),
    this.content = const Value.absent(),
    this.status = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  ArtifactRowsCompanion.insert({
    required String id,
    required String chatId,
    this.messageId = const Value.absent(),
    required String kind,
    required String title,
    this.language = const Value.absent(),
    required String content,
    required String status,
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       chatId = Value(chatId),
       kind = Value(kind),
       title = Value(title),
       content = Value(content),
       status = Value(status),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<ArtifactRow> custom({
    Expression<String>? id,
    Expression<String>? chatId,
    Expression<String>? messageId,
    Expression<String>? kind,
    Expression<String>? title,
    Expression<String>? language,
    Expression<String>? content,
    Expression<String>? status,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (chatId != null) 'chat_id': chatId,
      if (messageId != null) 'message_id': messageId,
      if (kind != null) 'kind': kind,
      if (title != null) 'title': title,
      if (language != null) 'language': language,
      if (content != null) 'content': content,
      if (status != null) 'status': status,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  ArtifactRowsCompanion copyWith({
    Value<String>? id,
    Value<String>? chatId,
    Value<String?>? messageId,
    Value<String>? kind,
    Value<String>? title,
    Value<String?>? language,
    Value<String>? content,
    Value<String>? status,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return ArtifactRowsCompanion(
      id: id ?? this.id,
      chatId: chatId ?? this.chatId,
      messageId: messageId ?? this.messageId,
      kind: kind ?? this.kind,
      title: title ?? this.title,
      language: language ?? this.language,
      content: content ?? this.content,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (chatId.present) {
      map['chat_id'] = Variable<String>(chatId.value);
    }
    if (messageId.present) {
      map['message_id'] = Variable<String>(messageId.value);
    }
    if (kind.present) {
      map['kind'] = Variable<String>(kind.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (language.present) {
      map['language'] = Variable<String>(language.value);
    }
    if (content.present) {
      map['content'] = Variable<String>(content.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('ArtifactRowsCompanion(')
          ..write('id: $id, ')
          ..write('chatId: $chatId, ')
          ..write('messageId: $messageId, ')
          ..write('kind: $kind, ')
          ..write('title: $title, ')
          ..write('language: $language, ')
          ..write('content: $content, ')
          ..write('status: $status, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $WebDevProjectRowsTable extends WebDevProjectRows
    with TableInfo<$WebDevProjectRowsTable, WebDevProjectRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $WebDevProjectRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _statusMeta = const VerificationMeta('status');
  @override
  late final GeneratedColumn<String> status = GeneratedColumn<String>(
    'status',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _isStarredMeta = const VerificationMeta(
    'isStarred',
  );
  @override
  late final GeneratedColumn<bool> isStarred = GeneratedColumn<bool>(
    'is_starred',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_starred" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _previewUrlMeta = const VerificationMeta(
    'previewUrl',
  );
  @override
  late final GeneratedColumn<String> previewUrl = GeneratedColumn<String>(
    'preview_url',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    title,
    status,
    isStarred,
    previewUrl,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'web_dev_project_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<WebDevProjectRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('status')) {
      context.handle(
        _statusMeta,
        status.isAcceptableOrUnknown(data['status']!, _statusMeta),
      );
    } else if (isInserting) {
      context.missing(_statusMeta);
    }
    if (data.containsKey('is_starred')) {
      context.handle(
        _isStarredMeta,
        isStarred.isAcceptableOrUnknown(data['is_starred']!, _isStarredMeta),
      );
    }
    if (data.containsKey('preview_url')) {
      context.handle(
        _previewUrlMeta,
        previewUrl.isAcceptableOrUnknown(data['preview_url']!, _previewUrlMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  WebDevProjectRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return WebDevProjectRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      status: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}status'],
      )!,
      isStarred: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_starred'],
      )!,
      previewUrl: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}preview_url'],
      ),
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $WebDevProjectRowsTable createAlias(String alias) {
    return $WebDevProjectRowsTable(attachedDatabase, alias);
  }
}

class WebDevProjectRow extends DataClass
    implements Insertable<WebDevProjectRow> {
  final String id;
  final String title;
  final String status;
  final bool isStarred;
  final String? previewUrl;
  final int createdAt;
  final int updatedAt;
  const WebDevProjectRow({
    required this.id,
    required this.title,
    required this.status,
    required this.isStarred,
    this.previewUrl,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['title'] = Variable<String>(title);
    map['status'] = Variable<String>(status);
    map['is_starred'] = Variable<bool>(isStarred);
    if (!nullToAbsent || previewUrl != null) {
      map['preview_url'] = Variable<String>(previewUrl);
    }
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  WebDevProjectRowsCompanion toCompanion(bool nullToAbsent) {
    return WebDevProjectRowsCompanion(
      id: Value(id),
      title: Value(title),
      status: Value(status),
      isStarred: Value(isStarred),
      previewUrl: previewUrl == null && nullToAbsent
          ? const Value.absent()
          : Value(previewUrl),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory WebDevProjectRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return WebDevProjectRow(
      id: serializer.fromJson<String>(json['id']),
      title: serializer.fromJson<String>(json['title']),
      status: serializer.fromJson<String>(json['status']),
      isStarred: serializer.fromJson<bool>(json['isStarred']),
      previewUrl: serializer.fromJson<String?>(json['previewUrl']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'title': serializer.toJson<String>(title),
      'status': serializer.toJson<String>(status),
      'isStarred': serializer.toJson<bool>(isStarred),
      'previewUrl': serializer.toJson<String?>(previewUrl),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  WebDevProjectRow copyWith({
    String? id,
    String? title,
    String? status,
    bool? isStarred,
    Value<String?> previewUrl = const Value.absent(),
    int? createdAt,
    int? updatedAt,
  }) => WebDevProjectRow(
    id: id ?? this.id,
    title: title ?? this.title,
    status: status ?? this.status,
    isStarred: isStarred ?? this.isStarred,
    previewUrl: previewUrl.present ? previewUrl.value : this.previewUrl,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  WebDevProjectRow copyWithCompanion(WebDevProjectRowsCompanion data) {
    return WebDevProjectRow(
      id: data.id.present ? data.id.value : this.id,
      title: data.title.present ? data.title.value : this.title,
      status: data.status.present ? data.status.value : this.status,
      isStarred: data.isStarred.present ? data.isStarred.value : this.isStarred,
      previewUrl: data.previewUrl.present
          ? data.previewUrl.value
          : this.previewUrl,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('WebDevProjectRow(')
          ..write('id: $id, ')
          ..write('title: $title, ')
          ..write('status: $status, ')
          ..write('isStarred: $isStarred, ')
          ..write('previewUrl: $previewUrl, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    title,
    status,
    isStarred,
    previewUrl,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is WebDevProjectRow &&
          other.id == this.id &&
          other.title == this.title &&
          other.status == this.status &&
          other.isStarred == this.isStarred &&
          other.previewUrl == this.previewUrl &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class WebDevProjectRowsCompanion extends UpdateCompanion<WebDevProjectRow> {
  final Value<String> id;
  final Value<String> title;
  final Value<String> status;
  final Value<bool> isStarred;
  final Value<String?> previewUrl;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const WebDevProjectRowsCompanion({
    this.id = const Value.absent(),
    this.title = const Value.absent(),
    this.status = const Value.absent(),
    this.isStarred = const Value.absent(),
    this.previewUrl = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  WebDevProjectRowsCompanion.insert({
    required String id,
    required String title,
    required String status,
    this.isStarred = const Value.absent(),
    this.previewUrl = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       title = Value(title),
       status = Value(status),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<WebDevProjectRow> custom({
    Expression<String>? id,
    Expression<String>? title,
    Expression<String>? status,
    Expression<bool>? isStarred,
    Expression<String>? previewUrl,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (title != null) 'title': title,
      if (status != null) 'status': status,
      if (isStarred != null) 'is_starred': isStarred,
      if (previewUrl != null) 'preview_url': previewUrl,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  WebDevProjectRowsCompanion copyWith({
    Value<String>? id,
    Value<String>? title,
    Value<String>? status,
    Value<bool>? isStarred,
    Value<String?>? previewUrl,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return WebDevProjectRowsCompanion(
      id: id ?? this.id,
      title: title ?? this.title,
      status: status ?? this.status,
      isStarred: isStarred ?? this.isStarred,
      previewUrl: previewUrl ?? this.previewUrl,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (status.present) {
      map['status'] = Variable<String>(status.value);
    }
    if (isStarred.present) {
      map['is_starred'] = Variable<bool>(isStarred.value);
    }
    if (previewUrl.present) {
      map['preview_url'] = Variable<String>(previewUrl.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('WebDevProjectRowsCompanion(')
          ..write('id: $id, ')
          ..write('title: $title, ')
          ..write('status: $status, ')
          ..write('isStarred: $isStarred, ')
          ..write('previewUrl: $previewUrl, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $WebDevThreadRowsTable extends WebDevThreadRows
    with TableInfo<$WebDevThreadRowsTable, WebDevThreadRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $WebDevThreadRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _projectIdMeta = const VerificationMeta(
    'projectId',
  );
  @override
  late final GeneratedColumn<String> projectId = GeneratedColumn<String>(
    'project_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES web_dev_project_rows (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _isStarredMeta = const VerificationMeta(
    'isStarred',
  );
  @override
  late final GeneratedColumn<bool> isStarred = GeneratedColumn<bool>(
    'is_starred',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_starred" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    projectId,
    title,
    isStarred,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'web_dev_thread_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<WebDevThreadRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('project_id')) {
      context.handle(
        _projectIdMeta,
        projectId.isAcceptableOrUnknown(data['project_id']!, _projectIdMeta),
      );
    } else if (isInserting) {
      context.missing(_projectIdMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('is_starred')) {
      context.handle(
        _isStarredMeta,
        isStarred.isAcceptableOrUnknown(data['is_starred']!, _isStarredMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  WebDevThreadRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return WebDevThreadRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      projectId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}project_id'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      isStarred: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_starred'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $WebDevThreadRowsTable createAlias(String alias) {
    return $WebDevThreadRowsTable(attachedDatabase, alias);
  }
}

class WebDevThreadRow extends DataClass implements Insertable<WebDevThreadRow> {
  final String id;
  final String projectId;
  final String title;
  final bool isStarred;
  final int createdAt;
  final int updatedAt;
  const WebDevThreadRow({
    required this.id,
    required this.projectId,
    required this.title,
    required this.isStarred,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['project_id'] = Variable<String>(projectId);
    map['title'] = Variable<String>(title);
    map['is_starred'] = Variable<bool>(isStarred);
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  WebDevThreadRowsCompanion toCompanion(bool nullToAbsent) {
    return WebDevThreadRowsCompanion(
      id: Value(id),
      projectId: Value(projectId),
      title: Value(title),
      isStarred: Value(isStarred),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory WebDevThreadRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return WebDevThreadRow(
      id: serializer.fromJson<String>(json['id']),
      projectId: serializer.fromJson<String>(json['projectId']),
      title: serializer.fromJson<String>(json['title']),
      isStarred: serializer.fromJson<bool>(json['isStarred']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'projectId': serializer.toJson<String>(projectId),
      'title': serializer.toJson<String>(title),
      'isStarred': serializer.toJson<bool>(isStarred),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  WebDevThreadRow copyWith({
    String? id,
    String? projectId,
    String? title,
    bool? isStarred,
    int? createdAt,
    int? updatedAt,
  }) => WebDevThreadRow(
    id: id ?? this.id,
    projectId: projectId ?? this.projectId,
    title: title ?? this.title,
    isStarred: isStarred ?? this.isStarred,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  WebDevThreadRow copyWithCompanion(WebDevThreadRowsCompanion data) {
    return WebDevThreadRow(
      id: data.id.present ? data.id.value : this.id,
      projectId: data.projectId.present ? data.projectId.value : this.projectId,
      title: data.title.present ? data.title.value : this.title,
      isStarred: data.isStarred.present ? data.isStarred.value : this.isStarred,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('WebDevThreadRow(')
          ..write('id: $id, ')
          ..write('projectId: $projectId, ')
          ..write('title: $title, ')
          ..write('isStarred: $isStarred, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode =>
      Object.hash(id, projectId, title, isStarred, createdAt, updatedAt);
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is WebDevThreadRow &&
          other.id == this.id &&
          other.projectId == this.projectId &&
          other.title == this.title &&
          other.isStarred == this.isStarred &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class WebDevThreadRowsCompanion extends UpdateCompanion<WebDevThreadRow> {
  final Value<String> id;
  final Value<String> projectId;
  final Value<String> title;
  final Value<bool> isStarred;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const WebDevThreadRowsCompanion({
    this.id = const Value.absent(),
    this.projectId = const Value.absent(),
    this.title = const Value.absent(),
    this.isStarred = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  WebDevThreadRowsCompanion.insert({
    required String id,
    required String projectId,
    required String title,
    this.isStarred = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       projectId = Value(projectId),
       title = Value(title),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<WebDevThreadRow> custom({
    Expression<String>? id,
    Expression<String>? projectId,
    Expression<String>? title,
    Expression<bool>? isStarred,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (projectId != null) 'project_id': projectId,
      if (title != null) 'title': title,
      if (isStarred != null) 'is_starred': isStarred,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  WebDevThreadRowsCompanion copyWith({
    Value<String>? id,
    Value<String>? projectId,
    Value<String>? title,
    Value<bool>? isStarred,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return WebDevThreadRowsCompanion(
      id: id ?? this.id,
      projectId: projectId ?? this.projectId,
      title: title ?? this.title,
      isStarred: isStarred ?? this.isStarred,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (projectId.present) {
      map['project_id'] = Variable<String>(projectId.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (isStarred.present) {
      map['is_starred'] = Variable<bool>(isStarred.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('WebDevThreadRowsCompanion(')
          ..write('id: $id, ')
          ..write('projectId: $projectId, ')
          ..write('title: $title, ')
          ..write('isStarred: $isStarred, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CharacterRowsTable extends CharacterRows
    with TableInfo<$CharacterRowsTable, CharacterRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CharacterRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _nameMeta = const VerificationMeta('name');
  @override
  late final GeneratedColumn<String> name = GeneratedColumn<String>(
    'name',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _avatarMeta = const VerificationMeta('avatar');
  @override
  late final GeneratedColumn<String> avatar = GeneratedColumn<String>(
    'avatar',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _colorMeta = const VerificationMeta('color');
  @override
  late final GeneratedColumn<int> color = GeneratedColumn<int>(
    'color',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _taglineMeta = const VerificationMeta(
    'tagline',
  );
  @override
  late final GeneratedColumn<String> tagline = GeneratedColumn<String>(
    'tagline',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _categoryMeta = const VerificationMeta(
    'category',
  );
  @override
  late final GeneratedColumn<String> category = GeneratedColumn<String>(
    'category',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _greetingMeta = const VerificationMeta(
    'greeting',
  );
  @override
  late final GeneratedColumn<String> greeting = GeneratedColumn<String>(
    'greeting',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _personalityMeta = const VerificationMeta(
    'personality',
  );
  @override
  late final GeneratedColumn<String> personality = GeneratedColumn<String>(
    'personality',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _speakingStyleMeta = const VerificationMeta(
    'speakingStyle',
  );
  @override
  late final GeneratedColumn<String> speakingStyle = GeneratedColumn<String>(
    'speaking_style',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _boundariesMeta = const VerificationMeta(
    'boundaries',
  );
  @override
  late final GeneratedColumn<String> boundaries = GeneratedColumn<String>(
    'boundaries',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _exampleDialogueMeta = const VerificationMeta(
    'exampleDialogue',
  );
  @override
  late final GeneratedColumn<String> exampleDialogue = GeneratedColumn<String>(
    'example_dialogue',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant(''),
  );
  static const VerificationMeta _visibilityMeta = const VerificationMeta(
    'visibility',
  );
  @override
  late final GeneratedColumn<String> visibility = GeneratedColumn<String>(
    'visibility',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
    defaultValue: const Constant('private'),
  );
  static const VerificationMeta _isStarredMeta = const VerificationMeta(
    'isStarred',
  );
  @override
  late final GeneratedColumn<bool> isStarred = GeneratedColumn<bool>(
    'is_starred',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_starred" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    name,
    avatar,
    color,
    tagline,
    category,
    greeting,
    personality,
    speakingStyle,
    boundaries,
    exampleDialogue,
    visibility,
    isStarred,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'character_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<CharacterRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('name')) {
      context.handle(
        _nameMeta,
        name.isAcceptableOrUnknown(data['name']!, _nameMeta),
      );
    } else if (isInserting) {
      context.missing(_nameMeta);
    }
    if (data.containsKey('avatar')) {
      context.handle(
        _avatarMeta,
        avatar.isAcceptableOrUnknown(data['avatar']!, _avatarMeta),
      );
    } else if (isInserting) {
      context.missing(_avatarMeta);
    }
    if (data.containsKey('color')) {
      context.handle(
        _colorMeta,
        color.isAcceptableOrUnknown(data['color']!, _colorMeta),
      );
    } else if (isInserting) {
      context.missing(_colorMeta);
    }
    if (data.containsKey('tagline')) {
      context.handle(
        _taglineMeta,
        tagline.isAcceptableOrUnknown(data['tagline']!, _taglineMeta),
      );
    } else if (isInserting) {
      context.missing(_taglineMeta);
    }
    if (data.containsKey('category')) {
      context.handle(
        _categoryMeta,
        category.isAcceptableOrUnknown(data['category']!, _categoryMeta),
      );
    } else if (isInserting) {
      context.missing(_categoryMeta);
    }
    if (data.containsKey('greeting')) {
      context.handle(
        _greetingMeta,
        greeting.isAcceptableOrUnknown(data['greeting']!, _greetingMeta),
      );
    } else if (isInserting) {
      context.missing(_greetingMeta);
    }
    if (data.containsKey('personality')) {
      context.handle(
        _personalityMeta,
        personality.isAcceptableOrUnknown(
          data['personality']!,
          _personalityMeta,
        ),
      );
    }
    if (data.containsKey('speaking_style')) {
      context.handle(
        _speakingStyleMeta,
        speakingStyle.isAcceptableOrUnknown(
          data['speaking_style']!,
          _speakingStyleMeta,
        ),
      );
    }
    if (data.containsKey('boundaries')) {
      context.handle(
        _boundariesMeta,
        boundaries.isAcceptableOrUnknown(data['boundaries']!, _boundariesMeta),
      );
    }
    if (data.containsKey('example_dialogue')) {
      context.handle(
        _exampleDialogueMeta,
        exampleDialogue.isAcceptableOrUnknown(
          data['example_dialogue']!,
          _exampleDialogueMeta,
        ),
      );
    }
    if (data.containsKey('visibility')) {
      context.handle(
        _visibilityMeta,
        visibility.isAcceptableOrUnknown(data['visibility']!, _visibilityMeta),
      );
    }
    if (data.containsKey('is_starred')) {
      context.handle(
        _isStarredMeta,
        isStarred.isAcceptableOrUnknown(data['is_starred']!, _isStarredMeta),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CharacterRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CharacterRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      name: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}name'],
      )!,
      avatar: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}avatar'],
      )!,
      color: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}color'],
      )!,
      tagline: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}tagline'],
      )!,
      category: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}category'],
      )!,
      greeting: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}greeting'],
      )!,
      personality: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}personality'],
      )!,
      speakingStyle: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}speaking_style'],
      )!,
      boundaries: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}boundaries'],
      )!,
      exampleDialogue: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}example_dialogue'],
      )!,
      visibility: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}visibility'],
      )!,
      isStarred: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_starred'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $CharacterRowsTable createAlias(String alias) {
    return $CharacterRowsTable(attachedDatabase, alias);
  }
}

class CharacterRow extends DataClass implements Insertable<CharacterRow> {
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
  final int createdAt;
  final int updatedAt;
  const CharacterRow({
    required this.id,
    required this.name,
    required this.avatar,
    required this.color,
    required this.tagline,
    required this.category,
    required this.greeting,
    required this.personality,
    required this.speakingStyle,
    required this.boundaries,
    required this.exampleDialogue,
    required this.visibility,
    required this.isStarred,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['name'] = Variable<String>(name);
    map['avatar'] = Variable<String>(avatar);
    map['color'] = Variable<int>(color);
    map['tagline'] = Variable<String>(tagline);
    map['category'] = Variable<String>(category);
    map['greeting'] = Variable<String>(greeting);
    map['personality'] = Variable<String>(personality);
    map['speaking_style'] = Variable<String>(speakingStyle);
    map['boundaries'] = Variable<String>(boundaries);
    map['example_dialogue'] = Variable<String>(exampleDialogue);
    map['visibility'] = Variable<String>(visibility);
    map['is_starred'] = Variable<bool>(isStarred);
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  CharacterRowsCompanion toCompanion(bool nullToAbsent) {
    return CharacterRowsCompanion(
      id: Value(id),
      name: Value(name),
      avatar: Value(avatar),
      color: Value(color),
      tagline: Value(tagline),
      category: Value(category),
      greeting: Value(greeting),
      personality: Value(personality),
      speakingStyle: Value(speakingStyle),
      boundaries: Value(boundaries),
      exampleDialogue: Value(exampleDialogue),
      visibility: Value(visibility),
      isStarred: Value(isStarred),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory CharacterRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CharacterRow(
      id: serializer.fromJson<String>(json['id']),
      name: serializer.fromJson<String>(json['name']),
      avatar: serializer.fromJson<String>(json['avatar']),
      color: serializer.fromJson<int>(json['color']),
      tagline: serializer.fromJson<String>(json['tagline']),
      category: serializer.fromJson<String>(json['category']),
      greeting: serializer.fromJson<String>(json['greeting']),
      personality: serializer.fromJson<String>(json['personality']),
      speakingStyle: serializer.fromJson<String>(json['speakingStyle']),
      boundaries: serializer.fromJson<String>(json['boundaries']),
      exampleDialogue: serializer.fromJson<String>(json['exampleDialogue']),
      visibility: serializer.fromJson<String>(json['visibility']),
      isStarred: serializer.fromJson<bool>(json['isStarred']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'name': serializer.toJson<String>(name),
      'avatar': serializer.toJson<String>(avatar),
      'color': serializer.toJson<int>(color),
      'tagline': serializer.toJson<String>(tagline),
      'category': serializer.toJson<String>(category),
      'greeting': serializer.toJson<String>(greeting),
      'personality': serializer.toJson<String>(personality),
      'speakingStyle': serializer.toJson<String>(speakingStyle),
      'boundaries': serializer.toJson<String>(boundaries),
      'exampleDialogue': serializer.toJson<String>(exampleDialogue),
      'visibility': serializer.toJson<String>(visibility),
      'isStarred': serializer.toJson<bool>(isStarred),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  CharacterRow copyWith({
    String? id,
    String? name,
    String? avatar,
    int? color,
    String? tagline,
    String? category,
    String? greeting,
    String? personality,
    String? speakingStyle,
    String? boundaries,
    String? exampleDialogue,
    String? visibility,
    bool? isStarred,
    int? createdAt,
    int? updatedAt,
  }) => CharacterRow(
    id: id ?? this.id,
    name: name ?? this.name,
    avatar: avatar ?? this.avatar,
    color: color ?? this.color,
    tagline: tagline ?? this.tagline,
    category: category ?? this.category,
    greeting: greeting ?? this.greeting,
    personality: personality ?? this.personality,
    speakingStyle: speakingStyle ?? this.speakingStyle,
    boundaries: boundaries ?? this.boundaries,
    exampleDialogue: exampleDialogue ?? this.exampleDialogue,
    visibility: visibility ?? this.visibility,
    isStarred: isStarred ?? this.isStarred,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  CharacterRow copyWithCompanion(CharacterRowsCompanion data) {
    return CharacterRow(
      id: data.id.present ? data.id.value : this.id,
      name: data.name.present ? data.name.value : this.name,
      avatar: data.avatar.present ? data.avatar.value : this.avatar,
      color: data.color.present ? data.color.value : this.color,
      tagline: data.tagline.present ? data.tagline.value : this.tagline,
      category: data.category.present ? data.category.value : this.category,
      greeting: data.greeting.present ? data.greeting.value : this.greeting,
      personality: data.personality.present
          ? data.personality.value
          : this.personality,
      speakingStyle: data.speakingStyle.present
          ? data.speakingStyle.value
          : this.speakingStyle,
      boundaries: data.boundaries.present
          ? data.boundaries.value
          : this.boundaries,
      exampleDialogue: data.exampleDialogue.present
          ? data.exampleDialogue.value
          : this.exampleDialogue,
      visibility: data.visibility.present
          ? data.visibility.value
          : this.visibility,
      isStarred: data.isStarred.present ? data.isStarred.value : this.isStarred,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CharacterRow(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('avatar: $avatar, ')
          ..write('color: $color, ')
          ..write('tagline: $tagline, ')
          ..write('category: $category, ')
          ..write('greeting: $greeting, ')
          ..write('personality: $personality, ')
          ..write('speakingStyle: $speakingStyle, ')
          ..write('boundaries: $boundaries, ')
          ..write('exampleDialogue: $exampleDialogue, ')
          ..write('visibility: $visibility, ')
          ..write('isStarred: $isStarred, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    name,
    avatar,
    color,
    tagline,
    category,
    greeting,
    personality,
    speakingStyle,
    boundaries,
    exampleDialogue,
    visibility,
    isStarred,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CharacterRow &&
          other.id == this.id &&
          other.name == this.name &&
          other.avatar == this.avatar &&
          other.color == this.color &&
          other.tagline == this.tagline &&
          other.category == this.category &&
          other.greeting == this.greeting &&
          other.personality == this.personality &&
          other.speakingStyle == this.speakingStyle &&
          other.boundaries == this.boundaries &&
          other.exampleDialogue == this.exampleDialogue &&
          other.visibility == this.visibility &&
          other.isStarred == this.isStarred &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class CharacterRowsCompanion extends UpdateCompanion<CharacterRow> {
  final Value<String> id;
  final Value<String> name;
  final Value<String> avatar;
  final Value<int> color;
  final Value<String> tagline;
  final Value<String> category;
  final Value<String> greeting;
  final Value<String> personality;
  final Value<String> speakingStyle;
  final Value<String> boundaries;
  final Value<String> exampleDialogue;
  final Value<String> visibility;
  final Value<bool> isStarred;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const CharacterRowsCompanion({
    this.id = const Value.absent(),
    this.name = const Value.absent(),
    this.avatar = const Value.absent(),
    this.color = const Value.absent(),
    this.tagline = const Value.absent(),
    this.category = const Value.absent(),
    this.greeting = const Value.absent(),
    this.personality = const Value.absent(),
    this.speakingStyle = const Value.absent(),
    this.boundaries = const Value.absent(),
    this.exampleDialogue = const Value.absent(),
    this.visibility = const Value.absent(),
    this.isStarred = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CharacterRowsCompanion.insert({
    required String id,
    required String name,
    required String avatar,
    required int color,
    required String tagline,
    required String category,
    required String greeting,
    this.personality = const Value.absent(),
    this.speakingStyle = const Value.absent(),
    this.boundaries = const Value.absent(),
    this.exampleDialogue = const Value.absent(),
    this.visibility = const Value.absent(),
    this.isStarred = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       name = Value(name),
       avatar = Value(avatar),
       color = Value(color),
       tagline = Value(tagline),
       category = Value(category),
       greeting = Value(greeting),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<CharacterRow> custom({
    Expression<String>? id,
    Expression<String>? name,
    Expression<String>? avatar,
    Expression<int>? color,
    Expression<String>? tagline,
    Expression<String>? category,
    Expression<String>? greeting,
    Expression<String>? personality,
    Expression<String>? speakingStyle,
    Expression<String>? boundaries,
    Expression<String>? exampleDialogue,
    Expression<String>? visibility,
    Expression<bool>? isStarred,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (name != null) 'name': name,
      if (avatar != null) 'avatar': avatar,
      if (color != null) 'color': color,
      if (tagline != null) 'tagline': tagline,
      if (category != null) 'category': category,
      if (greeting != null) 'greeting': greeting,
      if (personality != null) 'personality': personality,
      if (speakingStyle != null) 'speaking_style': speakingStyle,
      if (boundaries != null) 'boundaries': boundaries,
      if (exampleDialogue != null) 'example_dialogue': exampleDialogue,
      if (visibility != null) 'visibility': visibility,
      if (isStarred != null) 'is_starred': isStarred,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CharacterRowsCompanion copyWith({
    Value<String>? id,
    Value<String>? name,
    Value<String>? avatar,
    Value<int>? color,
    Value<String>? tagline,
    Value<String>? category,
    Value<String>? greeting,
    Value<String>? personality,
    Value<String>? speakingStyle,
    Value<String>? boundaries,
    Value<String>? exampleDialogue,
    Value<String>? visibility,
    Value<bool>? isStarred,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return CharacterRowsCompanion(
      id: id ?? this.id,
      name: name ?? this.name,
      avatar: avatar ?? this.avatar,
      color: color ?? this.color,
      tagline: tagline ?? this.tagline,
      category: category ?? this.category,
      greeting: greeting ?? this.greeting,
      personality: personality ?? this.personality,
      speakingStyle: speakingStyle ?? this.speakingStyle,
      boundaries: boundaries ?? this.boundaries,
      exampleDialogue: exampleDialogue ?? this.exampleDialogue,
      visibility: visibility ?? this.visibility,
      isStarred: isStarred ?? this.isStarred,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (name.present) {
      map['name'] = Variable<String>(name.value);
    }
    if (avatar.present) {
      map['avatar'] = Variable<String>(avatar.value);
    }
    if (color.present) {
      map['color'] = Variable<int>(color.value);
    }
    if (tagline.present) {
      map['tagline'] = Variable<String>(tagline.value);
    }
    if (category.present) {
      map['category'] = Variable<String>(category.value);
    }
    if (greeting.present) {
      map['greeting'] = Variable<String>(greeting.value);
    }
    if (personality.present) {
      map['personality'] = Variable<String>(personality.value);
    }
    if (speakingStyle.present) {
      map['speaking_style'] = Variable<String>(speakingStyle.value);
    }
    if (boundaries.present) {
      map['boundaries'] = Variable<String>(boundaries.value);
    }
    if (exampleDialogue.present) {
      map['example_dialogue'] = Variable<String>(exampleDialogue.value);
    }
    if (visibility.present) {
      map['visibility'] = Variable<String>(visibility.value);
    }
    if (isStarred.present) {
      map['is_starred'] = Variable<bool>(isStarred.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CharacterRowsCompanion(')
          ..write('id: $id, ')
          ..write('name: $name, ')
          ..write('avatar: $avatar, ')
          ..write('color: $color, ')
          ..write('tagline: $tagline, ')
          ..write('category: $category, ')
          ..write('greeting: $greeting, ')
          ..write('personality: $personality, ')
          ..write('speakingStyle: $speakingStyle, ')
          ..write('boundaries: $boundaries, ')
          ..write('exampleDialogue: $exampleDialogue, ')
          ..write('visibility: $visibility, ')
          ..write('isStarred: $isStarred, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

class $CharacterSessionRowsTable extends CharacterSessionRows
    with TableInfo<$CharacterSessionRowsTable, CharacterSessionRow> {
  @override
  final GeneratedDatabase attachedDatabase;
  final String? _alias;
  $CharacterSessionRowsTable(this.attachedDatabase, [this._alias]);
  static const VerificationMeta _idMeta = const VerificationMeta('id');
  @override
  late final GeneratedColumn<String> id = GeneratedColumn<String>(
    'id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _characterIdMeta = const VerificationMeta(
    'characterId',
  );
  @override
  late final GeneratedColumn<String> characterId = GeneratedColumn<String>(
    'character_id',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'REFERENCES character_rows (id) ON DELETE CASCADE',
    ),
  );
  static const VerificationMeta _titleMeta = const VerificationMeta('title');
  @override
  late final GeneratedColumn<String> title = GeneratedColumn<String>(
    'title',
    aliasedName,
    false,
    type: DriftSqlType.string,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _modelMeta = const VerificationMeta('model');
  @override
  late final GeneratedColumn<String> model = GeneratedColumn<String>(
    'model',
    aliasedName,
    true,
    type: DriftSqlType.string,
    requiredDuringInsert: false,
  );
  static const VerificationMeta _isStarredMeta = const VerificationMeta(
    'isStarred',
  );
  @override
  late final GeneratedColumn<bool> isStarred = GeneratedColumn<bool>(
    'is_starred',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("is_starred" IN (0, 1))',
    ),
    defaultValue: const Constant(false),
  );
  static const VerificationMeta _memoryEnabledMeta = const VerificationMeta(
    'memoryEnabled',
  );
  @override
  late final GeneratedColumn<bool> memoryEnabled = GeneratedColumn<bool>(
    'memory_enabled',
    aliasedName,
    false,
    type: DriftSqlType.bool,
    requiredDuringInsert: false,
    defaultConstraints: GeneratedColumn.constraintIsAlways(
      'CHECK ("memory_enabled" IN (0, 1))',
    ),
    defaultValue: const Constant(true),
  );
  static const VerificationMeta _createdAtMeta = const VerificationMeta(
    'createdAt',
  );
  @override
  late final GeneratedColumn<int> createdAt = GeneratedColumn<int>(
    'created_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  static const VerificationMeta _updatedAtMeta = const VerificationMeta(
    'updatedAt',
  );
  @override
  late final GeneratedColumn<int> updatedAt = GeneratedColumn<int>(
    'updated_at',
    aliasedName,
    false,
    type: DriftSqlType.int,
    requiredDuringInsert: true,
  );
  @override
  List<GeneratedColumn> get $columns => [
    id,
    characterId,
    title,
    model,
    isStarred,
    memoryEnabled,
    createdAt,
    updatedAt,
  ];
  @override
  String get aliasedName => _alias ?? actualTableName;
  @override
  String get actualTableName => $name;
  static const String $name = 'character_session_rows';
  @override
  VerificationContext validateIntegrity(
    Insertable<CharacterSessionRow> instance, {
    bool isInserting = false,
  }) {
    final context = VerificationContext();
    final data = instance.toColumns(true);
    if (data.containsKey('id')) {
      context.handle(_idMeta, id.isAcceptableOrUnknown(data['id']!, _idMeta));
    } else if (isInserting) {
      context.missing(_idMeta);
    }
    if (data.containsKey('character_id')) {
      context.handle(
        _characterIdMeta,
        characterId.isAcceptableOrUnknown(
          data['character_id']!,
          _characterIdMeta,
        ),
      );
    } else if (isInserting) {
      context.missing(_characterIdMeta);
    }
    if (data.containsKey('title')) {
      context.handle(
        _titleMeta,
        title.isAcceptableOrUnknown(data['title']!, _titleMeta),
      );
    } else if (isInserting) {
      context.missing(_titleMeta);
    }
    if (data.containsKey('model')) {
      context.handle(
        _modelMeta,
        model.isAcceptableOrUnknown(data['model']!, _modelMeta),
      );
    }
    if (data.containsKey('is_starred')) {
      context.handle(
        _isStarredMeta,
        isStarred.isAcceptableOrUnknown(data['is_starred']!, _isStarredMeta),
      );
    }
    if (data.containsKey('memory_enabled')) {
      context.handle(
        _memoryEnabledMeta,
        memoryEnabled.isAcceptableOrUnknown(
          data['memory_enabled']!,
          _memoryEnabledMeta,
        ),
      );
    }
    if (data.containsKey('created_at')) {
      context.handle(
        _createdAtMeta,
        createdAt.isAcceptableOrUnknown(data['created_at']!, _createdAtMeta),
      );
    } else if (isInserting) {
      context.missing(_createdAtMeta);
    }
    if (data.containsKey('updated_at')) {
      context.handle(
        _updatedAtMeta,
        updatedAt.isAcceptableOrUnknown(data['updated_at']!, _updatedAtMeta),
      );
    } else if (isInserting) {
      context.missing(_updatedAtMeta);
    }
    return context;
  }

  @override
  Set<GeneratedColumn> get $primaryKey => {id};
  @override
  CharacterSessionRow map(Map<String, dynamic> data, {String? tablePrefix}) {
    final effectivePrefix = tablePrefix != null ? '$tablePrefix.' : '';
    return CharacterSessionRow(
      id: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}id'],
      )!,
      characterId: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}character_id'],
      )!,
      title: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}title'],
      )!,
      model: attachedDatabase.typeMapping.read(
        DriftSqlType.string,
        data['${effectivePrefix}model'],
      ),
      isStarred: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}is_starred'],
      )!,
      memoryEnabled: attachedDatabase.typeMapping.read(
        DriftSqlType.bool,
        data['${effectivePrefix}memory_enabled'],
      )!,
      createdAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}created_at'],
      )!,
      updatedAt: attachedDatabase.typeMapping.read(
        DriftSqlType.int,
        data['${effectivePrefix}updated_at'],
      )!,
    );
  }

  @override
  $CharacterSessionRowsTable createAlias(String alias) {
    return $CharacterSessionRowsTable(attachedDatabase, alias);
  }
}

class CharacterSessionRow extends DataClass
    implements Insertable<CharacterSessionRow> {
  final String id;
  final String characterId;
  final String title;
  final String? model;
  final bool isStarred;
  final bool memoryEnabled;
  final int createdAt;
  final int updatedAt;
  const CharacterSessionRow({
    required this.id,
    required this.characterId,
    required this.title,
    this.model,
    required this.isStarred,
    required this.memoryEnabled,
    required this.createdAt,
    required this.updatedAt,
  });
  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    map['id'] = Variable<String>(id);
    map['character_id'] = Variable<String>(characterId);
    map['title'] = Variable<String>(title);
    if (!nullToAbsent || model != null) {
      map['model'] = Variable<String>(model);
    }
    map['is_starred'] = Variable<bool>(isStarred);
    map['memory_enabled'] = Variable<bool>(memoryEnabled);
    map['created_at'] = Variable<int>(createdAt);
    map['updated_at'] = Variable<int>(updatedAt);
    return map;
  }

  CharacterSessionRowsCompanion toCompanion(bool nullToAbsent) {
    return CharacterSessionRowsCompanion(
      id: Value(id),
      characterId: Value(characterId),
      title: Value(title),
      model: model == null && nullToAbsent
          ? const Value.absent()
          : Value(model),
      isStarred: Value(isStarred),
      memoryEnabled: Value(memoryEnabled),
      createdAt: Value(createdAt),
      updatedAt: Value(updatedAt),
    );
  }

  factory CharacterSessionRow.fromJson(
    Map<String, dynamic> json, {
    ValueSerializer? serializer,
  }) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return CharacterSessionRow(
      id: serializer.fromJson<String>(json['id']),
      characterId: serializer.fromJson<String>(json['characterId']),
      title: serializer.fromJson<String>(json['title']),
      model: serializer.fromJson<String?>(json['model']),
      isStarred: serializer.fromJson<bool>(json['isStarred']),
      memoryEnabled: serializer.fromJson<bool>(json['memoryEnabled']),
      createdAt: serializer.fromJson<int>(json['createdAt']),
      updatedAt: serializer.fromJson<int>(json['updatedAt']),
    );
  }
  @override
  Map<String, dynamic> toJson({ValueSerializer? serializer}) {
    serializer ??= driftRuntimeOptions.defaultSerializer;
    return <String, dynamic>{
      'id': serializer.toJson<String>(id),
      'characterId': serializer.toJson<String>(characterId),
      'title': serializer.toJson<String>(title),
      'model': serializer.toJson<String?>(model),
      'isStarred': serializer.toJson<bool>(isStarred),
      'memoryEnabled': serializer.toJson<bool>(memoryEnabled),
      'createdAt': serializer.toJson<int>(createdAt),
      'updatedAt': serializer.toJson<int>(updatedAt),
    };
  }

  CharacterSessionRow copyWith({
    String? id,
    String? characterId,
    String? title,
    Value<String?> model = const Value.absent(),
    bool? isStarred,
    bool? memoryEnabled,
    int? createdAt,
    int? updatedAt,
  }) => CharacterSessionRow(
    id: id ?? this.id,
    characterId: characterId ?? this.characterId,
    title: title ?? this.title,
    model: model.present ? model.value : this.model,
    isStarred: isStarred ?? this.isStarred,
    memoryEnabled: memoryEnabled ?? this.memoryEnabled,
    createdAt: createdAt ?? this.createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );
  CharacterSessionRow copyWithCompanion(CharacterSessionRowsCompanion data) {
    return CharacterSessionRow(
      id: data.id.present ? data.id.value : this.id,
      characterId: data.characterId.present
          ? data.characterId.value
          : this.characterId,
      title: data.title.present ? data.title.value : this.title,
      model: data.model.present ? data.model.value : this.model,
      isStarred: data.isStarred.present ? data.isStarred.value : this.isStarred,
      memoryEnabled: data.memoryEnabled.present
          ? data.memoryEnabled.value
          : this.memoryEnabled,
      createdAt: data.createdAt.present ? data.createdAt.value : this.createdAt,
      updatedAt: data.updatedAt.present ? data.updatedAt.value : this.updatedAt,
    );
  }

  @override
  String toString() {
    return (StringBuffer('CharacterSessionRow(')
          ..write('id: $id, ')
          ..write('characterId: $characterId, ')
          ..write('title: $title, ')
          ..write('model: $model, ')
          ..write('isStarred: $isStarred, ')
          ..write('memoryEnabled: $memoryEnabled, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt')
          ..write(')'))
        .toString();
  }

  @override
  int get hashCode => Object.hash(
    id,
    characterId,
    title,
    model,
    isStarred,
    memoryEnabled,
    createdAt,
    updatedAt,
  );
  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is CharacterSessionRow &&
          other.id == this.id &&
          other.characterId == this.characterId &&
          other.title == this.title &&
          other.model == this.model &&
          other.isStarred == this.isStarred &&
          other.memoryEnabled == this.memoryEnabled &&
          other.createdAt == this.createdAt &&
          other.updatedAt == this.updatedAt);
}

class CharacterSessionRowsCompanion
    extends UpdateCompanion<CharacterSessionRow> {
  final Value<String> id;
  final Value<String> characterId;
  final Value<String> title;
  final Value<String?> model;
  final Value<bool> isStarred;
  final Value<bool> memoryEnabled;
  final Value<int> createdAt;
  final Value<int> updatedAt;
  final Value<int> rowid;
  const CharacterSessionRowsCompanion({
    this.id = const Value.absent(),
    this.characterId = const Value.absent(),
    this.title = const Value.absent(),
    this.model = const Value.absent(),
    this.isStarred = const Value.absent(),
    this.memoryEnabled = const Value.absent(),
    this.createdAt = const Value.absent(),
    this.updatedAt = const Value.absent(),
    this.rowid = const Value.absent(),
  });
  CharacterSessionRowsCompanion.insert({
    required String id,
    required String characterId,
    required String title,
    this.model = const Value.absent(),
    this.isStarred = const Value.absent(),
    this.memoryEnabled = const Value.absent(),
    required int createdAt,
    required int updatedAt,
    this.rowid = const Value.absent(),
  }) : id = Value(id),
       characterId = Value(characterId),
       title = Value(title),
       createdAt = Value(createdAt),
       updatedAt = Value(updatedAt);
  static Insertable<CharacterSessionRow> custom({
    Expression<String>? id,
    Expression<String>? characterId,
    Expression<String>? title,
    Expression<String>? model,
    Expression<bool>? isStarred,
    Expression<bool>? memoryEnabled,
    Expression<int>? createdAt,
    Expression<int>? updatedAt,
    Expression<int>? rowid,
  }) {
    return RawValuesInsertable({
      if (id != null) 'id': id,
      if (characterId != null) 'character_id': characterId,
      if (title != null) 'title': title,
      if (model != null) 'model': model,
      if (isStarred != null) 'is_starred': isStarred,
      if (memoryEnabled != null) 'memory_enabled': memoryEnabled,
      if (createdAt != null) 'created_at': createdAt,
      if (updatedAt != null) 'updated_at': updatedAt,
      if (rowid != null) 'rowid': rowid,
    });
  }

  CharacterSessionRowsCompanion copyWith({
    Value<String>? id,
    Value<String>? characterId,
    Value<String>? title,
    Value<String?>? model,
    Value<bool>? isStarred,
    Value<bool>? memoryEnabled,
    Value<int>? createdAt,
    Value<int>? updatedAt,
    Value<int>? rowid,
  }) {
    return CharacterSessionRowsCompanion(
      id: id ?? this.id,
      characterId: characterId ?? this.characterId,
      title: title ?? this.title,
      model: model ?? this.model,
      isStarred: isStarred ?? this.isStarred,
      memoryEnabled: memoryEnabled ?? this.memoryEnabled,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      rowid: rowid ?? this.rowid,
    );
  }

  @override
  Map<String, Expression> toColumns(bool nullToAbsent) {
    final map = <String, Expression>{};
    if (id.present) {
      map['id'] = Variable<String>(id.value);
    }
    if (characterId.present) {
      map['character_id'] = Variable<String>(characterId.value);
    }
    if (title.present) {
      map['title'] = Variable<String>(title.value);
    }
    if (model.present) {
      map['model'] = Variable<String>(model.value);
    }
    if (isStarred.present) {
      map['is_starred'] = Variable<bool>(isStarred.value);
    }
    if (memoryEnabled.present) {
      map['memory_enabled'] = Variable<bool>(memoryEnabled.value);
    }
    if (createdAt.present) {
      map['created_at'] = Variable<int>(createdAt.value);
    }
    if (updatedAt.present) {
      map['updated_at'] = Variable<int>(updatedAt.value);
    }
    if (rowid.present) {
      map['rowid'] = Variable<int>(rowid.value);
    }
    return map;
  }

  @override
  String toString() {
    return (StringBuffer('CharacterSessionRowsCompanion(')
          ..write('id: $id, ')
          ..write('characterId: $characterId, ')
          ..write('title: $title, ')
          ..write('model: $model, ')
          ..write('isStarred: $isStarred, ')
          ..write('memoryEnabled: $memoryEnabled, ')
          ..write('createdAt: $createdAt, ')
          ..write('updatedAt: $updatedAt, ')
          ..write('rowid: $rowid')
          ..write(')'))
        .toString();
  }
}

abstract class _$PrivoraDatabase extends GeneratedDatabase {
  _$PrivoraDatabase(QueryExecutor e) : super(e);
  $PrivoraDatabaseManager get managers => $PrivoraDatabaseManager(this);
  late final $UiSettingsRowsTable uiSettingsRows = $UiSettingsRowsTable(this);
  late final $ChatRowsTable chatRows = $ChatRowsTable(this);
  late final $ChatMessageRowsTable chatMessageRows = $ChatMessageRowsTable(
    this,
  );
  late final $ArtifactRowsTable artifactRows = $ArtifactRowsTable(this);
  late final $WebDevProjectRowsTable webDevProjectRows =
      $WebDevProjectRowsTable(this);
  late final $WebDevThreadRowsTable webDevThreadRows = $WebDevThreadRowsTable(
    this,
  );
  late final $CharacterRowsTable characterRows = $CharacterRowsTable(this);
  late final $CharacterSessionRowsTable characterSessionRows =
      $CharacterSessionRowsTable(this);
  @override
  Iterable<TableInfo<Table, Object?>> get allTables =>
      allSchemaEntities.whereType<TableInfo<Table, Object?>>();
  @override
  List<DatabaseSchemaEntity> get allSchemaEntities => [
    uiSettingsRows,
    chatRows,
    chatMessageRows,
    artifactRows,
    webDevProjectRows,
    webDevThreadRows,
    characterRows,
    characterSessionRows,
  ];
  @override
  StreamQueryUpdateRules get streamUpdateRules => const StreamQueryUpdateRules([
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'chat_rows',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('chat_message_rows', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'chat_rows',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('artifact_rows', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'web_dev_project_rows',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('web_dev_thread_rows', kind: UpdateKind.delete)],
    ),
    WritePropagation(
      on: TableUpdateQuery.onTableName(
        'character_rows',
        limitUpdateKind: UpdateKind.delete,
      ),
      result: [TableUpdate('character_session_rows', kind: UpdateKind.delete)],
    ),
  ]);
}

typedef $$UiSettingsRowsTableCreateCompanionBuilder =
    UiSettingsRowsCompanion Function({
      required String id,
      Value<String> workspaceMode,
      required String selectedModel,
      Value<String> selectedStyle,
      Value<bool> isThinkingEnabled,
      Value<bool> isWebSearchEnabled,
      Value<bool> isDeepResearchEnabled,
      Value<bool> isDebateModeEnabled,
      Value<bool> isClashModeEnabled,
      Value<bool> isDarkMode,
      Value<String> composerMode,
      required String imageModel,
      Value<String> imageSizePreset,
      Value<String> imageQuality,
      Value<int> imageCount,
      Value<int> imagePartialImages,
      Value<String> imageOutputFormat,
      Value<String?> debateAgentAModel,
      Value<String?> debateAgentBModel,
      Value<String?> debateJudgeModel,
      Value<String?> clashAgentAModel,
      Value<String?> clashAgentBModel,
      Value<int> rowid,
    });
typedef $$UiSettingsRowsTableUpdateCompanionBuilder =
    UiSettingsRowsCompanion Function({
      Value<String> id,
      Value<String> workspaceMode,
      Value<String> selectedModel,
      Value<String> selectedStyle,
      Value<bool> isThinkingEnabled,
      Value<bool> isWebSearchEnabled,
      Value<bool> isDeepResearchEnabled,
      Value<bool> isDebateModeEnabled,
      Value<bool> isClashModeEnabled,
      Value<bool> isDarkMode,
      Value<String> composerMode,
      Value<String> imageModel,
      Value<String> imageSizePreset,
      Value<String> imageQuality,
      Value<int> imageCount,
      Value<int> imagePartialImages,
      Value<String> imageOutputFormat,
      Value<String?> debateAgentAModel,
      Value<String?> debateAgentBModel,
      Value<String?> debateJudgeModel,
      Value<String?> clashAgentAModel,
      Value<String?> clashAgentBModel,
      Value<int> rowid,
    });

class $$UiSettingsRowsTableFilterComposer
    extends Composer<_$PrivoraDatabase, $UiSettingsRowsTable> {
  $$UiSettingsRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get workspaceMode => $composableBuilder(
    column: $table.workspaceMode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get selectedModel => $composableBuilder(
    column: $table.selectedModel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get selectedStyle => $composableBuilder(
    column: $table.selectedStyle,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isThinkingEnabled => $composableBuilder(
    column: $table.isThinkingEnabled,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isWebSearchEnabled => $composableBuilder(
    column: $table.isWebSearchEnabled,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isDeepResearchEnabled => $composableBuilder(
    column: $table.isDeepResearchEnabled,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isDebateModeEnabled => $composableBuilder(
    column: $table.isDebateModeEnabled,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isClashModeEnabled => $composableBuilder(
    column: $table.isClashModeEnabled,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isDarkMode => $composableBuilder(
    column: $table.isDarkMode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get composerMode => $composableBuilder(
    column: $table.composerMode,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get imageModel => $composableBuilder(
    column: $table.imageModel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get imageSizePreset => $composableBuilder(
    column: $table.imageSizePreset,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get imageQuality => $composableBuilder(
    column: $table.imageQuality,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get imageCount => $composableBuilder(
    column: $table.imageCount,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get imagePartialImages => $composableBuilder(
    column: $table.imagePartialImages,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get imageOutputFormat => $composableBuilder(
    column: $table.imageOutputFormat,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get debateAgentAModel => $composableBuilder(
    column: $table.debateAgentAModel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get debateAgentBModel => $composableBuilder(
    column: $table.debateAgentBModel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get debateJudgeModel => $composableBuilder(
    column: $table.debateJudgeModel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get clashAgentAModel => $composableBuilder(
    column: $table.clashAgentAModel,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get clashAgentBModel => $composableBuilder(
    column: $table.clashAgentBModel,
    builder: (column) => ColumnFilters(column),
  );
}

class $$UiSettingsRowsTableOrderingComposer
    extends Composer<_$PrivoraDatabase, $UiSettingsRowsTable> {
  $$UiSettingsRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get workspaceMode => $composableBuilder(
    column: $table.workspaceMode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get selectedModel => $composableBuilder(
    column: $table.selectedModel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get selectedStyle => $composableBuilder(
    column: $table.selectedStyle,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isThinkingEnabled => $composableBuilder(
    column: $table.isThinkingEnabled,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isWebSearchEnabled => $composableBuilder(
    column: $table.isWebSearchEnabled,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isDeepResearchEnabled => $composableBuilder(
    column: $table.isDeepResearchEnabled,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isDebateModeEnabled => $composableBuilder(
    column: $table.isDebateModeEnabled,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isClashModeEnabled => $composableBuilder(
    column: $table.isClashModeEnabled,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isDarkMode => $composableBuilder(
    column: $table.isDarkMode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get composerMode => $composableBuilder(
    column: $table.composerMode,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get imageModel => $composableBuilder(
    column: $table.imageModel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get imageSizePreset => $composableBuilder(
    column: $table.imageSizePreset,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get imageQuality => $composableBuilder(
    column: $table.imageQuality,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get imageCount => $composableBuilder(
    column: $table.imageCount,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get imagePartialImages => $composableBuilder(
    column: $table.imagePartialImages,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get imageOutputFormat => $composableBuilder(
    column: $table.imageOutputFormat,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get debateAgentAModel => $composableBuilder(
    column: $table.debateAgentAModel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get debateAgentBModel => $composableBuilder(
    column: $table.debateAgentBModel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get debateJudgeModel => $composableBuilder(
    column: $table.debateJudgeModel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get clashAgentAModel => $composableBuilder(
    column: $table.clashAgentAModel,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get clashAgentBModel => $composableBuilder(
    column: $table.clashAgentBModel,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$UiSettingsRowsTableAnnotationComposer
    extends Composer<_$PrivoraDatabase, $UiSettingsRowsTable> {
  $$UiSettingsRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get workspaceMode => $composableBuilder(
    column: $table.workspaceMode,
    builder: (column) => column,
  );

  GeneratedColumn<String> get selectedModel => $composableBuilder(
    column: $table.selectedModel,
    builder: (column) => column,
  );

  GeneratedColumn<String> get selectedStyle => $composableBuilder(
    column: $table.selectedStyle,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get isThinkingEnabled => $composableBuilder(
    column: $table.isThinkingEnabled,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get isWebSearchEnabled => $composableBuilder(
    column: $table.isWebSearchEnabled,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get isDeepResearchEnabled => $composableBuilder(
    column: $table.isDeepResearchEnabled,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get isDebateModeEnabled => $composableBuilder(
    column: $table.isDebateModeEnabled,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get isClashModeEnabled => $composableBuilder(
    column: $table.isClashModeEnabled,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get isDarkMode => $composableBuilder(
    column: $table.isDarkMode,
    builder: (column) => column,
  );

  GeneratedColumn<String> get composerMode => $composableBuilder(
    column: $table.composerMode,
    builder: (column) => column,
  );

  GeneratedColumn<String> get imageModel => $composableBuilder(
    column: $table.imageModel,
    builder: (column) => column,
  );

  GeneratedColumn<String> get imageSizePreset => $composableBuilder(
    column: $table.imageSizePreset,
    builder: (column) => column,
  );

  GeneratedColumn<String> get imageQuality => $composableBuilder(
    column: $table.imageQuality,
    builder: (column) => column,
  );

  GeneratedColumn<int> get imageCount => $composableBuilder(
    column: $table.imageCount,
    builder: (column) => column,
  );

  GeneratedColumn<int> get imagePartialImages => $composableBuilder(
    column: $table.imagePartialImages,
    builder: (column) => column,
  );

  GeneratedColumn<String> get imageOutputFormat => $composableBuilder(
    column: $table.imageOutputFormat,
    builder: (column) => column,
  );

  GeneratedColumn<String> get debateAgentAModel => $composableBuilder(
    column: $table.debateAgentAModel,
    builder: (column) => column,
  );

  GeneratedColumn<String> get debateAgentBModel => $composableBuilder(
    column: $table.debateAgentBModel,
    builder: (column) => column,
  );

  GeneratedColumn<String> get debateJudgeModel => $composableBuilder(
    column: $table.debateJudgeModel,
    builder: (column) => column,
  );

  GeneratedColumn<String> get clashAgentAModel => $composableBuilder(
    column: $table.clashAgentAModel,
    builder: (column) => column,
  );

  GeneratedColumn<String> get clashAgentBModel => $composableBuilder(
    column: $table.clashAgentBModel,
    builder: (column) => column,
  );
}

class $$UiSettingsRowsTableTableManager
    extends
        RootTableManager<
          _$PrivoraDatabase,
          $UiSettingsRowsTable,
          UiSettingsRow,
          $$UiSettingsRowsTableFilterComposer,
          $$UiSettingsRowsTableOrderingComposer,
          $$UiSettingsRowsTableAnnotationComposer,
          $$UiSettingsRowsTableCreateCompanionBuilder,
          $$UiSettingsRowsTableUpdateCompanionBuilder,
          (
            UiSettingsRow,
            BaseReferences<
              _$PrivoraDatabase,
              $UiSettingsRowsTable,
              UiSettingsRow
            >,
          ),
          UiSettingsRow,
          PrefetchHooks Function()
        > {
  $$UiSettingsRowsTableTableManager(
    _$PrivoraDatabase db,
    $UiSettingsRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$UiSettingsRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$UiSettingsRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$UiSettingsRowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> workspaceMode = const Value.absent(),
                Value<String> selectedModel = const Value.absent(),
                Value<String> selectedStyle = const Value.absent(),
                Value<bool> isThinkingEnabled = const Value.absent(),
                Value<bool> isWebSearchEnabled = const Value.absent(),
                Value<bool> isDeepResearchEnabled = const Value.absent(),
                Value<bool> isDebateModeEnabled = const Value.absent(),
                Value<bool> isClashModeEnabled = const Value.absent(),
                Value<bool> isDarkMode = const Value.absent(),
                Value<String> composerMode = const Value.absent(),
                Value<String> imageModel = const Value.absent(),
                Value<String> imageSizePreset = const Value.absent(),
                Value<String> imageQuality = const Value.absent(),
                Value<int> imageCount = const Value.absent(),
                Value<int> imagePartialImages = const Value.absent(),
                Value<String> imageOutputFormat = const Value.absent(),
                Value<String?> debateAgentAModel = const Value.absent(),
                Value<String?> debateAgentBModel = const Value.absent(),
                Value<String?> debateJudgeModel = const Value.absent(),
                Value<String?> clashAgentAModel = const Value.absent(),
                Value<String?> clashAgentBModel = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => UiSettingsRowsCompanion(
                id: id,
                workspaceMode: workspaceMode,
                selectedModel: selectedModel,
                selectedStyle: selectedStyle,
                isThinkingEnabled: isThinkingEnabled,
                isWebSearchEnabled: isWebSearchEnabled,
                isDeepResearchEnabled: isDeepResearchEnabled,
                isDebateModeEnabled: isDebateModeEnabled,
                isClashModeEnabled: isClashModeEnabled,
                isDarkMode: isDarkMode,
                composerMode: composerMode,
                imageModel: imageModel,
                imageSizePreset: imageSizePreset,
                imageQuality: imageQuality,
                imageCount: imageCount,
                imagePartialImages: imagePartialImages,
                imageOutputFormat: imageOutputFormat,
                debateAgentAModel: debateAgentAModel,
                debateAgentBModel: debateAgentBModel,
                debateJudgeModel: debateJudgeModel,
                clashAgentAModel: clashAgentAModel,
                clashAgentBModel: clashAgentBModel,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                Value<String> workspaceMode = const Value.absent(),
                required String selectedModel,
                Value<String> selectedStyle = const Value.absent(),
                Value<bool> isThinkingEnabled = const Value.absent(),
                Value<bool> isWebSearchEnabled = const Value.absent(),
                Value<bool> isDeepResearchEnabled = const Value.absent(),
                Value<bool> isDebateModeEnabled = const Value.absent(),
                Value<bool> isClashModeEnabled = const Value.absent(),
                Value<bool> isDarkMode = const Value.absent(),
                Value<String> composerMode = const Value.absent(),
                required String imageModel,
                Value<String> imageSizePreset = const Value.absent(),
                Value<String> imageQuality = const Value.absent(),
                Value<int> imageCount = const Value.absent(),
                Value<int> imagePartialImages = const Value.absent(),
                Value<String> imageOutputFormat = const Value.absent(),
                Value<String?> debateAgentAModel = const Value.absent(),
                Value<String?> debateAgentBModel = const Value.absent(),
                Value<String?> debateJudgeModel = const Value.absent(),
                Value<String?> clashAgentAModel = const Value.absent(),
                Value<String?> clashAgentBModel = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => UiSettingsRowsCompanion.insert(
                id: id,
                workspaceMode: workspaceMode,
                selectedModel: selectedModel,
                selectedStyle: selectedStyle,
                isThinkingEnabled: isThinkingEnabled,
                isWebSearchEnabled: isWebSearchEnabled,
                isDeepResearchEnabled: isDeepResearchEnabled,
                isDebateModeEnabled: isDebateModeEnabled,
                isClashModeEnabled: isClashModeEnabled,
                isDarkMode: isDarkMode,
                composerMode: composerMode,
                imageModel: imageModel,
                imageSizePreset: imageSizePreset,
                imageQuality: imageQuality,
                imageCount: imageCount,
                imagePartialImages: imagePartialImages,
                imageOutputFormat: imageOutputFormat,
                debateAgentAModel: debateAgentAModel,
                debateAgentBModel: debateAgentBModel,
                debateJudgeModel: debateJudgeModel,
                clashAgentAModel: clashAgentAModel,
                clashAgentBModel: clashAgentBModel,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map((e) => (e.readTable(table), BaseReferences(db, table, e)))
              .toList(),
          prefetchHooksCallback: null,
        ),
      );
}

typedef $$UiSettingsRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$PrivoraDatabase,
      $UiSettingsRowsTable,
      UiSettingsRow,
      $$UiSettingsRowsTableFilterComposer,
      $$UiSettingsRowsTableOrderingComposer,
      $$UiSettingsRowsTableAnnotationComposer,
      $$UiSettingsRowsTableCreateCompanionBuilder,
      $$UiSettingsRowsTableUpdateCompanionBuilder,
      (
        UiSettingsRow,
        BaseReferences<_$PrivoraDatabase, $UiSettingsRowsTable, UiSettingsRow>,
      ),
      UiSettingsRow,
      PrefetchHooks Function()
    >;
typedef $$ChatRowsTableCreateCompanionBuilder =
    ChatRowsCompanion Function({
      required String id,
      required String title,
      Value<bool> isStarred,
      required int createdAt,
      required int updatedAt,
      Value<String?> model,
      Value<String?> pendingResearchIntentJson,
      Value<int> rowid,
    });
typedef $$ChatRowsTableUpdateCompanionBuilder =
    ChatRowsCompanion Function({
      Value<String> id,
      Value<String> title,
      Value<bool> isStarred,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<String?> model,
      Value<String?> pendingResearchIntentJson,
      Value<int> rowid,
    });

final class $$ChatRowsTableReferences
    extends BaseReferences<_$PrivoraDatabase, $ChatRowsTable, ChatRow> {
  $$ChatRowsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static MultiTypedResultKey<$ChatMessageRowsTable, List<ChatMessageRow>>
  _chatMessageRowsRefsTable(_$PrivoraDatabase db) =>
      MultiTypedResultKey.fromTable(
        db.chatMessageRows,
        aliasName: $_aliasNameGenerator(
          db.chatRows.id,
          db.chatMessageRows.chatId,
        ),
      );

  $$ChatMessageRowsTableProcessedTableManager get chatMessageRowsRefs {
    final manager = $$ChatMessageRowsTableTableManager(
      $_db,
      $_db.chatMessageRows,
    ).filter((f) => f.chatId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(
      _chatMessageRowsRefsTable($_db),
    );
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }

  static MultiTypedResultKey<$ArtifactRowsTable, List<ArtifactRow>>
  _artifactRowsRefsTable(_$PrivoraDatabase db) => MultiTypedResultKey.fromTable(
    db.artifactRows,
    aliasName: $_aliasNameGenerator(db.chatRows.id, db.artifactRows.chatId),
  );

  $$ArtifactRowsTableProcessedTableManager get artifactRowsRefs {
    final manager = $$ArtifactRowsTableTableManager(
      $_db,
      $_db.artifactRows,
    ).filter((f) => f.chatId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(_artifactRowsRefsTable($_db));
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$ChatRowsTableFilterComposer
    extends Composer<_$PrivoraDatabase, $ChatRowsTable> {
  $$ChatRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get model => $composableBuilder(
    column: $table.model,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get pendingResearchIntentJson => $composableBuilder(
    column: $table.pendingResearchIntentJson,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> chatMessageRowsRefs(
    Expression<bool> Function($$ChatMessageRowsTableFilterComposer f) f,
  ) {
    final $$ChatMessageRowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.chatMessageRows,
      getReferencedColumn: (t) => t.chatId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ChatMessageRowsTableFilterComposer(
            $db: $db,
            $table: $db.chatMessageRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<bool> artifactRowsRefs(
    Expression<bool> Function($$ArtifactRowsTableFilterComposer f) f,
  ) {
    final $$ArtifactRowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.artifactRows,
      getReferencedColumn: (t) => t.chatId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ArtifactRowsTableFilterComposer(
            $db: $db,
            $table: $db.artifactRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ChatRowsTableOrderingComposer
    extends Composer<_$PrivoraDatabase, $ChatRowsTable> {
  $$ChatRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get model => $composableBuilder(
    column: $table.model,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get pendingResearchIntentJson => $composableBuilder(
    column: $table.pendingResearchIntentJson,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$ChatRowsTableAnnotationComposer
    extends Composer<_$PrivoraDatabase, $ChatRowsTable> {
  $$ChatRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<bool> get isStarred =>
      $composableBuilder(column: $table.isStarred, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  GeneratedColumn<String> get model =>
      $composableBuilder(column: $table.model, builder: (column) => column);

  GeneratedColumn<String> get pendingResearchIntentJson => $composableBuilder(
    column: $table.pendingResearchIntentJson,
    builder: (column) => column,
  );

  Expression<T> chatMessageRowsRefs<T extends Object>(
    Expression<T> Function($$ChatMessageRowsTableAnnotationComposer a) f,
  ) {
    final $$ChatMessageRowsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.chatMessageRows,
      getReferencedColumn: (t) => t.chatId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ChatMessageRowsTableAnnotationComposer(
            $db: $db,
            $table: $db.chatMessageRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }

  Expression<T> artifactRowsRefs<T extends Object>(
    Expression<T> Function($$ArtifactRowsTableAnnotationComposer a) f,
  ) {
    final $$ArtifactRowsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.artifactRows,
      getReferencedColumn: (t) => t.chatId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ArtifactRowsTableAnnotationComposer(
            $db: $db,
            $table: $db.artifactRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$ChatRowsTableTableManager
    extends
        RootTableManager<
          _$PrivoraDatabase,
          $ChatRowsTable,
          ChatRow,
          $$ChatRowsTableFilterComposer,
          $$ChatRowsTableOrderingComposer,
          $$ChatRowsTableAnnotationComposer,
          $$ChatRowsTableCreateCompanionBuilder,
          $$ChatRowsTableUpdateCompanionBuilder,
          (ChatRow, $$ChatRowsTableReferences),
          ChatRow,
          PrefetchHooks Function({
            bool chatMessageRowsRefs,
            bool artifactRowsRefs,
          })
        > {
  $$ChatRowsTableTableManager(_$PrivoraDatabase db, $ChatRowsTable table)
    : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ChatRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ChatRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ChatRowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<bool> isStarred = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<String?> model = const Value.absent(),
                Value<String?> pendingResearchIntentJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ChatRowsCompanion(
                id: id,
                title: title,
                isStarred: isStarred,
                createdAt: createdAt,
                updatedAt: updatedAt,
                model: model,
                pendingResearchIntentJson: pendingResearchIntentJson,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String title,
                Value<bool> isStarred = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<String?> model = const Value.absent(),
                Value<String?> pendingResearchIntentJson = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ChatRowsCompanion.insert(
                id: id,
                title: title,
                isStarred: isStarred,
                createdAt: createdAt,
                updatedAt: updatedAt,
                model: model,
                pendingResearchIntentJson: pendingResearchIntentJson,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$ChatRowsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback:
              ({chatMessageRowsRefs = false, artifactRowsRefs = false}) {
                return PrefetchHooks(
                  db: db,
                  explicitlyWatchedTables: [
                    if (chatMessageRowsRefs) db.chatMessageRows,
                    if (artifactRowsRefs) db.artifactRows,
                  ],
                  addJoins: null,
                  getPrefetchedDataCallback: (items) async {
                    return [
                      if (chatMessageRowsRefs)
                        await $_getPrefetchedData<
                          ChatRow,
                          $ChatRowsTable,
                          ChatMessageRow
                        >(
                          currentTable: table,
                          referencedTable: $$ChatRowsTableReferences
                              ._chatMessageRowsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ChatRowsTableReferences(
                                db,
                                table,
                                p0,
                              ).chatMessageRowsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.chatId == item.id,
                              ),
                          typedResults: items,
                        ),
                      if (artifactRowsRefs)
                        await $_getPrefetchedData<
                          ChatRow,
                          $ChatRowsTable,
                          ArtifactRow
                        >(
                          currentTable: table,
                          referencedTable: $$ChatRowsTableReferences
                              ._artifactRowsRefsTable(db),
                          managerFromTypedResult: (p0) =>
                              $$ChatRowsTableReferences(
                                db,
                                table,
                                p0,
                              ).artifactRowsRefs,
                          referencedItemsForCurrentItem:
                              (item, referencedItems) => referencedItems.where(
                                (e) => e.chatId == item.id,
                              ),
                          typedResults: items,
                        ),
                    ];
                  },
                );
              },
        ),
      );
}

typedef $$ChatRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$PrivoraDatabase,
      $ChatRowsTable,
      ChatRow,
      $$ChatRowsTableFilterComposer,
      $$ChatRowsTableOrderingComposer,
      $$ChatRowsTableAnnotationComposer,
      $$ChatRowsTableCreateCompanionBuilder,
      $$ChatRowsTableUpdateCompanionBuilder,
      (ChatRow, $$ChatRowsTableReferences),
      ChatRow,
      PrefetchHooks Function({bool chatMessageRowsRefs, bool artifactRowsRefs})
    >;
typedef $$ChatMessageRowsTableCreateCompanionBuilder =
    ChatMessageRowsCompanion Function({
      required String id,
      required String chatId,
      required String role,
      required String content,
      Value<String?> thought,
      Value<bool?> isThinking,
      Value<String?> webSearchStatus,
      Value<String> webSearchQueriesJson,
      Value<String?> researchStatus,
      Value<String> attachmentsJson,
      Value<String?> artifactJson,
      Value<String?> imageGenerationJson,
      Value<String?> debateJson,
      Value<String?> clashJson,
      Value<String?> researchJson,
      required int createdAt,
      Value<int> rowid,
    });
typedef $$ChatMessageRowsTableUpdateCompanionBuilder =
    ChatMessageRowsCompanion Function({
      Value<String> id,
      Value<String> chatId,
      Value<String> role,
      Value<String> content,
      Value<String?> thought,
      Value<bool?> isThinking,
      Value<String?> webSearchStatus,
      Value<String> webSearchQueriesJson,
      Value<String?> researchStatus,
      Value<String> attachmentsJson,
      Value<String?> artifactJson,
      Value<String?> imageGenerationJson,
      Value<String?> debateJson,
      Value<String?> clashJson,
      Value<String?> researchJson,
      Value<int> createdAt,
      Value<int> rowid,
    });

final class $$ChatMessageRowsTableReferences
    extends
        BaseReferences<
          _$PrivoraDatabase,
          $ChatMessageRowsTable,
          ChatMessageRow
        > {
  $$ChatMessageRowsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $ChatRowsTable _chatIdTable(_$PrivoraDatabase db) =>
      db.chatRows.createAlias(
        $_aliasNameGenerator(db.chatMessageRows.chatId, db.chatRows.id),
      );

  $$ChatRowsTableProcessedTableManager get chatId {
    final $_column = $_itemColumn<String>('chat_id')!;

    final manager = $$ChatRowsTableTableManager(
      $_db,
      $_db.chatRows,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_chatIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$ChatMessageRowsTableFilterComposer
    extends Composer<_$PrivoraDatabase, $ChatMessageRowsTable> {
  $$ChatMessageRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get role => $composableBuilder(
    column: $table.role,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get content => $composableBuilder(
    column: $table.content,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get thought => $composableBuilder(
    column: $table.thought,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isThinking => $composableBuilder(
    column: $table.isThinking,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get webSearchStatus => $composableBuilder(
    column: $table.webSearchStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get webSearchQueriesJson => $composableBuilder(
    column: $table.webSearchQueriesJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get researchStatus => $composableBuilder(
    column: $table.researchStatus,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get attachmentsJson => $composableBuilder(
    column: $table.attachmentsJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get artifactJson => $composableBuilder(
    column: $table.artifactJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get imageGenerationJson => $composableBuilder(
    column: $table.imageGenerationJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get debateJson => $composableBuilder(
    column: $table.debateJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get clashJson => $composableBuilder(
    column: $table.clashJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get researchJson => $composableBuilder(
    column: $table.researchJson,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  $$ChatRowsTableFilterComposer get chatId {
    final $$ChatRowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.chatId,
      referencedTable: $db.chatRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ChatRowsTableFilterComposer(
            $db: $db,
            $table: $db.chatRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ChatMessageRowsTableOrderingComposer
    extends Composer<_$PrivoraDatabase, $ChatMessageRowsTable> {
  $$ChatMessageRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get role => $composableBuilder(
    column: $table.role,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get content => $composableBuilder(
    column: $table.content,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get thought => $composableBuilder(
    column: $table.thought,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isThinking => $composableBuilder(
    column: $table.isThinking,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get webSearchStatus => $composableBuilder(
    column: $table.webSearchStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get webSearchQueriesJson => $composableBuilder(
    column: $table.webSearchQueriesJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get researchStatus => $composableBuilder(
    column: $table.researchStatus,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get attachmentsJson => $composableBuilder(
    column: $table.attachmentsJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get artifactJson => $composableBuilder(
    column: $table.artifactJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get imageGenerationJson => $composableBuilder(
    column: $table.imageGenerationJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get debateJson => $composableBuilder(
    column: $table.debateJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get clashJson => $composableBuilder(
    column: $table.clashJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get researchJson => $composableBuilder(
    column: $table.researchJson,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$ChatRowsTableOrderingComposer get chatId {
    final $$ChatRowsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.chatId,
      referencedTable: $db.chatRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ChatRowsTableOrderingComposer(
            $db: $db,
            $table: $db.chatRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ChatMessageRowsTableAnnotationComposer
    extends Composer<_$PrivoraDatabase, $ChatMessageRowsTable> {
  $$ChatMessageRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get role =>
      $composableBuilder(column: $table.role, builder: (column) => column);

  GeneratedColumn<String> get content =>
      $composableBuilder(column: $table.content, builder: (column) => column);

  GeneratedColumn<String> get thought =>
      $composableBuilder(column: $table.thought, builder: (column) => column);

  GeneratedColumn<bool> get isThinking => $composableBuilder(
    column: $table.isThinking,
    builder: (column) => column,
  );

  GeneratedColumn<String> get webSearchStatus => $composableBuilder(
    column: $table.webSearchStatus,
    builder: (column) => column,
  );

  GeneratedColumn<String> get webSearchQueriesJson => $composableBuilder(
    column: $table.webSearchQueriesJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get researchStatus => $composableBuilder(
    column: $table.researchStatus,
    builder: (column) => column,
  );

  GeneratedColumn<String> get attachmentsJson => $composableBuilder(
    column: $table.attachmentsJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get artifactJson => $composableBuilder(
    column: $table.artifactJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get imageGenerationJson => $composableBuilder(
    column: $table.imageGenerationJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get debateJson => $composableBuilder(
    column: $table.debateJson,
    builder: (column) => column,
  );

  GeneratedColumn<String> get clashJson =>
      $composableBuilder(column: $table.clashJson, builder: (column) => column);

  GeneratedColumn<String> get researchJson => $composableBuilder(
    column: $table.researchJson,
    builder: (column) => column,
  );

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  $$ChatRowsTableAnnotationComposer get chatId {
    final $$ChatRowsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.chatId,
      referencedTable: $db.chatRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ChatRowsTableAnnotationComposer(
            $db: $db,
            $table: $db.chatRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ChatMessageRowsTableTableManager
    extends
        RootTableManager<
          _$PrivoraDatabase,
          $ChatMessageRowsTable,
          ChatMessageRow,
          $$ChatMessageRowsTableFilterComposer,
          $$ChatMessageRowsTableOrderingComposer,
          $$ChatMessageRowsTableAnnotationComposer,
          $$ChatMessageRowsTableCreateCompanionBuilder,
          $$ChatMessageRowsTableUpdateCompanionBuilder,
          (ChatMessageRow, $$ChatMessageRowsTableReferences),
          ChatMessageRow,
          PrefetchHooks Function({bool chatId})
        > {
  $$ChatMessageRowsTableTableManager(
    _$PrivoraDatabase db,
    $ChatMessageRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ChatMessageRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ChatMessageRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ChatMessageRowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> chatId = const Value.absent(),
                Value<String> role = const Value.absent(),
                Value<String> content = const Value.absent(),
                Value<String?> thought = const Value.absent(),
                Value<bool?> isThinking = const Value.absent(),
                Value<String?> webSearchStatus = const Value.absent(),
                Value<String> webSearchQueriesJson = const Value.absent(),
                Value<String?> researchStatus = const Value.absent(),
                Value<String> attachmentsJson = const Value.absent(),
                Value<String?> artifactJson = const Value.absent(),
                Value<String?> imageGenerationJson = const Value.absent(),
                Value<String?> debateJson = const Value.absent(),
                Value<String?> clashJson = const Value.absent(),
                Value<String?> researchJson = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ChatMessageRowsCompanion(
                id: id,
                chatId: chatId,
                role: role,
                content: content,
                thought: thought,
                isThinking: isThinking,
                webSearchStatus: webSearchStatus,
                webSearchQueriesJson: webSearchQueriesJson,
                researchStatus: researchStatus,
                attachmentsJson: attachmentsJson,
                artifactJson: artifactJson,
                imageGenerationJson: imageGenerationJson,
                debateJson: debateJson,
                clashJson: clashJson,
                researchJson: researchJson,
                createdAt: createdAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String chatId,
                required String role,
                required String content,
                Value<String?> thought = const Value.absent(),
                Value<bool?> isThinking = const Value.absent(),
                Value<String?> webSearchStatus = const Value.absent(),
                Value<String> webSearchQueriesJson = const Value.absent(),
                Value<String?> researchStatus = const Value.absent(),
                Value<String> attachmentsJson = const Value.absent(),
                Value<String?> artifactJson = const Value.absent(),
                Value<String?> imageGenerationJson = const Value.absent(),
                Value<String?> debateJson = const Value.absent(),
                Value<String?> clashJson = const Value.absent(),
                Value<String?> researchJson = const Value.absent(),
                required int createdAt,
                Value<int> rowid = const Value.absent(),
              }) => ChatMessageRowsCompanion.insert(
                id: id,
                chatId: chatId,
                role: role,
                content: content,
                thought: thought,
                isThinking: isThinking,
                webSearchStatus: webSearchStatus,
                webSearchQueriesJson: webSearchQueriesJson,
                researchStatus: researchStatus,
                attachmentsJson: attachmentsJson,
                artifactJson: artifactJson,
                imageGenerationJson: imageGenerationJson,
                debateJson: debateJson,
                clashJson: clashJson,
                researchJson: researchJson,
                createdAt: createdAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$ChatMessageRowsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({chatId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (chatId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.chatId,
                                referencedTable:
                                    $$ChatMessageRowsTableReferences
                                        ._chatIdTable(db),
                                referencedColumn:
                                    $$ChatMessageRowsTableReferences
                                        ._chatIdTable(db)
                                        .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$ChatMessageRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$PrivoraDatabase,
      $ChatMessageRowsTable,
      ChatMessageRow,
      $$ChatMessageRowsTableFilterComposer,
      $$ChatMessageRowsTableOrderingComposer,
      $$ChatMessageRowsTableAnnotationComposer,
      $$ChatMessageRowsTableCreateCompanionBuilder,
      $$ChatMessageRowsTableUpdateCompanionBuilder,
      (ChatMessageRow, $$ChatMessageRowsTableReferences),
      ChatMessageRow,
      PrefetchHooks Function({bool chatId})
    >;
typedef $$ArtifactRowsTableCreateCompanionBuilder =
    ArtifactRowsCompanion Function({
      required String id,
      required String chatId,
      Value<String?> messageId,
      required String kind,
      required String title,
      Value<String?> language,
      required String content,
      required String status,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$ArtifactRowsTableUpdateCompanionBuilder =
    ArtifactRowsCompanion Function({
      Value<String> id,
      Value<String> chatId,
      Value<String?> messageId,
      Value<String> kind,
      Value<String> title,
      Value<String?> language,
      Value<String> content,
      Value<String> status,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

final class $$ArtifactRowsTableReferences
    extends BaseReferences<_$PrivoraDatabase, $ArtifactRowsTable, ArtifactRow> {
  $$ArtifactRowsTableReferences(super.$_db, super.$_table, super.$_typedResult);

  static $ChatRowsTable _chatIdTable(_$PrivoraDatabase db) =>
      db.chatRows.createAlias(
        $_aliasNameGenerator(db.artifactRows.chatId, db.chatRows.id),
      );

  $$ChatRowsTableProcessedTableManager get chatId {
    final $_column = $_itemColumn<String>('chat_id')!;

    final manager = $$ChatRowsTableTableManager(
      $_db,
      $_db.chatRows,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_chatIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$ArtifactRowsTableFilterComposer
    extends Composer<_$PrivoraDatabase, $ArtifactRowsTable> {
  $$ArtifactRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get messageId => $composableBuilder(
    column: $table.messageId,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get language => $composableBuilder(
    column: $table.language,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get content => $composableBuilder(
    column: $table.content,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  $$ChatRowsTableFilterComposer get chatId {
    final $$ChatRowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.chatId,
      referencedTable: $db.chatRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ChatRowsTableFilterComposer(
            $db: $db,
            $table: $db.chatRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ArtifactRowsTableOrderingComposer
    extends Composer<_$PrivoraDatabase, $ArtifactRowsTable> {
  $$ArtifactRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get messageId => $composableBuilder(
    column: $table.messageId,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get kind => $composableBuilder(
    column: $table.kind,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get language => $composableBuilder(
    column: $table.language,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get content => $composableBuilder(
    column: $table.content,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$ChatRowsTableOrderingComposer get chatId {
    final $$ChatRowsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.chatId,
      referencedTable: $db.chatRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ChatRowsTableOrderingComposer(
            $db: $db,
            $table: $db.chatRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ArtifactRowsTableAnnotationComposer
    extends Composer<_$PrivoraDatabase, $ArtifactRowsTable> {
  $$ArtifactRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get messageId =>
      $composableBuilder(column: $table.messageId, builder: (column) => column);

  GeneratedColumn<String> get kind =>
      $composableBuilder(column: $table.kind, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get language =>
      $composableBuilder(column: $table.language, builder: (column) => column);

  GeneratedColumn<String> get content =>
      $composableBuilder(column: $table.content, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  $$ChatRowsTableAnnotationComposer get chatId {
    final $$ChatRowsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.chatId,
      referencedTable: $db.chatRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$ChatRowsTableAnnotationComposer(
            $db: $db,
            $table: $db.chatRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$ArtifactRowsTableTableManager
    extends
        RootTableManager<
          _$PrivoraDatabase,
          $ArtifactRowsTable,
          ArtifactRow,
          $$ArtifactRowsTableFilterComposer,
          $$ArtifactRowsTableOrderingComposer,
          $$ArtifactRowsTableAnnotationComposer,
          $$ArtifactRowsTableCreateCompanionBuilder,
          $$ArtifactRowsTableUpdateCompanionBuilder,
          (ArtifactRow, $$ArtifactRowsTableReferences),
          ArtifactRow,
          PrefetchHooks Function({bool chatId})
        > {
  $$ArtifactRowsTableTableManager(
    _$PrivoraDatabase db,
    $ArtifactRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$ArtifactRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$ArtifactRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$ArtifactRowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> chatId = const Value.absent(),
                Value<String?> messageId = const Value.absent(),
                Value<String> kind = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String?> language = const Value.absent(),
                Value<String> content = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => ArtifactRowsCompanion(
                id: id,
                chatId: chatId,
                messageId: messageId,
                kind: kind,
                title: title,
                language: language,
                content: content,
                status: status,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String chatId,
                Value<String?> messageId = const Value.absent(),
                required String kind,
                required String title,
                Value<String?> language = const Value.absent(),
                required String content,
                required String status,
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => ArtifactRowsCompanion.insert(
                id: id,
                chatId: chatId,
                messageId: messageId,
                kind: kind,
                title: title,
                language: language,
                content: content,
                status: status,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$ArtifactRowsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({chatId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (chatId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.chatId,
                                referencedTable: $$ArtifactRowsTableReferences
                                    ._chatIdTable(db),
                                referencedColumn: $$ArtifactRowsTableReferences
                                    ._chatIdTable(db)
                                    .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$ArtifactRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$PrivoraDatabase,
      $ArtifactRowsTable,
      ArtifactRow,
      $$ArtifactRowsTableFilterComposer,
      $$ArtifactRowsTableOrderingComposer,
      $$ArtifactRowsTableAnnotationComposer,
      $$ArtifactRowsTableCreateCompanionBuilder,
      $$ArtifactRowsTableUpdateCompanionBuilder,
      (ArtifactRow, $$ArtifactRowsTableReferences),
      ArtifactRow,
      PrefetchHooks Function({bool chatId})
    >;
typedef $$WebDevProjectRowsTableCreateCompanionBuilder =
    WebDevProjectRowsCompanion Function({
      required String id,
      required String title,
      required String status,
      Value<bool> isStarred,
      Value<String?> previewUrl,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$WebDevProjectRowsTableUpdateCompanionBuilder =
    WebDevProjectRowsCompanion Function({
      Value<String> id,
      Value<String> title,
      Value<String> status,
      Value<bool> isStarred,
      Value<String?> previewUrl,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

final class $$WebDevProjectRowsTableReferences
    extends
        BaseReferences<
          _$PrivoraDatabase,
          $WebDevProjectRowsTable,
          WebDevProjectRow
        > {
  $$WebDevProjectRowsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static MultiTypedResultKey<$WebDevThreadRowsTable, List<WebDevThreadRow>>
  _webDevThreadRowsRefsTable(_$PrivoraDatabase db) =>
      MultiTypedResultKey.fromTable(
        db.webDevThreadRows,
        aliasName: $_aliasNameGenerator(
          db.webDevProjectRows.id,
          db.webDevThreadRows.projectId,
        ),
      );

  $$WebDevThreadRowsTableProcessedTableManager get webDevThreadRowsRefs {
    final manager = $$WebDevThreadRowsTableTableManager(
      $_db,
      $_db.webDevThreadRows,
    ).filter((f) => f.projectId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(
      _webDevThreadRowsRefsTable($_db),
    );
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$WebDevProjectRowsTableFilterComposer
    extends Composer<_$PrivoraDatabase, $WebDevProjectRowsTable> {
  $$WebDevProjectRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get previewUrl => $composableBuilder(
    column: $table.previewUrl,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> webDevThreadRowsRefs(
    Expression<bool> Function($$WebDevThreadRowsTableFilterComposer f) f,
  ) {
    final $$WebDevThreadRowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.webDevThreadRows,
      getReferencedColumn: (t) => t.projectId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$WebDevThreadRowsTableFilterComposer(
            $db: $db,
            $table: $db.webDevThreadRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$WebDevProjectRowsTableOrderingComposer
    extends Composer<_$PrivoraDatabase, $WebDevProjectRowsTable> {
  $$WebDevProjectRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get status => $composableBuilder(
    column: $table.status,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get previewUrl => $composableBuilder(
    column: $table.previewUrl,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$WebDevProjectRowsTableAnnotationComposer
    extends Composer<_$PrivoraDatabase, $WebDevProjectRowsTable> {
  $$WebDevProjectRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get status =>
      $composableBuilder(column: $table.status, builder: (column) => column);

  GeneratedColumn<bool> get isStarred =>
      $composableBuilder(column: $table.isStarred, builder: (column) => column);

  GeneratedColumn<String> get previewUrl => $composableBuilder(
    column: $table.previewUrl,
    builder: (column) => column,
  );

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  Expression<T> webDevThreadRowsRefs<T extends Object>(
    Expression<T> Function($$WebDevThreadRowsTableAnnotationComposer a) f,
  ) {
    final $$WebDevThreadRowsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.webDevThreadRows,
      getReferencedColumn: (t) => t.projectId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$WebDevThreadRowsTableAnnotationComposer(
            $db: $db,
            $table: $db.webDevThreadRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$WebDevProjectRowsTableTableManager
    extends
        RootTableManager<
          _$PrivoraDatabase,
          $WebDevProjectRowsTable,
          WebDevProjectRow,
          $$WebDevProjectRowsTableFilterComposer,
          $$WebDevProjectRowsTableOrderingComposer,
          $$WebDevProjectRowsTableAnnotationComposer,
          $$WebDevProjectRowsTableCreateCompanionBuilder,
          $$WebDevProjectRowsTableUpdateCompanionBuilder,
          (WebDevProjectRow, $$WebDevProjectRowsTableReferences),
          WebDevProjectRow,
          PrefetchHooks Function({bool webDevThreadRowsRefs})
        > {
  $$WebDevProjectRowsTableTableManager(
    _$PrivoraDatabase db,
    $WebDevProjectRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$WebDevProjectRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$WebDevProjectRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$WebDevProjectRowsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String> status = const Value.absent(),
                Value<bool> isStarred = const Value.absent(),
                Value<String?> previewUrl = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => WebDevProjectRowsCompanion(
                id: id,
                title: title,
                status: status,
                isStarred: isStarred,
                previewUrl: previewUrl,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String title,
                required String status,
                Value<bool> isStarred = const Value.absent(),
                Value<String?> previewUrl = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => WebDevProjectRowsCompanion.insert(
                id: id,
                title: title,
                status: status,
                isStarred: isStarred,
                previewUrl: previewUrl,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$WebDevProjectRowsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({webDevThreadRowsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (webDevThreadRowsRefs) db.webDevThreadRows,
              ],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (webDevThreadRowsRefs)
                    await $_getPrefetchedData<
                      WebDevProjectRow,
                      $WebDevProjectRowsTable,
                      WebDevThreadRow
                    >(
                      currentTable: table,
                      referencedTable: $$WebDevProjectRowsTableReferences
                          ._webDevThreadRowsRefsTable(db),
                      managerFromTypedResult: (p0) =>
                          $$WebDevProjectRowsTableReferences(
                            db,
                            table,
                            p0,
                          ).webDevThreadRowsRefs,
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where((e) => e.projectId == item.id),
                      typedResults: items,
                    ),
                ];
              },
            );
          },
        ),
      );
}

typedef $$WebDevProjectRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$PrivoraDatabase,
      $WebDevProjectRowsTable,
      WebDevProjectRow,
      $$WebDevProjectRowsTableFilterComposer,
      $$WebDevProjectRowsTableOrderingComposer,
      $$WebDevProjectRowsTableAnnotationComposer,
      $$WebDevProjectRowsTableCreateCompanionBuilder,
      $$WebDevProjectRowsTableUpdateCompanionBuilder,
      (WebDevProjectRow, $$WebDevProjectRowsTableReferences),
      WebDevProjectRow,
      PrefetchHooks Function({bool webDevThreadRowsRefs})
    >;
typedef $$WebDevThreadRowsTableCreateCompanionBuilder =
    WebDevThreadRowsCompanion Function({
      required String id,
      required String projectId,
      required String title,
      Value<bool> isStarred,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$WebDevThreadRowsTableUpdateCompanionBuilder =
    WebDevThreadRowsCompanion Function({
      Value<String> id,
      Value<String> projectId,
      Value<String> title,
      Value<bool> isStarred,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

final class $$WebDevThreadRowsTableReferences
    extends
        BaseReferences<
          _$PrivoraDatabase,
          $WebDevThreadRowsTable,
          WebDevThreadRow
        > {
  $$WebDevThreadRowsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $WebDevProjectRowsTable _projectIdTable(_$PrivoraDatabase db) =>
      db.webDevProjectRows.createAlias(
        $_aliasNameGenerator(
          db.webDevThreadRows.projectId,
          db.webDevProjectRows.id,
        ),
      );

  $$WebDevProjectRowsTableProcessedTableManager get projectId {
    final $_column = $_itemColumn<String>('project_id')!;

    final manager = $$WebDevProjectRowsTableTableManager(
      $_db,
      $_db.webDevProjectRows,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_projectIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$WebDevThreadRowsTableFilterComposer
    extends Composer<_$PrivoraDatabase, $WebDevThreadRowsTable> {
  $$WebDevThreadRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  $$WebDevProjectRowsTableFilterComposer get projectId {
    final $$WebDevProjectRowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.projectId,
      referencedTable: $db.webDevProjectRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$WebDevProjectRowsTableFilterComposer(
            $db: $db,
            $table: $db.webDevProjectRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$WebDevThreadRowsTableOrderingComposer
    extends Composer<_$PrivoraDatabase, $WebDevThreadRowsTable> {
  $$WebDevThreadRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$WebDevProjectRowsTableOrderingComposer get projectId {
    final $$WebDevProjectRowsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.projectId,
      referencedTable: $db.webDevProjectRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$WebDevProjectRowsTableOrderingComposer(
            $db: $db,
            $table: $db.webDevProjectRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$WebDevThreadRowsTableAnnotationComposer
    extends Composer<_$PrivoraDatabase, $WebDevThreadRowsTable> {
  $$WebDevThreadRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<bool> get isStarred =>
      $composableBuilder(column: $table.isStarred, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  $$WebDevProjectRowsTableAnnotationComposer get projectId {
    final $$WebDevProjectRowsTableAnnotationComposer composer =
        $composerBuilder(
          composer: this,
          getCurrentColumn: (t) => t.projectId,
          referencedTable: $db.webDevProjectRows,
          getReferencedColumn: (t) => t.id,
          builder:
              (
                joinBuilder, {
                $addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer,
              }) => $$WebDevProjectRowsTableAnnotationComposer(
                $db: $db,
                $table: $db.webDevProjectRows,
                $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
                joinBuilder: joinBuilder,
                $removeJoinBuilderFromRootComposer:
                    $removeJoinBuilderFromRootComposer,
              ),
        );
    return composer;
  }
}

class $$WebDevThreadRowsTableTableManager
    extends
        RootTableManager<
          _$PrivoraDatabase,
          $WebDevThreadRowsTable,
          WebDevThreadRow,
          $$WebDevThreadRowsTableFilterComposer,
          $$WebDevThreadRowsTableOrderingComposer,
          $$WebDevThreadRowsTableAnnotationComposer,
          $$WebDevThreadRowsTableCreateCompanionBuilder,
          $$WebDevThreadRowsTableUpdateCompanionBuilder,
          (WebDevThreadRow, $$WebDevThreadRowsTableReferences),
          WebDevThreadRow,
          PrefetchHooks Function({bool projectId})
        > {
  $$WebDevThreadRowsTableTableManager(
    _$PrivoraDatabase db,
    $WebDevThreadRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$WebDevThreadRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$WebDevThreadRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$WebDevThreadRowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> projectId = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<bool> isStarred = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => WebDevThreadRowsCompanion(
                id: id,
                projectId: projectId,
                title: title,
                isStarred: isStarred,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String projectId,
                required String title,
                Value<bool> isStarred = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => WebDevThreadRowsCompanion.insert(
                id: id,
                projectId: projectId,
                title: title,
                isStarred: isStarred,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$WebDevThreadRowsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({projectId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (projectId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.projectId,
                                referencedTable:
                                    $$WebDevThreadRowsTableReferences
                                        ._projectIdTable(db),
                                referencedColumn:
                                    $$WebDevThreadRowsTableReferences
                                        ._projectIdTable(db)
                                        .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$WebDevThreadRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$PrivoraDatabase,
      $WebDevThreadRowsTable,
      WebDevThreadRow,
      $$WebDevThreadRowsTableFilterComposer,
      $$WebDevThreadRowsTableOrderingComposer,
      $$WebDevThreadRowsTableAnnotationComposer,
      $$WebDevThreadRowsTableCreateCompanionBuilder,
      $$WebDevThreadRowsTableUpdateCompanionBuilder,
      (WebDevThreadRow, $$WebDevThreadRowsTableReferences),
      WebDevThreadRow,
      PrefetchHooks Function({bool projectId})
    >;
typedef $$CharacterRowsTableCreateCompanionBuilder =
    CharacterRowsCompanion Function({
      required String id,
      required String name,
      required String avatar,
      required int color,
      required String tagline,
      required String category,
      required String greeting,
      Value<String> personality,
      Value<String> speakingStyle,
      Value<String> boundaries,
      Value<String> exampleDialogue,
      Value<String> visibility,
      Value<bool> isStarred,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$CharacterRowsTableUpdateCompanionBuilder =
    CharacterRowsCompanion Function({
      Value<String> id,
      Value<String> name,
      Value<String> avatar,
      Value<int> color,
      Value<String> tagline,
      Value<String> category,
      Value<String> greeting,
      Value<String> personality,
      Value<String> speakingStyle,
      Value<String> boundaries,
      Value<String> exampleDialogue,
      Value<String> visibility,
      Value<bool> isStarred,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

final class $$CharacterRowsTableReferences
    extends
        BaseReferences<_$PrivoraDatabase, $CharacterRowsTable, CharacterRow> {
  $$CharacterRowsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static MultiTypedResultKey<
    $CharacterSessionRowsTable,
    List<CharacterSessionRow>
  >
  _characterSessionRowsRefsTable(_$PrivoraDatabase db) =>
      MultiTypedResultKey.fromTable(
        db.characterSessionRows,
        aliasName: $_aliasNameGenerator(
          db.characterRows.id,
          db.characterSessionRows.characterId,
        ),
      );

  $$CharacterSessionRowsTableProcessedTableManager
  get characterSessionRowsRefs {
    final manager = $$CharacterSessionRowsTableTableManager(
      $_db,
      $_db.characterSessionRows,
    ).filter((f) => f.characterId.id.sqlEquals($_itemColumn<String>('id')!));

    final cache = $_typedResult.readTableOrNull(
      _characterSessionRowsRefsTable($_db),
    );
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: cache),
    );
  }
}

class $$CharacterRowsTableFilterComposer
    extends Composer<_$PrivoraDatabase, $CharacterRowsTable> {
  $$CharacterRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get avatar => $composableBuilder(
    column: $table.avatar,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get color => $composableBuilder(
    column: $table.color,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get tagline => $composableBuilder(
    column: $table.tagline,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get greeting => $composableBuilder(
    column: $table.greeting,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get personality => $composableBuilder(
    column: $table.personality,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get speakingStyle => $composableBuilder(
    column: $table.speakingStyle,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get boundaries => $composableBuilder(
    column: $table.boundaries,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get exampleDialogue => $composableBuilder(
    column: $table.exampleDialogue,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get visibility => $composableBuilder(
    column: $table.visibility,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  Expression<bool> characterSessionRowsRefs(
    Expression<bool> Function($$CharacterSessionRowsTableFilterComposer f) f,
  ) {
    final $$CharacterSessionRowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.id,
      referencedTable: $db.characterSessionRows,
      getReferencedColumn: (t) => t.characterId,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$CharacterSessionRowsTableFilterComposer(
            $db: $db,
            $table: $db.characterSessionRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return f(composer);
  }
}

class $$CharacterRowsTableOrderingComposer
    extends Composer<_$PrivoraDatabase, $CharacterRowsTable> {
  $$CharacterRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get name => $composableBuilder(
    column: $table.name,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get avatar => $composableBuilder(
    column: $table.avatar,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get color => $composableBuilder(
    column: $table.color,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get tagline => $composableBuilder(
    column: $table.tagline,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get category => $composableBuilder(
    column: $table.category,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get greeting => $composableBuilder(
    column: $table.greeting,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get personality => $composableBuilder(
    column: $table.personality,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get speakingStyle => $composableBuilder(
    column: $table.speakingStyle,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get boundaries => $composableBuilder(
    column: $table.boundaries,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get exampleDialogue => $composableBuilder(
    column: $table.exampleDialogue,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get visibility => $composableBuilder(
    column: $table.visibility,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );
}

class $$CharacterRowsTableAnnotationComposer
    extends Composer<_$PrivoraDatabase, $CharacterRowsTable> {
  $$CharacterRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get name =>
      $composableBuilder(column: $table.name, builder: (column) => column);

  GeneratedColumn<String> get avatar =>
      $composableBuilder(column: $table.avatar, builder: (column) => column);

  GeneratedColumn<int> get color =>
      $composableBuilder(column: $table.color, builder: (column) => column);

  GeneratedColumn<String> get tagline =>
      $composableBuilder(column: $table.tagline, builder: (column) => column);

  GeneratedColumn<String> get category =>
      $composableBuilder(column: $table.category, builder: (column) => column);

  GeneratedColumn<String> get greeting =>
      $composableBuilder(column: $table.greeting, builder: (column) => column);

  GeneratedColumn<String> get personality => $composableBuilder(
    column: $table.personality,
    builder: (column) => column,
  );

  GeneratedColumn<String> get speakingStyle => $composableBuilder(
    column: $table.speakingStyle,
    builder: (column) => column,
  );

  GeneratedColumn<String> get boundaries => $composableBuilder(
    column: $table.boundaries,
    builder: (column) => column,
  );

  GeneratedColumn<String> get exampleDialogue => $composableBuilder(
    column: $table.exampleDialogue,
    builder: (column) => column,
  );

  GeneratedColumn<String> get visibility => $composableBuilder(
    column: $table.visibility,
    builder: (column) => column,
  );

  GeneratedColumn<bool> get isStarred =>
      $composableBuilder(column: $table.isStarred, builder: (column) => column);

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  Expression<T> characterSessionRowsRefs<T extends Object>(
    Expression<T> Function($$CharacterSessionRowsTableAnnotationComposer a) f,
  ) {
    final $$CharacterSessionRowsTableAnnotationComposer composer =
        $composerBuilder(
          composer: this,
          getCurrentColumn: (t) => t.id,
          referencedTable: $db.characterSessionRows,
          getReferencedColumn: (t) => t.characterId,
          builder:
              (
                joinBuilder, {
                $addJoinBuilderToRootComposer,
                $removeJoinBuilderFromRootComposer,
              }) => $$CharacterSessionRowsTableAnnotationComposer(
                $db: $db,
                $table: $db.characterSessionRows,
                $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
                joinBuilder: joinBuilder,
                $removeJoinBuilderFromRootComposer:
                    $removeJoinBuilderFromRootComposer,
              ),
        );
    return f(composer);
  }
}

class $$CharacterRowsTableTableManager
    extends
        RootTableManager<
          _$PrivoraDatabase,
          $CharacterRowsTable,
          CharacterRow,
          $$CharacterRowsTableFilterComposer,
          $$CharacterRowsTableOrderingComposer,
          $$CharacterRowsTableAnnotationComposer,
          $$CharacterRowsTableCreateCompanionBuilder,
          $$CharacterRowsTableUpdateCompanionBuilder,
          (CharacterRow, $$CharacterRowsTableReferences),
          CharacterRow,
          PrefetchHooks Function({bool characterSessionRowsRefs})
        > {
  $$CharacterRowsTableTableManager(
    _$PrivoraDatabase db,
    $CharacterRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CharacterRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CharacterRowsTableOrderingComposer($db: db, $table: table),
          createComputedFieldComposer: () =>
              $$CharacterRowsTableAnnotationComposer($db: db, $table: table),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> name = const Value.absent(),
                Value<String> avatar = const Value.absent(),
                Value<int> color = const Value.absent(),
                Value<String> tagline = const Value.absent(),
                Value<String> category = const Value.absent(),
                Value<String> greeting = const Value.absent(),
                Value<String> personality = const Value.absent(),
                Value<String> speakingStyle = const Value.absent(),
                Value<String> boundaries = const Value.absent(),
                Value<String> exampleDialogue = const Value.absent(),
                Value<String> visibility = const Value.absent(),
                Value<bool> isStarred = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CharacterRowsCompanion(
                id: id,
                name: name,
                avatar: avatar,
                color: color,
                tagline: tagline,
                category: category,
                greeting: greeting,
                personality: personality,
                speakingStyle: speakingStyle,
                boundaries: boundaries,
                exampleDialogue: exampleDialogue,
                visibility: visibility,
                isStarred: isStarred,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String name,
                required String avatar,
                required int color,
                required String tagline,
                required String category,
                required String greeting,
                Value<String> personality = const Value.absent(),
                Value<String> speakingStyle = const Value.absent(),
                Value<String> boundaries = const Value.absent(),
                Value<String> exampleDialogue = const Value.absent(),
                Value<String> visibility = const Value.absent(),
                Value<bool> isStarred = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => CharacterRowsCompanion.insert(
                id: id,
                name: name,
                avatar: avatar,
                color: color,
                tagline: tagline,
                category: category,
                greeting: greeting,
                personality: personality,
                speakingStyle: speakingStyle,
                boundaries: boundaries,
                exampleDialogue: exampleDialogue,
                visibility: visibility,
                isStarred: isStarred,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$CharacterRowsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({characterSessionRowsRefs = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [
                if (characterSessionRowsRefs) db.characterSessionRows,
              ],
              addJoins: null,
              getPrefetchedDataCallback: (items) async {
                return [
                  if (characterSessionRowsRefs)
                    await $_getPrefetchedData<
                      CharacterRow,
                      $CharacterRowsTable,
                      CharacterSessionRow
                    >(
                      currentTable: table,
                      referencedTable: $$CharacterRowsTableReferences
                          ._characterSessionRowsRefsTable(db),
                      managerFromTypedResult: (p0) =>
                          $$CharacterRowsTableReferences(
                            db,
                            table,
                            p0,
                          ).characterSessionRowsRefs,
                      referencedItemsForCurrentItem: (item, referencedItems) =>
                          referencedItems.where(
                            (e) => e.characterId == item.id,
                          ),
                      typedResults: items,
                    ),
                ];
              },
            );
          },
        ),
      );
}

typedef $$CharacterRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$PrivoraDatabase,
      $CharacterRowsTable,
      CharacterRow,
      $$CharacterRowsTableFilterComposer,
      $$CharacterRowsTableOrderingComposer,
      $$CharacterRowsTableAnnotationComposer,
      $$CharacterRowsTableCreateCompanionBuilder,
      $$CharacterRowsTableUpdateCompanionBuilder,
      (CharacterRow, $$CharacterRowsTableReferences),
      CharacterRow,
      PrefetchHooks Function({bool characterSessionRowsRefs})
    >;
typedef $$CharacterSessionRowsTableCreateCompanionBuilder =
    CharacterSessionRowsCompanion Function({
      required String id,
      required String characterId,
      required String title,
      Value<String?> model,
      Value<bool> isStarred,
      Value<bool> memoryEnabled,
      required int createdAt,
      required int updatedAt,
      Value<int> rowid,
    });
typedef $$CharacterSessionRowsTableUpdateCompanionBuilder =
    CharacterSessionRowsCompanion Function({
      Value<String> id,
      Value<String> characterId,
      Value<String> title,
      Value<String?> model,
      Value<bool> isStarred,
      Value<bool> memoryEnabled,
      Value<int> createdAt,
      Value<int> updatedAt,
      Value<int> rowid,
    });

final class $$CharacterSessionRowsTableReferences
    extends
        BaseReferences<
          _$PrivoraDatabase,
          $CharacterSessionRowsTable,
          CharacterSessionRow
        > {
  $$CharacterSessionRowsTableReferences(
    super.$_db,
    super.$_table,
    super.$_typedResult,
  );

  static $CharacterRowsTable _characterIdTable(_$PrivoraDatabase db) =>
      db.characterRows.createAlias(
        $_aliasNameGenerator(
          db.characterSessionRows.characterId,
          db.characterRows.id,
        ),
      );

  $$CharacterRowsTableProcessedTableManager get characterId {
    final $_column = $_itemColumn<String>('character_id')!;

    final manager = $$CharacterRowsTableTableManager(
      $_db,
      $_db.characterRows,
    ).filter((f) => f.id.sqlEquals($_column));
    final item = $_typedResult.readTableOrNull(_characterIdTable($_db));
    if (item == null) return manager;
    return ProcessedTableManager(
      manager.$state.copyWith(prefetchedData: [item]),
    );
  }
}

class $$CharacterSessionRowsTableFilterComposer
    extends Composer<_$PrivoraDatabase, $CharacterSessionRowsTable> {
  $$CharacterSessionRowsTableFilterComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnFilters<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<String> get model => $composableBuilder(
    column: $table.model,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<bool> get memoryEnabled => $composableBuilder(
    column: $table.memoryEnabled,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnFilters(column),
  );

  ColumnFilters<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnFilters(column),
  );

  $$CharacterRowsTableFilterComposer get characterId {
    final $$CharacterRowsTableFilterComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.characterId,
      referencedTable: $db.characterRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$CharacterRowsTableFilterComposer(
            $db: $db,
            $table: $db.characterRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$CharacterSessionRowsTableOrderingComposer
    extends Composer<_$PrivoraDatabase, $CharacterSessionRowsTable> {
  $$CharacterSessionRowsTableOrderingComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  ColumnOrderings<String> get id => $composableBuilder(
    column: $table.id,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get title => $composableBuilder(
    column: $table.title,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<String> get model => $composableBuilder(
    column: $table.model,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get isStarred => $composableBuilder(
    column: $table.isStarred,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<bool> get memoryEnabled => $composableBuilder(
    column: $table.memoryEnabled,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get createdAt => $composableBuilder(
    column: $table.createdAt,
    builder: (column) => ColumnOrderings(column),
  );

  ColumnOrderings<int> get updatedAt => $composableBuilder(
    column: $table.updatedAt,
    builder: (column) => ColumnOrderings(column),
  );

  $$CharacterRowsTableOrderingComposer get characterId {
    final $$CharacterRowsTableOrderingComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.characterId,
      referencedTable: $db.characterRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$CharacterRowsTableOrderingComposer(
            $db: $db,
            $table: $db.characterRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$CharacterSessionRowsTableAnnotationComposer
    extends Composer<_$PrivoraDatabase, $CharacterSessionRowsTable> {
  $$CharacterSessionRowsTableAnnotationComposer({
    required super.$db,
    required super.$table,
    super.joinBuilder,
    super.$addJoinBuilderToRootComposer,
    super.$removeJoinBuilderFromRootComposer,
  });
  GeneratedColumn<String> get id =>
      $composableBuilder(column: $table.id, builder: (column) => column);

  GeneratedColumn<String> get title =>
      $composableBuilder(column: $table.title, builder: (column) => column);

  GeneratedColumn<String> get model =>
      $composableBuilder(column: $table.model, builder: (column) => column);

  GeneratedColumn<bool> get isStarred =>
      $composableBuilder(column: $table.isStarred, builder: (column) => column);

  GeneratedColumn<bool> get memoryEnabled => $composableBuilder(
    column: $table.memoryEnabled,
    builder: (column) => column,
  );

  GeneratedColumn<int> get createdAt =>
      $composableBuilder(column: $table.createdAt, builder: (column) => column);

  GeneratedColumn<int> get updatedAt =>
      $composableBuilder(column: $table.updatedAt, builder: (column) => column);

  $$CharacterRowsTableAnnotationComposer get characterId {
    final $$CharacterRowsTableAnnotationComposer composer = $composerBuilder(
      composer: this,
      getCurrentColumn: (t) => t.characterId,
      referencedTable: $db.characterRows,
      getReferencedColumn: (t) => t.id,
      builder:
          (
            joinBuilder, {
            $addJoinBuilderToRootComposer,
            $removeJoinBuilderFromRootComposer,
          }) => $$CharacterRowsTableAnnotationComposer(
            $db: $db,
            $table: $db.characterRows,
            $addJoinBuilderToRootComposer: $addJoinBuilderToRootComposer,
            joinBuilder: joinBuilder,
            $removeJoinBuilderFromRootComposer:
                $removeJoinBuilderFromRootComposer,
          ),
    );
    return composer;
  }
}

class $$CharacterSessionRowsTableTableManager
    extends
        RootTableManager<
          _$PrivoraDatabase,
          $CharacterSessionRowsTable,
          CharacterSessionRow,
          $$CharacterSessionRowsTableFilterComposer,
          $$CharacterSessionRowsTableOrderingComposer,
          $$CharacterSessionRowsTableAnnotationComposer,
          $$CharacterSessionRowsTableCreateCompanionBuilder,
          $$CharacterSessionRowsTableUpdateCompanionBuilder,
          (CharacterSessionRow, $$CharacterSessionRowsTableReferences),
          CharacterSessionRow,
          PrefetchHooks Function({bool characterId})
        > {
  $$CharacterSessionRowsTableTableManager(
    _$PrivoraDatabase db,
    $CharacterSessionRowsTable table,
  ) : super(
        TableManagerState(
          db: db,
          table: table,
          createFilteringComposer: () =>
              $$CharacterSessionRowsTableFilterComposer($db: db, $table: table),
          createOrderingComposer: () =>
              $$CharacterSessionRowsTableOrderingComposer(
                $db: db,
                $table: table,
              ),
          createComputedFieldComposer: () =>
              $$CharacterSessionRowsTableAnnotationComposer(
                $db: db,
                $table: table,
              ),
          updateCompanionCallback:
              ({
                Value<String> id = const Value.absent(),
                Value<String> characterId = const Value.absent(),
                Value<String> title = const Value.absent(),
                Value<String?> model = const Value.absent(),
                Value<bool> isStarred = const Value.absent(),
                Value<bool> memoryEnabled = const Value.absent(),
                Value<int> createdAt = const Value.absent(),
                Value<int> updatedAt = const Value.absent(),
                Value<int> rowid = const Value.absent(),
              }) => CharacterSessionRowsCompanion(
                id: id,
                characterId: characterId,
                title: title,
                model: model,
                isStarred: isStarred,
                memoryEnabled: memoryEnabled,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          createCompanionCallback:
              ({
                required String id,
                required String characterId,
                required String title,
                Value<String?> model = const Value.absent(),
                Value<bool> isStarred = const Value.absent(),
                Value<bool> memoryEnabled = const Value.absent(),
                required int createdAt,
                required int updatedAt,
                Value<int> rowid = const Value.absent(),
              }) => CharacterSessionRowsCompanion.insert(
                id: id,
                characterId: characterId,
                title: title,
                model: model,
                isStarred: isStarred,
                memoryEnabled: memoryEnabled,
                createdAt: createdAt,
                updatedAt: updatedAt,
                rowid: rowid,
              ),
          withReferenceMapper: (p0) => p0
              .map(
                (e) => (
                  e.readTable(table),
                  $$CharacterSessionRowsTableReferences(db, table, e),
                ),
              )
              .toList(),
          prefetchHooksCallback: ({characterId = false}) {
            return PrefetchHooks(
              db: db,
              explicitlyWatchedTables: [],
              addJoins:
                  <
                    T extends TableManagerState<
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic,
                      dynamic
                    >
                  >(state) {
                    if (characterId) {
                      state =
                          state.withJoin(
                                currentTable: table,
                                currentColumn: table.characterId,
                                referencedTable:
                                    $$CharacterSessionRowsTableReferences
                                        ._characterIdTable(db),
                                referencedColumn:
                                    $$CharacterSessionRowsTableReferences
                                        ._characterIdTable(db)
                                        .id,
                              )
                              as T;
                    }

                    return state;
                  },
              getPrefetchedDataCallback: (items) async {
                return [];
              },
            );
          },
        ),
      );
}

typedef $$CharacterSessionRowsTableProcessedTableManager =
    ProcessedTableManager<
      _$PrivoraDatabase,
      $CharacterSessionRowsTable,
      CharacterSessionRow,
      $$CharacterSessionRowsTableFilterComposer,
      $$CharacterSessionRowsTableOrderingComposer,
      $$CharacterSessionRowsTableAnnotationComposer,
      $$CharacterSessionRowsTableCreateCompanionBuilder,
      $$CharacterSessionRowsTableUpdateCompanionBuilder,
      (CharacterSessionRow, $$CharacterSessionRowsTableReferences),
      CharacterSessionRow,
      PrefetchHooks Function({bool characterId})
    >;

class $PrivoraDatabaseManager {
  final _$PrivoraDatabase _db;
  $PrivoraDatabaseManager(this._db);
  $$UiSettingsRowsTableTableManager get uiSettingsRows =>
      $$UiSettingsRowsTableTableManager(_db, _db.uiSettingsRows);
  $$ChatRowsTableTableManager get chatRows =>
      $$ChatRowsTableTableManager(_db, _db.chatRows);
  $$ChatMessageRowsTableTableManager get chatMessageRows =>
      $$ChatMessageRowsTableTableManager(_db, _db.chatMessageRows);
  $$ArtifactRowsTableTableManager get artifactRows =>
      $$ArtifactRowsTableTableManager(_db, _db.artifactRows);
  $$WebDevProjectRowsTableTableManager get webDevProjectRows =>
      $$WebDevProjectRowsTableTableManager(_db, _db.webDevProjectRows);
  $$WebDevThreadRowsTableTableManager get webDevThreadRows =>
      $$WebDevThreadRowsTableTableManager(_db, _db.webDevThreadRows);
  $$CharacterRowsTableTableManager get characterRows =>
      $$CharacterRowsTableTableManager(_db, _db.characterRows);
  $$CharacterSessionRowsTableTableManager get characterSessionRows =>
      $$CharacterSessionRowsTableTableManager(_db, _db.characterSessionRows);
}
