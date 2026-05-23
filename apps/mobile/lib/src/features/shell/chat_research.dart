part of 'privora_shell.dart';

class _ResearchPlanCard extends StatefulWidget {
  const _ResearchPlanCard({
    required this.message,
    required this.onStart,
    required this.onCancel,
    required this.onStop,
    required this.onEdit,
    required this.onActivity,
  });

  final ChatMessageRecord message;
  final VoidCallback onStart;
  final VoidCallback onCancel;
  final VoidCallback onStop;
  final VoidCallback onEdit;
  final VoidCallback onActivity;

  @override
  State<_ResearchPlanCard> createState() => _ResearchPlanCardState();
}

class _ResearchPlanCardState extends State<_ResearchPlanCard> {
  Timer? _elapsedTimer;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _syncElapsedTimer();
  }

  @override
  void didUpdateWidget(covariant _ResearchPlanCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncElapsedTimer();
  }

  @override
  void dispose() {
    _elapsedTimer?.cancel();
    super.dispose();
  }

  void _syncElapsedTimer() {
    final running =
        widget.message.researchPlan?.status == ResearchPlanStatus.running;
    if (!running) {
      _elapsedTimer?.cancel();
      _elapsedTimer = null;
      return;
    }
    _elapsedTimer ??= Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _now = DateTime.now());
    });
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final message = widget.message;
    final plan = message.researchPlan!;
    final running = plan.status == ResearchPlanStatus.running;
    final cancelled = plan.status == ResearchPlanStatus.cancelled;
    final superseded = plan.status == ResearchPlanStatus.superseded;
    final elapsed = _researchElapsedLabel(message, now: _now);
    final sourceCount = message.researchSources.length;
    return Container(
      constraints: const BoxConstraints(maxWidth: 620),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 10),
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
              Icon(LucideIcons.bookOpen, size: 16, color: colors.muted),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  plan.title,
                  style: TextStyle(
                    color: colors.text,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              IconButton(
                tooltip: 'Research activity',
                visualDensity: VisualDensity.compact,
                onPressed: widget.onActivity,
                icon: const Icon(LucideIcons.activity, size: 17),
              ),
            ],
          ),
          Text(
            superseded
                ? 'Superseded by a newer plan'
                : cancelled
                ? 'Stopped'
                : running
                ? plan.currentActivity ?? 'Researching'
                : 'Review the plan before starting',
            style: TextStyle(color: colors.muted, fontSize: 12),
          ),
          if (running || sourceCount > 0 || elapsed != null) ...[
            const SizedBox(height: 7),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                if (running)
                  _ResearchMetaChip(
                    icon: LucideIcons.timer,
                    label: elapsed ?? '0s',
                  ),
                if (sourceCount > 0)
                  _ResearchMetaChip(
                    icon: LucideIcons.link,
                    label: '$sourceCount source${sourceCount == 1 ? '' : 's'}',
                  ),
                if (message.researchTimeBudgetMs != null)
                  _ResearchMetaChip(
                    icon: LucideIcons.hourglass,
                    label:
                        'budget ${_durationLabel(Duration(milliseconds: message.researchTimeBudgetMs!))}',
                  ),
              ],
            ),
          ],
          if (running) ...[
            const SizedBox(height: 9),
            LinearProgressIndicator(
              value: plan.progress,
              minHeight: 3,
              borderRadius: BorderRadius.circular(3),
              color: colors.text.withValues(alpha: 0.68),
              backgroundColor: colors.border,
            ),
          ],
          const SizedBox(height: 10),
          for (var index = 0; index < plan.steps.length; index++)
            Padding(
              padding: const EdgeInsets.only(bottom: 7),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _ResearchStepMark(status: plan.steps[index].status),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      plan.steps[index].text,
                      style: TextStyle(
                        color: colors.text,
                        height: 1.35,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          if (!cancelled && !superseded) ...[
            const SizedBox(height: 3),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: running
                  ? [
                      OutlinedButton.icon(
                        onPressed: widget.onStop,
                        icon: const Icon(LucideIcons.square, size: 14),
                        label: const Text('Stop'),
                      ),
                    ]
                  : [
                      FilledButton.icon(
                        onPressed: widget.onStart,
                        icon: const Icon(LucideIcons.play, size: 14),
                        label: const Text('Start'),
                      ),
                      OutlinedButton.icon(
                        onPressed: widget.onEdit,
                        icon: const Icon(LucideIcons.pencil, size: 14),
                        label: const Text('Edit'),
                      ),
                      IconButton.outlined(
                        tooltip: 'Cancel plan',
                        onPressed: widget.onCancel,
                        icon: const Icon(LucideIcons.x, size: 16),
                      ),
                    ],
            ),
          ],
          if (message.researchStatus == ResearchStatus.failed &&
              message.content.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              message.content,
              style: TextStyle(color: colors.muted, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}

class _ResearchMetaChip extends StatelessWidget {
  const _ResearchMetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: colors.userBubble,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: colors.muted),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(color: colors.muted, fontSize: 11)),
        ],
      ),
    );
  }
}

