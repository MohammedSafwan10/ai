part of 'privora_shell.dart';

class _ChatViewport extends StatefulWidget {
  const _ChatViewport({
    required this.chat,
    required this.onEditUserMessage,
    required this.onEditGeneratedImage,
    required this.onOpenArtifact,
    required this.onOpenCodePlayground,
  });
  final ChatRecord? chat;
  final ValueChanged<ChatMessageRecord> onEditUserMessage;
  final void Function(AttachmentRecord attachment, String prompt)
  onEditGeneratedImage;
  final ValueChanged<String> onOpenArtifact;
  final void Function(String code, String language) onOpenCodePlayground;

  @override
  State<_ChatViewport> createState() => _ChatViewportState();
}

class _ChatViewportState extends State<_ChatViewport> {
  final _scrollController = ScrollController();
  bool _showLatest = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_updateLatestButton);
  }

  @override
  void didUpdateWidget(covariant _ChatViewport oldWidget) {
    super.didUpdateWidget(oldWidget);
    final oldCount = oldWidget.chat?.messages.length ?? 0;
    final nextCount = widget.chat?.messages.length ?? 0;
    final wasNearBottom = !_showLatest;
    if (nextCount != oldCount || wasNearBottom) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_scrollController.hasClients || !wasNearBottom) return;
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
        );
      });
    }
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_updateLatestButton)
      ..dispose();
    super.dispose();
  }

  void _updateLatestButton() {
    if (!_scrollController.hasClients) return;
    final show =
        _scrollController.position.maxScrollExtent -
            _scrollController.position.pixels >
        100;
    if (show != _showLatest) setState(() => _showLatest = show);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final chat = widget.chat;
    if (chat == null || chat.messages.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(
            'How can I help today?',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
              fontSize: 34,
              color: colors.text,
            ),
          ),
        ),
      );
    }
    return Stack(
      children: [
        ListView.builder(
          controller: _scrollController,
          padding: const EdgeInsets.fromLTRB(8, 18, 8, 70),
          itemCount: chat.messages.length,
          itemBuilder: (_, index) => _MessageBubble(
            message: chat.messages[index],
            onEditUserMessage: widget.onEditUserMessage,
            onEditGeneratedImage: widget.onEditGeneratedImage,
            onOpenArtifact: widget.onOpenArtifact,
            onOpenCodePlayground: widget.onOpenCodePlayground,
          ),
        ),
        if (_showLatest)
          Positioned(
            bottom: 14,
            left: 0,
            right: 0,
            child: Center(
              child: IconButton.filledTonal(
                tooltip: 'Scroll to latest',
                onPressed: () => _scrollController.animateTo(
                  _scrollController.position.maxScrollExtent,
                  duration: const Duration(milliseconds: 220),
                  curve: Curves.easeOut,
                ),
                icon: const Icon(LucideIcons.arrowDown, size: 18),
              ),
            ),
          ),
      ],
    );
  }
}

