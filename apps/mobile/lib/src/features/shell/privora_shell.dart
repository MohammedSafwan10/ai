import 'dart:async';
import 'dart:convert';
import 'dart:io' as io;
import 'dart:math' as math;

import 'package:file_selector/file_selector.dart';
import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/theme/privora_theme.dart';
import '../../data/secure/secure_credential_repository.dart';
import '../chat/data/attachment_rules.dart';
import '../chat/data/image_generation_client.dart';
import '../../models/privora_models.dart';
import '../../state/app_state.dart';

part 'chat_viewport.dart';
part 'chat_image_generation.dart';
part 'chat_artifacts.dart';
part 'chat_research.dart';
part 'chat_debate.dart';
part 'chat_clash.dart';
part 'chat_thinking.dart';
part 'chat_composer.dart';
part 'chat_composer_sheets.dart';
part 'chat_composer_search.dart';
part 'chat_composer_actions.dart';
part 'shell_sidebar.dart';
part 'shell_workspaces.dart';

class PrivoraShell extends ConsumerStatefulWidget {
  const PrivoraShell({required this.mode, this.id, super.key});
  final WorkspaceMode mode;
  final String? id;

  @override
  ConsumerState<PrivoraShell> createState() => _PrivoraShellState();
}

class _PrivoraShellState extends ConsumerState<PrivoraShell> {
  final _messageController = TextEditingController();
  final _messageFocusNode = FocusNode();
  final _imagePicker = ImagePicker();
  final List<AttachmentRecord> _attachments = [];
  bool _drawerOpen = false;
  bool _searchOpen = false;
  String? _openArtifactId;
  _CodePlaygroundDraft? _playgroundDraft;
  String? _lastAppliedRouteKey;
  DateTime? _lastBackPressedAt;

  @override
  void initState() {
    super.initState();
    Future.microtask(
      () => ref.read(appControllerProvider.notifier).setMode(widget.mode),
    );
  }