class _ResearchStepMark extends StatelessWidget {
  const _ResearchStepMark({required this.status});

  final ResearchPlanStepStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return SizedBox(
      height: 18,
      width: 18,
      child: switch (status) {
        ResearchPlanStepStatus.active => _PrivoraTypingIndicator(
          size: 18,
          color: colors.text.withValues(alpha: 0.72),
        ),
        ResearchPlanStepStatus.completed => Icon(
          LucideIcons.circleCheck,
          size: 16,
          color: colors.text.withValues(alpha: 0.72),
        ),
        ResearchPlanStepStatus.skipped => Icon(
          LucideIcons.circleMinus,
          size: 16,
          color: colors.muted,
        ),
        ResearchPlanStepStatus.pending => Icon(
          LucideIcons.circle,
          size: 16,
          color: colors.muted,
        ),
      },
    );
  }
}

class _ResearchReportCard extends StatelessWidget {
  const _ResearchReportCard({required this.message, required this.onActivity});

  final ChatMessageRecord message;
  final VoidCallback onActivity;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final plan = message.researchPlan!;
    final meta = _ResearchReportMeta.fromMessage(message);
    return Container(
      constraints: const BoxConstraints(maxWidth: 680),
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: colors.surface,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 8, 8),
            child: Row(
              children: [
                Container(
                  height: 30,
                  width: 30,
                  decoration: BoxDecoration(
                    color: colors.userBubble,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    LucideIcons.bookOpenText,
                    size: 16,
                    color: colors.text,
                  ),
                ),
                const SizedBox(width: 9),
                Expanded(
                  child: InkWell(
                    onTap: () => _showResearchReportViewer(context, message),
                    child: Text(
                      plan.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: colors.text,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                _MessageAction(
                  tooltip: 'Export report',
                  icon: LucideIcons.download,
                  onPressed: () => _showResearchExportSheet(context, message),
                ),
                _MessageAction(
                  tooltip: 'Open full report',
                  icon: LucideIcons.maximize2,
                  onPressed: () => _showResearchReportViewer(context, message),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(13, 0, 13, 8),
            child: Text(
              'Research ${meta.summary}',
              style: TextStyle(
                color: colors.muted,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          InkWell(
            onTap: () => _showResearchReportViewer(context, message),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 360),
              child: Stack(
                children: [
                  SingleChildScrollView(
                    physics: const NeverScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(18, 14, 18, 34),
                    child: MarkdownBody(
                      data: message.content,
                      selectable: false,
                      styleSheet:
                          MarkdownStyleSheet.fromTheme(
                            Theme.of(context),
                          ).copyWith(
                            p: TextStyle(
                              color: colors.text,
                              height: 1.52,
                              fontSize: 14,
                            ),
                          ),
                    ),
                  ),
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: 84,
                    child: IgnorePointer(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.bottomCenter,
                            end: Alignment.topCenter,
                            colors: [
                              colors.surface,
                              colors.surface.withValues(alpha: 0),
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
          Padding(
            padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
            child: Row(
              children: [
                _MessageAction(
                  tooltip: 'Copy report',
                  icon: LucideIcons.copy,
                  onPressed: () => Clipboard.setData(
                    ClipboardData(text: _buildResearchReportMarkdown(message)),
                  ),
                ),
                _MessageAction(
                  tooltip: 'Share report',
                  icon: LucideIcons.share2,
                  onPressed: () => SharePlus.instance.share(
                    ShareParams(text: _buildResearchReportMarkdown(message)),
                  ),
                ),
                _MessageAction(
                  tooltip: 'Activity and sources',
                  icon: LucideIcons.activity,
                  onPressed: onActivity,
                ),
                _MessageAction(
                  tooltip: 'Open full report',
                  icon: LucideIcons.externalLink,
                  onPressed: () => _showResearchReportViewer(context, message),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ResearchReportMeta {
  const _ResearchReportMeta({
    required this.title,
    required this.summary,
    required this.toc,
  });

  final String title;
  final String summary;
  final List<_ResearchTocItem> toc;

  factory _ResearchReportMeta.fromMessage(ChatMessageRecord message) {
    final title = message.researchPlan?.title ?? 'Deep Research';
    final sourceCount = message.researchSources.length;
    final citationMatches = RegExp(
      r'\[(?:\d+|source\s*\d+)\]',
    ).allMatches(message.content.toLowerCase());
    final elapsed = _researchElapsedLabel(message);
    final summary = [
      elapsed == null ? 'completed' : 'completed in $elapsed',
      '${citationMatches.length} citation${citationMatches.length == 1 ? '' : 's'}',
      '$sourceCount source${sourceCount == 1 ? '' : 's'}',
    ].join(' · ');
    return _ResearchReportMeta(
      title: title,
      summary: summary,
      toc: _extractResearchToc(message.content),
    );
  }
}

class _ResearchTocItem {
  const _ResearchTocItem({required this.text, required this.level});
  final String text;
  final int level;
}

String? _researchElapsedLabel(ChatMessageRecord message, {DateTime? now}) {
  final started = message.researchStartedAt;
  final completed = message.researchCompletedAt;
  final elapsed = started == null
      ? message.researchPlan?.updatedAt.difference(
          message.researchPlan?.createdAt ?? DateTime.now(),
        )
      : (completed ?? now ?? DateTime.now()).difference(started);
  if (elapsed == null) return null;
  return _durationLabel(elapsed);
}

String _durationLabel(Duration elapsed) {
  final totalSeconds = elapsed.inMilliseconds <= 0
      ? 0
      : (elapsed.inMilliseconds / 1000).round();
  final minutes = totalSeconds ~/ 60;
  final seconds = totalSeconds % 60;
  if (minutes <= 0) return '${seconds}s';
  if (minutes < 60) return '${minutes}m ${seconds.toString().padLeft(2, '0')}s';
  final hours = minutes ~/ 60;
  final remainingMinutes = minutes % 60;
  return '${hours}h ${remainingMinutes.toString().padLeft(2, '0')}m';
}

List<_ResearchTocItem> _extractResearchToc(String markdown) {
  final items = <_ResearchTocItem>[];
  for (final line in markdown.split('\n')) {
    final match = RegExp(r'^(#{1,3})\s+(.+)$').firstMatch(line.trimRight());
    if (match == null) continue;
    final text = match.group(2)?.trim();
    if (text == null || text.isEmpty) continue;
    items.add(_ResearchTocItem(text: text, level: match.group(1)!.length));
  }
  return items;
}

String _buildResearchReportMarkdown(ChatMessageRecord message) {
  final sources = message.researchSources;
  if (sources.isEmpty) return message.content;
  final contentHasSources = RegExp(
    r'^#{1,3}\s+sources\b',
    caseSensitive: false,
    multiLine: true,
  ).hasMatch(message.content);
  if (contentHasSources) return message.content;
  return [
    message.content.trim(),
    '',
    '## Sources',
    for (var index = 0; index < sources.length; index++)
      '${index + 1}. ${sources[index].title ?? sources[index].url} - ${sources[index].url}',
  ].join('\n');
}

Future<void> _showResearchExportSheet(
  BuildContext context,
  ChatMessageRecord message,
) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  builder: (context) => SafeArea(
    child: Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 18),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(LucideIcons.copy, size: 19),
            title: const Text('Copy contents'),
            onTap: () {
              Clipboard.setData(
                ClipboardData(text: _buildResearchReportMarkdown(message)),
              );
              Navigator.pop(context);
            },
          ),
          ListTile(
            leading: const Icon(LucideIcons.download, size: 19),
            title: const Text('Export Markdown'),
            onTap: () {
              Navigator.pop(context);
              _shareResearchMarkdown(message);
            },
          ),
          ListTile(
            leading: const Icon(LucideIcons.share2, size: 19),
            title: const Text('Share report'),
            onTap: () {
              Navigator.pop(context);
              SharePlus.instance.share(
                ShareParams(text: _buildResearchReportMarkdown(message)),
              );
            },
          ),
        ],
      ),
    ),
  ),
);

Future<void> _shareResearchMarkdown(ChatMessageRecord message) async {
  final title = message.researchPlan?.title ?? 'Deep Research';
  final filename = '${_safeFilename(title)}.md';
  final directory = await getTemporaryDirectory();
  final file = io.File(p.join(directory.path, filename));
  await file.writeAsString(_buildResearchReportMarkdown(message), flush: true);
  await SharePlus.instance.share(
    ShareParams(
      files: [XFile(file.path, mimeType: 'text/markdown', name: filename)],
    ),
  );
}

String _safeFilename(String value) {
  final cleaned = value
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  return cleaned.isEmpty ? 'privora-research-report' : cleaned;
}

Future<void> _showResearchReportViewer(
  BuildContext context,
  ChatMessageRecord message,
) async {
  final colors = context.colors;
  final meta = _ResearchReportMeta.fromMessage(message);
  return showDialog<void>(
    context: context,
    builder: (context) => Dialog.fullscreen(
      backgroundColor: colors.background,
      child: SafeArea(
        child: Column(
          children: [
            Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: colors.background,
                border: Border(bottom: BorderSide(color: colors.border)),
              ),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Close report',
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(LucideIcons.x, size: 20),
                  ),
                  const SizedBox(width: 4),
                  Icon(LucideIcons.bookOpenText, size: 18, color: colors.muted),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          meta.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: colors.text,
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        Text(
                          meta.summary,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: colors.muted, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    tooltip: 'Export report',
                    onPressed: () => _showResearchExportSheet(context, message),
                    icon: const Icon(LucideIcons.download, size: 18),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Row(
                children: [
                  if (MediaQuery.sizeOf(context).width >= 720 &&
                      meta.toc.isNotEmpty)
                    Container(
                      width: 230,
                      decoration: BoxDecoration(
                        border: Border(right: BorderSide(color: colors.border)),
                      ),
                      child: ListView(
                        padding: const EdgeInsets.fromLTRB(16, 22, 12, 16),
                        children: [
                          Text(
                            'Table of contents',
                            style: TextStyle(
                              color: colors.muted,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 12),
                          for (final item in meta.toc.take(24))
                            Padding(
                              padding: EdgeInsets.only(
                                left: item.level == 3 ? 14 : 0,
                                bottom: 10,
                              ),
                              child: Text(
                                item.text,
                                style: TextStyle(
                                  color: colors.text.withValues(
                                    alpha: item.level == 1 ? 0.92 : 0.72,
                                  ),
                                  fontSize: item.level == 3 ? 12 : 13,
                                  fontWeight: item.level == 1
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  height: 1.35,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 36),
                      children: [
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 760),
                          child: MarkdownBody(
                            data: message.content,
                            selectable: true,
                            styleSheet:
                                MarkdownStyleSheet.fromTheme(
                                  Theme.of(context),
                                ).copyWith(
                                  p: TextStyle(
                                    color: colors.text,
                                    height: 1.62,
                                    fontSize: 15,
                                  ),
                                ),
                          ),
                        ),
                        if (message.researchSources.isNotEmpty) ...[
                          const SizedBox(height: 28),
                          Text(
                            'Sources',
                            style: TextStyle(
                              color: colors.text,
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 10),
                          for (
                            var index = 0;
                            index < message.researchSources.length;
                            index++
                          )
                            _ResearchSourceTile(
                              index: index + 1,
                              source: message.researchSources[index],
                            ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

class _ResearchSourceTile extends StatelessWidget {
  const _ResearchSourceTile({required this.index, required this.source});
  final int index;
  final ResearchSourceRecord source;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Text(
        '$index.',
        style: TextStyle(color: colors.muted, fontWeight: FontWeight.w700),
      ),
      title: Text(source.title ?? source.url),
      subtitle: source.title == null ? null : Text(source.url),
      onTap: () => launchUrl(Uri.parse(source.url)),
    );
  }
}

Future<void> _showResearchActivitySheet(
  BuildContext context,
  ChatMessageRecord message,
) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  builder: (context) {
    final colors = context.colors;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 22),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Research activity',
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 13),
              for (final activity in message.researchActivity)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(
                    LucideIcons.circleDot,
                    size: 16,
                    color: colors.muted,
                  ),
                  title: Text(activity.title),
                  subtitle: activity.detail == null
                      ? null
                      : Text(activity.detail!),
                ),
              if (message.researchSources.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text('Sources', style: Theme.of(context).textTheme.titleSmall),
                const SizedBox(height: 7),
                for (final source in message.researchSources)
                  ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(
                      LucideIcons.link,
                      size: 16,
                      color: colors.muted,
                    ),
                    title: Text(source.title ?? source.url),
                    subtitle: source.title == null ? null : Text(source.url),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  },
);

class _ResearchPlanEditor extends StatefulWidget {
  const _ResearchPlanEditor({required this.plan});

  final ResearchPlanRecord plan;

  @override
  State<_ResearchPlanEditor> createState() => _ResearchPlanEditorState();
}

class _ResearchPlanEditorState extends State<_ResearchPlanEditor> {
  late final TextEditingController _titleController;
  late final TextEditingController _promptController;
  late final TextEditingController _stepsController;

  @override
  void initState() {
    super.initState();
    _titleController = TextEditingController(text: widget.plan.title);
    _promptController = TextEditingController(text: widget.plan.refinedPrompt);
    _stepsController = TextEditingController(
      text: widget.plan.steps.map((step) => step.text).join('\n'),
    );
  }

  @override
  void dispose() {
    _titleController.dispose();
    _promptController.dispose();
    _stepsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.fromLTRB(
      18,
      15,
      18,
      MediaQuery.viewInsetsOf(context).bottom + 18,
    ),
    child: SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Edit plan', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 14),
          TextField(
            controller: _titleController,
            decoration: const InputDecoration(labelText: 'Title'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _promptController,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Research goal'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _stepsController,
            maxLines: 6,
            decoration: const InputDecoration(
              labelText: 'Steps',
              hintText: 'One step per line',
            ),
          ),
          const SizedBox(height: 15),
          FilledButton(
            onPressed: () {
              final steps = _stepsController.text
                  .split('\n')
                  .map((step) => step.trim())
                  .where((step) => step.isNotEmpty)
                  .map(
                    (step) => ResearchPlanStepRecord(
                      text: step,
                      status: ResearchPlanStepStatus.pending,
                    ),
                  )
                  .toList();
              if (steps.isEmpty || _titleController.text.trim().isEmpty) return;
              Navigator.pop(
                context,
                widget.plan.copyWith(
                  title: _titleController.text.trim(),
                  refinedPrompt: _promptController.text.trim(),
                  steps: steps,
                  status: ResearchPlanStatus.draft,
                  progress: 0,
                  currentActivity: 'Ready to start',
                  updatedAt: DateTime.now(),
                ),
              );
            },
            child: const Text('Save plan'),
          ),
        ],
      ),
    ),
  );
}
