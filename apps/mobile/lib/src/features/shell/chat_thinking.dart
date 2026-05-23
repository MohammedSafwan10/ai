part of 'privora_shell.dart';

class _ThoughtPanel extends StatefulWidget {
  const _ThoughtPanel({required this.message});
  final ChatMessageRecord message;

  @override
  State<_ThoughtPanel> createState() => _ThoughtPanelState();
}

class _ThoughtPanelState extends State<_ThoughtPanel> {
  late bool _expanded =
      widget.message.isThinking == true &&
      widget.message.thought?.isNotEmpty == true;

  @override
  void didUpdateWidget(covariant _ThoughtPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    final hasNewThought =
        widget.message.thought?.isNotEmpty == true &&
        oldWidget.message.thought?.isNotEmpty != true;
    if (widget.message.isThinking == true && hasNewThought) {
      _expanded = true;
    }
    if (oldWidget.message.isThinking == true &&
        widget.message.isThinking != true &&
        widget.message.content.isNotEmpty) {
      _expanded = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final thought = widget.message.thought;
    final hasThought = thought?.isNotEmpty == true;
    final isThinking = widget.message.isThinking == true;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: hasThought
                ? () => setState(() => _expanded = !_expanded)
                : null,
            borderRadius: BorderRadius.circular(6),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _PrivoraTypingIndicator(
                    key: const Key('thinking-indicator'),
                    size: hasThought ? 22 : 20,
                    animate: isThinking,
                    color: colors.text.withValues(
                      alpha: hasThought ? 0.88 : 0.52,
                    ),
                  ),
                  if (hasThought) ...[
                    const SizedBox(width: 8),
                    _ThinkingLabel(active: isThinking),
                    const SizedBox(width: 4),
                    AnimatedRotation(
                      turns: _expanded ? 0 : -0.25,
                      duration: const Duration(milliseconds: 250),
                      child: Icon(
                        LucideIcons.chevronDown,
                        size: 14,
                        color: colors.muted,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 240),
            alignment: Alignment.topLeft,
            child: _expanded && hasThought
                ? Container(
                    margin: const EdgeInsets.only(top: 6),
                    constraints: const BoxConstraints(maxWidth: 720),
                    padding: const EdgeInsets.fromLTRB(15, 12, 14, 12),
                    decoration: BoxDecoration(
                      color: colors.surface.withValues(alpha: 0.42),
                      border: Border(
                        left: BorderSide(
                          color: colors.muted.withValues(alpha: 0.26),
                          width: 2,
                        ),
                      ),
                      borderRadius: const BorderRadius.horizontal(
                        right: Radius.circular(18),
                      ),
                    ),
                    child: MarkdownBody(
                      data: thought!,
                      selectable: true,
                      styleSheet:
                          MarkdownStyleSheet.fromTheme(
                            Theme.of(context),
                          ).copyWith(
                            p: TextStyle(
                              color: Color.lerp(
                                colors.muted,
                                colors.text,
                                0.14,
                              ),
                              fontSize: 14,
                              fontStyle: FontStyle.italic,
                              height: 1.62,
                            ),
                          ),
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

class _ThinkingLabel extends StatefulWidget {
  const _ThinkingLabel({required this.active});
  final bool active;

  @override
  State<_ThinkingLabel> createState() => _ThinkingLabelState();
}

class _ThinkingLabelState extends State<_ThinkingLabel>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2500),
  );

  @override
  void initState() {
    super.initState();
    if (widget.active) _controller.repeat();
  }

  @override
  void didUpdateWidget(covariant _ThinkingLabel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.active && !oldWidget.active) {
      _controller.repeat();
    } else if (!widget.active && oldWidget.active) {
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
    final text = widget.active ? 'Thinking' : 'Thought process';
    if (!widget.active) {
      return Text(
        text,
        style: TextStyle(
          color: colors.muted,
          fontSize: 14,
          fontWeight: FontWeight.w500,
        ),
      );
    }
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) => ShaderMask(
        blendMode: BlendMode.srcIn,
        shaderCallback: (bounds) => LinearGradient(
          begin: Alignment(-2.0 + (_controller.value * 4), 0),
          end: Alignment(-1.0 + (_controller.value * 4), 0),
          colors: [colors.muted, colors.text, colors.muted],
        ).createShader(bounds),
        child: child,
      ),
      child: const Text(
        'Thinking',
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    );
  }
}
