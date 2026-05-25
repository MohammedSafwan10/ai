part of 'privora_shell.dart';

class _ClashCard extends StatefulWidget {
  const _ClashCard({required this.clash, required this.onRetry});

  final ClashRecord clash;
  final VoidCallback onRetry;

  @override
  State<_ClashCard> createState() => _ClashCardState();
}

class _ClashCardState extends State<_ClashCard> {
  String _selectedAgent = 'a';

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final clash = widget.clash;
    final selectedAgent =
        clash.agents.where((agent) => agent.id == _selectedAgent).firstOrNull ??
        clash.agents.firstOrNull;
    final fullText = _clashFullText(clash);
    final resultText = _clashResultText(clash);
    return Container(
      key: const Key('clash-card'),
      constraints: const BoxConstraints(maxWidth: 760),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.fromLTRB(2, 8, 2, 10),
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: colors.border.withValues(alpha: 0.65)),
          bottom: BorderSide(color: colors.border.withValues(alpha: 0.45)),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _ClashGlyph(color: colors.text.withValues(alpha: 0.82)),
              const SizedBox(width: 8),
              Text(
                'Clash',
                style: TextStyle(
                  color: colors.text,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const Spacer(),
              Text(
                _clashStatusLabel(clash),
                style: TextStyle(color: colors.muted, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _ClashAgentTabs(
            agents: clash.agents,
            selected: selectedAgent?.id ?? _selectedAgent,
            onSelected: (agentId) => setState(() => _selectedAgent = agentId),
          ),
          const SizedBox(height: 10),
          if (selectedAgent != null)
            _ClashAgentPane(
              clash: clash,
              agent: selectedAgent,
              turns: clash.turns
                  .where((turn) => turn.speaker == selectedAgent.id)
                  .toList(),
            ),
          if (clash.status == ClashStatus.converged &&
              clash.conclusion?.isNotEmpty == true)
            _ClashConclusionBand(conclusion: clash.conclusion!),
          if (clash.status == ClashStatus.capped)
            _ClashNoAgreementBand(clash: clash),
          if (clash.status == ClashStatus.error && clash.error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                clash.error!,
                style: TextStyle(color: colors.muted, fontSize: 12),
              ),
            ),
          if (clash.status != ClashStatus.streaming) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                _MessageAction(
                  tooltip: 'Copy result',
                  icon: LucideIcons.copy,
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: resultText)),
                ),
                _MessageAction(
                  tooltip: 'Copy full clash',
                  icon: LucideIcons.copyPlus,
                  onPressed: () =>
                      Clipboard.setData(ClipboardData(text: fullText)),
                ),
                _MessageAction(
                  tooltip: 'Retry clash',
                  icon: LucideIcons.refreshCw,
                  onPressed: widget.onRetry,
                ),
                _MessageAction(
                  tooltip: 'Share result',
                  icon: LucideIcons.share2,
                  onPressed: () =>
                      SharePlus.instance.share(ShareParams(text: resultText)),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _ClashGlyph extends StatelessWidget {
  const _ClashGlyph({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: const Size.square(18),
      painter: _ClashGlyphPainter(color),
    );
  }
}

class _ClashGlyphPainter extends CustomPainter {
  const _ClashGlyphPainter(this.color);

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    Offset point(double x, double y) =>
        Offset(size.width * x / 24, size.height * y / 24);
    final sideStroke = Paint()
      ..color = color
      ..strokeWidth = size.shortestSide * 2.25 / 24
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final boltStroke = Paint()
      ..color = color
      ..strokeWidth = size.shortestSide * 2.1 / 24
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final left = Path()
      ..moveTo(point(7.2, 7.2).dx, point(7.2, 7.2).dy)
      ..lineTo(point(3.8, 12).dx, point(3.8, 12).dy)
      ..lineTo(point(7.2, 16.8).dx, point(7.2, 16.8).dy);
    final right = Path()
      ..moveTo(point(16.8, 7.2).dx, point(16.8, 7.2).dy)
      ..lineTo(point(20.2, 12).dx, point(20.2, 12).dy)
      ..lineTo(point(16.8, 16.8).dx, point(16.8, 16.8).dy);
    final bolt = Path()
      ..moveTo(point(12.9, 4.8).dx, point(12.9, 4.8).dy)
      ..lineTo(point(10.7, 10.8).dx, point(10.7, 10.8).dy)
      ..lineTo(point(13.8, 10.8).dx, point(13.8, 10.8).dy)
      ..lineTo(point(11.1, 19.2).dx, point(11.1, 19.2).dy);
    canvas
      ..drawPath(left, sideStroke)
      ..drawPath(right, sideStroke)
      ..drawPath(bolt, boltStroke);
  }

  @override
  bool shouldRepaint(covariant _ClashGlyphPainter oldDelegate) =>
      oldDelegate.color != color;
}

class _ClashAgentTabs extends StatelessWidget {
  const _ClashAgentTabs({
    required this.agents,
    required this.selected,
    required this.onSelected,
  });

  final List<ClashAgentRecord> agents;
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: Row(
        children: [
          for (final agent in agents)
            Expanded(
              child: InkWell(
                key: Key('clash-agent-${agent.id}-tab'),
                onTap: () => onSelected(agent.id),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 160),
                  padding: const EdgeInsets.fromLTRB(8, 8, 8, 9),
                  decoration: BoxDecoration(
                    color: selected == agent.id
                        ? colors.text.withValues(alpha: 0.055)
                        : Colors.transparent,
                    border: Border(
                      bottom: BorderSide(
                        width: 2,
                        color: selected == agent.id
                            ? colors.text
                            : Colors.transparent,
                      ),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (agent.status == ClashAgentStatus.streaming) ...[
                        _ClashPulseDot(color: colors.text),
                        const SizedBox(width: 7),
                      ],
                      Flexible(
                        child: Text(
                          agent.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: colors.text,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ClashAgentPane extends StatelessWidget {
  const _ClashAgentPane({
    required this.clash,
    required this.agent,
    required this.turns,
  });

  final ClashRecord clash;
  final ClashAgentRecord agent;
  final List<ClashTurnRecord> turns;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            if (agent.status == ClashAgentStatus.streaming)
              _ClashPulseDot(color: colors.text)
            else
              Icon(
                LucideIcons.circle,
                size: 8,
                color: colors.muted.withValues(alpha: 0.8),
              ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                agent.label,
                style: TextStyle(
                  color: colors.text,
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Text(
              _clashAgentStatusLabel(agent.status),
              style: TextStyle(color: colors.muted, fontSize: 11),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Padding(
          padding: const EdgeInsets.only(left: 16),
          child: Text(
            modelOptionFor(agent.model).label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: colors.muted, fontSize: 11),
          ),
        ),
        const SizedBox(height: 10),
        if (turns.isEmpty)
          _ClashEmptyAgent(status: agent.status)
        else
          for (final turn in turns)
            _ClashTurnBlock(
              turn: turn,
              active: turn.status == ClashAgentStatus.streaming,
            ),
        if (agent.error != null)
          Padding(
            padding: const EdgeInsets.only(top: 8, left: 16),
            child: Text(
              agent.error!,
              style: TextStyle(color: colors.muted, fontSize: 12),
            ),
          ),
      ],
    );
  }
}

class _ClashEmptyAgent extends StatelessWidget {
  const _ClashEmptyAgent({required this.status});

  final ClashAgentStatus status;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final waiting = status == ClashAgentStatus.queued;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      decoration: BoxDecoration(
        border: Border.all(color: colors.border.withValues(alpha: 0.75)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        waiting ? 'Waiting for opponent turn' : 'No turn yet',
        style: TextStyle(color: colors.muted, fontSize: 12),
      ),
    );
  }
}

class _ClashTurnBlock extends StatelessWidget {
  const _ClashTurnBlock({required this.turn, required this.active});

  final ClashTurnRecord turn;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final textStyle = TextStyle(color: colors.text, height: 1.55, fontSize: 14);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(11, 9, 11, 10),
      decoration: BoxDecoration(
        color: active
            ? colors.text.withValues(alpha: 0.035)
            : Colors.transparent,
        border: Border(
          left: BorderSide(
            color: active ? colors.text : colors.border,
            width: active ? 2 : 1,
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                'ROUND ${turn.round}',
                style: TextStyle(
                  color: colors.muted,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
              const Spacer(),
              Text(
                _clashActionLabel(turn.action),
                style: TextStyle(
                  color: colors.muted,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          if (turn.content.isEmpty && active)
            _ClashThinkingLine(startedAt: turn.startedAt)
          else if (turn.content.isNotEmpty)
            MarkdownBody(
              data: turn.content,
              selectable: true,
              styleSheet: MarkdownStyleSheet.fromTheme(
                Theme.of(context),
              ).copyWith(p: textStyle),
            ),
          if (turn.thought?.isNotEmpty == true) ...[
            const SizedBox(height: 8),
            Text(
              'Thought process',
              style: TextStyle(
                color: colors.muted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            MarkdownBody(
              data: turn.thought!,
              selectable: true,
              styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context))
                  .copyWith(
                    p: TextStyle(
                      color: colors.muted,
                      height: 1.45,
                      fontSize: 12,
                    ),
                  ),
            ),
          ],
          if (turn.error != null) ...[
            const SizedBox(height: 6),
            Text(
              turn.error!,
              style: TextStyle(color: colors.muted, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }
}

class _ClashThinkingLine extends StatelessWidget {
  const _ClashThinkingLine({required this.startedAt});

  final DateTime startedAt;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return StreamBuilder<int>(
      stream: Stream.periodic(const Duration(seconds: 1), (tick) => tick),
      builder: (context, _) {
        final seconds = DateTime.now().difference(startedAt).inSeconds;
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _PrivoraTypingIndicator(
              size: 15,
              animate: true,
              color: colors.text.withValues(alpha: 0.6),
            ),
            const SizedBox(width: 7),
            Text(
              seconds <= 1 ? 'Thinking' : 'Thinking ${seconds}s',
              style: TextStyle(color: colors.muted, fontSize: 12),
            ),
          ],
        );
      },
    );
  }
}

class _ClashPulseDot extends StatefulWidget {
  const _ClashPulseDot({required this.color});

  final Color color;

  @override
  State<_ClashPulseDot> createState() => _ClashPulseDotState();
}

class _ClashPulseDotState extends State<_ClashPulseDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(_controller),
      child: Container(
        width: 7,
        height: 7,
        decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
      ),
    );
  }
}

class _ClashConclusionBand extends StatelessWidget {
  const _ClashConclusionBand({required this.conclusion});

  final String conclusion;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 12),
      decoration: BoxDecoration(
        color: colors.userBubble.withValues(alpha: 0.5),
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Mutual conclusion',
            style: TextStyle(
              color: colors.text,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          MarkdownBody(
            data: conclusion,
            selectable: true,
            styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context))
                .copyWith(
                  p: TextStyle(color: colors.text, height: 1.5, fontSize: 14),
                ),
          ),
        ],
      ),
    );
  }
}

class _ClashNoAgreementBand extends StatelessWidget {
  const _ClashNoAgreementBand({required this.clash});

  final ClashRecord clash;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final agentA = _lastTurnFor(clash, 'a');
    final agentB = _lastTurnFor(clash, 'b');
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.fromLTRB(12, 11, 12, 12),
      decoration: BoxDecoration(
        border: Border.all(color: colors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'No full agreement',
            style: TextStyle(
              color: colors.text,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          if (agentA != null)
            _ClashFinalPosition(label: 'Agent A', turn: agentA),
          if (agentB != null)
            _ClashFinalPosition(label: 'Agent B', turn: agentB),
        ],
      ),
    );
  }
}

class _ClashFinalPosition extends StatelessWidget {
  const _ClashFinalPosition({required this.label, required this.turn});

  final String label;
  final ClashTurnRecord turn;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: colors.muted,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          MarkdownBody(
            data: turn.content,
            selectable: true,
            styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context))
                .copyWith(
                  p: TextStyle(color: colors.text, height: 1.45, fontSize: 13),
                ),
          ),
        ],
      ),
    );
  }
}