  @override
  void didUpdateWidget(covariant PrivoraShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.mode != widget.mode) {
      Future.microtask(
        () => ref.read(appControllerProvider.notifier).setMode(widget.mode),
      );
    }
  }

  void _applyRouteId(PrivoraState state) {
    final id = widget.id;
    final key = '${widget.mode.name}:${id ?? ''}';
    if (_lastAppliedRouteKey == key) return;
    _lastAppliedRouteKey = key;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final controller = ref.read(appControllerProvider.notifier);
      if (widget.mode == WorkspaceMode.chat) {
        if (id != null &&
            state.visibleChats.any((chat) => chat.id == id) &&
            state.currentChat?.id != id) {
          controller.selectChat(id);
        } else {
          controller.setMode(WorkspaceMode.chat);
        }
      }
      if (widget.mode == WorkspaceMode.characters) {
        if (id == null) {
          controller.openCharactersHome();
        } else {
          unawaited(controller.selectCharacterSession(id));
        }
      }
    });
  }

  void _handleSystemBack(PrivoraState state) {
    if (_playgroundDraft != null) {
      setState(() => _playgroundDraft = null);
      return;
    }
    if (_openArtifactId != null) {
      setState(() => _openArtifactId = null);
      return;
    }
    if (_searchOpen) {
      setState(() => _searchOpen = false);
      return;
    }
    if (_drawerOpen) {
      setState(() => _drawerOpen = false);
      return;
    }
    if (_messageFocusNode.hasFocus) {
      _messageFocusNode.unfocus();
      return;
    }
    if (state.settings.workspaceMode == WorkspaceMode.characters &&
        state.currentCharacterSession != null) {
      context.go('/characters');
      return;
    }
    if (state.settings.workspaceMode != WorkspaceMode.chat) {
      context.go('/chat');
      return;
    }

    final now = DateTime.now();
    final shouldExit =
        _lastBackPressedAt != null &&
        now.difference(_lastBackPressedAt!) < const Duration(seconds: 2);
    if (shouldExit) {
      SystemNavigator.pop();
      return;
    }
    _lastBackPressedAt = now;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        const SnackBar(content: Text('Press back again to exit Privora')),
      );
  }

  @override
  void dispose() {
    _messageController.dispose();
    _messageFocusNode.dispose();
    super.dispose();
  }

  Future<void> _pickFiles() async {
    final files = await openFiles();
    for (final file in files) {
      await _addAttachment(file);
    }
  }

  Future<void> _pickImage() async {
    final file = await _imagePicker.pickImage(source: ImageSource.gallery);
    if (file != null) await _addAttachment(file);
  }

  Future<void> _addAttachment(XFile file) async {
    final bytes = await file.readAsBytes();
    if (!mounted) return;
    final attachment = AttachmentRecord(
      url: file.path,
      base64: base64Encode(bytes),
      mimeType: inferredMimeType(file.name, file.mimeType),
      name: file.name,
      size: bytes.length,
    );
    final settings = ref.read(appControllerProvider).requireValue.settings;
    if (settings.composerMode == ComposerMode.image &&
        !attachment.mimeType.startsWith('image/')) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'Image generation only accepts image attachments. Remove "${attachment.name}" or switch back to chat.',
          ),
        ),
      );
      return;
    }
    final proposed = [..._attachments, attachment];
    final error = validateAttachments(
      proposed,
      _attachmentProviderFor(settings),
    );
    if (error != null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error)));
      return;
    }
    setState(() => _attachments.add(attachment));
  }

  Widget _workspaceContent(PrivoraState state, {required bool showMenu}) {
    _applyRouteId(state);
    return Stack(
      children: [
        Column(
          children: [
            _TopBar(
              mode: state.settings.workspaceMode,
              onOpenSidebar: () => setState(() => _drawerOpen = true),
              showMenu: showMenu,
            ),
            Expanded(
              child: _WorkspaceBody(
                mode: state.settings.workspaceMode,
                onEditUserMessage: (message) {
                  final draft = ref
                      .read(appControllerProvider.notifier)
                      .beginEditMessage(message.id);
                  if (draft == null) return;
                  setState(() {
                    _attachments
                      ..clear()
                      ..addAll(draft.attachments);
                    _messageController.text = draft.content;
                    _messageController.selection = TextSelection.collapsed(
                      offset: draft.content.length,
                    );
                  });
                  ref
                      .read(appControllerProvider.notifier)
                      .setComposerMode(ComposerMode.chat);
                  WidgetsBinding.instance.addPostFrameCallback(
                    (_) => _messageFocusNode.requestFocus(),
                  );
                },
                onEditGeneratedImage: (attachment, prompt) {
                  setState(() {
                    _attachments
                      ..clear()
                      ..add(attachment);
                    _messageController.text = prompt;
                    _messageController.selection = TextSelection.collapsed(
                      offset: prompt.length,
                    );
                  });
                  ref
                      .read(appControllerProvider.notifier)
                      .setComposerMode(ComposerMode.image);
                },
                onOpenArtifact: (artifactId) => setState(() {
                  _openArtifactId = artifactId;
                }),
                onOpenCodePlayground: (code, language) => setState(
                  () => _playgroundDraft = _CodePlaygroundDraft(
                    code: code,
                    language: language,
                  ),
                ),
              ),
            ),
            if (state.settings.workspaceMode == WorkspaceMode.chat ||
                (state.settings.workspaceMode == WorkspaceMode.characters &&
                    state.currentCharacterSession != null))
              _Composer(
                controller: _messageController,
                focusNode: _messageFocusNode,
                attachments: _attachments,
                onPickFiles: _pickFiles,
                onPickImage: _pickImage,
                onRemoveAttachment: (attachment) =>
                    setState(() => _attachments.remove(attachment)),
                onSent: () => setState(_attachments.clear),
                onOpenCodePlayground: () => setState(
                  () => _playgroundDraft = const _CodePlaygroundDraft(
                    code: '',
                    language: 'javascript',
                  ),
                ),
              ),
          ],
        ),
        if (_searchOpen)
          _SearchOverlay(
            chats: state.visibleChats,
            onClose: () => setState(() => _searchOpen = false),
            onSelectChat: (chatId) {
              ref.read(appControllerProvider.notifier).selectChat(chatId);
              context.go('/chat/$chatId');
              setState(() => _searchOpen = false);
            },
          ),
        if (_openArtifactId != null)
          Positioned.fill(
            child: _ArtifactCanvasPanel(
              artifact: state.artifacts
                  .where((artifact) => artifact.id == _openArtifactId)
                  .firstOrNull,
              isGenerating: state.isGenerating,
              onStop: ref.read(appControllerProvider.notifier).stopGeneration,
              onClose: () => setState(() => _openArtifactId = null),
            ),
          ),
        if (_playgroundDraft != null)
          Positioned.fill(
            child: _CodePlaygroundPanel(
              draft: _playgroundDraft!,
              onClose: () => setState(() => _playgroundDraft = null),
            ),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final stateAsync = ref.watch(appControllerProvider);
    final isWide = MediaQuery.sizeOf(context).width >= 820;
    final colors = context.colors;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (didPop) return;
        final state = ref.read(appControllerProvider).value;
        if (state != null) _handleSystemBack(state);
      },
      child: Scaffold(
        backgroundColor: colors.background,
        body: SafeArea(
          child: stateAsync.when(
            loading: () => _LoadingShell(mode: widget.mode),
            error: (error, stackTrace) => _ErrorShell(
              mode: widget.mode,
              error: error,
              onRetry: () => ref.invalidate(appControllerProvider),
            ),
            data: (state) => isWide
                ? Row(
                    children: [
                      _Sidebar(
                        state: state,
                        onClose: () {},
                        onSearchOpen: () => setState(() => _searchOpen = true),
                      ),
                      Expanded(
                        child: _workspaceContent(state, showMenu: false),
                      ),
                    ],
                  )
                : Stack(
                    children: [
                      Positioned.fill(
                        child: _workspaceContent(state, showMenu: !_drawerOpen),
                      ),
                      if (_drawerOpen)
                        Positioned.fill(
                          child: Row(
                            children: [
                              _Sidebar(
                                state: state,
                                onClose: () =>
                                    setState(() => _drawerOpen = false),
                                onSearchOpen: () =>
                                    setState(() => _searchOpen = true),
                                compact: true,
                              ),
                              Expanded(
                                child: GestureDetector(
                                  onTap: () =>
                                      setState(() => _drawerOpen = false),
                                  child: ColoredBox(
                                    color: Colors.black.withValues(alpha: 0.2),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}

ProviderId _attachmentProviderFor(UiSettings settings) {
  if (settings.composerMode == ComposerMode.image) {
    return settings.imageSettings.model == 'gpt-image-2'
        ? ProviderId.cliproxy
        : ProviderId.gemini;
  }
  return modelOptionFor(settings.selectedModel).provider;
}

class _LoadingShell extends StatelessWidget {
  const _LoadingShell({required this.mode});
  final WorkspaceMode mode;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Column(
      children: [
        _TopBar(mode: mode, onOpenSidebar: () {}, showMenu: false),
        Expanded(
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _PrivoraTypingIndicator(
                  key: const Key('shell-loading-indicator'),
                  size: 30,
                  color: colors.text.withValues(alpha: 0.62),
                ),
                const SizedBox(height: 10),
                Text(
                  'Loading Privora',
                  style: TextStyle(
                    color: colors.muted,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ErrorShell extends StatelessWidget {
  const _ErrorShell({
    required this.mode,
    required this.error,
    required this.onRetry,
  });
  final WorkspaceMode mode;
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Column(
      children: [
        _TopBar(mode: mode, onOpenSidebar: () {}, showMenu: false),
        Expanded(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Could not open local data',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '$error',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: colors.muted),
                  ),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: onRetry, child: const Text('Retry')),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _TopBar extends ConsumerWidget {
  const _TopBar({
    required this.mode,
    required this.onOpenSidebar,
    required this.showMenu,
  });
  final WorkspaceMode mode;
  final VoidCallback onOpenSidebar;
  final bool showMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.colors;
    final settings = ref.watch(
      appControllerProvider.select((state) => state.value?.settings),
    );
    final showModelSelector =
        settings != null &&
        (mode == WorkspaceMode.chat || mode == WorkspaceMode.characters);
    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: colors.border.withValues(alpha: 0.5)),
        ),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (showMenu)
                  IconButton(
                    tooltip: 'Open sidebar',
                    onPressed: onOpenSidebar,
                    icon: const Icon(LucideIcons.panelLeft),
                  ),
                Text(
                  _modeTitle(mode),
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          if (showModelSelector)
            _TopModelSelector(
              selectedModel: settings.selectedModel,
              onSelected: ref.read(appControllerProvider.notifier).selectModel,
            ),
        ],
      ),
    );
  }
}

class _TopModelSelector extends StatelessWidget {
  const _TopModelSelector({
    required this.selectedModel,
    required this.onSelected,
  });

  final String selectedModel;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final model = modelOptionFor(selectedModel);
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 190),
        child: Material(
          color: colors.surface,
          borderRadius: BorderRadius.circular(999),
          child: InkWell(
            borderRadius: BorderRadius.circular(999),
            onTap: () => _showModelSheet(
              context,
              selectedModel: selectedModel,
              onSelected: onSelected,
            ),
            child: Container(
              height: 34,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: colors.border.withValues(alpha: 0.8)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Flexible(
                    child: Text(
                      model.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: colors.text,
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Icon(LucideIcons.chevronDown, size: 14, color: colors.muted),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
