import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/secure/secure_credential_repository.dart';
import '../../../models/privora_models.dart';

class ChatGenerationRequest {
  const ChatGenerationRequest({
    required this.model,
    required this.styleId,
    required this.history,
    required this.thinkingEnabled,
    required this.webSearchEnabled,
    required this.deepResearchEnabled,
    this.webSearchForced = false,
    this.artifactToolsEnabled = false,
    this.instructionSuffix,
  });

  final String model;
  final String styleId;
  final List<ChatMessageRecord> history;
  final bool thinkingEnabled;
  final bool webSearchEnabled;
  final bool webSearchForced;
  final bool deepResearchEnabled;
  final bool artifactToolsEnabled;
  final String? instructionSuffix;
}

class ArtifactStreamPayload {
  const ArtifactStreamPayload({
    required this.kind,
    required this.title,
    required this.content,
    required this.status,
    this.operation = 'create',
    this.targetArtifactId,
    this.language,
  });

  final String operation;
  final String? targetArtifactId;
  final ArtifactKind kind;
  final String title;
  final String? language;
  final String content;
  final ArtifactStatus status;
}

enum ChatStreamEventType { text, thought, webSearch, artifact }

class ChatStreamEvent {
  const ChatStreamEvent({
    required this.type,
    this.text = '',
    this.status,
    this.queries = const [],
    this.artifact,
  });

  const ChatStreamEvent.text(String text)
    : this(type: ChatStreamEventType.text, text: text);

  const ChatStreamEvent.thought(String text)
    : this(type: ChatStreamEventType.thought, text: text);

  const ChatStreamEvent.webSearch(String status, List<String> queries)
    : this(
        type: ChatStreamEventType.webSearch,
        status: status,
        queries: queries,
      );

  const ChatStreamEvent.artifact(ArtifactStreamPayload artifact)
    : this(type: ChatStreamEventType.artifact, artifact: artifact);

  final ChatStreamEventType type;
  final String text;
  final String? status;
  final List<String> queries;
  final ArtifactStreamPayload? artifact;
}

class _ProviderWebSearchEvent {
  const _ProviderWebSearchEvent(this.status, this.queries);

  final String status;
  final List<String> queries;
}

abstract interface class ChatGenerationClient {
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request);
  void stop();
}

final chatGenerationClientProvider = Provider<ChatGenerationClient>((ref) {
  return GatewayChatGenerationClient(
    ref.watch(secureCredentialRepositoryProvider),
  );
});

class GatewayChatGenerationClient implements ChatGenerationClient {
  GatewayChatGenerationClient(this._credentials);

