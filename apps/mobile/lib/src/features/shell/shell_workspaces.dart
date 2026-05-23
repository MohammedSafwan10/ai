part of 'privora_shell.dart';

class _WorkspaceBody extends ConsumerWidget {
  const _WorkspaceBody({
    required this.mode,
    required this.onEditUserMessage,
    required this.onEditGeneratedImage,
    required this.onOpenArtifact,
    required this.onOpenCodePlayground,
  });
  final WorkspaceMode mode;
  final ValueChanged<ChatMessageRecord> onEditUserMessage;
  final void Function(AttachmentRecord attachment, String prompt)
  onEditGeneratedImage;
  final ValueChanged<String> onOpenArtifact;
  final void Function(String code, String language) onOpenCodePlayground;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider).requireValue;
    return switch (mode) {
      WorkspaceMode.chat => _ChatViewport(
        chat: state.currentChat,
        onEditUserMessage: onEditUserMessage,
        onEditGeneratedImage: onEditGeneratedImage,
        onOpenArtifact: onOpenArtifact,
        onOpenCodePlayground: onOpenCodePlayground,
      ),
      WorkspaceMode.webDev => _ChatViewport(
        chat: state.currentChat,
        onEditUserMessage: onEditUserMessage,
        onEditGeneratedImage: onEditGeneratedImage,
        onOpenArtifact: onOpenArtifact,
        onOpenCodePlayground: onOpenCodePlayground,
      ),
      WorkspaceMode.characters => _CharactersWorkspace(
        characters: state.characters,
        sessions: state.characterSessions,
        onEditUserMessage: onEditUserMessage,
        onEditGeneratedImage: onEditGeneratedImage,
        onOpenArtifact: onOpenArtifact,
        onOpenCodePlayground: onOpenCodePlayground,
      ),
    };
  }
}

class _CharactersWorkspace extends ConsumerWidget {
  const _CharactersWorkspace({
    required this.characters,
    required this.sessions,
    required this.onEditUserMessage,
    required this.onEditGeneratedImage,
    required this.onOpenArtifact,
    required this.onOpenCodePlayground,
  });

