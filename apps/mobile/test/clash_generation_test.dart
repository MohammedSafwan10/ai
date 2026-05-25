import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/data/local/privora_database.dart';
import 'package:privora_mobile/src/data/local/privora_local_repository.dart';
import 'package:privora_mobile/src/features/chat/data/chat_generation_client.dart';
import 'package:privora_mobile/src/models/privora_models.dart';
import 'package:privora_mobile/src/state/app_state.dart';

class _QueueClashClient implements ChatGenerationClient {
  _QueueClashClient(this.outputs);

  final List<String> outputs;
  final List<ChatGenerationRequest> requests = [];
  int _index = 0;

  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) async* {
    requests.add(request);
    if (_index >= outputs.length) throw StateError('No fake output queued.');
    yield ChatStreamEvent.text(outputs[_index++]);
  }

  @override
  void stop() {}
}

class _SlowClashClient implements ChatGenerationClient {
  final started = Completer<void>();
  final emitted = Completer<void>();
  bool _stopped = false;

  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) async* {
    if (!started.isCompleted) started.complete();
    yield const ChatStreamEvent.text('Partial opening.');
    if (!emitted.isCompleted) emitted.complete();
    while (!_stopped) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
  }

  @override
  void stop() {
    _stopped = true;
  }
}

class _ErrorClashClient implements ChatGenerationClient {
  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) async* {
    throw StateError('provider down');
  }

  @override
  void stop() {}
}

void main() {
  test(
    'clash alternates agents and converges only after opposite accept',
    () async {
      final database = PrivoraDatabase(NativeDatabase.memory());
      final client = _QueueClashClient(const [
        'Opening: Make it optional for hard calls.',
        'Challenge: Optional tools are invisible when users need them most.',
        'Refine: Surface it for high-stakes choices, but keep it optional.\n'
            'Shared conclusion: Privora should suggest Clash for high-stakes, uncertain decisions and keep it optional elsewhere.',
        'Accept: That resolves my objection.',
      ]);
      final container = ProviderContainer(
        overrides: [
          privoraDatabaseProvider.overrideWithValue(database),
          chatGenerationClientProvider.overrideWithValue(client),
        ],
      );
      addTearDown(() async {
        container.dispose();
        await database.close();
      });

      await container.read(appControllerProvider.future);
      final app = container.read(appControllerProvider.notifier);
      app.toggleClash();
      app.updateClashSettings(
        const ClashSettings(
          agentAModel: 'gpt-5.5',
          agentBModel: gemini35FlashModelId,
        ),
      );

      await app.sendMessage('Should Clash be default?');

      final clash = container
          .read(appControllerProvider)
          .requireValue
          .currentChat!
          .messages
          .last
          .clash!;
      expect(clash.status, ClashStatus.converged);
      expect(clash.turns.map((turn) => turn.speaker), ['a', 'b', 'a', 'b']);
      expect(clash.turns.last.action, ClashTurnAction.accept);
      expect(
        clash.conclusion,
        'Privora should suggest Clash for high-stakes, uncertain decisions and keep it optional elsewhere.',
      );
      expect(client.requests.map((request) => request.model), [
        'gpt-5.5',
        gemini35FlashModelId,
        'gpt-5.5',
        gemini35FlashModelId,
      ]);

      final persisted = await PrivoraLocalRepository(database).loadSnapshot();
      expect(
        persisted.chats.single.messages.last.clash?.status,
        ClashStatus.converged,
      );
    },
  );

  test('clash caps after six full rounds without agreement', () async {
    final outputs = [
      'Opening: Keep it optional.',
      'Challenge: Make it default for risky choices.',
      for (var index = 0; index < 10; index++)
        'Refine: Still disagree on the trigger boundary $index.',
    ];
    final database = PrivoraDatabase(NativeDatabase.memory());
    final client = _QueueClashClient(outputs);
    final container = ProviderContainer(
      overrides: [
        privoraDatabaseProvider.overrideWithValue(database),
        chatGenerationClientProvider.overrideWithValue(client),
      ],
    );
    addTearDown(() async {
      container.dispose();
      await database.close();
    });

    await container.read(appControllerProvider.future);
    final app = container.read(appControllerProvider.notifier);
    app.toggleClash();

    await app.sendMessage('Set the Clash default policy.');

    final clash = container
        .read(appControllerProvider)
        .requireValue
        .currentChat!
        .messages
        .last
        .clash!;
    expect(clash.status, ClashStatus.capped);
    expect(clash.turns, hasLength(12));
    expect(client.requests, hasLength(12));
  });

  test('stopping clash preserves partial active turn', () async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    final client = _SlowClashClient();
    final container = ProviderContainer(
      overrides: [
        privoraDatabaseProvider.overrideWithValue(database),
        chatGenerationClientProvider.overrideWithValue(client),
      ],
    );
    addTearDown(() async {
      container.dispose();
      await database.close();
    });

    await container.read(appControllerProvider.future);
    final app = container.read(appControllerProvider.notifier);
    app.toggleClash();

    final future = app.sendMessage('Run a long clash.');
    await client.started.future;
    await client.emitted.future;
    app.stopGeneration();
    await future;

    final clash = container
        .read(appControllerProvider)
        .requireValue
        .currentChat!
        .messages
        .last
        .clash!;
    expect(clash.status, ClashStatus.stopped);
    expect(clash.turns.single.content, 'Partial opening.');
    expect(clash.turns.single.status, ClashAgentStatus.stopped);
  });

  test('provider failure marks active clash turn and agent as error', () async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    final container = ProviderContainer(
      overrides: [
        privoraDatabaseProvider.overrideWithValue(database),
        chatGenerationClientProvider.overrideWithValue(_ErrorClashClient()),
      ],
    );
    addTearDown(() async {
      container.dispose();
      await database.close();
    });

    await container.read(appControllerProvider.future);
    final app = container.read(appControllerProvider.notifier);
    app.toggleClash();

    await app.sendMessage('Fail this clash.');

    final clash = container
        .read(appControllerProvider)
        .requireValue
        .currentChat!
        .messages
        .last
        .clash!;
    expect(clash.status, ClashStatus.error);
    expect(clash.agents.first.status, ClashAgentStatus.error);
    expect(clash.turns.single.status, ClashAgentStatus.error);
    expect(clash.turns.single.error, contains('provider down'));
  });
}