  final SecureCredentialRepository _credentials;
  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 45),
      sendTimeout: const Duration(seconds: 45),
    ),
  );
  final Set<CancelToken> _activeCancelTokens = {};

  @override
  void stop() {
    for (final token in _activeCancelTokens.toList()) {
      token.cancel('Request stopped.');
    }
    _activeCancelTokens.clear();
  }

  @override
  Stream<ChatStreamEvent> stream(ChatGenerationRequest request) async* {
    final provider = modelOptionFor(request.model).provider;
    final cancelToken = CancelToken();
    _activeCancelTokens.add(cancelToken);
    Uri? uri;

    try {
      uri = await _directUri(request, provider);
      _debugAiLog(
        'chat request provider=${provider.name} model=${request.model} url=${_redactedUri(uri)}',
      );
      final headers = <String, Object?>{};
      if (provider == ProviderId.cliproxy) {
        headers['Authorization'] = 'Bearer dummy-key';
      } else if (provider == ProviderId.openrouter) {
        final apiKey = await _credentials.openRouterApiKey();
        if (apiKey.isEmpty) throw StateError('OPENROUTER_API_KEY is missing.');
        headers['Authorization'] = 'Bearer $apiKey';
        headers['HTTP-Referer'] = 'https://privora.local';
        headers['X-Title'] = 'Privora';
      }
      final response = await _dio.postUri<ResponseBody>(
        uri,
        data: provider == ProviderId.gemini
            ? _geminiDirectBody(request)
            : _requestBody(request, provider),
        options: Options(
          contentType: Headers.jsonContentType,
          headers: headers,
          responseType: ResponseType.stream,
          validateStatus: (_) => true,
        ),
        cancelToken: cancelToken,
      );
      final statusCode = response.statusCode ?? 0;
      _debugAiLog(
        'chat response provider=${provider.name} status=$statusCode url=${_redactedUri(uri)}',
      );
      final body = response.data;
      if (body == null) throw StateError('Model request returned no body.');
      if (statusCode < 200 || statusCode >= 300) {
        final error = await _streamToString(body.stream);
        throw StateError(
          error.trim().isEmpty
              ? 'Model request failed with $statusCode.'
              : error,
        );
      }

      if (provider == ProviderId.gemini) {
        yield* _readGeminiDirect(body.stream);
      } else if (provider == ProviderId.cliproxy) {
        yield* _readCliproxy(body.stream);
      } else {
        yield* _readOpenRouter(body.stream);
      }
    } on DioException catch (error) {
      if (CancelToken.isCancel(error)) return;
      _debugAiLog(
        'chat error provider=${provider.name} url=${uri == null ? 'unresolved' : _redactedUri(uri)} type=${error.type} message=${error.message}',
      );
      throw StateError(_dioErrorMessage(error, provider, uri));
    } finally {
      _activeCancelTokens.remove(cancelToken);
    }
  }

  Future<Uri> _directUri(
    ChatGenerationRequest request,
    ProviderId provider,
  ) async {
    if (provider == ProviderId.gemini) {
      final apiKey = await _credentials.geminiApiKey();
      if (apiKey.isEmpty) throw StateError('GEMINI_API_KEY is missing.');
      return Uri.https(
        'generativelanguage.googleapis.com',
        '/v1beta/models/${request.model}:streamGenerateContent',
        {'alt': 'sse', 'key': apiKey},
      );
    }
    if (provider == ProviderId.openrouter) {
      return Uri.https('openrouter.ai', '/api/v1/chat/completions');
    }
    final baseUrl = await _credentials.cliproxyEndpoint();
    return Uri.parse(baseUrl).resolve('/v1/responses');
  }

  Map<String, Object?> _geminiDirectBody(ChatGenerationRequest request) => {
    'contents': [
      for (final message in request.history)
        {
          'role': message.role == 'model' ? 'model' : 'user',
          'parts': [
            if (message.content.isNotEmpty) {'text': message.content},
            if (message.role == 'user')
              for (final attachment in message.attachments)
                if (attachment.base64 != null)
                  {
                    'inlineData': {
                      'data': attachment.base64,
                      'mimeType': attachment.mimeType,
                    },
                  },
          ],
        },
    ],
    'systemInstruction': {
      'parts': [
        {'text': _systemInstruction(request)},
      ],
    },
    'generationConfig': {'temperature': 0.85},
    if (request.webSearchEnabled)
      'tools': [
        {'googleSearch': {}},
      ],
  };

  Map<String, Object?> _requestBody(
    ChatGenerationRequest request,
    ProviderId provider,
  ) {
    final instruction = _systemInstruction(request);
    if (provider == ProviderId.gemini) {
      return {
        'model': request.model,
        'contents': [
          for (final message in request.history)
            {
              'role': message.role == 'model' ? 'model' : 'user',
              'parts': [
                if (message.content.isNotEmpty) {'text': message.content},
                if (message.role == 'user')
                  for (final attachment in message.attachments)
                    if (attachment.base64 != null)
                      {
                        'inlineData': {
                          'data': attachment.base64,
                          'mimeType': attachment.mimeType,
                        },
                      },
              ],
            },
        ],
        'systemInstruction': instruction,
        'thinkingEnabled': request.thinkingEnabled,
        'webSearchEnabled': request.webSearchEnabled,
        'artifactToolsEnabled': request.artifactToolsEnabled,
        'temperature': 0.85,
      };
    }
    if (provider == ProviderId.cliproxy) {
      return {
        'model': request.model,
        'instructions': instruction,
        'input': [
          for (final message in request.history)
            {
              'role': message.role == 'model' ? 'assistant' : 'user',
              'content': _cliproxyContent(message),
            },
        ],
        'stream': true,
        'temperature': 0.85,
        if (request.thinkingEnabled)
          'reasoning': {'effort': 'medium', 'summary': 'auto'},
        if (request.webSearchEnabled || request.artifactToolsEnabled)
          'tools': [
            if (request.webSearchEnabled) {'type': 'web_search_preview'},
            if (request.artifactToolsEnabled) _artifactToolDefinition,
          ],
      };
    }
    return {
      'model': request.model,
      'messages': [
        {'role': 'system', 'content': instruction},
        for (final message in request.history)
          {
            'role': message.role == 'model' ? 'assistant' : 'user',
            'content': message.content,
          },
      ],
      'stream': true,
      if (request.webSearchEnabled) 'stream_options': {'include_usage': true},
      if (request.thinkingEnabled)
        'reasoning': {'effort': 'medium', 'exclude': false},
      if (request.webSearchEnabled || request.artifactToolsEnabled)
        'tools': [
          if (request.webSearchEnabled)
            {
              'type': 'openrouter:web_search',
              'parameters': {'max_results': 5, 'max_total_results': 12},
            },
          if (request.artifactToolsEnabled) _openRouterArtifactToolDefinition,
        ],
    };
  }

  List<Map<String, Object?>> _cliproxyContent(ChatMessageRecord message) {
    final output = <Map<String, Object?>>[
      if (message.content.isNotEmpty)
        {
          'type': message.role == 'model' ? 'output_text' : 'input_text',
          'text': message.content,
        },
    ];
    if (message.role == 'user') {
      for (final attachment in message.attachments) {
        if (attachment.base64 == null) continue;
        final dataUrl =
            'data:${attachment.mimeType};base64,${attachment.base64}';
        if (_imageMimeTypes.contains(attachment.mimeType)) {
          output.add({
            'type': 'input_image',
            'image_url': dataUrl,
            'detail': 'auto',
          });
        } else {
          output.add({
            'type': 'input_file',
            'filename': attachment.name,
            'file_data': dataUrl,
          });
        }
      }
    }
    return output.isEmpty
        ? [
            {
              'type': message.role == 'model' ? 'output_text' : 'input_text',
              'text': '',
            },
          ]
        : output;
  }

  String _systemInstruction(ChatGenerationRequest request) {
    final style = responseStyleFor(request.styleId);
    final now = DateTime.now().toLocal();
    return [
      'You are Privora, a clear and useful AI assistant.',
      'Respond in markdown unless the user asks for another format. Keep simple replies simple, and use structure only when it helps.',
      'Current local date/time: ${now.toIso8601String()}.',
      _styleInstruction(style.id),
      if (request.webSearchForced)
        'The user has turned Web search on for this turn. You must use the available web search tool before composing the answer. Search for current, high-quality sources and base the answer on those results. If search is unavailable, say that clearly instead of answering from memory.',
      if (request.webSearchEnabled && !request.webSearchForced)
        'A web search tool may be available. Decide whether to use it before answering. Use it when the user asks for latest/current/recent information, live facts, prices, schedules, scores, laws, product or library details, source links, citations, or any fact likely to have changed. Do not search for stable facts, casual chat, creative writing, brainstorming, or questions answerable from the conversation. If search is needed but unavailable, say so instead of guessing.',
      if (request.deepResearchEnabled)
        'Deep Research is requested. Investigate carefully and produce a structured cited report.',
      if (request.artifactToolsEnabled) _artifactSystemInstruction,
      if (request.instructionSuffix?.isNotEmpty == true)
        request.instructionSuffix!,
    ].join('\n');
  }

  String _styleInstruction(String styleId) => switch (styleId) {
    'concise' =>
      '# Response style: Concise\n- Lead with the answer, fix, recommendation, or conclusion.\n- Be brief without being blunt; skip ceremony, filler, and generic recaps.\n- Use compact bullets only when they reduce reading time.\n- Do not omit critical caveats, assumptions, risks, commands, or verification steps.',
    'formal' =>
      '# Response style: Formal\n- Use professional plain English: polished, precise, respectful, and easy to read.\n- Lead with the conclusion or requested deliverable when appropriate.\n- Avoid slang, jokes, emojis, casual openers, and corporate filler.\n- State uncertainty, risks, and next steps clearly.',
    'learning' =>
      '# Response style: Learning\n- Teach clearly with small examples when useful.\n- Explain the why, not only the answer.\n- Keep examples proportional to the user request.\n- For small runnable code examples, use normal fenced code blocks so the Code Playground can open them; do not create Canvas artifacts unless the user asks for a file, app, document, artifact, or reusable standalone page.',
    'explanatory' =>
      '# Response style: Explanatory\n- Explain causes, mechanics, and tradeoffs clearly.\n- Skip broad scene-setting and blog-style warmups.\n- Go deeper than default when depth helps, but keep it proportional.\n- Use concrete examples and checks when they clarify the answer.',
    'creative' =>
      '# Response style: Creative\n- Bring useful originality, alternatives, and taste without becoming vague.\n- Preserve accuracy, constraints, and practical usefulness.\n- Offer a few distinct directions when ideating.\n- Avoid generic names, obvious category words, and style for its own sake.',
    'human' =>
      '# Response style: Human\n- Sound natural, grounded, and less template-like.\n- Use plain language and a conversational rhythm without padding.\n- Match the user tone while keeping the answer useful and concrete.\n- Avoid stock assistant phrasing and over-explaining simple points.',
    _ =>
      '# Response style: Normal\n- Use Privora\'s balanced default voice: warm, concise, useful, and natural.\n- Adapt depth to the user\'s task instead of forcing a fixed format.\n- Be conversational without becoming chatty.\n- Avoid emojis unless the user uses them first or the moment clearly benefits from one.\n- Structure answers when structure helps, but keep simple replies simple.',
  };

  Stream<ChatStreamEvent> _readGeminiDirect(Stream<List<int>> body) async* {
    await for (final raw in _sseEvents(body)) {
      for (final line in raw.split('\n')) {
        if (!line.startsWith('data:')) continue;
        final payload = line.substring(5).trim();
        if (payload.isEmpty || payload == '[DONE]') continue;
        final data = jsonDecode(payload) as Map<String, dynamic>;
        if (data['error'] != null) throw StateError('${data['error']}');
        final parts =
            (((data['candidates'] as List?)?.firstOrNull
                        as Map<String, dynamic>?)?['content']
                    as Map<String, dynamic>?)?['parts']
                as List? ??
            const [];
        for (final part in parts.whereType<Map>()) {
          final text = part['text'];
          if (text is! String || text.isEmpty) continue;
          if (part['thought'] == true) {
            yield ChatStreamEvent.thought(text);
          } else {
            yield ChatStreamEvent.text(text);
          }
        }
        final grounding =
            ((data['candidates'] as List?)?.firstOrNull
                    as Map<String, dynamic>?)?['groundingMetadata']
                as Map?;
        final queries = [
          ..._strings(grounding?['webSearchQueries']),
          ..._strings(grounding?['imageSearchQueries']),
          ..._strings(grounding?['retrievalQueries']),
        ];
        if (queries.isNotEmpty) {
          yield ChatStreamEvent.webSearch('searched', queries);
        }
      }
    }
  }

  Stream<ChatStreamEvent> _readCliproxy(Stream<List<int>> body) async* {
    var artifactArguments = '';
    await for (final raw in _sseEvents(body)) {
      String? eventType;
      for (final line in raw.split('\n')) {
        if (line.startsWith('event:')) {
          eventType = line.substring(6).trim();
          continue;
        }
        if (!line.startsWith('data:')) continue;
        final payload = line.substring(5).trim();
        if (payload.isEmpty || payload == '[DONE]') continue;
        final data = jsonDecode(payload) as Map<String, dynamic>;
        final type = '${eventType ?? ''} ${data['type'] ?? ''}';
        if (type.contains('output_text') && data['delta'] is String) {
          yield ChatStreamEvent.text(data['delta'] as String);
        }
        if (type.contains('reasoning') && data['delta'] is String) {
          yield ChatStreamEvent.thought(data['delta'] as String);
        }
        final webSearchEvent = _extractCliproxyWebSearchEvent(eventType, data);
        if (webSearchEvent != null) {
          yield ChatStreamEvent.webSearch(
            webSearchEvent.status,
            webSearchEvent.queries,
          );
        }
        if (type.contains('function_call_arguments.delta') &&
            data['delta'] is String) {
          artifactArguments += data['delta'] as String;
          final draft = _partialArtifact(artifactArguments);
          if (draft != null) yield ChatStreamEvent.artifact(draft);
        }
        if (type.contains('function_call_arguments.done') ||
            type.contains('function_call.done')) {
          final payload = data['arguments'] as String? ?? artifactArguments;
          final artifact = _artifactFromArguments(payload);
          if (artifact != null) yield ChatStreamEvent.artifact(artifact);
          artifactArguments = '';
        }
      }
    }
  }

  Stream<ChatStreamEvent> _readOpenRouter(Stream<List<int>> body) async* {
    var didEmitSearch = false;
    final toolArguments = <int, String>{};
    final toolNames = <int, String>{};
    await for (final raw in _sseEvents(body)) {
      for (final line in raw.split('\n')) {
        if (!line.startsWith('data:')) continue;
        final payload = line.substring(5).trim();
        if (payload.isEmpty || payload == '[DONE]') continue;
        final data = jsonDecode(payload) as Map<String, dynamic>;
        if (data['error'] != null) throw StateError('${data['error']}');
        final choices = data['choices'] as List?;
        final choice = choices?.firstOrNull as Map?;
        final delta = choice?['delta'] as Map?;
        final text = delta?['content'];
        if (text is String && text.isNotEmpty) {
          yield ChatStreamEvent.text(text);
        }
        for (final key in const ['reasoning', 'reasoning_content', 'thought']) {
          final thought = delta?[key];
          if (thought is String && thought.isNotEmpty) {
            yield ChatStreamEvent.thought(thought);
            break;
          }
        }
        if (!didEmitSearch && requestShowsWebSearch(data, delta)) {
          didEmitSearch = true;
          yield const ChatStreamEvent.webSearch('searched', []);
        }
        final toolCalls = delta?['tool_calls'] as List? ?? const [];
        for (var index = 0; index < toolCalls.length; index++) {
          final call = toolCalls[index] as Map?;
          final callIndex = (call?['index'] as num?)?.toInt() ?? index;
          final function = call?['function'] as Map?;
          final name = function?['name'] as String?;
          if (name != null) toolNames[callIndex] = name;
          final arguments = function?['arguments'] as String?;
          if (arguments != null) {
            toolArguments[callIndex] =
                (toolArguments[callIndex] ?? '') + arguments;
            if (toolNames[callIndex] == 'create_or_update_artifact') {
              final draft = _partialArtifact(toolArguments[callIndex]!);
              if (draft != null) yield ChatStreamEvent.artifact(draft);
            }
          }
        }
        if (choice?['finish_reason'] == 'tool_calls') {
          for (final entry in toolArguments.entries) {
            if (toolNames[entry.key] != 'create_or_update_artifact') continue;
            final artifact = _artifactFromArguments(entry.value);
            if (artifact != null) yield ChatStreamEvent.artifact(artifact);
          }
          toolArguments.clear();
          toolNames.clear();
        }
      }
    }
  }

  ArtifactStreamPayload? _artifactFromArguments(String source) {
    try {
      return _artifactFromMap(
        jsonDecode(source) as Map<String, dynamic>,
        ArtifactStatus.ready,
      );
    } catch (_) {
      return null;
    }
  }

  ArtifactStreamPayload? _partialArtifact(String source) {
    final kind = RegExp(r'"kind"\s*:\s*"([^"]+)"').firstMatch(source)?.group(1);
    final title = _partialJsonString(source, 'title');
    final content = _partialJsonString(source, 'content');
    if (kind == null || title == null || content == null) return null;
    return ArtifactStreamPayload(
      operation: _partialJsonString(source, 'operation') ?? 'create',
      targetArtifactId: _partialJsonString(source, 'targetArtifactId'),
      kind: artifactKindFromStorage(kind),
      title: title,
      language: _partialJsonString(source, 'language'),
      content: content,
      status: ArtifactStatus.streaming,
    );
  }

  String? _partialJsonString(String source, String key) {
    final match = RegExp(
      '"$key"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)',
    ).firstMatch(source);
    final raw = match?.group(1);
    if (raw == null) return null;
    try {
      return jsonDecode('"$raw"') as String;
    } catch (_) {
      final trimmed = raw.endsWith(r'\')
          ? raw.substring(0, raw.length - 1)
          : raw;
      try {
        return jsonDecode('"$trimmed"') as String;
      } catch (_) {
        return null;
      }
    }
  }

  ArtifactStreamPayload? _artifactFromMap(
    Map<String, dynamic> map,
    ArtifactStatus status,
  ) {
    final title = map['title'] as String?;
    final content = map['content'] as String?;
    if (title == null || content == null) return null;
    return ArtifactStreamPayload(
      operation: map['operation'] as String? ?? 'create',
      targetArtifactId: map['targetArtifactId'] as String?,
      kind: artifactKindFromStorage(map['kind'] as String?),
      title: title,
      language: map['language'] as String?,
      content: content,
      status: status,
    );
  }

  _ProviderWebSearchEvent? _extractCliproxyWebSearchEvent(
    String? event,
    Map<String, dynamic> data,
  ) {
    final payload = data['item'] is Map
        ? data['item'] as Map
        : data['output_item'] is Map
        ? data['output_item'] as Map
        : data;
    final type =
        '${event ?? ''} ${data['type'] ?? ''} ${payload['type'] ?? ''}';
    if (!type.contains('web_search')) return null;
    final queries = [
      if ((payload['action'] as Map?)?['query'] is String)
        (payload['action'] as Map)['query'] as String,
      if ((data['action'] as Map?)?['query'] is String)
        (data['action'] as Map)['query'] as String,
      ..._strings((payload['action'] as Map?)?['queries']),
      ..._strings((data['action'] as Map?)?['queries']),
    ].where((query) => query.trim().isNotEmpty).toList();
    final status =
        payload['status'] == 'completed' || data['status'] == 'completed'
        ? 'searched'
        : 'searching';
    return _ProviderWebSearchEvent(status, queries);
  }

  bool requestShowsWebSearch(Map<String, dynamic> data, Map? delta) {
    final choices = data['choices'] as List?;
    final choice = choices?.firstOrNull as Map?;
    final message = choice?['message'] as Map? ?? const {};
    if ((delta?['annotations'] as List?)?.isNotEmpty ?? false) return true;
    if ((message['annotations'] as List?)?.isNotEmpty ?? false) return true;
    if ((data['annotations'] as List?)?.isNotEmpty ?? false) return true;
    final usage = data['usage'] as Map?;
    final serverTools = usage?['server_tool_use'] as Map?;
    final requests =
        (serverTools?['web_search_requests'] as num? ?? 0) +
        (usage?['web_search_requests'] as num? ?? 0) +
        ((data['server_tool_use'] as Map?)?['web_search_requests'] as num? ??
            0) +
        (data['web_search_requests'] as num? ?? 0);
    if (requests > 0) return true;
    final toolCalls = [
      ...(delta?['tool_calls'] as List? ?? const []),
      ...(message['tool_calls'] as List? ?? const []),
    ];
    return toolCalls.any((toolCall) {
      if (toolCall is! Map) return false;
      final function = toolCall['function'] as Map?;
      final name = function?['name'] ?? toolCall['name'] ?? toolCall['type'];
      return name is String && name.contains('web_search');
    });
  }

  Stream<String> _sseEvents(Stream<List<int>> body) async* {
    var buffer = '';
    await for (final chunk in utf8.decoder.bind(body.cast<List<int>>())) {
      buffer += chunk;
      final parts = buffer.split(RegExp(r'\r?\n\r?\n'));
      buffer = parts.removeLast();
      for (final part in parts) {
        if (part.trim().isNotEmpty && !part.trimLeft().startsWith(':')) {
          yield part;
        }
      }
    }
    if (buffer.trim().isNotEmpty) yield buffer;
  }

  List<String> _strings(Object? input) =>
      input is List ? input.whereType<String>().toList() : const [];

  Future<String> _streamToString(Stream<List<int>> body) {
    return utf8.decoder.bind(body.cast<List<int>>()).join();
  }

  String _dioErrorMessage(DioException error, ProviderId provider, Uri? uri) {
    final source = error.error ?? error.message ?? error;
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout) {
      if (provider == ProviderId.cliproxy) {
        return 'Could not connect to CLIProxy at ${uri ?? 'the configured endpoint'}. '
            'For GPT/CLIProxy, start CLIProxy and make sure the phone can reach it. '
            'For USB debugging, run adb reverse tcp:8317 tcp:8317 and set CLIProxy to http://127.0.0.1:8317. For Wi-Fi/LAN, use your computer IP, for example http://192.168.1.10:8317. Details: $source';
      }
      return 'Could not connect to the selected AI provider. Check the provider endpoint, network access, and API key. Details: $source';
    }
    return 'AI provider request failed. Details: $source';
  }

  void _debugAiLog(String message) {
    if (kDebugMode) debugPrint('[Privora AI] $message');
  }

  String _redactedUri(Uri uri) {
    if (uri.queryParameters.isEmpty) return uri.toString();
    return uri
        .replace(
          queryParameters: {
            for (final entry in uri.queryParameters.entries)
              entry.key: _isSensitiveQueryKey(entry.key)
                  ? 'REDACTED'
                  : entry.value,
          },
        )
        .toString();
  }

  bool _isSensitiveQueryKey(String key) {
    final lower = key.toLowerCase();
    return lower.contains('key') ||
        lower.contains('token') ||
        lower.contains('secret');
  }
}

