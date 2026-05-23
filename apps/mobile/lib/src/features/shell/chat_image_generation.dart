part of 'privora_shell.dart';

class _ImageGenerationCard extends StatelessWidget {
  const _ImageGenerationCard({
    required this.generation,
    required this.attachments,
    required this.onEditGeneratedImage,
    required this.onRetry,
  });
  final ImageGenerationRecord generation;
  final List<AttachmentRecord> attachments;
  final void Function(AttachmentRecord attachment, String prompt)
  onEditGeneratedImage;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final complete = generation.status == ImageGenerationStatus.completed;
    final failed = generation.status == ImageGenerationStatus.failed;
    final running =
        generation.status == ImageGenerationStatus.queued ||
        generation.status == ImageGenerationStatus.generating;
    return Container(
      constraints: BoxConstraints(
        maxWidth: generation.items.length == 1 ? 416 : 512,
      ),
      margin: const EdgeInsets.only(bottom: 8),
      padding: running || complete ? EdgeInsets.zero : const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: running || complete ? Colors.transparent : colors.surface,
        border: running
            ? Border.all(color: colors.border.withValues(alpha: 0.45))
            : complete
            ? null
            : Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!running && !complete) ...[
            Row(
              children: [
                Icon(LucideIcons.image, size: 16, color: colors.muted),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    failed
                        ? 'Image generation failed'
                        : generation.status == ImageGenerationStatus.stopped
                        ? 'Image generation stopped'
                        : generation.mode == 'edit'
                        ? 'Edited image'
                        : 'Generated image',
                    style: TextStyle(
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
          ],
          LayoutBuilder(
            builder: (context, constraints) {
              final itemWidth = generation.items.length > 1
                  ? (constraints.maxWidth - 8) / 2
                  : constraints.maxWidth;
              AttachmentRecord? attachmentFor(
                int index,
                ImageGenerationItemRecord item,
              ) {
                if (item.attachmentName != null) {
                  for (final attachment in attachments) {
                    if (attachment.name == item.attachmentName) {
                      return attachment;
                    }
                  }
                }
                return index < attachments.length ? attachments[index] : null;
              }

              return Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  for (final entry in generation.items.indexed)
                    _GeneratedImageItem(
                      item: entry.$2,
                      attachment: attachmentFor(entry.$1, entry.$2),
                      width: itemWidth,
                      onEditGeneratedImage: onEditGeneratedImage,
                      onRetry: onRetry,
                      prompt: generation.prompt,
                    ),
                ],
              );
            },
          ),
          if (generation.error != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.red.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                generation.error!,
                style: TextStyle(color: colors.muted, fontSize: 12),
              ),
            ),
          ],
          if (!running && !complete) ...[
            const SizedBox(height: 7),
            Text(
              '${generation.options.sizePreset} / ${generation.options.quality} / ${generation.model}',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: colors.muted, fontSize: 11),
            ),
          ],
        ],
      ),
    );
  }
}

