part of 'privora_shell.dart';

void _showModelSheet(
  BuildContext context, {
  required String selectedModel,
  required ValueChanged<String> onSelected,
}) {
  final colors = context.colors;
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: colors.surface,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.62,
        ),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
          children: [
            for (final group in modelProviderOrder) ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 11, 12, 5),
                child: Text(
                  group.label,
                  style: TextStyle(
                    color: colors.muted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              for (final model in modelsForProvider(group.id))
                ListTile(
                  dense: true,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  leading: model.id == selectedModel
                      ? Icon(LucideIcons.check, size: 16, color: colors.text)
                      : const SizedBox(width: 16),
                  title: Text(model.label),
                  onTap: () {
                    onSelected(model.id);
                    Navigator.pop(sheetContext);
                  },
                ),
            ],
          ],
        ),
      ),
    ),
  );
}

void _showImageModelSheet(
  BuildContext context, {
  required String selectedModel,
  required ValueChanged<String> onSelected,
}) {
  final colors = context.colors;
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: colors.surface,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: ListView(
        shrinkWrap: true,
        padding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
        children: [
          for (final model in imageModelOptions)
            ListTile(
              dense: true,
              leading: model.id == selectedModel
                  ? Icon(LucideIcons.check, size: 16, color: colors.text)
                  : const SizedBox(width: 16),
              title: Text(model.label),
              onTap: () {
                onSelected(model.id);
                Navigator.pop(sheetContext);
              },
            ),
        ],
      ),
    ),
  );
}

Future<String?> _showRenameChatDialog(
  BuildContext context,
  String currentTitle,
) {
  return showDialog<String>(
    context: context,
    builder: (context) => _TextEntryDialog(
      title: 'Rename chat',
      initialValue: currentTitle,
      hintText: 'Chat title',
      submitLabel: 'Rename',
      minLines: 1,
      maxLines: 1,
    ),
  );
}

class _TextEntryDialog extends StatefulWidget {
  const _TextEntryDialog({
    required this.title,
    required this.initialValue,
    required this.hintText,
    required this.submitLabel,
    required this.minLines,
    required this.maxLines,
  });

  final String title;
  final String initialValue;
  final String hintText;
  final String submitLabel;
  final int minLines;
  final int maxLines;

  @override
  State<_TextEntryDialog> createState() => _TextEntryDialogState();
}

class _TextEntryDialogState extends State<_TextEntryDialog> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialValue,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: context.colors.surface,
      title: Text(widget.title),
      content: TextField(
        controller: _controller,
        autofocus: true,
        minLines: widget.minLines,
        maxLines: widget.maxLines,
        decoration: InputDecoration(hintText: widget.hintText),
        onSubmitted: widget.maxLines == 1
            ? (value) => Navigator.pop(context, value)
            : null,
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () => Navigator.pop(context, _controller.text),
          child: Text(widget.submitLabel),
        ),
      ],
    );
  }
}

void _showStyleSheet(BuildContext context, WidgetRef ref) {
  final colors = context.colors;
  final current = ref
      .read(appControllerProvider)
      .requireValue
      .settings
      .selectedStyle;
  final app = ref.read(appControllerProvider.notifier);
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: colors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.72,
        ),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: [
            for (final style in responseStyleOptions)
              ListTile(
                leading: Icon(
                  style.id == current ? LucideIcons.check : LucideIcons.feather,
                  color: colors.muted,
                ),
                title: Text(
                  style.label,
                  style: TextStyle(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: Text(style.description),
                onTap: () {
                  app.selectStyle(style.id);
                  Navigator.pop(context);
                },
              ),
          ],
        ),
      ),
    ),
  );
}