const _imageMimeTypes = {'image/png', 'image/jpeg', 'image/webp', 'image/gif'};

const _artifactSystemInstruction = '''
Artifact conversation flow:
- When the user asks you to create or substantially revise a reusable standalone asset, file, document, app, diagram, prompt, table, or structured document, prefer creating/updating an artifact instead of only writing the full content in chat.
- Use the create_or_update_artifact tool with complete artifact content when that tool is available.
- Do not write a preamble before creating or updating an artifact.
- While the artifact is being created, do not paste the full artifact content into chat; let Canvas carry the work.
- After creating or updating the artifact, keep the chat response short and do not include verbose implementation notes.
- If the user explicitly says they do not want an artifact, canvas, or file, or only wants a normal answer, do not call the artifact tool.
- If the user asks for a small runnable code example or teaching snippet, answer with normal fenced code blocks for Code Playground unless they explicitly ask for a file, Canvas, artifact, full app, or reusable standalone page.

Artifact rules:
- Use "create" for a new standalone artifact.
- Use "update" when revising, extending, fixing, rewriting, or transforming the most relevant existing artifact.
- Pick a concise title and closest kind.
- For code, include language.
- For Markdown documents, use kind "markdown".
- For comparison tables, use kind "table" unless the table is part of a larger document.
- Put metadata only in tool fields. Never wrap the content in custom artifact, canvas, or XML metadata tags.
- For SVG artifacts, content must be raw <svg>...</svg> only.
- For HTML artifacts, content must be raw HTML document or fragment only.
- Never simulate tool calls in chat text.
''';

const _artifactParameters = {
  'type': 'object',
  'additionalProperties': false,
  'properties': {
    'operation': {
      'type': 'string',
      'enum': ['create', 'update'],
    },
    'targetArtifactId': {'type': 'string'},
    'kind': {
      'type': 'string',
      'enum': [
        'markdown',
        'code',
        'html',
        'svg',
        'mermaid',
        'json',
        'yaml',
        'sql',
        'text',
        'table',
        'prompt',
      ],
    },
    'title': {'type': 'string'},
    'language': {'type': 'string'},
    'content': {'type': 'string'},
  },
  'required': ['operation', 'kind', 'title', 'content'],
};

const _artifactToolDefinition = {
  'type': 'function',
  'name': 'create_or_update_artifact',
  'description':
      'Create or update a Privora Canvas artifact for substantial code, docs, tables, prompts, diagrams, or structured content.',
  'parameters': _artifactParameters,
};

const _openRouterArtifactToolDefinition = {
  'type': 'function',
  'function': {
    'name': 'create_or_update_artifact',
    'description':
        'Create or update a Privora Canvas artifact for substantial code, docs, tables, prompts, diagrams, or structured content.',
    'parameters': _artifactParameters,
  },
};
