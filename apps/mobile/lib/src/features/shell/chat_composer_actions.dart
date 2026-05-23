part of 'privora_shell.dart';

void _showAddSheet(
  BuildContext context,
  WidgetRef ref, {
  required VoidCallback onPickFiles,
  required VoidCallback onPickImage,
  required VoidCallback onOpenCodePlayground,
}) {
  final colors = context.colors;
  final app = ref.read(appControllerProvider.notifier);
  final settings = ref.read(appControllerProvider).requireValue.settings;
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
          children: [
            _SheetAction(
              icon: LucideIcons.imagePlus,
              label:
                  'Image model: ${imageModelOptions.firstWhere((option) => option.id == settings.imageSettings.model, orElse: () => imageModelOptions.first).label}',
              onTap: () {
                Navigator.pop(context);
                WidgetsBinding.instance.addPostFrameCallback(
                  (_) => _showImageModelSheet(
                    context,
                    selectedModel: settings.imageSettings.model,
                    onSelected: (model) => app.updateImageSettings(
                      settings.imageSettings.copyWith(model: model),
                    ),
                  ),
                );
              },
            ),
            _SheetAction(
              icon: LucideIcons.paperclip,
              label: 'Add files',
              onTap: () {
                Navigator.pop(context);
                onPickFiles();
              },
            ),
            _SheetAction(
              icon: LucideIcons.image,
              label: 'Add photo',
              onTap: () {
                Navigator.pop(context);
                onPickImage();
              },
            ),
            _SheetAction(
              icon: LucideIcons.imagePlus,
              label: settings.composerMode == ComposerMode.image
                  ? 'Back to chat'
                  : 'Create image',
              onTap: () {
                app.setComposerMode(
                  settings.composerMode == ComposerMode.image
                      ? ComposerMode.chat
                      : ComposerMode.image,
                );
                Navigator.pop(context);
              },
            ),
            _SheetAction(
              icon: LucideIcons.feather,
              label:
                  'Use style: ${responseStyleFor(settings.selectedStyle).label}',
              onTap: () {
                Navigator.pop(context);
                WidgetsBinding.instance.addPostFrameCallback(
                  (_) => _showStyleSheet(context, ref),
                );
              },
            ),
            _SheetAction(
              icon: LucideIcons.globe,
              label: settings.isWebSearchEnabled
                  ? 'Disable web search'
                  : 'Web search',
              onTap: () {
                app.toggleWebSearch();
                Navigator.pop(context);
              },
            ),
            _SheetAction(
              icon: LucideIcons.microscope,
              label: settings.isDeepResearchEnabled
                  ? 'Disable deep research'
                  : 'Deep Research',
              onTap: () {
                app.toggleDeepResearch();
                Navigator.pop(context);
              },
            ),
            _SheetAction(
              icon: LucideIcons.gitCompare,
              label: settings.isDebateModeEnabled
                  ? 'Disable debate'
                  : 'Debate mode',
              onTap: () {
                app.toggleDebate();
                Navigator.pop(context);
                if (!settings.isDebateModeEnabled) {
                  WidgetsBinding.instance.addPostFrameCallback(
                    (_) => _showDebateOptionsSheet(context, ref),
                  );
                }
              },
            ),
            _SheetAction(
              icon: LucideIcons.code2,
              label: 'Code Playground',
              onTap: () {
                Navigator.pop(context);
                onOpenCodePlayground();
              },
            ),
            _SheetAction(
              icon: LucideIcons.plug,
              label: 'Connections',
              onTap: () {
                Navigator.pop(context);
                WidgetsBinding.instance.addPostFrameCallback(
                  (_) => _showConnectionsSheet(context, ref),
                );
              },
            ),
          ],
        ),
      ),
    ),
  );
}

Future<void> _showConnectionsSheet(BuildContext context, WidgetRef ref) async {
  final colors = context.colors;
  final credentials = ref.read(secureCredentialRepositoryProvider);
  final storedEndpoint = await credentials.read(ApiCredential.cliproxyEndpoint);
  if (!context.mounted) return;
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: colors.surface,
    showDragHandle: true,
    builder: (sheetContext) => _ConnectionsForm(
      initialEndpoint: storedEndpoint ?? '',
      onSave: (value) =>
          credentials.save(ApiCredential.cliproxyEndpoint, value),
    ),
  );
}

class _ConnectionsForm extends StatefulWidget {
  const _ConnectionsForm({required this.initialEndpoint, required this.onSave});

  final String initialEndpoint;
  final Future<void> Function(String value) onSave;

  @override
  State<_ConnectionsForm> createState() => _ConnectionsFormState();
}

class _ConnectionsFormState extends State<_ConnectionsForm> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialEndpoint,
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Connections',
              style: TextStyle(
                color: colors.text,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _controller,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(
                labelText: 'CLIProxy endpoint',
                hintText: 'http://127.0.0.1:8317',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Only GPT/CLIProxy uses this. For a real USB Android phone, run adb reverse tcp:8317 tcp:8317 and use http://127.0.0.1:8317. Gemini and OpenRouter run directly from mobile keys.',
              style: TextStyle(color: colors.muted, fontSize: 12),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: () async {
                  await widget.onSave(_controller.text);
                  if (context.mounted) Navigator.pop(context);
                },
                child: const Text('Save'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SheetAction extends StatelessWidget {
  const _SheetAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return ListTile(
      leading: Icon(icon, color: colors.muted),
      title: Text(
        label,
        style: TextStyle(color: colors.text, fontWeight: FontWeight.w600),
      ),
      onTap: onTap,
    );
  }
}
