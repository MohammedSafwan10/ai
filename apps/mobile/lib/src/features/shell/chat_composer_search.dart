part of 'privora_shell.dart';

class _SearchOverlay extends StatefulWidget {
  const _SearchOverlay({
    required this.chats,
    required this.onClose,
    required this.onSelectChat,
  });
  final List<ChatRecord> chats;
  final VoidCallback onClose;
  final ValueChanged<String> onSelectChat;

  @override
  State<_SearchOverlay> createState() => _SearchOverlayState();
}

class _SearchOverlayState extends State<_SearchOverlay> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final query = _controller.text.trim().toLowerCase();
    final matches = query.isEmpty
        ? widget.chats
        : widget.chats
              .where(
                (chat) =>
                    chat.title.toLowerCase().contains(query) ||
                    chat.messages.any(
                      (message) =>
                          message.content.toLowerCase().contains(query),
                    ),
              )
              .toList();
    return Positioned.fill(
      child: Material(
        color: Colors.black.withValues(alpha: 0.22),
        child: Center(
          child: Container(
            width: 560,
            constraints: const BoxConstraints(maxHeight: 620),
            margin: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: colors.surface,
              border: Border.all(color: colors.border),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: colors.shadow,
                  blurRadius: 28,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 8, 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _controller,
                          autofocus: true,
                          onChanged: (_) => setState(() {}),
                          decoration: InputDecoration(
                            prefixIcon: const Icon(LucideIcons.search),
                            hintText: 'Search chats',
                            filled: true,
                            fillColor: colors.background.withValues(
                              alpha: 0.55,
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(14),
                              borderSide: BorderSide(color: colors.border),
                            ),
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'Close search',
                        onPressed: widget.onClose,
                        icon: const Icon(LucideIcons.x),
                      ),
                    ],
                  ),
                ),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    padding: const EdgeInsets.fromLTRB(10, 4, 10, 12),
                    itemCount: matches.length,
                    itemBuilder: (_, index) => _SearchResultTile(
                      chat: matches[index],
                      onTap: () => widget.onSelectChat(matches[index].id),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SearchResultTile extends StatelessWidget {
  const _SearchResultTile({required this.chat, required this.onTap});
  final ChatRecord chat;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final preview = chat.messages.isEmpty
        ? 'No messages yet'
        : chat.messages.last.content;
    return ListTile(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      title: Text(
        chat.title,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: colors.text, fontWeight: FontWeight.w600),
      ),
      subtitle: Text(
        preview,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: colors.muted),
      ),
      onTap: onTap,
    );
  }
}