class _GeneratedImageItem extends StatelessWidget {
  const _GeneratedImageItem({
    required this.item,
    required this.attachment,
    required this.width,
    required this.onEditGeneratedImage,
    required this.onRetry,
    required this.prompt,
  });
  final ImageGenerationItemRecord item;
  final AttachmentRecord? attachment;
  final double width;
  final void Function(AttachmentRecord attachment, String prompt)
  onEditGeneratedImage;
  final VoidCallback onRetry;
  final String prompt;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final image = attachment?.base64 ?? item.partialImageBase64;
    final running =
        item.status == ImageGenerationItemStatus.queued ||
        item.status == ImageGenerationItemStatus.generating;
    final complete =
        item.status == ImageGenerationItemStatus.completed &&
        attachment != null;
    return Container(
      width: width,
      constraints: const BoxConstraints(minHeight: 126),
      decoration: BoxDecoration(
        color: item.status == ImageGenerationItemStatus.completed
            ? Colors.transparent
            : colors.background,
        borderRadius: BorderRadius.circular(16),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: attachment == null
                        ? null
                        : () => _showImagePreview(context, attachment!),
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (image == null)
                          item.status == ImageGenerationItemStatus.failed
                              ? Center(
                                  child: Icon(
                                    LucideIcons.triangleAlert,
                                    color: colors.muted,
                                  ),
                                )
                              : const _ImageGenerationShimmer(
                                  key: Key('image-generation-shimmer'),
                                )
                        else
                          Image.memory(
                            base64Decode(image),
                            fit: BoxFit.cover,
                            gaplessPlayback: true,
                            opacity: running
                                ? const AlwaysStoppedAnimation(0.85)
                                : null,
                          ),
                        if (running) ...[
                          const _ImageGenerationVignette(),
                          const _ImageGenerationSheen(),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          if (complete) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                _MessageAction(
                  tooltip: 'Open image',
                  icon: LucideIcons.externalLink,
                  onPressed: () => _showImagePreview(context, attachment!),
                ),
                _MessageAction(
                  tooltip: 'Save image',
                  icon: LucideIcons.download,
                  onPressed: () => _shareImageAttachment(attachment!),
                ),
                _MessageAction(
                  tooltip: 'Edit image',
                  icon: LucideIcons.pencil,
                  onPressed: () => onEditGeneratedImage(attachment!, prompt),
                ),
                _MessageAction(
                  tooltip: 'Retry image generation',
                  icon: LucideIcons.refreshCw,
                  onPressed: onRetry,
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

void _showImagePreview(BuildContext context, AttachmentRecord attachment) {
  final data = attachment.base64;
  if (data == null) return;
  final colors = context.colors;
  showDialog<void>(
    context: context,
    barrierColor: Colors.black.withValues(alpha: 0.78),
    builder: (context) => Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: SafeArea(
        child: Stack(
          children: [
            Positioned.fill(
              child: InteractiveViewer(
                minScale: 0.7,
                maxScale: 5,
                child: Center(
                  child: Image.memory(
                    base64Decode(data),
                    fit: BoxFit.contain,
                    gaplessPlayback: true,
                  ),
                ),
              ),
            ),
            Positioned(
              top: 10,
              left: 10,
              right: 10,
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      attachment.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  _PreviewAction(
                    tooltip: 'Save image',
                    icon: LucideIcons.download,
                    onPressed: () => _shareImageAttachment(attachment),
                  ),
                  _PreviewAction(
                    tooltip: 'Close',
                    icon: LucideIcons.x,
                    onPressed: () => Navigator.of(context).pop(),
                  ),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: IgnorePointer(
                child: Container(
                  height: 96,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0.44),
                        colors.background.withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

Future<void> _shareImageAttachment(AttachmentRecord attachment) async {
  final data = attachment.base64;
  if (data == null) return;
  final directory = await getTemporaryDirectory();
  final filename = attachment.name.isEmpty
      ? 'privora-image.png'
      : attachment.name;
  final file = io.File(p.join(directory.path, filename));
  await file.writeAsBytes(base64Decode(data), flush: true);
  await SharePlus.instance.share(
    ShareParams(
      files: [XFile(file.path, mimeType: attachment.mimeType, name: filename)],
    ),
  );
}

class _PreviewAction extends StatelessWidget {
  const _PreviewAction({
    required this.tooltip,
    required this.icon,
    required this.onPressed,
  });
  final String tooltip;
  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Tooltip(
    message: tooltip,
    child: IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      icon: Icon(icon, color: Colors.white, size: 20),
    ),
  );
}

class _ImageGenerationShimmer extends StatefulWidget {
  const _ImageGenerationShimmer({super.key});

  @override
  State<_ImageGenerationShimmer> createState() =>
      _ImageGenerationShimmerState();
}

class _ImageGenerationShimmerState extends State<_ImageGenerationShimmer>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2200),
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
      painter: _ImageGenerationShimmerPainter(
        phase: _controller.value,
        colors: context.colors,
      ),
    ),
  );
}

class _ImageGenerationSheen extends StatefulWidget {
  const _ImageGenerationSheen();

  @override
  State<_ImageGenerationSheen> createState() => _ImageGenerationSheenState();
}

class _ImageGenerationSheenState extends State<_ImageGenerationSheen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1800),
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
      painter: _ImageGenerationSheenPainter(phase: _controller.value),
    ),
  );
}

class _ImageGenerationShimmerPainter extends CustomPainter {
  const _ImageGenerationShimmerPainter({
    required this.phase,
    required this.colors,
  });

  final double phase;
  final PrivoraColors colors;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final eased = Curves.easeInOut.transform(
      phase <= 0.5 ? phase * 2 : 2 - phase * 2,
    );
    final bgPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          colors.background,
          colors.surface.withValues(alpha: 0.66),
          colors.userBubble.withValues(alpha: 0.52),
        ],
      ).createShader(rect);
    canvas.drawRect(rect, bgPaint);

    void drawOrb({
      required Offset center,
      required double radius,
      required Color color,
    }) {
      final paint = Paint()
        ..color = color
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 18);
      canvas.drawCircle(center, radius, paint);
    }

