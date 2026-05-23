part of 'privora_shell.dart';

class _Sidebar extends ConsumerWidget {
  const _Sidebar({
    required this.state,
    required this.onClose,
    required this.onSearchOpen,
    this.compact = false,
  });
  final PrivoraState state;
  final VoidCallback onClose;
  final VoidCallback onSearchOpen;
  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final controller = ref.read(appControllerProvider.notifier);
    return Material(
      color: colors.surface,
      child: Container(
        width: 280,
        decoration: BoxDecoration(
          border: Border(right: BorderSide(color: colors.border)),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 14, 12, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      'Privora',
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    tooltip: 'Close sidebar',
                    onPressed: onClose,
                    icon: const Icon(LucideIcons.panelLeft),
                  ),
                ],
              ),
            ),
            _ModeSwitcher(current: state.settings.workspaceMode),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: _NewItemButton(mode: state.settings.workspaceMode),
            ),
            if (state.settings.workspaceMode == WorkspaceMode.chat)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: _SearchButton(onPressed: onSearchOpen),
              ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 0, 10, 12),
                children: [
                  if (state.settings.workspaceMode == WorkspaceMode.chat) ...[
                    _ChatSection(
                      title: 'Starred',
                      chats: state.visibleChats
                          .where((chat) => chat.isStarred)
                          .toList(),
                    ),
                    _ChatSection(
                      title: 'Recents',
                      chats: state.visibleChats
                          .where((chat) => !chat.isStarred)
                          .toList(),
                    ),
                  ] else
                    _CharacterList(state: state),
                ],
              ),
            ),
            Divider(height: 1, color: colors.border),
            Padding(
              padding: const EdgeInsets.all(12),
              child: TextButton.icon(
                onPressed: controller.toggleDarkMode,
                icon: Icon(
                  state.settings.isDarkMode
                      ? LucideIcons.sun
                      : LucideIcons.moon,
                ),
                label: Text(
                  state.settings.isDarkMode ? 'Light Mode' : 'Dark Mode',
                ),
                style: TextButton.styleFrom(
                  foregroundColor: colors.muted,
                  minimumSize: const Size.fromHeight(44),
                  alignment: Alignment.centerLeft,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ModeSwitcher extends StatelessWidget {
  const _ModeSwitcher({required this.current});
  final WorkspaceMode current;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.background.withValues(alpha: 0.55),
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Column(
        children: [
          _ModeTile(
            mode: WorkspaceMode.chat,
            current: current,
            icon: LucideIcons.messageCircle,
            label: 'Chat',
            route: '/chat',
          ),
          _ModeTile(
            mode: WorkspaceMode.characters,
            current: current,
            icon: LucideIcons.bot,
            label: 'Characters',
            route: '/characters',
          ),
        ],
      ),
    );
  }
}

class _ModeTile extends StatelessWidget {
  const _ModeTile({
    required this.mode,
    required this.current,
    required this.icon,
    required this.label,
    required this.route,
  });
  final WorkspaceMode mode;
  final WorkspaceMode current;
  final IconData icon;
  final String label;
  final String route;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final active = mode == current;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.go(route),
        child: Container(
          height: 42,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: active ? colors.surface : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
            boxShadow: active
                ? [
                    BoxShadow(
                      color: colors.shadow,
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ]
                : null,
          ),
          child: Row(
            children: [
              Icon(icon, size: 18, color: active ? colors.text : colors.muted),
              const SizedBox(width: 10),
              Text(
                label,
                style: TextStyle(
                  color: active ? colors.text : colors.muted,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NewItemButton extends ConsumerWidget {
  const _NewItemButton({required this.mode});
  final WorkspaceMode mode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    return OutlinedButton.icon(
      onPressed: mode == WorkspaceMode.chat
          ? ref.read(appControllerProvider.notifier).newChat
          : mode == WorkspaceMode.characters
          ? () => context.go('/characters')
          : null,
      icon: const Icon(LucideIcons.plus, size: 18),
      label: Text(
        mode == WorkspaceMode.characters ? 'New character chat' : 'New chat',
      ),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(46),
        foregroundColor: colors.text,
        backgroundColor: colors.background.withValues(alpha: 0.55),
        side: BorderSide(color: colors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        alignment: Alignment.centerLeft,
      ),
    );
  }
}

class _ChatSection extends ConsumerWidget {
  const _ChatSection({required this.title, required this.chats});
  final String title;
  final List<ChatRecord> chats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (chats.isEmpty) return const SizedBox.shrink();
    final state = ref.watch(appControllerProvider).requireValue;
    final controller = ref.read(appControllerProvider.notifier);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SidebarSectionLabel(title),
        for (final chat in chats)
          _SidebarRow(
            active: state.currentChat?.id == chat.id,
            icon: chat.isStarred ? LucideIcons.star : null,
            title: chat.title,
            onTap: () {
              controller.selectChat(chat.id);
              context.go('/chat/${chat.id}');
            },
            trailing: PopupMenuButton<String>(
              icon: const Icon(LucideIcons.ellipsis, size: 18),
              onSelected: (value) async {
                if (value == 'star') controller.toggleStarChat(chat.id);
                if (value == 'rename') {
                  final title = await _showRenameChatDialog(
                    context,
                    chat.title,
                  );
                  if (title != null) controller.renameChat(chat.id, title);
                }
                if (value == 'delete') controller.deleteChat(chat.id);
              },
              itemBuilder: (_) => [
                PopupMenuItem(
                  value: 'star',
                  child: Text(chat.isStarred ? 'Unstar' : 'Star'),
                ),
                const PopupMenuItem(value: 'rename', child: Text('Rename')),
                const PopupMenuItem(value: 'delete', child: Text('Delete')),
              ],
            ),
          ),
      ],
    );
  }
}

class _SidebarRow extends StatelessWidget {
  const _SidebarRow({
    required this.title,
    required this.onTap,
    this.active = false,
    this.icon,
    this.trailing,
  });
  final String title;
  final VoidCallback onTap;
  final bool active;
  final IconData? icon;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        constraints: const BoxConstraints(minHeight: 42),
        padding: const EdgeInsets.only(left: 10),
        decoration: BoxDecoration(
          color: active
              ? colors.text.withValues(alpha: 0.1)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            if (icon != null) ...[
              Icon(icon, size: 15, color: colors.muted),
              const SizedBox(width: 8),
            ],
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: active
                      ? colors.text
                      : colors.text.withValues(alpha: 0.72),
                  fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            ?trailing,
          ],
        ),
      ),
    );
  }
}
