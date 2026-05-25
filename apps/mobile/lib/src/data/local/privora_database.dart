import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:path_provider/path_provider.dart';

part 'privora_database.g.dart';

class UiSettingsRows extends Table {
  TextColumn get id => text()();
  TextColumn get workspaceMode => text().withDefault(const Constant('chat'))();
  TextColumn get selectedModel => text()();
  TextColumn get selectedStyle =>
      text().withDefault(const Constant('normal'))();
  BoolColumn get isThinkingEnabled =>
      boolean().withDefault(const Constant(false))();
  BoolColumn get isWebSearchEnabled =>
      boolean().withDefault(const Constant(false))();
  BoolColumn get isDeepResearchEnabled =>
      boolean().withDefault(const Constant(false))();
  BoolColumn get isDebateModeEnabled =>
      boolean().withDefault(const Constant(false))();
  BoolColumn get isClashModeEnabled =>
      boolean().withDefault(const Constant(false))();
  BoolColumn get isDarkMode => boolean().withDefault(const Constant(false))();
  TextColumn get composerMode => text().withDefault(const Constant('chat'))();
  TextColumn get imageModel => text()();
  TextColumn get imageSizePreset =>
      text().withDefault(const Constant('square'))();
  TextColumn get imageQuality => text().withDefault(const Constant('medium'))();
  IntColumn get imageCount => integer().withDefault(const Constant(1))();
  IntColumn get imagePartialImages =>
      integer().withDefault(const Constant(0))();
  TextColumn get imageOutputFormat =>
      text().withDefault(const Constant('png'))();
  TextColumn get debateAgentAModel => text().nullable()();
  TextColumn get debateAgentBModel => text().nullable()();
  TextColumn get debateJudgeModel => text().nullable()();
  TextColumn get clashAgentAModel => text().nullable()();
  TextColumn get clashAgentBModel => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class ChatRows extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();
  TextColumn get model => text().nullable()();
  TextColumn get pendingResearchIntentJson => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class ChatMessageRows extends Table {
  TextColumn get id => text()();
  TextColumn get chatId =>
      text().references(ChatRows, #id, onDelete: KeyAction.cascade)();
  TextColumn get role => text()();
  TextColumn get content => text()();
  TextColumn get thought => text().nullable()();
  BoolColumn get isThinking => boolean().nullable()();
  TextColumn get webSearchStatus => text().nullable()();
  TextColumn get webSearchQueriesJson =>
      text().withDefault(const Constant('[]'))();
  TextColumn get researchStatus => text().nullable()();
  TextColumn get attachmentsJson => text().withDefault(const Constant('[]'))();
  TextColumn get artifactJson => text().nullable()();
  TextColumn get imageGenerationJson => text().nullable()();
  TextColumn get debateJson => text().nullable()();
  TextColumn get clashJson => text().nullable()();
  TextColumn get researchJson => text().nullable()();
  IntColumn get createdAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class ArtifactRows extends Table {
  TextColumn get id => text()();
  TextColumn get chatId =>
      text().references(ChatRows, #id, onDelete: KeyAction.cascade)();
  TextColumn get messageId => text().nullable()();
  TextColumn get kind => text()();
  TextColumn get title => text()();
  TextColumn get language => text().nullable()();
  TextColumn get content => text()();
  TextColumn get status => text()();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class WebDevProjectRows extends Table {
  TextColumn get id => text()();
  TextColumn get title => text()();
  TextColumn get status => text()();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  TextColumn get previewUrl => text().nullable()();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class WebDevThreadRows extends Table {
  TextColumn get id => text()();
  TextColumn get projectId =>
      text().references(WebDevProjectRows, #id, onDelete: KeyAction.cascade)();
  TextColumn get title => text()();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class CharacterRows extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get avatar => text()();
  IntColumn get color => integer()();
  TextColumn get tagline => text()();
  TextColumn get category => text()();
  TextColumn get greeting => text()();
  TextColumn get personality => text().withDefault(const Constant(''))();
  TextColumn get speakingStyle => text().withDefault(const Constant(''))();
  TextColumn get boundaries => text().withDefault(const Constant(''))();
  TextColumn get exampleDialogue => text().withDefault(const Constant(''))();
  TextColumn get visibility => text().withDefault(const Constant('private'))();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class CharacterSessionRows extends Table {
  TextColumn get id => text()();
  TextColumn get characterId =>
      text().references(CharacterRows, #id, onDelete: KeyAction.cascade)();
  TextColumn get title => text()();
  TextColumn get model => text().nullable()();
  BoolColumn get isStarred => boolean().withDefault(const Constant(false))();
  BoolColumn get memoryEnabled => boolean().withDefault(const Constant(true))();
  IntColumn get createdAt => integer()();
  IntColumn get updatedAt => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

@DriftDatabase(
  tables: [
    UiSettingsRows,
    ChatRows,
    ChatMessageRows,
    ArtifactRows,
    WebDevProjectRows,
    WebDevThreadRows,
    CharacterRows,
    CharacterSessionRows,
  ],
)
class PrivoraDatabase extends _$PrivoraDatabase {
  PrivoraDatabase([QueryExecutor? executor])
    : super(executor ?? _openConnection());

  @override
  int get schemaVersion => 6;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async => m.createAll(),
    onUpgrade: (m, from, to) async {
      if (from < 2) {
        await m.addColumn(chatMessageRows, chatMessageRows.imageGenerationJson);
      }
      if (from < 3) {
        await m.addColumn(uiSettingsRows, uiSettingsRows.debateAgentAModel);
        await m.addColumn(uiSettingsRows, uiSettingsRows.debateAgentBModel);
        await m.addColumn(uiSettingsRows, uiSettingsRows.debateJudgeModel);
        await m.addColumn(chatMessageRows, chatMessageRows.debateJson);
      }
      if (from < 4) {
        await m.addColumn(chatRows, chatRows.pendingResearchIntentJson);
        await m.addColumn(chatMessageRows, chatMessageRows.researchJson);
      }
      if (from < 5) {
        await m.createTable(artifactRows);
      }
      if (from < 6) {
        await m.addColumn(uiSettingsRows, uiSettingsRows.isClashModeEnabled);
        await m.addColumn(uiSettingsRows, uiSettingsRows.clashAgentAModel);
        await m.addColumn(uiSettingsRows, uiSettingsRows.clashAgentBModel);
        await m.addColumn(chatMessageRows, chatMessageRows.clashJson);
      }
    },
    beforeOpen: (details) async {
      await customStatement('pragma foreign_keys = ON');
      await customStatement('pragma journal_mode = WAL');
    },
  );

  static QueryExecutor _openConnection() {
    return driftDatabase(
      name: 'privora_local_db',
      native: const DriftNativeOptions(
        databaseDirectory: getApplicationSupportDirectory,
      ),
    );
  }
}
