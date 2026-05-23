import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../core/theme/privora_theme.dart';
import '../features/shell/privora_shell.dart';
import '../models/privora_models.dart';
import '../state/app_state.dart';

final _router = GoRouter(
  initialLocation: '/chat',
  routes: [
    GoRoute(path: '/', redirect: (context, state) => '/chat'),
    GoRoute(
      path: '/chat',
      builder: (context, state) => const PrivoraShell(mode: WorkspaceMode.chat),
    ),
    GoRoute(
      path: '/chat/:chatId',
      builder: (context, state) => PrivoraShell(
        mode: WorkspaceMode.chat,
        id: state.pathParameters['chatId'],
      ),
    ),
    GoRoute(path: '/web-dev', redirect: (context, state) => '/chat'),
    GoRoute(path: '/web-dev/:projectId', redirect: (context, state) => '/chat'),
    GoRoute(
      path: '/characters',
      builder: (context, state) =>
          const PrivoraShell(mode: WorkspaceMode.characters),
    ),
    GoRoute(
      path: '/characters/:sessionId',
      builder: (context, state) => PrivoraShell(
        mode: WorkspaceMode.characters,
        id: state.pathParameters['sessionId'],
      ),
    ),
  ],
);

class PrivoraApp extends ConsumerWidget {
  const PrivoraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isDark = ref.watch(
      appControllerProvider.select(
        (state) => state.value?.settings.isDarkMode ?? false,
      ),
    );
    return MaterialApp.router(
      title: 'Privora',
      debugShowCheckedModeBanner: false,
      routerConfig: _router,
      themeMode: isDark ? ThemeMode.dark : ThemeMode.light,
      theme: PrivoraTheme.light(
        GoogleFonts.interTextTheme(),
        GoogleFonts.outfitTextTheme(),
      ),
      darkTheme: PrivoraTheme.dark(
        GoogleFonts.interTextTheme(),
        GoogleFonts.outfitTextTheme(),
      ),
    );
  }
}
