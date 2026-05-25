part of 'privora_shell.dart';

class _Composer extends ConsumerWidget {
  const _Composer({
    required this.controller,
    required this.focusNode,
    required this.attachments,
    required this.onPickFiles,
    required this.onPickImage,
    required this.onRemoveAttachment,
    required this.onSent,
    required this.onOpenCodePlayground,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final List<AttachmentRecord> attachments;
  final VoidCallback onPickFiles;
  final VoidCallback onPickImage;
  final ValueChanged<AttachmentRecord> onRemoveAttachment;
  final VoidCallback onSent;
  final VoidCallback onOpenCodePlayground;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(appControllerProvider).requireValue;
    final app = ref.read(appControllerProvider.notifier);
    final colors = context.colors;
    final isImageMode = state.settings.composerMode == ComposerMode.image;
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
      decoration: BoxDecoration(
        color: colors.background,
        border: Border(
          top: BorderSide(color: colors.border.withValues(alpha: 0.5)),
        ),
      ),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 760),
        padding: const EdgeInsets.fromLTRB(9, 7, 8, 7),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (attachments.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 5),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final attachment in attachments) ...[
                          _AttachmentPreview(
                            attachment: attachment,
                            onRemove: () => onRemoveAttachment(attachment),
                          ),
                          const SizedBox(width: 6),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            TextField(
              controller: controller,
              focusNode: focusNode,
              minLines: 1,
              maxLines: 4,
              style: TextStyle(color: colors.text, fontSize: 14, height: 1.35),
              decoration: InputDecoration(
                hintText: isImageMode
                    ? 'Describe the image to create'
                    : 'How can I help you today?',
                hintStyle: TextStyle(color: colors.muted),
                filled: false,
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                disabledBorder: InputBorder.none,
                isDense: true,
                contentPadding: const EdgeInsets.fromLTRB(5, 5, 5, 9),
              ),
            ),
            Row(
              children: [
                _ComposerIcon(
                  icon: LucideIcons.plus,
                  tooltip: 'Add files or options',
                  onPressed: () => _showAddSheet(
                    context,
                    ref,
                    onPickFiles: onPickFiles,
                    onPickImage: onPickImage,
                    onOpenCodePlayground: onOpenCodePlayground,
                  ),
                ),
                if (!isImageMode) ...[
                  const SizedBox(width: 3),
                  _ThinkingButton(
                    active: state.settings.isThinkingEnabled,
                    onPressed: app.toggleThinking,
                  ),
                  if (state.settings.isDebateModeEnabled)
                    IconButton(
                      tooltip: 'Debate model settings',
                      visualDensity: VisualDensity.compact,
                      style: IconButton.styleFrom(
                        backgroundColor: colors.userBubble,
                      ),
                      onPressed: () => _showDebateOptionsSheet(context, ref),
                      icon: const Icon(LucideIcons.gitCompare, size: 17),
                    ),
                  if (state.settings.isClashModeEnabled)
                    IconButton(
                      tooltip: 'Clash model settings',
                      visualDensity: VisualDensity.compact,
                      style: IconButton.styleFrom(
                        backgroundColor: colors.userBubble,
                      ),
                      onPressed: () => _showClashOptionsSheet(context, ref),
                      icon: _ClashGlyph(
                        color: colors.text.withValues(alpha: 0.9),
                      ),
                    ),
                ],
                const SizedBox(width: 4),
                const Spacer(),
                const SizedBox(width: 4),
                if (isImageMode) ...[
                  IconButton(
                    tooltip: 'Image options',
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _showImageOptionsSheet(context, ref),
                    icon: const Icon(LucideIcons.slidersHorizontal, size: 17),
                  ),
                  const SizedBox(width: 2),
                ],
                IconButton.filled(
                  tooltip: state.isGenerating
                      ? 'Stop generating'
                      : 'Send message',
                  onPressed: () => _submit(context, state, app),
                  icon: Icon(
                    state.isGenerating
                        ? LucideIcons.square
                        : LucideIcons.arrowUp,
                    size: 18,
                  ),
                  style: IconButton.styleFrom(
                    backgroundColor: colors.accent,
                    foregroundColor: colors.accentForeground,
                    disabledBackgroundColor: colors.text.withValues(alpha: 0.1),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _submit(BuildContext context, PrivoraState state, AppController app) {
    if (state.isGenerating) {
      app.stopGeneration();
      return;
    }
    final error = validateAttachments(
      attachments,
      _attachmentProviderFor(state.settings),
    );
    if (error != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    app.sendMessage(controller.text, attachments: attachments);
    controller.clear();
    onSent();
  }
}

class _AttachmentPreview extends StatelessWidget {
  const _AttachmentPreview({required this.attachment, this.onRemove});

  final AttachmentRecord attachment;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final isImage = attachment.mimeType.startsWith('image/');
    return Container(
      height: 38,
      constraints: const BoxConstraints(maxWidth: 210),
      padding: const EdgeInsets.only(left: 7, right: 4),
      decoration: BoxDecoration(
        color: colors.background.withValues(alpha: 0.7),
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (isImage && attachment.base64 != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: Image.memory(
                base64Decode(attachment.base64!),
                height: 26,
                width: 26,
                fit: BoxFit.cover,
              ),
            )
          else
            Icon(LucideIcons.file, size: 17, color: colors.muted),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              attachment.name,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: colors.text, fontSize: 12),
            ),
          ),
          if (onRemove != null)
            IconButton(
              tooltip: 'Remove attachment',
              visualDensity: VisualDensity.compact,
              iconSize: 14,
              onPressed: onRemove,
              icon: const Icon(LucideIcons.x),
            ),
        ],
      ),
    );
  }
}

class _ComposerIcon extends StatelessWidget {
  const _ComposerIcon({
    required this.icon,
    required this.tooltip,
    required this.onPressed,
  });
  final IconData icon;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      visualDensity: VisualDensity.compact,
      icon: Icon(icon, size: 18),
      style: IconButton.styleFrom(
        backgroundColor: colors.text.withValues(alpha: 0.05),
        foregroundColor: colors.text,
      ),
    );
  }
}

class _ThinkingButton extends StatelessWidget {
  const _ThinkingButton({required this.active, required this.onPressed});
  final bool active;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return IconButton(
      tooltip: active ? 'Thinking: Medium' : 'Thinking: Instant',
      onPressed: onPressed,
      visualDensity: VisualDensity.compact,
      style: IconButton.styleFrom(
        backgroundColor: active ? colors.userBubble : Colors.transparent,
      ),
      icon: Icon(
        LucideIcons.brain,
        size: 17,
        color: active ? colors.text : colors.muted,
      ),
    );
  }
}

class _SearchButton extends StatelessWidget {
  const _SearchButton({required this.onPressed});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return TextButton.icon(
      onPressed: onPressed,
      icon: const Icon(LucideIcons.search, size: 18),
      label: const Text('Search'),
      style: TextButton.styleFrom(
        foregroundColor: colors.text,
        minimumSize: const Size.fromHeight(42),
        alignment: Alignment.centerLeft,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