  final List<CharacterRecord> characters;
  final List<CharacterSessionRecord> sessions;
  final ValueChanged<ChatMessageRecord> onEditUserMessage;
  final void Function(AttachmentRecord attachment, String prompt)
  onEditGeneratedImage;
  final ValueChanged<String> onOpenArtifact;
  final void Function(String code, String language) onOpenCodePlayground;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider).requireValue;
    final colors = context.colors;
    final activeSession = state.currentCharacterSession;
    final activeCharacter = state.currentCharacter;
    if (activeSession != null) {
      return Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
            decoration: BoxDecoration(
              color: colors.surface.withValues(alpha: 0.78),
              border: Border(
                bottom: BorderSide(color: colors.border.withValues(alpha: 0.7)),
              ),
            ),
            child: Row(
              children: [
                _CharacterAvatar(character: activeCharacter),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        activeSession.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: colors.text,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      Text(
                        activeCharacter?.tagline ?? 'Character chat',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: colors.muted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                TextButton.icon(
                  onPressed: () => context.go('/characters'),
                  icon: const Icon(LucideIcons.library, size: 16),
                  label: const Text('Library'),
                ),
              ],
            ),
          ),
          Expanded(
            child: _ChatViewport(
              chat: state.currentChat,
              onEditUserMessage: onEditUserMessage,
              onEditGeneratedImage: onEditGeneratedImage,
              onOpenArtifact: onOpenArtifact,
              onOpenCodePlayground: onOpenCodePlayground,
            ),
          ),
        ],
      );
    }
    final grouped = <String, List<CharacterRecord>>{};
    for (final character in characters) {
      grouped.putIfAbsent(character.category, () => []).add(character);
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 26),
      children: [
        Text(
          'Characters',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          'Pick a persona and continue in Chat with its voice, memory setting, and starter greeting.',
          style: TextStyle(color: colors.muted, height: 1.45, fontSize: 13),
        ),
        if (sessions.isNotEmpty) ...[
          const SizedBox(height: 18),
          Text(
            'Recent character chats',
            style: TextStyle(
              color: colors.muted,
              fontSize: 12,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          for (final session in sessions.take(3))
            _CharacterSessionTile(session: session, characters: characters),
        ],
        const SizedBox(height: 16),
        for (final entry in grouped.entries) ...[
          Padding(
            padding: const EdgeInsets.only(top: 12, bottom: 8),
            child: Text(
              entry.key,
              style: TextStyle(
                color: colors.muted,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          for (final character in entry.value)
            _CharacterCard(
              character: character,
              onStart: () {
                unawaited(
                  ref
                      .read(appControllerProvider.notifier)
                      .createCharacterSession(character.id)
                      .then((sessionId) {
                        if (sessionId != null && context.mounted) {
                          context.go('/characters/$sessionId');
                        }
                      }),
                );
              },
            ),
        ],
      ],
    );
  }
}

class _CharacterSessionTile extends StatelessWidget {
  const _CharacterSessionTile({
    required this.session,
    required this.characters,
  });

  final CharacterSessionRecord session;
  final List<CharacterRecord> characters;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final character = characters
        .where((item) => item.id == session.characterId)
        .firstOrNull;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          _CharacterAvatar(character: character),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  session.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  character?.name ?? 'Character',
                  style: TextStyle(color: colors.muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CharacterCard extends StatelessWidget {
  const _CharacterCard({required this.character, required this.onStart});

  final CharacterRecord character;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _CharacterAvatar(character: character),
              const SizedBox(width: 11),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      character.name,
                      style: TextStyle(
                        color: colors.text,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    Text(
                      character.tagline,
                      style: TextStyle(color: colors.muted, fontSize: 12),
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip: 'Start character chat',
                onPressed: onStart,
                icon: const Icon(LucideIcons.messageCirclePlus, size: 19),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            character.greeting,
            style: TextStyle(color: colors.text, height: 1.42, fontSize: 13),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _CharacterChip(
                icon: LucideIcons.sparkles,
                label: character.personality,
              ),
              _CharacterChip(
                icon: LucideIcons.feather,
                label: character.speakingStyle,
              ),
              if (character.memoryEnabledLabel.isNotEmpty)
                _CharacterChip(
                  icon: LucideIcons.brain,
                  label: character.memoryEnabledLabel,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

extension on CharacterRecord {
  String get memoryEnabledLabel =>
      visibility == 'private' ? 'Private' : visibility;
}

class _CharacterChip extends StatelessWidget {
  const _CharacterChip({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    if (label.trim().isEmpty) return const SizedBox.shrink();
    final colors = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: colors.userBubble,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: colors.muted),
          const SizedBox(width: 5),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 220),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: colors.muted, fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}

class _CharacterAvatar extends StatelessWidget {
  const _CharacterAvatar({this.character});
  final CharacterRecord? character;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final color = character == null
        ? colors.userBubble
        : Color(character!.color);
    return Container(
      height: 38,
      width: 38,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        border: Border.all(color: color.withValues(alpha: 0.28)),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        character?.avatar ?? '?',
        style: TextStyle(
          color: colors.text,
          fontSize: 13,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class _CharacterList extends ConsumerWidget {
  const _CharacterList({required this.state});
  final PrivoraState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = ref.read(appControllerProvider.notifier);
    if (state.characterSessions.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(10),
        child: Text(
          'No character chats yet.',
          style: TextStyle(color: context.colors.muted),
        ),
      );
    }
    return Column(
      children: [
        const _SidebarSectionLabel('Character chats'),
        for (final session in state.characterSessions)
          _SidebarRow(
            title: session.title,
            icon: LucideIcons.bot,
            active: state.currentChat?.id == session.id,
            onTap: () {
              unawaited(controller.selectCharacterSession(session.id));
              context.go('/characters/${session.id}');
            },
            trailing: PopupMenuButton<String>(
              icon: const Icon(LucideIcons.ellipsis, size: 18),
              onSelected: (value) {
                if (value != 'delete') return;
                unawaited(controller.deleteCharacterSession(session.id));
                if (state.currentCharacterSession?.id == session.id) {
                  context.go('/characters');
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
          ),
      ],
    );
  }
}

class _SidebarSectionLabel extends StatelessWidget {
  const _SidebarSectionLabel(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 14, 10, 8),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          label,
          style: TextStyle(
            color: context.colors.muted,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

String _modeTitle(WorkspaceMode mode) => switch (mode) {
  WorkspaceMode.chat => 'Chat',
  WorkspaceMode.webDev => 'Chat',
  WorkspaceMode.characters => 'Characters',
};
