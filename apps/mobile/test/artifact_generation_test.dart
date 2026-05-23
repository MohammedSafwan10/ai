import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/data/local/privora_database.dart';
import 'package:privora_mobile/src/data/local/privora_local_repository.dart';
import 'package:privora_mobile/src/features/chat/data/chat_generation_client.dart';
import 'package:privora_mobile/src/models/privora_models.dart';
import 'package:privora_mobile/src/state/app_state.dart';

class _FakeArtifactClient implements ChatGenerationClient {
  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) async* {
    expect(request.artifactToolsEnabled, isTrue);
    yield const ChatStreamEvent.artifact(
      ArtifactStreamPayload(
        kind: ArtifactKind.markdown,
        title: 'Launch plan',
        content: '# Launch plan\n\n- Ship mobile Canvas.',
        status: ArtifactStatus.streaming,
      ),
    );
    yield const ChatStreamEvent.artifact(
      ArtifactStreamPayload(
        kind: ArtifactKind.markdown,
        title: 'Launch plan',
        content: '# Launch plan\n\n- Ship mobile Canvas.\n- Verify tests.',
        status: ArtifactStatus.ready,
      ),
    );
    yield const ChatStreamEvent.text('Created the Canvas artifact.');
  }

  @override
  void stop() {}
}

class _SilentArtifactClient implements ChatGenerationClient {
  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) async* {
    yield const ChatStreamEvent.artifact(
      ArtifactStreamPayload(
        kind: ArtifactKind.html,
        title: 'Landing page',
        content: '<!doctype html><html><body><h1>Privora</h1></body></html>',
        status: ArtifactStatus.streaming,
      ),
    );
  }

  @override
  void stop() {}
}

class _RepeatedStreamingArtifactClient implements ChatGenerationClient {
  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) async* {
    yield const ChatStreamEvent.artifact(
      ArtifactStreamPayload(
        kind: ArtifactKind.svg,
        title: 'Icon',
        content: '<svg><circle cx="8" cy="8" r="4"/></svg>',
        status: ArtifactStatus.streaming,
      ),
    );
    yield const ChatStreamEvent.artifact(
      ArtifactStreamPayload(
        kind: ArtifactKind.svg,
        title: 'Icon',
        content: '<svg><circle cx="12" cy="12" r="8"/></svg>',
        status: ArtifactStatus.streaming,
      ),
    );
  }

  @override
  void stop() {}
}

void main() {
  test(
    'artifact tool events persist a message card and canvas content',
    () async {
      final database = PrivoraDatabase(NativeDatabase.memory());
      final container = ProviderContainer(
        overrides: [
          privoraDatabaseProvider.overrideWithValue(database),
          chatGenerationClientProvider.overrideWithValue(_FakeArtifactClient()),
        ],
      );
      addTearDown(() async {
        container.dispose();
        await database.close();
      });

      await container.read(appControllerProvider.future);
      final app = container.read(appControllerProvider.notifier);
      await app.sendMessage('Create a launch plan artifact');

      final state = container.read(appControllerProvider).requireValue;
      final message = state.currentChat!.messages.last;
      expect(message.artifact?.title, 'Launch plan');
      expect(message.artifact?.status, ArtifactStatus.ready);
      expect(message.content, 'Created the Canvas artifact.');
      expect(state.artifacts.single.content, contains('Verify tests'));

      final persisted = await PrivoraLocalRepository(database).loadSnapshot();
      expect(persisted.artifacts.single.title, 'Launch plan');
      expect(persisted.artifacts.single.status, ArtifactStatus.ready);
      expect(
        persisted.chats.single.messages.last.artifact?.artifactId,
        isNotEmpty,
      );
    },
  );

  test('artifact-only model turns finish with a chat summary', () async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    final container = ProviderContainer(
      overrides: [
        privoraDatabaseProvider.overrideWithValue(database),
        chatGenerationClientProvider.overrideWithValue(_SilentArtifactClient()),
      ],
    );
    addTearDown(() async {
      container.dispose();
      await database.close();
    });

    await container.read(appControllerProvider.future);
    final app = container.read(appControllerProvider.notifier);
    await app.sendMessage('Create a landing page artifact');

    final state = container.read(appControllerProvider).requireValue;
    final message = state.currentChat!.messages.last;
    expect(message.artifact?.status, ArtifactStatus.ready);
    expect(message.content, contains('Landing page'));
    expect(message.content, contains('Open Canvas'));
    expect(state.artifacts.single.status, ArtifactStatus.ready);
  });

  test('streaming artifact deltas reuse one artifact record', () async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    final container = ProviderContainer(
      overrides: [
        privoraDatabaseProvider.overrideWithValue(database),
        chatGenerationClientProvider.overrideWithValue(
          _RepeatedStreamingArtifactClient(),
        ),
      ],
    );
    addTearDown(() async {
      container.dispose();
      await database.close();
    });

    await container.read(appControllerProvider.future);
    final app = container.read(appControllerProvider.notifier);
    await app.sendMessage('Create an icon artifact');

    final state = container.read(appControllerProvider).requireValue;
    expect(state.artifacts, hasLength(1));
    expect(state.artifacts.single.status, ArtifactStatus.ready);
    expect(state.artifacts.single.content, contains('r="8"'));
    expect(state.currentChat!.messages.last.artifact?.artifactId, isNotEmpty);
  });
}