class _MessageBubble extends ConsumerWidget {
  const _MessageBubble({
    required this.message,
    required this.onEditUserMessage,
    required this.onEditGeneratedImage,
    required this.onOpenArtifact,
    required this.onOpenCodePlayground,
  });
  final ChatMessageRecord message;
  final ValueChanged<ChatMessageRecord> onEditUserMessage;
  final void Function(AttachmentRecord attachment, String prompt)
  onEditGeneratedImage;
  final ValueChanged<String> onOpenArtifact;
  final void Function(String code, String language) onOpenCodePlayground;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final isUser = message.role == 'user';
    final state = ref.watch(appControllerProvider).value;
    final app = ref.read(appControllerProvider.notifier);
    final isActiveResponse =
        state?.isGenerating == true &&
        state?.currentChat?.messages.lastOrNull?.id == message.id;
    final showsThinkingSurface =
        !isUser && (message.thought != null || message.isThinking == true);
    final hasResearchPlan = !isUser && message.researchPlan != null;
    final isResearchReport =
        hasResearchPlan &&
        message.researchPlan?.status == ResearchPlanStatus.completed;
    final showTypingOnly =
        !isUser &&
        isActiveResponse &&
        message.content.isEmpty &&
        message.imageGeneration == null &&
        message.debate == null &&
        !hasResearchPlan &&
        !showsThinkingSurface;
    final codeBlock = !isUser ? _firstCodeBlock(message.content) : null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: GestureDetector(
        onLongPressStart: isUser
            ? (details) => _showUserMessageMenu(
                context,
                details.globalPosition,
                message: message,
                onEdit: () => onEditUserMessage(message),
              )
            : null,
        child: Align(
          alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            constraints: BoxConstraints(
              maxWidth: isUser ? 620 : double.infinity,
            ),
            padding: isUser
                ? const EdgeInsets.symmetric(horizontal: 18, vertical: 13)
                : EdgeInsets.zero,
            decoration: BoxDecoration(
              color: isUser ? colors.userBubble : Colors.transparent,
              borderRadius: BorderRadius.circular(24),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (showsThinkingSurface) _ThoughtPanel(message: message),
                if (!isUser && message.webSearchStatus != null)
                  _WebSearchProgress(
                    status: message.webSearchStatus!,
                    queries: message.webSearchQueries,
                  ),
                if (hasResearchPlan && !isResearchReport)
                  _ResearchPlanCard(
                    message: message,
                    onStart: () => app.startResearchPlan(message.id),
                    onCancel: () => app.cancelResearchPlan(message.id),
                    onStop: app.stopGeneration,
                    onEdit: () async {
                      final updated =
                          await showModalBottomSheet<ResearchPlanRecord>(
                            context: context,
                            isScrollControlled: true,
                            builder: (_) => _ResearchPlanEditor(
                              plan: message.researchPlan!,
                            ),
                          );
                      if (updated != null) {
                        app.updateResearchPlan(message.id, updated);
                      }
                    },
                    onActivity: () =>
                        _showResearchActivitySheet(context, message),
                  ),
                if (isResearchReport)
                  _ResearchReportCard(
                    message: message,
                    onActivity: () =>
                        _showResearchActivitySheet(context, message),
                  ),
                if (message.imageGeneration != null)
                  _ImageGenerationCard(
                    generation: message.imageGeneration!,
                    attachments: message.attachments,
                    onEditGeneratedImage: onEditGeneratedImage,
                    onRetry: () => app.retryImageMessage(message.id),
                  ),
                if (message.debate != null)
                  _DebateCard(
                    debate: message.debate!,
                    onRetry: () => app.retryMessage(message.id),
                  ),
                if (message.artifact != null)
                  _ArtifactCard(
                    artifact: message.artifact!,
                    onOpen: () => onOpenArtifact(message.artifact!.artifactId),
                  ),
                if (message.imageGeneration == null &&
                    message.debate == null &&
                    message.attachments.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        for (final attachment in message.attachments)
                          _AttachmentPreview(attachment: attachment),
                      ],
                    ),
                  ),
                if (showTypingOnly)
                  const _PrivoraTypingIndicator(
                    key: Key('typing-indicator'),
                    size: 22,
                  )
                else if (message.content.isNotEmpty)
                  if (!hasResearchPlan)
                    MarkdownBody(
                      data: message.content,
                      selectable: !isUser,
                      styleSheet:
                          MarkdownStyleSheet.fromTheme(
                            Theme.of(context),
                          ).copyWith(
                            p: TextStyle(
                              color: colors.text,
                              height: 1.58,
                              fontSize: isUser ? 15 : 16,
                            ),
                          ),
                    ),
                if (!isUser && !hasResearchPlan && message.content.isNotEmpty)
                  const SizedBox(height: 6),
                if (!isUser && !hasResearchPlan && message.content.isNotEmpty)
                  Wrap(
                    spacing: 2,
                    children: [
                      _MessageAction(
                        tooltip: 'Copy',
                        icon: LucideIcons.copy,
                        onPressed: () => Clipboard.setData(
                          ClipboardData(text: message.content),
                        ),
                      ),
                      _MessageAction(
                        tooltip: 'Share',
                        icon: LucideIcons.share2,
                        onPressed: () => SharePlus.instance.share(
                          ShareParams(text: message.content),
                        ),
                      ),
                      _MessageAction(
                        tooltip: 'Retry',
                        icon: LucideIcons.refreshCw,
                        onPressed: () => app.retryMessage(message.id),
                      ),
                      if (codeBlock != null)
                        _MessageAction(
                          tooltip: 'Open in Code Playground',
                          icon: LucideIcons.code2,
                          onPressed: () => onOpenCodePlayground(
                            codeBlock.code,
                            codeBlock.language,
                          ),
                        ),
                    ],
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> _showUserMessageMenu(
  BuildContext context,
  Offset position, {
  required ChatMessageRecord message,
  required VoidCallback onEdit,
}) async {
  final overlay = Overlay.of(context).context.findRenderObject() as RenderBox;
  final selected = await showMenu<String>(
    context: context,
    position: RelativeRect.fromRect(
      Rect.fromLTWH(position.dx, position.dy, 1, 1),
      Offset.zero & overlay.size,
    ),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    items: const [
      PopupMenuItem(
        value: 'copy',
        child: Row(
          children: [
            Icon(LucideIcons.copy, size: 17),
            SizedBox(width: 12),
            Text('Copy'),
          ],
        ),
      ),
      PopupMenuItem(
        value: 'edit',
        child: Row(
          children: [
            Icon(LucideIcons.pencil, size: 17),
            SizedBox(width: 12),
            Text('Edit message'),
          ],
        ),
      ),
      PopupMenuItem(
        value: 'share',
        child: Row(
          children: [
            Icon(LucideIcons.share2, size: 17),
            SizedBox(width: 12),
            Text('Share'),
          ],
        ),
      ),
    ],
  );
  if (selected == 'copy') {
    await Clipboard.setData(ClipboardData(text: message.content));
  } else if (selected == 'share') {
    await SharePlus.instance.share(ShareParams(text: message.content));
  } else if (selected == 'edit') {
    onEdit();
  }
}

class _CodePlaygroundDraft {
  const _CodePlaygroundDraft({required this.code, required this.language});

  final String code;
  final String language;
}

_CodePlaygroundDraft? _firstCodeBlock(String content) {
  final match = RegExp(
    r'```([a-zA-Z0-9_+\-.#]*)\s*\n([\s\S]*?)```',
  ).firstMatch(content);
  if (match == null) return null;
  final language = (match.group(1)?.trim().toLowerCase() ?? '').isEmpty
      ? 'text'
      : match.group(1)!.trim().toLowerCase();
  return _CodePlaygroundDraft(
    code: match.group(2)?.trim() ?? '',
    language: language,
  );
}

class _CodePlaygroundPanel extends StatefulWidget {
  const _CodePlaygroundPanel({required this.draft, required this.onClose});

  final _CodePlaygroundDraft draft;
  final VoidCallback onClose;

  @override
  State<_CodePlaygroundPanel> createState() => _CodePlaygroundPanelState();
}

class _CodePlaygroundPanelState extends State<_CodePlaygroundPanel> {
  late final TextEditingController _codeController;
  late final TextEditingController _languageController;

  @override
  void initState() {
    super.initState();
    _codeController = TextEditingController(text: widget.draft.code);
    _languageController = TextEditingController(text: widget.draft.language);
  }

  @override
  void dispose() {
    _codeController.dispose();
    _languageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Material(
      color: colors.background,
      child: SafeArea(
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(10, 8, 8, 8),
              decoration: BoxDecoration(
                color: colors.surface,
                border: Border(bottom: BorderSide(color: colors.border)),
              ),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Close Code Playground',
                    onPressed: widget.onClose,
                    icon: const Icon(LucideIcons.x, size: 19),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      'Code Playground',
                      style: TextStyle(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Copy code',
                    onPressed: () => Clipboard.setData(
                      ClipboardData(text: _codeController.text),
                    ),
                    icon: const Icon(LucideIcons.copy, size: 18),
                  ),
                  IconButton(
                    tooltip: 'Share code',
                    onPressed: _shareCodeFile,
                    icon: const Icon(LucideIcons.share2, size: 18),
                  ),
                  IconButton(
                    tooltip: 'Export code file',
                    onPressed: _shareCodeFile,
                    icon: const Icon(LucideIcons.download, size: 18),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 8),
              child: TextField(
                controller: _languageController,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Language',
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
            ),
            Expanded(
              child: DefaultTabController(
                length: 2,
                child: Column(
                  children: [
                    Material(
                      color: colors.background,
                      child: const TabBar(
                        tabs: [
                          Tab(
                            icon: Icon(LucideIcons.code2, size: 16),
                            text: 'Editor',
                          ),
                          Tab(
                            icon: Icon(LucideIcons.eye, size: 16),
                            text: 'Preview',
                          ),
                        ],
                      ),
                    ),
                    Expanded(
                      child: TabBarView(
                        children: [
                          Padding(
                            padding: const EdgeInsets.all(14),
                            child: TextField(
                              controller: _codeController,
                              expands: true,
                              maxLines: null,
                              minLines: null,
                              onChanged: (_) => setState(() {}),
                              textAlignVertical: TextAlignVertical.top,
                              style: TextStyle(
                                color: colors.text,
                                fontFamily: 'monospace',
                                fontSize: 13,
                                height: 1.45,
                              ),
                              decoration: InputDecoration(
                                filled: true,
                                fillColor: colors.surface,
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(8),
                                  borderSide: BorderSide(color: colors.border),
                                ),
                              ),
                            ),
                          ),
                          SingleChildScrollView(
                            padding: const EdgeInsets.all(14),
                            child: _CodePreview(
                              code: _codeController.text,
                              language: _languageController.text,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _shareCodeFile() async {
    final language = _languageController.text.trim();
    final filename = 'privora-playground.${_codeExtension(language)}';
    final directory = await getTemporaryDirectory();
    final file = io.File(p.join(directory.path, filename));
    await file.writeAsString(_codeController.text, flush: true);
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: 'text/plain', name: filename)],
      ),
    );
  }
}

class _CodePreview extends StatelessWidget {
  const _CodePreview({required this.code, required this.language});

  final String code;
  final String language;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final normalized = language.trim().toLowerCase();
    if (normalized == 'markdown' || normalized == 'md') {
      return MarkdownBody(data: code, selectable: true);
    }
    if (normalized == 'html' || normalized == 'svg') {
      final isSvg = normalized == 'svg' || code.trimLeft().startsWith('<svg');
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: colors.surface,
          border: Border.all(color: colors.border),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  isSvg ? LucideIcons.shapes : LucideIcons.globe2,
                  size: 16,
                  color: colors.muted,
                ),
                const SizedBox(width: 8),
                Text(
                  isSvg ? 'SVG preview source' : 'HTML preview source',
                  style: TextStyle(
                    color: colors.text,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SelectableText(
              code.isEmpty ? 'Start typing markup.' : code,
              style: TextStyle(
                color: code.isEmpty ? colors.muted : colors.text,
                fontFamily: 'monospace',
                fontSize: 12.5,
                height: 1.45,
              ),
            ),
          ],
        ),
      );
    }
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: SelectableText(
        code.isEmpty ? 'Start typing code.' : code,
        style: TextStyle(
          color: code.isEmpty ? colors.muted : colors.text,
          fontFamily: 'monospace',
          fontSize: 12.5,
          height: 1.45,
        ),
      ),
    );
  }
}

String _codeExtension(String language) {
  final normalized = language.trim().toLowerCase();
  return switch (normalized) {
    'javascript' || 'js' => 'js',
    'typescript' || 'ts' => 'ts',
    'jsx' => 'jsx',
    'tsx' => 'tsx',
    'dart' => 'dart',
    'python' || 'py' => 'py',
    'html' => 'html',
    'css' => 'css',
    'json' => 'json',
    'markdown' || 'md' => 'md',
    'svg' => 'svg',
    _ => 'txt',
  };
}

class _PrivoraTypingIndicator extends StatefulWidget {
  const _PrivoraTypingIndicator({
    super.key,
    this.size = 24,
    this.animate = true,
    this.color,
  });

  final double size;
  final bool animate;
  final Color? color;

  @override
  State<_PrivoraTypingIndicator> createState() =>
      _PrivoraTypingIndicatorState();
}

class _PrivoraTypingIndicatorState extends State<_PrivoraTypingIndicator>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 18),
  );

  @override
  void initState() {
    super.initState();
    if (widget.animate) _controller.repeat();
  }

  @override
  void didUpdateWidget(covariant _PrivoraTypingIndicator oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.animate && !oldWidget.animate) {
      _controller.repeat();
    } else if (!widget.animate && oldWidget.animate) {
      _controller.stop();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return SizedBox.square(
      dimension: widget.size,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, _) => CustomPaint(
          painter: _PrivoraTypingPainter(
            phase: widget.animate ? _controller.value : 0,
            animate: widget.animate,
            color: widget.color ?? colors.text,
            muted: colors.muted,
          ),
        ),
      ),
    );
  }
}

class _PrivoraTypingPainter extends CustomPainter {
  const _PrivoraTypingPainter({
    required this.phase,
    required this.animate,
    required this.color,
    required this.muted,
  });

