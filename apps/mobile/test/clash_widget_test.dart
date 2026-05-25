import 'package:drift/native.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/app/privora_app.dart';
import 'package:privora_mobile/src/data/local/privora_database.dart';
import 'package:privora_mobile/src/data/local/privora_local_repository.dart';
import 'package:privora_mobile/src/models/privora_models.dart';

void main() {
  testWidgets('clash card renders capped arena and agent tabs', (tester) async {
    final database = PrivoraDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    final now = DateTime(2026, 5, 25);
    await PrivoraLocalRepository(database).upsertChat(
      ChatRecord(
        id: 'chat_clash_widget',
        title: 'Clash widget',
        messages: [
          ChatMessageRecord(
            id: 'user_clash_widget',
            chatId: 'chat_clash_widget',
            role: 'user',
            content: 'Should Clash be default?',
            createdAt: now,
          ),
          ChatMessageRecord(
            id: 'model_clash_widget',
            chatId: 'chat_clash_widget',
            role: 'model',
            content: '',
            clash: ClashRecord(
              status: ClashStatus.capped,
              prompt: 'Should Clash be default?',
              startedAt: now,
              completedAt: now.add(const Duration(seconds: 4)),
              agents: const [
                ClashAgentRecord(
                  id: 'a',
                  label: 'Agent A',
                  model: 'gpt-5.5',
                  status: ClashAgentStatus.done,
                ),
                ClashAgentRecord(
                  id: 'b',
                  label: 'Agent B',
                  model: gemini35FlashModelId,
                  status: ClashAgentStatus.done,
                ),
              ],
              turns: [
                ClashTurnRecord(
                  id: 'turn_a',
                  round: 1,
                  speaker: 'a',
                  action: ClashTurnAction.opening,
                  status: ClashAgentStatus.done,
                  content: 'Opening: Keep Clash optional.',
                  startedAt: now,
                  completedAt: now.add(const Duration(seconds: 1)),
                ),
                ClashTurnRecord(
                  id: 'turn_b',
                  round: 1,
                  speaker: 'b',
                  action: ClashTurnAction.challenge,
                  status: ClashAgentStatus.done,
                  content: 'Challenge: Suggest it for high-stakes prompts.',
                  startedAt: now.add(const Duration(seconds: 1)),
                  completedAt: now.add(const Duration(seconds: 2)),
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
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('clash-card')), findsOneWidget);
    expect(find.text('Clash'), findsOneWidget);
    expect(find.text('cap reached'), findsOneWidget);
    expect(find.text('Opening: Keep Clash optional.'), findsWidgets);
    expect(find.text('No full agreement'), findsOneWidget);

    expect(find.byKey(const Key('clash-agent-a-tab')), findsOneWidget);
    expect(find.byKey(const Key('clash-agent-b-tab')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