void _showImageOptionsSheet(BuildContext context, WidgetRef ref) {
  final colors = context.colors;
  final app = ref.read(appControllerProvider.notifier);
  const sizes = [
    ('square', '1:1', '1024'),
    ('square_2k', '1:1 2K', '2048'),
    ('landscape', '3:2', '1536x1024'),
    ('widescreen', '16:9', '2048x1152'),
    ('widescreen_4k', '16:9 4K', '3840x2160'),
    ('portrait', '2:3', '1024x1536'),
    ('story_4k', '9:16', '2160x3840'),
    ('auto', 'Auto', 'Best fit'),
  ];
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: colors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => StatefulBuilder(
      builder: (context, setSheetState) {
        var active = ref
            .read(appControllerProvider)
            .requireValue
            .settings
            .imageSettings;
        final isCliproxy = active.model == 'gpt-image-2';
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.72,
            ),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
              children: [
                Text(
                  'Image options',
                  style: TextStyle(
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'Size',
                  style: TextStyle(color: colors.muted, fontSize: 12),
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final size in sizes)
                      ChoiceChip(
                        selected: active.sizePreset == size.$1,
                        label: Text('${size.$2}  ${size.$3}'),
                        onSelected: (_) {
                          app.updateImageSettings(
                            active.copyWith(sizePreset: size.$1),
                          );
                          setSheetState(() {});
                        },
                      ),
                  ],
                ),
                if (isCliproxy) ...[
                  const SizedBox(height: 16),
                  Text(
                    'Quality',
                    style: TextStyle(color: colors.muted, fontSize: 12),
                  ),
                  const SizedBox(height: 6),
                  SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(value: 'low', label: Text('Low')),
                      ButtonSegment(value: 'medium', label: Text('Medium')),
                      ButtonSegment(value: 'high', label: Text('High')),
                    ],
                    selected: {active.quality},
                    onSelectionChanged: (choice) {
                      app.updateImageSettings(
                        active.copyWith(quality: choice.first),
                      );
                      setSheetState(() {});
                    },
                  ),
                ],
                const SizedBox(height: 16),
                Text(
                  'Count',
                  style: TextStyle(color: colors.muted, fontSize: 12),
                ),
                const SizedBox(height: 6),
                SegmentedButton<int>(
                  segments: const [
                    ButtonSegment(value: 1, label: Text('1')),
                    ButtonSegment(value: 2, label: Text('2')),
                    ButtonSegment(value: 3, label: Text('3')),
                    ButtonSegment(value: 4, label: Text('4')),
                  ],
                  selected: {effectiveImageCount(active)},
                  onSelectionChanged: (choice) {
                    app.updateImageSettings(
                      active.copyWith(count: choice.first),
                    );
                    setSheetState(() {});
                  },
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

void _showDebateOptionsSheet(BuildContext context, WidgetRef ref) {
  final colors = context.colors;
  final app = ref.read(appControllerProvider.notifier);
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: colors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
    ),
    builder: (sheetContext) => SafeArea(
      child: Consumer(
        builder: (context, ref, _) {
          final state = ref.watch(appControllerProvider).requireValue;
          final settings = state.settings.debateSettings;
          return ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.72,
            ),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 20),
              children: [
                Text(
                  'Debate models',
                  style: TextStyle(
                    color: colors.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Each role can use the current chat model or an override.',
                  style: TextStyle(color: colors.muted, fontSize: 12),
                ),
                const SizedBox(height: 14),
                _DebateModelField(
                  label: 'Agent A',
                  value: settings.agentAModel,
                  currentModel: state.settings.selectedModel,
                  onChanged: (value) => app.updateDebateSettings(
                    settings.copyWith(agentAModel: value),
                  ),
                ),
                const SizedBox(height: 12),
                _DebateModelField(
                  label: 'Agent B',
                  value: settings.agentBModel,
                  currentModel: state.settings.selectedModel,
                  onChanged: (value) => app.updateDebateSettings(
                    settings.copyWith(agentBModel: value),
                  ),
                ),
                const SizedBox(height: 12),
                _DebateModelField(
                  label: 'Judge',
                  value: settings.judgeModel,
                  currentModel: state.settings.selectedModel,
                  onChanged: (value) => app.updateDebateSettings(
                    settings.copyWith(judgeModel: value),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    ),
  );
}

class _DebateModelField extends StatelessWidget {
  const _DebateModelField({
    required this.label,
    required this.value,
    required this.currentModel,
    required this.onChanged,
  });

  final String label;
  final String? value;
  final String currentModel;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final shown = value == null
        ? 'Current (${modelOptionFor(currentModel).label})'
        : modelOptionFor(value!).label;
    return ListTile(
      dense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 10),
      shape: RoundedRectangleBorder(
        side: BorderSide(color: colors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      title: Text(label, style: TextStyle(color: colors.muted, fontSize: 11)),
      subtitle: Text(
        shown,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(color: colors.text, fontWeight: FontWeight.w600),
      ),
      trailing: const Icon(LucideIcons.chevronRight, size: 16),
      onTap: () => _showDebateRoleModelSheet(
        context,
        label: label,
        selectedModel: value,
        currentModel: currentModel,
        onSelected: onChanged,
      ),
    );
  }
}

void _showDebateRoleModelSheet(
  BuildContext context, {
  required String label,
  required String? selectedModel,
  required String currentModel,
  required ValueChanged<String?> onSelected,
}) {
  final colors = context.colors;
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: colors.surface,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(sheetContext).height * 0.62,
        ),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(8, 0, 8, 10),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
              child: Text(
                label,
                style: TextStyle(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            ListTile(
              dense: true,
              leading: selectedModel == null
                  ? Icon(LucideIcons.check, size: 16, color: colors.text)
                  : const SizedBox(width: 16),
              title: Text('Current (${modelOptionFor(currentModel).label})'),
              onTap: () {
                onSelected(null);
                Navigator.pop(sheetContext);
              },
            ),
            for (final model in modelOptions)
              ListTile(
                dense: true,
                leading: selectedModel == model.id
                    ? Icon(LucideIcons.check, size: 16, color: colors.text)
                    : const SizedBox(width: 16),
                title: Text(model.label),
                onTap: () {
                  onSelected(model.id);
                  Navigator.pop(sheetContext);
                },
              ),
          ],
        ),
      ),
    ),
  );
}
