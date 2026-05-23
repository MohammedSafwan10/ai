import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/data/local/privora_database.dart';
import 'package:privora_mobile/src/data/local/privora_local_repository.dart';
import 'package:privora_mobile/src/data/secure/secure_credential_repository.dart';
import 'package:privora_mobile/src/app/privora_app.dart';
import 'package:privora_mobile/src/features/chat/data/chat_generation_client.dart';
import 'package:privora_mobile/src/models/privora_models.dart';
import 'package:privora_mobile/src/state/app_state.dart';

class _MemorySecureStore implements SecureKeyValueStore {
  final _values = <String, String>{};

  @override
  Future<bool> containsKey({required String key}) async =>
      _values.containsKey(key);

  @override
  Future<void> delete({required String key}) async => _values.remove(key);

  @override
  Future<String?> read({required String key}) async => _values[key];

  @override
  Future<void> write({required String key, required String value}) async {
    _values[key] = value;
  }
}

class _HoldingChatClient implements ChatGenerationClient {
  final events = StreamController<ChatStreamEvent>();

  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) =>
      events.stream;

  @override
  void stop() => events.close();
}

void main() {
  testWidgets('Privora mobile shell renders the chat landing', (tester) async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    addTearDown(database.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [privoraDatabaseProvider.overrideWithValue(database)],
        child: const PrivoraApp(),
      ),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Chat'), findsOneWidget);
    expect(find.text('How can I help today?'), findsOneWidget);
  });

  testWidgets('mobile composer and drawer do not overflow narrow screens', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(360, 740));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final database = PrivoraDatabase(NativeDatabase.memory());
    addTearDown(database.close);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [privoraDatabaseProvider.overrideWithValue(database)],
        child: const PrivoraApp(),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byTooltip('Select AI model'), findsNothing);
    expect(find.text('Use style: Normal'), findsNothing);

    await tester.tap(find.byTooltip('Add files or options'));
    await tester.pumpAndSettle();
    expect(find.text('Use style: Normal'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('Use style: Normal'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Normal'));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Open sidebar'));
    await tester.pumpAndSettle();
    expect(find.text('Privora'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('compact model selector and connections sheet close cleanly', (
    tester,
  ) async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    final store = _MemorySecureStore();
    addTearDown(database.close);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          privoraDatabaseProvider.overrideWithValue(database),
          secureKeyValueStoreProvider.overrideWithValue(store),
        ],
        child: const PrivoraApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Gemini 3.1 Flash Lite'));
    await tester.pumpAndSettle();
    expect(find.text('Gemini 3 Flash'), findsOneWidget);
    await tester.tap(find.text('Gemini 3 Flash'));
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Add files or options'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Connections'),
      120,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Connections'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'CLIProxy endpoint'),
      'http://127.0.0.1:8317',
    );
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(
      await store.read(key: ApiCredential.cliproxyEndpoint.storageKey),
      'http://127.0.0.1:8317',
    );

    await tester.tap(find.byTooltip('Add files or options'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Code Playground'),
      120,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.ensureVisible(find.text('Code Playground'));
    await tester.tap(find.text('Code Playground'), warnIfMissed: false);
    await tester.pumpAndSettle();
    expect(find.text('Code Playground'), findsOneWidget);
    await tester.tapAt(const Offset(20, 20));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Add files or options'));
    await tester.pumpAndSettle();
    expect(find.text('Skills'), findsNothing);
    expect(find.text('Add connectors'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('characters workspace starts a persona chat and hides web dev', (
    tester,
  ) async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [privoraDatabaseProvider.overrideWithValue(database)],
        child: const PrivoraApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Open sidebar'));
    await tester.pumpAndSettle();
    expect(find.text('Web Dev'), findsNothing);
    await tester.tap(find.text('Characters'));
    await tester.pumpAndSettle();

    expect(find.text('Mentor'), findsWidgets);
    expect(find.text('Practical senior guidance'), findsOneWidget);
    await tester.tap(find.byTooltip('Start character chat').first);
    await tester.pumpAndSettle();

    expect(find.text('What are we improving today?'), findsOneWidget);
    expect(find.text('How can I help today?'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'long press user menu restores edited message into composer as a draft',
    (tester) async {
      final database = PrivoraDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final now = DateTime(2026, 5, 23);
      await PrivoraLocalRepository(database).upsertChat(
        ChatRecord(
          id: 'chat_dialog',
          title: 'Dialog check',
          messages: [
            ChatMessageRecord(
              id: 'user_dialog',
              chatId: 'chat_dialog',
              role: 'user',
              content: 'Edit this message',
              attachments: const [
                AttachmentRecord(
                  url: 'draft.txt',
                  mimeType: 'text/plain',
                  name: 'draft.txt',
                ),
              ],
              createdAt: now,
            ),
            ChatMessageRecord(
              id: 'model_dialog',
              chatId: 'chat_dialog',
              role: 'model',
              content: 'This response should be removed.',
              createdAt: now.add(const Duration(milliseconds: 1)),
            ),
          ],
          createdAt: now,
          updatedAt: now,
        ),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [privoraDatabaseProvider.overrideWithValue(database)],
          child: const PrivoraApp(),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byTooltip('Edit'), findsNothing);
      await tester.longPress(find.text('Edit this message'));
      await tester.pumpAndSettle();
      expect(find.text('Edit message'), findsOneWidget);
      await tester.tap(find.text('Edit message'));
      await tester.pumpAndSettle();

      final textField = tester.widget<TextField>(find.byType(TextField).first);
      expect(textField.controller?.text, 'Edit this message');
      expect(find.text('draft.txt'), findsOneWidget);
      expect(find.text('This response should be removed.'), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('assistant code block opens in Code Playground', (tester) async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final now = DateTime(2026, 5, 23);
    await PrivoraLocalRepository(database).upsertChat(
      ChatRecord(
        id: 'chat_code',
        title: 'Code check',
        messages: [
          ChatMessageRecord(
            id: 'user_code',
            chatId: 'chat_code',
            role: 'user',
            content: 'Show JS',
            createdAt: now,
          ),
          ChatMessageRecord(
            id: 'model_code',
            chatId: 'chat_code',
            role: 'model',
            content: '```javascript\nconsole.log("hi")\n```',
            createdAt: now.add(const Duration(milliseconds: 1)),
          ),
        ],
        createdAt: now,
        updatedAt: now,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [privoraDatabaseProvider.overrideWithValue(database)],
        child: const PrivoraApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('Open in Code Playground'));
    await tester.pumpAndSettle();

    expect(find.text('Code Playground'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'javascript'), findsOneWidget);
    expect(find.textContaining('console.log'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'thinking mode renders one animated thinking surface and streamed thought',
    (tester) async {
      final database = PrivoraDatabase(NativeDatabase.memory());
      final client = _HoldingChatClient();
      addTearDown(() async {
        if (!client.events.isClosed) await client.events.close();
        await database.close();
      });
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            privoraDatabaseProvider.overrideWithValue(database),
            chatGenerationClientProvider.overrideWithValue(client),
          ],
          child: const PrivoraApp(),
        ),
      );
      await tester.pumpAndSettle();
      final context = tester.element(find.text('Chat'));
      final container = ProviderScope.containerOf(context);
      final app = container.read(appControllerProvider.notifier);
      app.toggleThinking();
      final pending = app.sendMessage('Think about this');
      await tester.pump();

      expect(find.byKey(const Key('thinking-indicator')), findsOneWidget);
      expect(find.byKey(const Key('typing-indicator')), findsNothing);

      client.events.add(const ChatStreamEvent.thought('Considering options.'));
      await tester.pump();
      expect(find.text('Thinking'), findsOneWidget);
      expect(find.text('Considering options.'), findsOneWidget);
      expect(find.byKey(const Key('thinking-indicator')), findsOneWidget);

      client.events.add(const ChatStreamEvent.text('Final answer.'));
      await client.events.close();
      await pending;
      await tester.pumpAndSettle();
      expect(find.text('Thought process'), findsOneWidget);
      expect(find.text('Final answer.'), findsOneWidget);
      expect(find.byKey(const Key('typing-indicator')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('web search progress shows streamed query', (tester) async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    final client = _HoldingChatClient();
    addTearDown(() async {
      if (!client.events.isClosed) await client.events.close();
      await database.close();
    });
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          privoraDatabaseProvider.overrideWithValue(database),
          chatGenerationClientProvider.overrideWithValue(client),
        ],
        child: const PrivoraApp(),
      ),
    );
    await tester.pumpAndSettle();
    final context = tester.element(find.text('Chat'));
    final app = ProviderScope.containerOf(
      context,
    ).read(appControllerProvider.notifier);
    app.toggleWebSearch();
    final pending = app.sendMessage('What changed today?');
    await tester.pump();

    expect(find.text('Searching web'), findsOneWidget);
    client.events.add(
      const ChatStreamEvent.webSearch('searched', ['latest Privora updates']),
    );
    await tester.pump();
    expect(find.text('Searched web'), findsOneWidget);
    expect(find.text('latest Privora updates'), findsOneWidget);

    client.events.add(const ChatStreamEvent.text('Search-backed answer.'));
    await client.events.close();
    await pending;
    await tester.pumpAndSettle();
    expect(find.text('Search-backed answer.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('generating image card uses shimmer instead of spinner', (
    tester,
  ) async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final now = DateTime(2026, 5, 23);
    await PrivoraLocalRepository(database).upsertChat(
      ChatRecord(
        id: 'chat_image_generating',
        title: 'Image check',
        messages: [
          ChatMessageRecord(
            id: 'user_image_generating',
            chatId: 'chat_image_generating',
            role: 'user',
            content: 'make a glass city',
            createdAt: now,
          ),
          ChatMessageRecord(
            id: 'model_image_generating',
            chatId: 'chat_image_generating',
            role: 'model',
            content: '',
            imageGeneration: ImageGenerationRecord(
              status: ImageGenerationStatus.generating,
              mode: 'generate',
              prompt: 'make a glass city',
              model: 'gpt-image-2',
              options: const ImageSettings(),
              startedAt: now.add(const Duration(milliseconds: 1)),
              items: const [
                ImageGenerationItemRecord(
                  id: 'image_pending',
                  status: ImageGenerationItemStatus.generating,
                ),
              ],
            ),
            createdAt: now.add(const Duration(milliseconds: 1)),
          ),
        ],
        createdAt: now,
        updatedAt: now,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [privoraDatabaseProvider.overrideWithValue(database)],
        child: const PrivoraApp(),
      ),
    );
    await tester.pump();

    expect(find.byKey(const Key('image-generation-shimmer')), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('completed image card opens preview and shows image actions', (
    tester,
  ) async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final now = DateTime(2026, 5, 23);
    const png1x1 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    await PrivoraLocalRepository(database).upsertChat(
      ChatRecord(
        id: 'chat_image_completed',
        title: 'Image complete',
        messages: [
          ChatMessageRecord(
            id: 'user_image_completed',
            chatId: 'chat_image_completed',
            role: 'user',
            content: 'make a glass city',
            createdAt: now,
          ),
          ChatMessageRecord(
            id: 'model_image_completed',
            chatId: 'chat_image_completed',
            role: 'model',
            content: '',
            attachments: const [
              AttachmentRecord(
                url: 'privora-image.png',
                base64: png1x1,
                mimeType: 'image/png',
                name: 'privora-image.png',
              ),
            ],
            imageGeneration: ImageGenerationRecord(
              status: ImageGenerationStatus.completed,
              mode: 'generate',
              prompt: 'make a glass city',
              model: 'gpt-image-2',
              options: const ImageSettings(),
              startedAt: now.add(const Duration(milliseconds: 1)),
              completedAt: now.add(const Duration(seconds: 1)),
              items: const [
                ImageGenerationItemRecord(
                  id: 'image_done',
                  status: ImageGenerationItemStatus.completed,
                  attachmentName: 'privora-image.png',
                ),
              ],
            ),
            createdAt: now.add(const Duration(milliseconds: 1)),
          ),
        ],
        createdAt: now,
        updatedAt: now,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [privoraDatabaseProvider.overrideWithValue(database)],
        child: const PrivoraApp(),
      ),
    );
    await tester.pump();

    expect(find.byTooltip('Open image'), findsOneWidget);
    expect(find.byTooltip('Save image'), findsOneWidget);
    expect(find.byTooltip('Edit image'), findsOneWidget);
    expect(find.byTooltip('Retry image generation'), findsOneWidget);

    await tester.tap(find.byType(Image).first);
    await tester.pumpAndSettle();
    expect(find.text('privora-image.png'), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsOneWidget);
    await tester.tap(find.byTooltip('Close').last);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('scroll to latest button returns to newest message', (
    tester,
  ) async {
    await tester.binding.setSurfaceSize(const Size(390, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final database = PrivoraDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final now = DateTime(2026, 5, 23);
    await PrivoraLocalRepository(database).upsertChat(
      ChatRecord(
        id: 'chat_scroll',
        title: 'Scroll check',
        messages: [
          for (var index = 0; index < 36; index++)
            ChatMessageRecord(
              id: 'msg_$index',
              chatId: 'chat_scroll',
              role: index.isEven ? 'user' : 'model',
              content: index == 35
                  ? 'Newest generated answer'
                  : 'Message $index',
              createdAt: now.add(Duration(milliseconds: index)),
            ),
        ],
        createdAt: now,
        updatedAt: now,
      ),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [privoraDatabaseProvider.overrideWithValue(database)],
        child: const PrivoraApp(),
      ),
    );
    await tester.pumpAndSettle();
    for (
      var index = 0;
      index < 6 && find.text('Newest generated answer').evaluate().isEmpty;
      index++
    ) {
      await tester.drag(find.byType(ListView), const Offset(0, -900));
      await tester.pumpAndSettle();
    }
    expect(find.text('Newest generated answer'), findsOneWidget);

    await tester.drag(find.byType(ListView), const Offset(0, 900));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Scroll to latest'), findsOneWidget);

    await tester.tap(find.byTooltip('Scroll to latest'));
    await tester.pumpAndSettle();
    expect(find.text('Newest generated answer'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
