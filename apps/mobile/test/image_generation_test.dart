import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/data/local/privora_database.dart';
import 'package:privora_mobile/src/data/local/privora_local_repository.dart';
import 'package:privora_mobile/src/features/chat/data/image_generation_client.dart';
import 'package:privora_mobile/src/models/privora_models.dart';
import 'package:privora_mobile/src/state/app_state.dart';

class _FakeImageClient implements ImageGenerationClient {
  int requests = 0;

  @override
  Stream<ImageGenerationEvent> generate(ImageGenerationRequest request) async* {
    requests += 1;
    yield const ImageGenerationEvent(
      index: 0,
      base64: 'aW1hZ2U=',
      mimeType: 'image/png',
      outputFormat: 'png',
      isPartial: false,
    );
  }

  @override
  void stop() {}
}

class _HoldingImageClient implements ImageGenerationClient {
  final _events = StreamController<ImageGenerationEvent>();

  @override
  Stream<ImageGenerationEvent> generate(ImageGenerationRequest request) {
    return _events.stream;
  }

  @override
  void stop() {
    _events.close();
  }
}

void main() {
  test(
    'image mode stores completed generated output in the chat record',
    () async {
      final database = PrivoraDatabase(NativeDatabase.memory());
      final imageClient = _FakeImageClient();
      final container = ProviderContainer(
        overrides: [
          privoraDatabaseProvider.overrideWithValue(database),
          imageGenerationClientProvider.overrideWithValue(imageClient),
        ],
      );
      addTearDown(() async {
        container.dispose();
        await database.close();
      });

      await container.read(appControllerProvider.future);
      final app = container.read(appControllerProvider.notifier);
      app.setComposerMode(ComposerMode.image);
      await app.sendMessage('A studio lamp');

      final message = container
          .read(appControllerProvider)
          .requireValue
          .currentChat!
          .messages
          .last;
      expect(message.imageGeneration?.status, ImageGenerationStatus.completed);
      expect(message.imageGeneration?.prompt, 'A studio lamp');
      expect(message.attachments, hasLength(1));
      expect(message.attachments.single.mimeType, 'image/png');

      final persisted = await PrivoraLocalRepository(database).loadSnapshot();
      expect(
        persisted.chats.single.messages.last.imageGeneration?.status,
        ImageGenerationStatus.completed,
      );

      final imageMessageId = message.id;
      app.setComposerMode(ComposerMode.chat);
      await app.retryImageMessage(imageMessageId);
      expect(imageClient.requests, 2);
      expect(
        container
            .read(appControllerProvider)
            .requireValue
            .currentChat!
            .messages
            .last
            .imageGeneration
            ?.status,
        ImageGenerationStatus.completed,
      );
    },
  );

  test('stopping image generation persists a stopped image card', () async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    final imageClient = _HoldingImageClient();
    final container = ProviderContainer(
      overrides: [
        privoraDatabaseProvider.overrideWithValue(database),
        imageGenerationClientProvider.overrideWithValue(imageClient),
      ],
    );
    addTearDown(() async {
      container.dispose();
      await database.close();
    });

    await container.read(appControllerProvider.future);
    final app = container.read(appControllerProvider.notifier);
    app.setComposerMode(ComposerMode.image);
    final pending = app.sendMessage('An unfinished scene');
    await Future<void>.delayed(Duration.zero);

    expect(
      container.read(appControllerProvider).requireValue.isGenerating,
      isTrue,
    );
    app.stopGeneration();
    await pending;

    final generation = container
        .read(appControllerProvider)
        .requireValue
        .currentChat!
        .messages
        .last
        .imageGeneration!;
    expect(generation.status, ImageGenerationStatus.stopped);
    expect(generation.items.single.status, ImageGenerationItemStatus.stopped);
  });
}