    drawOrb(
      center: Offset(
        size.width * (0.18 + eased * 0.16),
        size.height * (0.18 + eased * 0.10),
      ),
      radius: size.shortestSide * 0.18,
      color: colors.userBubble.withValues(alpha: 0.34),
    );
    drawOrb(
      center: Offset(
        size.width * (0.82 - eased * 0.14),
        size.height * (0.24 + eased * 0.18),
      ),
      radius: size.shortestSide * 0.17,
      color: colors.text.withValues(alpha: 0.09),
    );
    drawOrb(
      center: Offset(
        size.width * (0.48 - eased * 0.04),
        size.height * (0.82 - eased * 0.16),
      ),
      radius: size.shortestSide * 0.21,
      color: colors.surface.withValues(alpha: 0.52),
    );

    final gridPaint = Paint()
      ..color = Colors.white.withValues(alpha: 0.045)
      ..strokeWidth = 1;
    const grid = 28.0;
    for (double x = 0; x <= size.width; x += grid) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double y = 0; y <= size.height; y += grid) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }
  }

  @override
  bool shouldRepaint(covariant _ImageGenerationShimmerPainter oldDelegate) =>
      phase != oldDelegate.phase || colors != oldDelegate.colors;
}

class _ImageGenerationSheenPainter extends CustomPainter {
  const _ImageGenerationSheenPainter({required this.phase});
  final double phase;

  @override
  void paint(Canvas canvas, Size size) {
    final eased = Curves.easeInOut.transform(phase);
    final opacity = phase < 0.22
        ? phase / 0.22 * 0.85
        : phase < 0.64
        ? 0.85 - ((phase - 0.22) / 0.42) * 0.3
        : (1 - phase) / 0.36 * 0.55;
    final rect = Rect.fromLTWH(
      size.width * (-0.78 + eased * 1.56),
      -size.height * 0.35,
      size.width * 0.88,
      size.height * 1.7,
    );
    canvas.save();
    canvas.translate(rect.center.dx, rect.center.dy);
    canvas.rotate(8 * math.pi / 180);
    canvas.translate(-rect.center.dx, -rect.center.dy);
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.centerLeft,
        end: Alignment.centerRight,
        colors: [
          Colors.white.withValues(alpha: 0),
          Colors.white.withValues(alpha: 0.04 * opacity),
          Colors.white.withValues(alpha: 0.24 * opacity),
          Colors.white.withValues(alpha: 0.06 * opacity),
          Colors.white.withValues(alpha: 0),
        ],
        stops: const [0, 0.36, 0.48, 0.58, 0.76],
      ).createShader(rect);
    canvas.drawRect(rect, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant _ImageGenerationSheenPainter oldDelegate) =>
      phase != oldDelegate.phase;
}

class _ImageGenerationVignette extends StatefulWidget {
  const _ImageGenerationVignette();

  @override
  State<_ImageGenerationVignette> createState() =>
      _ImageGenerationVignetteState();
}

class _ImageGenerationVignetteState extends State<_ImageGenerationVignette>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2800),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, _) => CustomPaint(
      painter: _ImageGenerationVignettePainter(
        opacity: 0.68 + _controller.value * 0.32,
      ),
    ),
  );
}

class _ImageGenerationVignettePainter extends CustomPainter {
  const _ImageGenerationVignettePainter({required this.opacity});
  final double opacity;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final paint = Paint()
      ..shader = RadialGradient(
        center: const Alignment(0, -0.16),
        radius: 0.82,
        colors: [
          Colors.transparent,
          Colors.black.withValues(alpha: 0.08 * opacity),
        ],
      ).createShader(rect);
    canvas.drawRect(rect, paint);
  }

  @override
  bool shouldRepaint(covariant _ImageGenerationVignettePainter oldDelegate) =>
      opacity != oldDelegate.opacity;
}