String _clashStatusLabel(ClashRecord clash) => switch (clash.status) {
  ClashStatus.streaming =>
    'round ${clash.turns.lastOrNull?.round ?? 1}/${clash.maxRounds}',
  ClashStatus.converged => 'converged',
  ClashStatus.capped => 'cap reached',
  ClashStatus.stopped => 'stopped',
  ClashStatus.error => 'failed',
};

String _clashAgentStatusLabel(ClashAgentStatus status) => switch (status) {
  ClashAgentStatus.queued => 'queued',
  ClashAgentStatus.streaming => 'streaming',
  ClashAgentStatus.done => 'done',
  ClashAgentStatus.error => 'failed',
  ClashAgentStatus.stopped => 'stopped',
};

String _clashActionLabel(ClashTurnAction action) => switch (action) {
  ClashTurnAction.opening => 'OPENING',
  ClashTurnAction.challenge => 'CHALLENGE',
  ClashTurnAction.refine => 'REFINE',
  ClashTurnAction.accept => 'ACCEPT',
};

ClashTurnRecord? _lastTurnFor(ClashRecord clash, String speaker) {
  final turns = clash.turns.where((turn) => turn.speaker == speaker).toList();
  return turns.isEmpty ? null : turns.last;
}

String _clashFullText(ClashRecord clash) => [
  'Prompt:\n${clash.prompt}',
  for (final turn in clash.turns)
    '${turn.speaker == 'a' ? 'Agent A' : 'Agent B'} round ${turn.round} ${turn.action.name}:\n${turn.content}',
  if (clash.conclusion?.isNotEmpty == true)
    'Shared conclusion:\n${clash.conclusion}',
].join('\n\n');

String _clashResultText(ClashRecord clash) {
  if (clash.conclusion?.isNotEmpty == true) return clash.conclusion!;
  final agentA = _lastTurnFor(clash, 'a')?.content ?? '';
  final agentB = _lastTurnFor(clash, 'b')?.content ?? '';
  if (clash.status == ClashStatus.capped) {
    return [
      'No full agreement.',
      if (agentA.isNotEmpty) 'Agent A:\n$agentA',
      if (agentB.isNotEmpty) 'Agent B:\n$agentB',
    ].join('\n\n');
  }
  return _clashFullText(clash);
}
