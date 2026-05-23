part of 'privora_shell.dart';

class _ArtifactCard extends StatelessWidget {
  const _ArtifactCard({required this.artifact, required this.onOpen});

  final ArtifactReferenceRecord artifact;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final streaming = artifact.status == ArtifactStatus.streaming;
    return Container(
      constraints: const BoxConstraints(maxWidth: 560),
      margin: const EdgeInsets.only(top: 6, bottom: 8),
      child: Material(
        color: colors.surface.withValues(alpha: 0.78),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(
            color: streaming
                ? colors.text.withValues(alpha: 0.2)
                : colors.border,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpen,
          child: Stack(
            children: [
              if (streaming)
                Positioned.fill(
                  child: _ArtifactCardShimmer(color: colors.userBubble),
                ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Container(
                      height: 38,
                      width: 38,
                      decoration: BoxDecoration(
                        color: colors.userBubble,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Icon(
                        _artifactIcon(artifact.kind),
                        size: 18,
                        color: colors.text,
                      ),
                    ),
                    const SizedBox(width: 11),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            artifact.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: colors.text,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            streaming
                                ? 'Creating ${artifact.kind.name} artifact'
                                : '${artifact.kind.name} artifact',
                            style: TextStyle(color: colors.muted, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    Icon(LucideIcons.maximize2, size: 17, color: colors.muted),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ArtifactCardShimmer extends StatefulWidget {
  const _ArtifactCardShimmer({required this.color});
  final Color color;

  @override
  State<_ArtifactCardShimmer> createState() => _ArtifactCardShimmerState();
}

class _ArtifactCardShimmerState extends State<_ArtifactCardShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1600),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, _) => CustomPaint(
      painter: _ArtifactCardShimmerPainter(
        phase: _controller.value,
        color: widget.color,
      ),
    ),
  );
}

class _ArtifactCardShimmerPainter extends CustomPainter {
  const _ArtifactCardShimmerPainter({required this.phase, required this.color});

  final double phase;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final pulse = 0.55 + 0.45 * math.sin(phase * math.pi * 2).abs();
    canvas.drawRect(
      rect,
      Paint()..color = color.withValues(alpha: 0.07 * pulse),
    );
    final sweep = Rect.fromLTWH(
      size.width * (-0.42 + phase * 1.8),
      -size.height * 0.8,
      size.width * 0.38,
      size.height * 2.6,
    );
    canvas.save();
    canvas.translate(sweep.center.dx, sweep.center.dy);
    canvas.rotate(8 * math.pi / 180);
    canvas.translate(-sweep.center.dx, -sweep.center.dy);
    canvas.drawRect(
      sweep,
      Paint()
        ..shader = LinearGradient(
          colors: [
            color.withValues(alpha: 0),
            color.withValues(alpha: 0.22),
            color.withValues(alpha: 0),
          ],
        ).createShader(sweep),
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ArtifactCardShimmerPainter oldDelegate) =>
      phase != oldDelegate.phase || color != oldDelegate.color;
}

class _ArtifactCanvasPanel extends StatelessWidget {
  const _ArtifactCanvasPanel({
    required this.artifact,
    required this.isGenerating,
    required this.onStop,
    required this.onClose,
  });

  final ArtifactRecord? artifact;
  final bool isGenerating;
  final VoidCallback onStop;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final streaming = artifact?.status == ArtifactStatus.streaming;
    return Material(
      color: colors.background.withValues(alpha: 0.72),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(18),
            child: ColoredBox(
              color: colors.background,
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.fromLTRB(8, 6, 6, 6),
                    decoration: BoxDecoration(
                      color: colors.surface.withValues(alpha: 0.86),
                      border: Border(bottom: BorderSide(color: colors.border)),
                    ),
                    child: Row(
                      children: [
                        IconButton(
                          tooltip: 'Close Canvas',
                          onPressed: onClose,
                          icon: const Icon(LucideIcons.x, size: 19),
                        ),
                        const SizedBox(width: 2),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                artifact?.title ?? 'Artifact',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: colors.text,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                              ),
                              const SizedBox(height: 3),
                              Wrap(
                                spacing: 6,
                                runSpacing: 4,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  _ArtifactMetaChip(
                                    label: artifact == null
                                        ? 'Not found'
                                        : artifact!.kind.name,
                                  ),
                                  if (artifact?.language != null)
                                    _ArtifactMetaChip(
                                      label: artifact!.language!,
                                    ),
                                  if (streaming)
                                    _ArtifactMetaChip(
                                      label: 'Streaming',
                                      active: true,
                                    ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        if (streaming && isGenerating)
                          TextButton.icon(
                            onPressed: onStop,
                            icon: const Icon(LucideIcons.square, size: 15),
                            label: const Text('Stop'),
                          ),
                        if (artifact != null)
                          PopupMenuButton<String>(
                            tooltip: 'Artifact actions',
                            icon: const Icon(LucideIcons.ellipsisVertical),
                            onSelected: (value) {
                              if (value == 'copy') {
                                Clipboard.setData(
                                  ClipboardData(text: artifact!.content),
                                );
                              }
                              if (value == 'share' || value == 'export') {
                                _shareArtifactFile(artifact!);
                              }
                            },
                            itemBuilder: (context) => const [
                              PopupMenuItem(value: 'copy', child: Text('Copy')),
                              PopupMenuItem(
                                value: 'share',
                                child: Text('Share'),
                              ),
                              PopupMenuItem(
                                value: 'export',
                                child: Text('Export'),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                  Expanded(
                    child: artifact == null
                        ? Center(
                            child: Text(
                              'Artifact not found.',
                              style: TextStyle(color: colors.muted),
                            ),
                          )
                        : _ArtifactCanvasBody(artifact: artifact!),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ArtifactMetaChip extends StatelessWidget {
  const _ArtifactMetaChip({required this.label, this.active = false});

  final String label;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: active
            ? colors.userBubble.withValues(alpha: 0.58)
            : colors.background.withValues(alpha: 0.72),
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (active) ...[
              _PrivoraTypingIndicator(
                size: 12,
                color: colors.text.withValues(alpha: 0.68),
              ),
              const SizedBox(width: 4),
            ],
            Text(
              label,
              style: TextStyle(
                color: active ? colors.text : colors.muted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ArtifactCanvasBody extends StatelessWidget {
  const _ArtifactCanvasBody({required this.artifact});

  final ArtifactRecord artifact;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final markdownKinds = {
      ArtifactKind.markdown,
      ArtifactKind.table,
      ArtifactKind.prompt,
      ArtifactKind.text,
    };
    final streaming = artifact.status == ArtifactStatus.streaming;
    if (streaming) {
      return Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            color: colors.surface.withValues(alpha: 0.52),
            child: Text(
              'Live source updates are shown while Privora writes. Preview unlocks when streaming finishes.',
              style: TextStyle(color: colors.muted, fontSize: 12),
            ),
          ),
          Expanded(child: _ArtifactSourceEditor(artifact: artifact)),
        ],
      );
    }
    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          Material(
            color: colors.surface.withValues(alpha: 0.52),
            child: TabBar(
              tabs: const [
                Tab(icon: Icon(LucideIcons.eye, size: 15), text: 'Preview'),
                Tab(icon: Icon(LucideIcons.code2, size: 15), text: 'Source'),
              ],
            ),
          ),
          Expanded(
            child: TabBarView(
              children: [
                SingleChildScrollView(
                  padding: const EdgeInsets.all(12),
                  child: markdownKinds.contains(artifact.kind)
                      ? MarkdownBody(
                          data: artifact.content,
                          selectable: true,
                          styleSheet:
                              MarkdownStyleSheet.fromTheme(
                                Theme.of(context),
                              ).copyWith(
                                p: TextStyle(
                                  color: colors.text,
                                  height: 1.5,
                                  fontSize: 14,
                                ),
                              ),
                        )
                      : _ArtifactPreviewPane(artifact: artifact),
                ),
                _ArtifactSourceEditor(artifact: artifact),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ArtifactSourceBlock extends StatelessWidget {
  const _ArtifactSourceBlock({required this.artifact});

  final ArtifactRecord artifact;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: SelectableText(
        artifact.content,
        style: TextStyle(
          color: colors.text,
          fontFamily: 'monospace',
          fontSize: 12.5,
          height: 1.45,
        ),
      ),
    );
  }
}

class _ArtifactPreviewPane extends StatelessWidget {
  const _ArtifactPreviewPane({required this.artifact});

  final ArtifactRecord artifact;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    if (artifact.kind == ArtifactKind.svg ||
        artifact.content.trimLeft().startsWith('<svg')) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.transparent,
          border: Border.all(color: colors.border),
          borderRadius: BorderRadius.circular(12),
        ),
        child: SvgPicture.string(
          artifact.content,
          fit: BoxFit.contain,
          placeholderBuilder: (context) => Center(
            child: Text(
              'Rendering SVG...',
              style: TextStyle(color: colors.muted),
            ),
          ),
        ),
      );
    }
    if (artifact.kind == ArtifactKind.html) {
      return _ExternalArtifactPreview(artifact: artifact);
    }
    return _ArtifactSourceBlock(artifact: artifact);
  }
}

class _ExternalArtifactPreview extends StatelessWidget {
  const _ExternalArtifactPreview({required this.artifact});

  final ArtifactRecord artifact;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.transparent,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(LucideIcons.globe2, color: colors.muted, size: 22),
          const SizedBox(height: 10),
          Text(
            'HTML preview',
            style: TextStyle(
              color: colors.text,
              fontSize: 15,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Open this artifact in the browser preview. Source stays live in the Code tab while the model streams.',
            style: TextStyle(color: colors.muted, height: 1.45, fontSize: 13),
          ),
          const SizedBox(height: 14),
          FilledButton.icon(
            onPressed: () => _openHtmlArtifactPreview(artifact),
            icon: const Icon(LucideIcons.externalLink, size: 16),
            label: const Text('Open preview'),
          ),
        ],
      ),
    );
  }
}

class _ArtifactSourceEditor extends StatefulWidget {
  const _ArtifactSourceEditor({required this.artifact});

  final ArtifactRecord artifact;

  @override
  State<_ArtifactSourceEditor> createState() => _ArtifactSourceEditorState();
}

class _ArtifactSourceEditorState extends State<_ArtifactSourceEditor> {
  late final TextEditingController _controller;
  String _lastSyncedContent = '';
  double _scrollTop = 0;
  final _scrollController = ScrollController();
  Timer? _streamSyncTimer;

  @override
  void initState() {
    super.initState();
    _lastSyncedContent = widget.artifact.content;
    _controller = TextEditingController(text: widget.artifact.content);
    _scrollController.addListener(() {
      if (_scrollTop != _scrollController.offset) {
        setState(() => _scrollTop = _scrollController.offset);
      }
    });
  }

  @override
  void didUpdateWidget(covariant _ArtifactSourceEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.artifact.id != oldWidget.artifact.id) {
      _streamSyncTimer?.cancel();
      _lastSyncedContent = widget.artifact.content;
      _syncController(widget.artifact.content);
      return;
    }
    final untouched = _controller.text == _lastSyncedContent;
    final streaming = widget.artifact.status == ArtifactStatus.streaming;
    if (widget.artifact.content != _lastSyncedContent &&
        (streaming || untouched)) {
      _lastSyncedContent = widget.artifact.content;
      if (streaming) {
        _streamSyncTimer?.cancel();
        _streamSyncTimer = Timer(
          const Duration(milliseconds: 90),
          () => _syncController(_lastSyncedContent),
        );
      } else {
        _syncController(widget.artifact.content);
      }
    }
  }

  @override
  void dispose() {
    _streamSyncTimer?.cancel();
    _scrollController.dispose();
    _controller.dispose();
    super.dispose();
  }

  void _syncController(String content) {
    if (!mounted || _controller.text == content) return;
    _controller.value = TextEditingValue(
      text: content,
      selection: TextSelection.collapsed(offset: content.length),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final lineCount = math.max(1, '\n'.allMatches(_controller.text).length + 1);
    final streaming = widget.artifact.status == ArtifactStatus.streaming;
    return Container(
      color: colors.background,
      child: Row(
        children: [
          Container(
            width: 36,
            color: colors.surface.withValues(alpha: 0.42),
            child: CustomPaint(
              painter: _LineNumberGutterPainter(
                lineCount: lineCount,
                scrollTop: _scrollTop,
                color: colors.muted.withValues(alpha: 0.72),
              ),
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                TextField(
                  controller: _controller,
                  scrollController: _scrollController,
                  expands: true,
                  maxLines: null,
                  minLines: null,
                  readOnly: streaming,
                  textAlignVertical: TextAlignVertical.top,
                  onChanged: (_) => setState(() {}),
                  style: TextStyle(
                    color: colors.text,
                    fontFamily: 'monospace',
                    fontSize: 12.2,
                    height: 1.44,
                  ),
                  decoration: InputDecoration(
                    filled: true,
                    fillColor: Colors.transparent,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.fromLTRB(10, 12, 10, 18),
                    hintText: streaming
                        ? 'Artifact code is streaming...'
                        : 'Edit artifact source',
                  ),
                ),
                if (streaming)
                  Positioned(
                    top: 10,
                    right: 10,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: colors.surface.withValues(alpha: 0.84),
                        border: Border.all(color: colors.border),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            _PrivoraTypingIndicator(
                              size: 14,
                              color: colors.text.withValues(alpha: 0.68),
                            ),
                            const SizedBox(width: 5),
                            Text(
                              'Streaming',
                              style: TextStyle(
                                color: colors.muted,
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _LineNumberGutterPainter extends CustomPainter {
  const _LineNumberGutterPainter({
    required this.lineCount,
    required this.scrollTop,
    required this.color,
  });

  final int lineCount;
  final double scrollTop;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    const lineHeight = 19.0;
    const topPadding = 14.0;
    final textStyle = TextStyle(
      color: color,
      fontFamily: 'monospace',
      fontSize: 11,
    );
    final firstLine = math.max(
      1,
      ((scrollTop - topPadding) / lineHeight).floor(),
    );
    final visibleCount = (size.height / lineHeight).ceil() + 3;
    final lastLine = math.min(lineCount, firstLine + visibleCount);
    for (var line = firstLine; line <= lastLine; line++) {
      final painter = TextPainter(
        text: TextSpan(text: '$line', style: textStyle),
        textDirection: TextDirection.ltr,
      )..layout();
      final y = topPadding + (line - 1) * lineHeight - scrollTop;
      painter.paint(canvas, Offset(size.width - painter.width - 8, y));
    }
  }

  @override
  bool shouldRepaint(covariant _LineNumberGutterPainter oldDelegate) =>
      lineCount != oldDelegate.lineCount ||
      scrollTop != oldDelegate.scrollTop ||
      color != oldDelegate.color;
}

Future<void> _shareArtifactFile(ArtifactRecord artifact) async {
  final filename =
      '${_safeFilename(artifact.title)}.${_artifactExtension(artifact)}';
  final directory = await getTemporaryDirectory();
  final file = io.File(p.join(directory.path, filename));
  await file.writeAsString(artifact.content, flush: true);
  await SharePlus.instance.share(
    ShareParams(
      files: [XFile(file.path, mimeType: 'text/plain', name: filename)],
      subject: artifact.title,
    ),
  );
}

Future<void> _openHtmlArtifactPreview(ArtifactRecord artifact) async {
  final uri = Uri.dataFromString(
    artifact.content,
    mimeType: 'text/html',
    encoding: utf8,
  );
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

String _artifactExtension(ArtifactRecord artifact) {
  if (artifact.kind == ArtifactKind.code && artifact.language != null) {
    return _codeExtension(artifact.language!);
  }
  return switch (artifact.kind) {
    ArtifactKind.markdown => 'md',
    ArtifactKind.html => 'html',
    ArtifactKind.svg => 'svg',
    ArtifactKind.mermaid => 'mmd',
    ArtifactKind.json => 'json',
    ArtifactKind.yaml => 'yaml',
    ArtifactKind.sql => 'sql',
    ArtifactKind.table => 'csv',
    ArtifactKind.prompt || ArtifactKind.text || ArtifactKind.code => 'txt',
  };
}

IconData _artifactIcon(ArtifactKind kind) => switch (kind) {
  ArtifactKind.code ||
  ArtifactKind.html ||
  ArtifactKind.svg ||
  ArtifactKind.mermaid => LucideIcons.fileCode2,
  ArtifactKind.json ||
  ArtifactKind.yaml ||
  ArtifactKind.sql => LucideIcons.sparkles,
  _ => LucideIcons.fileText,
};
