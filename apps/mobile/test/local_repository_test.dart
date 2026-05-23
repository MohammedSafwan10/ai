import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/data/local/privora_database.dart';
import 'package:privora_mobile/src/data/local/privora_local_repository.dart';
import 'package:privora_mobile/src/models/privora_models.dart';

void main() {
  test(
    'local repository persists settings and chat messages in SQLite',
    () async {
      final database = PrivoraDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final repository = PrivoraLocalRepository(database);
      final now = DateTime.fromMillisecondsSinceEpoch(1710000000000);

      await repository.saveSettings(
        const UiSettings(
          isDarkMode: true,
          isThinkingEnabled: true,
          selectedModel: 'gpt-5.5',
          composerMode: ComposerMode.image,
          debateSettings: DebateSettings(
            agentAModel: 'gpt-5.5',
            judgeModel: 'gemini-3-flash-preview',
          ),
        ),
      );

      await repository.upsertChat(
        ChatRecord(
          id: 'chat_test',
          title: 'Persistence check',
          createdAt: now,
          updatedAt: now,
          model: 'gpt-5.5',
          isStarred: true,
          pendingResearchIntent: PendingResearchIntentRecord(
            originalGoal: 'Investigate persistence',
            clarificationQuestions: const ['Which sources?'],
            createdAt: now,
            updatedAt: now,
          ),
          messages: [
            ChatMessageRecord(
              id: 'msg_user',
              chatId: 'chat_test',
              role: 'user',
              content: 'Remember this',
              createdAt: now,
            ),
            ChatMessageRecord(
              id: 'msg_model',
              chatId: 'chat_test',
              role: 'model',
              content: 'Stored in SQLite',
              thought: 'Persistence layer round-trip.',
              imageGeneration: ImageGenerationRecord(
                status: ImageGenerationStatus.completed,
                mode: 'generate',
                prompt: 'A quiet desk',
                model: 'gpt-image-2',
                options: const ImageSettings(),
                items: [
                  ImageGenerationItemRecord(
                    id: 'image_1',
                    status: ImageGenerationItemStatus.completed,
                    attachmentName: 'desk.png',
                    completedAt: now,
                  ),
                ],
                startedAt: now,
                completedAt: now,
              ),
              debate: DebateRecord(
                status: DebateAgentStatus.done,
                prompt: 'Choose one',
                agents: [
                  DebateAgentRecord(
                    id: 'judge',
                    label: 'Judge',
                    model: 'gpt-5.5',
                    status: DebateAgentStatus.done,
                    content: 'Use the first option.',
                  ),
                ],
                startedAt: now,
                completedAt: now,
              ),
              researchStatus: ResearchStatus.completed,
              researchSources: const [
                ResearchSourceRecord(
                  url: 'https://example.com/research',
                  title: 'Research source',
                ),
              ],
              researchPlan: ResearchPlanRecord(
                title: 'Evidence plan',
                steps: const [
                  ResearchPlanStepRecord(
                    text: 'Read sources',
                    status: ResearchPlanStepStatus.completed,
                  ),
                ],
                refinedPrompt: 'Investigate persistence',
                status: ResearchPlanStatus.completed,
                progress: 1,
                currentActivity: 'Completed',
                createdAt: now,
                updatedAt: now,
              ),
              researchActivity: [
                ResearchActivityRecord(
                  phase: 'reading',
                  title: 'Read sources',
                  timestamp: now,
                ),
              ],
              researchJobId: 'job_storage',
              researchStartedAt: now,
              researchCompletedAt: now,
              researchTimeBudgetMs: 180000,
              artifact: const ArtifactReferenceRecord(
                artifactId: 'artifact_1',
                title: 'Stored artifact',
                kind: ArtifactKind.markdown,
                status: ArtifactStatus.ready,
              ),
              createdAt: now.add(const Duration(milliseconds: 1)),
            ),
          ],
        ),
      );
      await repository.upsertArtifact(
        ArtifactRecord(
          id: 'artifact_1',
          chatId: 'chat_test',
          messageId: 'msg_model',
          kind: ArtifactKind.markdown,
          title: 'Stored artifact',
          content: '# Stored artifact',
          status: ArtifactStatus.ready,
          createdAt: now,
          updatedAt: now,
        ),
      );

      final snapshot = await repository.loadSnapshot();

      expect(snapshot.settings.isDarkMode, isTrue);
      expect(snapshot.settings.isThinkingEnabled, isTrue);
      expect(snapshot.settings.selectedModel, 'gpt-5.5');
      expect(snapshot.settings.composerMode, ComposerMode.image);
      expect(snapshot.settings.debateSettings.agentAModel, 'gpt-5.5');
      expect(
        snapshot.settings.debateSettings.judgeModel,
        'gemini-3-flash-preview',
      );
      expect(snapshot.chats, hasLength(1));
      expect(snapshot.chats.single.isStarred, isTrue);
      expect(
        snapshot.chats.single.pendingResearchIntent?.originalGoal,
        'Investigate persistence',
      );
      expect(snapshot.chats.single.messages.map((message) => message.content), [
        'Remember this',
        'Stored in SQLite',
      ]);
      expect(
        snapshot.chats.single.messages.last.thought,
        'Persistence layer round-trip.',
      );
      expect(
        snapshot.chats.single.messages.last.imageGeneration?.status,
        ImageGenerationStatus.completed,
      );
      expect(
        snapshot
            .chats
            .single
            .messages
            .last
            .imageGeneration
            ?.items
            .single
            .attachmentName,
        'desk.png',
      );
      expect(
        snapshot.chats.single.messages.last.debate?.agents.single.content,
        'Use the first option.',
      );
      expect(
        snapshot.chats.single.messages.last.researchPlan?.status,
        ResearchPlanStatus.completed,
      );
      expect(
        snapshot.chats.single.messages.last.researchSources.single.title,
        'Research source',
      );
      expect(snapshot.chats.single.messages.last.researchJobId, 'job_storage');
      expect(
        snapshot.chats.single.messages.last.artifact?.title,
        'Stored artifact',
      );
      expect(snapshot.artifacts.single.content, '# Stored artifact');
    },
  );
}
