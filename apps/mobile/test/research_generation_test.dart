import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/data/local/privora_database.dart';
import 'package:privora_mobile/src/data/local/privora_local_repository.dart';
import 'package:privora_mobile/src/features/chat/data/research_client.dart';
import 'package:privora_mobile/src/models/privora_models.dart';
import 'package:privora_mobile/src/state/app_state.dart';

class _FakeResearchClient implements ResearchClient {
  bool started = false;

  @override
  Future<ResearchPreflightResult> preflight({
    required String model,
    required ProviderId provider,
    required String styleId,
    required List<ChatMessageRecord> history,
    PendingResearchIntentRecord? pendingIntent,
  }) async => const ResearchPreflightResult(
    decision: 'ready',
    title: 'Architecture evidence',
    refinedPrompt: 'Compare reliable evidence.',
    steps: ['Gather sources', 'Synthesize findings'],
  );

  @override
  Future<String> startJob({
    required String model,
    required ProviderId provider,
    required String styleId,
    required List<ChatMessageRecord> history,
    required ResearchPlanRecord plan,
  }) async {
    started = true;
    return 'job_1';
  }

  @override
  Stream<ResearchStreamEvent> streamJob(String jobId) async* {
    yield const ResearchStreamEvent(
      type: ResearchStreamEventType.status,
      status: ResearchStatus.searching,
      message: 'Searching sources',
    );
    yield ResearchStreamEvent(
      type: ResearchStreamEventType.activity,
      activity: ResearchActivityRecord(
        phase: 'searching',
        title: 'Found documentation',
        timestamp: DateTime.fromMillisecondsSinceEpoch(1710000000000),
      ),
    );
    yield const ResearchStreamEvent(
      type: ResearchStreamEventType.planStep,
      index: 0,
      stepStatus: ResearchPlanStepStatus.completed,
    );
    yield const ResearchStreamEvent(
      type: ResearchStreamEventType.sources,
      sources: [
        ResearchSourceRecord(url: 'https://example.com', title: 'Primary'),
      ],
    );
    yield const ResearchStreamEvent(
      type: ResearchStreamEventType.text,
      text: '# Draft\nEvidence collected.',
    );
    yield const ResearchStreamEvent(
      type: ResearchStreamEventType.completed,
      text: '# Result\nUse documented evidence.',
    );
  }

  @override
  Future<void> cancelJob(String jobId) async {}

  @override
  void stop() {}
}

void main() {
  test(
    'deep research prepares a plan then persists a streamed report',
    () async {
      final database = PrivoraDatabase(NativeDatabase.memory());
      final client = _FakeResearchClient();
      final container = ProviderContainer(
        overrides: [
          privoraDatabaseProvider.overrideWithValue(database),
          researchClientProvider.overrideWithValue(client),
        ],
      );
      addTearDown(() async {
        container.dispose();
        await database.close();
      });

      await container.read(appControllerProvider.future);
      final app = container.read(appControllerProvider.notifier);
      app.toggleDeepResearch();

      await app.sendMessage('Research the architecture');
      var researchMessage = container
          .read(appControllerProvider)
          .requireValue
          .currentChat!
          .messages
          .last;
      expect(researchMessage.researchPlan?.status, ResearchPlanStatus.draft);
      expect(researchMessage.researchPlan?.steps, hasLength(2));
      expect(client.started, isFalse);

      await app.startResearchPlan(researchMessage.id);
      researchMessage = container
          .read(appControllerProvider)
          .requireValue
          .currentChat!
          .messages
          .last;
      expect(client.started, isTrue);
      expect(researchMessage.researchStatus, ResearchStatus.completed);
      expect(
        researchMessage.researchPlan?.status,
        ResearchPlanStatus.completed,
      );
      expect(researchMessage.content, contains('Use documented evidence.'));
      expect(researchMessage.researchSources.single.title, 'Primary');
      expect(researchMessage.researchActivity, hasLength(2));

      final persisted = await PrivoraLocalRepository(database).loadSnapshot();
      expect(
        persisted.chats.single.messages.last.researchPlan?.status,
        ResearchPlanStatus.completed,
      );
      expect(persisted.chats.single.messages.last.researchJobId, 'job_1');
    },
  );
}
