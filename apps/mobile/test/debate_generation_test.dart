import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/data/local/privora_database.dart';
import 'package:privora_mobile/src/data/local/privora_local_repository.dart';
import 'package:privora_mobile/src/features/chat/data/chat_generation_client.dart';
import 'package:privora_mobile/src/models/privora_models.dart';
import 'package:privora_mobile/src/state/app_state.dart';

class _FakeDebateClient implements ChatGenerationClient {
  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) async* {
    final instruction = request.instructionSuffix ?? '';
    if (instruction.contains('Debater A')) {
      yield const ChatStreamEvent.text('Option A.');
    } else if (instruction.contains('Debater B')) {
      yield const ChatStreamEvent.text('Option B.');
    } else {
      yield const ChatStreamEvent.text('Choose A.');
    }
  }

  @override
  void stop() {}
}

void main() {
  test(
    'debate mode streams two agents and a judge into a persisted card',
    () async {
      final database = PrivoraDatabase(NativeDatabase.memory());
      final container = ProviderContainer(
        overrides: [
          privoraDatabaseProvider.overrideWithValue(database),
          chatGenerationClientProvider.overrideWithValue(_FakeDebateClient()),
        ],
      );
      addTearDown(() async {
        container.dispose();
        await database.close();
      });

      await container.read(appControllerProvider.future);
      final app = container.read(appControllerProvider.notifier);
      app.toggleDebate();
      app.updateDebateSettings(
        const DebateSettings(
          agentAModel: 'gpt-5.5',
          judgeModel: 'gemini-3-flash-preview',
        ),
      );

      await app.sendMessage('Choose an implementation');

      final debate = container
          .read(appControllerProvider)
          .requireValue
          .currentChat!
          .messages
          .last
          .debate!;
      expect(debate.status, DebateAgentStatus.done);
      expect(debate.agents.map((agent) => agent.content), [
        'Option A.',
        'Option B.',
        'Choose A.',
      ]);
      expect(debate.agents.first.model, 'gpt-5.5');
      expect(debate.agents.last.model, gemini35FlashModelId);

      final persisted = await PrivoraLocalRepository(database).loadSnapshot();
      expect(
        persisted.chats.single.messages.last.debate?.agents.last.content,
        'Choose A.',
      );
    },
  );
}
