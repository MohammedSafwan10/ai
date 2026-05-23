import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/data/local/privora_database.dart';
import 'package:privora_mobile/src/data/local/privora_local_repository.dart';
import 'package:privora_mobile/src/features/chat/data/chat_generation_client.dart';
import 'package:privora_mobile/src/state/app_state.dart';

class _CaptureCharacterClient implements ChatGenerationClient {
  ChatGenerationRequest? request;

  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) async* {
    this.request = request;
    yield const ChatStreamEvent.text('Character response');
  }

  @override
  void stop() {}
}

void main() {
  test('character chats inject persona instructions into generation', () async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    final client = _CaptureCharacterClient();
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
    await app.createCharacterSession('char_mentor');
    await app.sendMessage('How should I plan this?');

    final request = client.request;
    expect(request, isNotNull);
    expect(
      request!.instructionSuffix,
      contains('You are responding as Mentor'),
    );
    expect(
      request.instructionSuffix,
      contains('Practical, direct, and senior'),
    );
    final state = container.read(appControllerProvider).requireValue;
    expect(state.currentCharacterSession?.characterId, 'char_mentor');
    expect(
      state.currentChat!.messages.first.content,
      'What are we improving today?',
    );
    expect(state.currentChat!.messages.last.content, 'Character response');
  });
}