  final double phase;
  final bool animate;
  final Color color;
  final Color muted;

  @override
  void paint(Canvas canvas, Size size) {
    final center = size.center(Offset.zero);
    final scale = size.shortestSide / 24;
    canvas.save();
    canvas.translate(center.dx, center.dy);
    if (animate) canvas.rotate(phase * math.pi * 2);
    final oval = Rect.fromCenter(
      center: Offset.zero,
      width: 7 * scale,
      height: 21 * scale,
    );
    final track = Paint()
      ..color = muted.withValues(alpha: animate ? 0.30 : 0.10)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.25 * scale;
    for (var index = 0; index < 4; index++) {
      canvas.save();
      canvas.rotate(index * math.pi / 4);
      canvas.drawOval(oval, track);
      final local = (phase * 6 + index * 0.16) % 1;
      final sweep = animate
          ? 0.10 + 0.54 * (0.5 - 0.5 * math.cos(local * math.pi * 2))
          : 1.0;
      final arc = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeWidth = 1.25 * scale;
      canvas.drawArc(
        oval,
        local * math.pi * 2,
        sweep * math.pi * 2,
        false,
        arc,
      );
      canvas.restore();
    }
    final pulse = animate
        ? 0.70 + 0.70 * (0.5 - 0.5 * math.cos(phase * math.pi * 18))
        : 1.0;
    canvas.drawCircle(
      Offset.zero,
      1.5 * scale * pulse,
      Paint()..color = color.withValues(alpha: animate ? 0.8 : 0.72),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _PrivoraTypingPainter oldDelegate) =>
      phase != oldDelegate.phase ||
      animate != oldDelegate.animate ||
      color != oldDelegate.color ||
      muted != oldDelegate.muted;
}

class _WebSearchProgress extends StatelessWidget {
  const _WebSearchProgress({required this.status, required this.queries});
  final String status;
  final List<String> queries;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(
            LucideIcons.globe,
            size: 14,
            color: status == 'searching' ? colors.text : colors.muted,
          ),
          const SizedBox(width: 6),
          Text(
            status == 'searched' ? 'Searched web' : 'Searching web',
            style: TextStyle(color: colors.muted, fontSize: 13),
          ),
          if (queries.isNotEmpty) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 7),
              child: Container(
                width: 4,
                height: 4,
                decoration: BoxDecoration(
                  color: colors.muted.withValues(alpha: 0.55),
                  shape: BoxShape.circle,
                ),
              ),
            ),
            Flexible(
              child: Text(
                queries.first,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: colors.muted.withValues(alpha: 0.78),
                  fontSize: 13,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MessageAction extends StatelessWidget {
  const _MessageAction({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      visualDensity: VisualDensity.compact,
      iconSize: 16,
      icon: Icon(icon, color: context.colors.muted),
    );
  }
}
