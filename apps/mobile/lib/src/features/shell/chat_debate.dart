part of 'privora_shell.dart';

class _DebateCard extends StatelessWidget {
  const _DebateCard({required this.debate, required this.onRetry});

  final DebateRecord debate;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final debaters = debate.agents
        .where((agent) => agent.id != 'judge')
        .toList();
    final judge = debate.agents
        .where((agent) => agent.id == 'judge')
        .firstOrNull;
    final fullText = [
      'Prompt:\n${debate.prompt}',
      for (final agent in debate.agents) '${agent.label}:\n${agent.content}',
    ].join('\n\n');
    final verdict = judge?.content.isNotEmpty == true
        ? judge!.content
        : fullText;
    return Container(
      constraints: const BoxConstraints(maxWidth: 720),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 10),
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
              Icon(LucideIcons.gitCompare, size: 16, color: colors.muted),
              const SizedBox(width: 7),
              Text(
                'Debate',
                style: TextStyle(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Text(
                _debateStatusLabel(debate.status),
                style: TextStyle(color: colors.muted, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 10),
          LayoutBuilder(
            builder: (context, constraints) {
              final twoColumns = constraints.maxWidth >= 560;
              final width = twoColumns
                  ? (constraints.maxWidth - 10) / 2
                  : constraints.maxWidth;
              return Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final agent in debaters)
                    SizedBox(
                      width: width,
                      child: _DebateAgentSection(agent: agent, compact: true),
                    ),
                ],
              );
            },
          ),
          if (judge != null) ...[
            const SizedBox(height: 10),
            _DebateAgentSection(agent: judge, compact: false),
          ],
          if (debate.status != DebateAgentStatus.streaming) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                _MessageAction(
                  tooltip: 'Copy verdict',
                  icon: LucideIcons.copy,
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: verdict)),
                ),
                _MessageAction(
                  tooltip: 'Copy full debate',
                  icon: LucideIcons.copyPlus,
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: fullText)),
                ),
                _MessageAction(
                  tooltip: 'Retry debate',
                  icon: LucideIcons.refreshCw,
                  onPressed: onRetry,
                ),
                _MessageAction(
                  tooltip: 'Share verdict',
                  icon: LucideIcons.share2,
                  onPressed: () =>
                      SharePlus.instance.share(ShareParams(text: verdict)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _DebateAgentSection extends StatelessWidget {
  const _DebateAgentSection({required this.agent, required this.compact});

  final DebateAgentRecord agent;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final running =
        agent.status == DebateAgentStatus.streaming ||
        agent.status == DebateAgentStatus.queued;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: compact ? colors.background : colors.userBubble,
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(11, 10, 11, 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  compact ? LucideIcons.messagesSquare : LucideIcons.scale,
                  size: 15,
                  color: colors.muted,
                ),
                const SizedBox(width: 7),
                Expanded(
                  child: Text(
                    agent.label,
                    style: TextStyle(
                      color: colors.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 7,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: running
                        ? colors.text.withValues(alpha: 0.08)
                        : colors.surface,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _debateStatusLabel(agent.status),
                    style: TextStyle(color: colors.muted, fontSize: 10.5),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              modelOptionFor(agent.model).label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: colors.muted, fontSize: 11),
            ),
            const SizedBox(height: 8),
            if (agent.content.isEmpty && running)
              _PrivoraTypingIndicator(
                size: 18,
                animate: running,
                color: colors.text.withValues(alpha: 0.6),
              )
            else if (agent.content.isNotEmpty)
              MarkdownBody(
                data: agent.content,
                selectable: true,
                styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context))
                    .copyWith(
                      p: TextStyle(
                        color: colors.text,
                        height: compact ? 1.45 : 1.55,
                        fontSize: compact ? 13 : 14,
                      ),
                    ),
              ),
            if (agent.error != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(
                  agent.error!,
                  style: TextStyle(color: colors.muted, fontSize: 12),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

String _debateStatusLabel(DebateAgentStatus status) => switch (status) {
  DebateAgentStatus.queued => 'Queued',
  DebateAgentStatus.streaming => 'Running',
  DebateAgentStatus.done => 'Complete',
  DebateAgentStatus.error => 'Failed',
  DebateAgentStatus.stopped => 'Stopped',
};
