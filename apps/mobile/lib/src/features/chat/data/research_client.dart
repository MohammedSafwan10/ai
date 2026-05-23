import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/secure/secure_credential_repository.dart';
import '../../../models/privora_models.dart';
import 'chat_generation_client.dart';

const deepResearchTimeBudgetMs = 180000;

class ResearchPreflightResult {
  const ResearchPreflightResult({
    required this.decision,
    this.assistantMessage,
    this.questions = const [],
    this.title,
    this.steps = const [],
    this.refinedPrompt,
    this.confidence,
  });

  final String decision;
  final String? assistantMessage;
  final List<String> questions;
  final String? title;
  final List<String> steps;
  final String? refinedPrompt;
  final double? confidence;
}

enum ResearchStreamEventType {
  status,
  activity,
  planStep,
  sources,
  text,
  completed,
  stopped,
  error,
}

class ResearchStreamEvent {
  const ResearchStreamEvent({
    required this.type,
    this.status,
    this.message,
    this.activity,
    this.index,
    this.stepStatus,
    this.sources = const [],
    this.text,
    this.error,
  });

  final ResearchStreamEventType type;
  final ResearchStatus? status;
  final String? message;
  final ResearchActivityRecord? activity;
  final int? index;
  final ResearchPlanStepStatus? stepStatus;
  final List<ResearchSourceRecord> sources;
  final String? text;
  final String? error;
}

abstract interface class ResearchClient {
  Future<ResearchPreflightResult> preflight({
    required String model,
    required ProviderId provider,
    required String styleId,
    required List<ChatMessageRecord> history,
    PendingResearchIntentRecord? pendingIntent,
  });

  Future<String> startJob({
    required String model,
    required ProviderId provider,
    required String styleId,
    required List<ChatMessageRecord> history,
    required ResearchPlanRecord plan,
  });

  Stream<ResearchStreamEvent> streamJob(String jobId);
  Future<void> cancelJob(String jobId);
  void stop();
}

final researchClientProvider = Provider<ResearchClient>((ref) {
  return DirectResearchClient(
    ref.watch(chatGenerationClientProvider),
    ref.watch(secureCredentialRepositoryProvider),
  );
});

class DirectResearchClient implements ResearchClient {
  DirectResearchClient(this._chatClient, this._credentials);

  final ChatGenerationClient _chatClient;
  final SecureCredentialRepository _credentials;
  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 20),
      receiveTimeout: const Duration(seconds: 45),
      sendTimeout: const Duration(seconds: 45),
      headers: {'User-Agent': 'PrivoraMobile/1.0'},
    ),
  );
  final Map<String, _DirectResearchJob> _jobs = {};
  final Set<String> _cancelledJobIds = {};

  @override
  Future<ResearchPreflightResult> preflight({
    required String model,
    required ProviderId provider,
    required String styleId,
    required List<ChatMessageRecord> history,
    PendingResearchIntentRecord? pendingIntent,
  }) async {
    final input = _buildPreflightInput(
      styleId: styleId,
      pendingIntent: pendingIntent,
      history: history,
    );
    final text = await _providerText(
      model: model,
      provider: provider,
      instruction: _deepResearchPreflightInstruction,
      input: input,
      temperature: 0.2,
      webSearchEnabled: false,
    );
    return _normalizePreflightResult(_extractJsonObject(text));
  }

  @override
  Future<String> startJob({
    required String model,
    required ProviderId provider,
    required String styleId,
    required List<ChatMessageRecord> history,
    required ResearchPlanRecord plan,
  }) async {
    final jobId = 'research_${DateTime.now().microsecondsSinceEpoch}';
    _cancelledJobIds.remove(jobId);
    _jobs[jobId] = _DirectResearchJob(
      model: model,
      provider: provider,
      styleId: styleId,
      history: history,
      plan: plan,
    );
    return jobId;
  }

  @override
  Stream<ResearchStreamEvent> streamJob(String jobId) async* {
    final job = _jobs[jobId];
    if (job == null) {
      yield const ResearchStreamEvent(
        type: ResearchStreamEventType.error,
        error: 'Research job was not found.',
      );
      return;
    }
    try {
      var content = '';
      var sources = <ResearchSourceRecord>[];
      final seenSourceUrls = <String>{};
      var didEnterReading = false;
      var didEnterSynthesis = false;

      void mergeSources(
        List<ResearchSourceRecord> next,
        void Function(ResearchStreamEvent event) emit,
      ) {
        final fresh = <ResearchSourceRecord>[];
        for (final source in next) {
          if (source.url.isEmpty || !seenSourceUrls.add(source.url)) continue;
          fresh.add(source);
        }
        if (fresh.isEmpty) return;
        sources = _uniqueSources([...sources, ...fresh]);
        emit(
          ResearchStreamEvent(
            type: ResearchStreamEventType.sources,
            sources: sources,
          ),
        );
        for (final source in fresh.take(10)) {
          emit(
            ResearchStreamEvent(
              type: ResearchStreamEventType.activity,
              activity: ResearchActivityRecord(
                phase: 'source',
                title: source.title ?? _sourceLabel(source.url),
                detail: source.url,
                source: source,
                timestamp: DateTime.now(),
              ),
            ),
          );
        }
      }

      final pendingEvents = <ResearchStreamEvent>[];
      void queueEvent(ResearchStreamEvent event) => pendingEvents.add(event);
      Iterable<ResearchStreamEvent> drainEvents() sync* {
        while (pendingEvents.isNotEmpty) {
          yield pendingEvents.removeAt(0);
        }
      }

      void enterReading() {
        if (didEnterReading) return;
        didEnterReading = true;
        queueEvent(
          const ResearchStreamEvent(
            type: ResearchStreamEventType.planStep,
            index: 0,
            stepStatus: ResearchPlanStepStatus.completed,
          ),
        );
        if (job.plan.steps.length > 1) {
          queueEvent(
            ResearchStreamEvent(
              type: ResearchStreamEventType.planStep,
              index: 1,
              stepStatus: ResearchPlanStepStatus.active,
              message: job.plan.steps[1].text,
            ),
          );
        }
        queueEvent(
          const ResearchStreamEvent(
            type: ResearchStreamEventType.status,
            status: ResearchStatus.reading,
            message: 'Reading and comparing sources',
          ),
        );
        queueEvent(
          ResearchStreamEvent(
            type: ResearchStreamEventType.activity,
            activity: ResearchActivityRecord(
              phase: 'reading',
              title: 'Reading and comparing sources',
              timestamp: DateTime.now(),
            ),
          ),
        );
      }

      void enterSynthesis() {
        if (didEnterSynthesis) return;
        didEnterSynthesis = true;
        if (!didEnterReading) enterReading();
        if (job.plan.steps.length > 1) {
          queueEvent(
            const ResearchStreamEvent(
              type: ResearchStreamEventType.planStep,
              index: 1,
              stepStatus: ResearchPlanStepStatus.completed,
            ),
          );
        }
        if (job.plan.steps.length > 2) {
          queueEvent(
            ResearchStreamEvent(
              type: ResearchStreamEventType.planStep,
              index: 2,
              stepStatus: ResearchPlanStepStatus.active,
              message: job.plan.steps[2].text,
            ),
          );
        }
        queueEvent(
          const ResearchStreamEvent(
            type: ResearchStreamEventType.status,
            status: ResearchStatus.synthesizing,
            message: 'Synthesizing answer',
          ),
        );
        queueEvent(
          ResearchStreamEvent(
            type: ResearchStreamEventType.activity,
            activity: ResearchActivityRecord(
              phase: 'synthesizing',
              title: 'Synthesizing cited answer',
              timestamp: DateTime.now(),
            ),
          ),
        );
      }

      yield const ResearchStreamEvent(
        type: ResearchStreamEventType.status,
        status: ResearchStatus.searching,
        message: 'Searching the web',
      );
      yield ResearchStreamEvent(
        type: ResearchStreamEventType.activity,
        activity: ResearchActivityRecord(
          phase: 'planning',
          title: 'Research plan accepted',
          detail: job.plan.title,
          timestamp: DateTime.now(),
        ),
      );
      if (job.plan.steps.isNotEmpty) {
        yield ResearchStreamEvent(
          type: ResearchStreamEventType.planStep,
          index: 0,
          stepStatus: ResearchPlanStepStatus.active,
          message: job.plan.steps.first.text,
        );
      }
      yield ResearchStreamEvent(
        type: ResearchStreamEventType.activity,
        activity: ResearchActivityRecord(
          phase: 'searching',
          title: 'Searching for relevant sources',
          timestamp: DateTime.now(),
        ),
      );

      final searchStartedAt = DateTime.now();
      final directSources = await _directSearch(job);
      mergeSources(directSources, queueEvent);
      if (directSources.isNotEmpty) {
        yield ResearchStreamEvent(
          type: ResearchStreamEventType.activity,
          activity: ResearchActivityRecord(
            phase: 'searching',
            title: 'Source candidates ready',
            detail:
                '${directSources.length} candidate${directSources.length == 1 ? '' : 's'} from DuckDuckGo/Bing in ${DateTime.now().difference(searchStartedAt).inSeconds.clamp(1, 99)}s.',
            timestamp: DateTime.now(),
          ),
        );
        enterReading();
      } else {
        yield ResearchStreamEvent(
          type: ResearchStreamEventType.activity,
          activity: ResearchActivityRecord(
            phase: 'debug',
            title: 'Direct source scout unavailable',
            detail: 'Continuing with provider-native web search.',
            timestamp: DateTime.now(),
          ),
        );
      }
      for (final event in drainEvents()) {
        yield event;
      }

      if (sources.length < 4) {
        final providerSources = await _providerSourceScout(job);
        mergeSources(providerSources, queueEvent);
        if (providerSources.isNotEmpty) enterReading();
        for (final event in drainEvents()) {
          yield event;
        }
      }

      if (_cancelledJobIds.contains(jobId)) {
        yield ResearchStreamEvent(
          type: ResearchStreamEventType.stopped,
          text: content,
          sources: sources,
        );
        return;
      }

      yield ResearchStreamEvent(
        type: ResearchStreamEventType.activity,
        activity: ResearchActivityRecord(
          phase: 'synthesizing',
          title: 'Writing final answer',
          detail:
              'Using ${sources.length} source candidate${sources.length == 1 ? '' : 's'}.',
          timestamp: DateTime.now(),
        ),
      );

      await for (final event in _chatClient.stream(
        ChatGenerationRequest(
          model: job.model,
          styleId: job.styleId,
          history: job.history,
          thinkingEnabled: true,
          webSearchEnabled: true,
          webSearchForced: true,
          deepResearchEnabled: true,
          instructionSuffix: _directResearchInstruction(job.plan, sources),
        ),
      )) {
        if (_cancelledJobIds.contains(jobId)) {
          _chatClient.stop();
          yield ResearchStreamEvent(
            type: ResearchStreamEventType.stopped,
            text: content,
            sources: sources,
          );
          return;
        }
        if (event.type == ChatStreamEventType.webSearch) {
          yield ResearchStreamEvent(
            type: ResearchStreamEventType.activity,
            activity: ResearchActivityRecord(
              phase: 'search',
              title: event.status ?? 'Searched',
              detail: event.queries.isEmpty ? null : event.queries.join(', '),
              timestamp: DateTime.now(),
            ),
          );
          continue;
        }
        if (event.type != ChatStreamEventType.text || event.text.isEmpty) {
          continue;
        }
        enterSynthesis();
        mergeSources(_extractSourcesFromText(event.text), queueEvent);
        for (final pending in drainEvents()) {
          yield pending;
        }
        content += event.text;
        yield ResearchStreamEvent(
          type: ResearchStreamEventType.text,
          text: content,
        );
      }
      if (!didEnterSynthesis) {
        enterSynthesis();
        for (final event in drainEvents()) {
          yield event;
        }
      }
      for (var index = 2; index < job.plan.steps.length; index++) {
        yield ResearchStreamEvent(
          type: ResearchStreamEventType.planStep,
          index: index,
          stepStatus: ResearchPlanStepStatus.completed,
        );
      }
      yield ResearchStreamEvent(
        type: ResearchStreamEventType.completed,
        text: content,
        sources: sources,
      );
    } catch (error) {
      yield ResearchStreamEvent(
        type: ResearchStreamEventType.error,
        error: '$error',
      );
    } finally {
      _jobs.remove(jobId);
      _cancelledJobIds.remove(jobId);
    }
  }

  @override
  Future<void> cancelJob(String jobId) async {
    _cancelledJobIds.add(jobId);
    _chatClient.stop();
  }

  @override
  void stop() {
    _cancelledJobIds.addAll(_jobs.keys);
    _chatClient.stop();
  }

  Future<String> _providerText({
    required String model,
    required ProviderId provider,
    required String instruction,
    required String input,
    required double temperature,
    required bool webSearchEnabled,
  }) async {
    if (provider == ProviderId.gemini) {
      final apiKey = await _credentials.geminiApiKey();
      if (apiKey.isEmpty) throw StateError('GEMINI_API_KEY is missing.');
      final response = await _dio.postUri<Map<String, dynamic>>(
        Uri.https(
          'generativelanguage.googleapis.com',
          '/v1beta/models/$model:generateContent',
          {'key': apiKey},
        ),
        data: {
          'contents': [
            {
              'role': 'user',
              'parts': [
                {'text': input},
              ],
            },
          ],
          'systemInstruction': {
            'parts': [
              {'text': instruction},
            ],
          },
          'generationConfig': {'temperature': temperature},
          if (webSearchEnabled)
            'tools': [
              {'googleSearch': {}},
            ],
        },
        options: Options(validateStatus: (_) => true),
      );
      _throwForStatus(response, 'Research provider request');
      return _extractGeminiText(response.data);
    }
    if (provider == ProviderId.openrouter) {
      final apiKey = await _credentials.openRouterApiKey();
      if (apiKey.isEmpty) throw StateError('OPENROUTER_API_KEY is missing.');
      final response = await _dio.postUri<Map<String, dynamic>>(
        Uri.https('openrouter.ai', '/api/v1/chat/completions'),
        data: {
          'model': model,
          'messages': [
            {'role': 'system', 'content': instruction},
            {'role': 'user', 'content': input},
          ],
          'temperature': temperature,
          if (webSearchEnabled)
            'tools': [
              {
                'type': 'openrouter:web_search',
                'parameters': {'max_results': 5, 'max_total_results': 12},
              },
            ],
          if (webSearchEnabled) 'tool_choice': 'auto',
        },
        options: Options(
          headers: {
            'Authorization': 'Bearer $apiKey',
            'HTTP-Referer': 'https://privora.local',
            'X-Title': 'Privora',
          },
          validateStatus: (_) => true,
        ),
      );
      _throwForStatus(response, 'Research provider request');
      return _extractOpenRouterText(response.data);
    }
    final baseUrl = await _credentials.cliproxyEndpoint();
    final response = await _dio.postUri<Map<String, dynamic>>(
      Uri.parse(baseUrl).resolve('/v1/responses'),
      data: {
        'model': model,
        'instructions': instruction,
        'input': [
          {
            'role': 'user',
            'content': [
              {'type': 'input_text', 'text': input},
            ],
          },
        ],
        'temperature': temperature,
        if (webSearchEnabled)
          'tools': [
            {'type': 'web_search_preview'},
          ],
        if (webSearchEnabled) 'reasoning': {'effort': 'low', 'summary': 'auto'},
      },
      options: Options(
        headers: {'Authorization': 'Bearer dummy-key'},
        validateStatus: (_) => true,
      ),
    );
    _throwForStatus(response, 'Research provider request');
    return _extractCliproxyText(response.data);
  }

  void _throwForStatus(Response response, String label) {
    final statusCode = response.statusCode ?? 0;
    if (statusCode >= 200 && statusCode < 300) return;
    throw StateError('$label failed with $statusCode: ${response.data}');
  }

  Future<List<ResearchSourceRecord>> _directSearch(_DirectResearchJob job) {
    final queries = _directQueries(job);
    return Future.wait([
      for (final query in queries.take(3)) ...[
        _fetchSearchResults(query, 'duckduckgo'),
        _fetchSearchResults(query, 'bing'),
      ],
    ]).then((groups) => _uniqueSources(groups.expand((group) => group)));
  }

  List<String> _directQueries(_DirectResearchJob job) {
    final base = job.plan.refinedPrompt
        .replaceAll(RegExp(r'\s+'), ' ')
        .replaceAll(RegExp(r'[^\w\s".:-]'), ' ')
        .trim();
    final title = job.plan.title.trim();
    final firstStep = job.plan.steps.isEmpty ? '' : job.plan.steps.first.text;
    return [
      if (base.isNotEmpty) base,
      if (title.isNotEmpty && title != base) title,
      if (firstStep.isNotEmpty) '$base $firstStep',
    ].where((query) => query.trim().length > 3).toList();
  }

  Future<List<ResearchSourceRecord>> _fetchSearchResults(
    String query,
    String engine,
  ) async {
    try {
      final uri = engine == 'bing'
          ? Uri.https('www.bing.com', '/search', {'q': query})
          : Uri.https('duckduckgo.com', '/html/', {'q': query});
      final response = await _dio.getUri<String>(
        uri,
        options: Options(
          responseType: ResponseType.plain,
          validateStatus: (_) => true,
        ),
      );
      if ((response.statusCode ?? 0) < 200 ||
          (response.statusCode ?? 0) >= 300) {
        return const [];
      }
      return _parseSearchHtml(response.data ?? '', engine);
    } catch (error) {
      _debugResearchLog('search $engine failed: $error');
      return const [];
    }
  }

  List<ResearchSourceRecord> _parseSearchHtml(String html, String engine) {
    final results = <ResearchSourceRecord>[];
    final linkPattern = RegExp(
      r'<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>',
      caseSensitive: false,
    );
    for (final match in linkPattern.allMatches(html)) {
      if (results.length >= 8) break;
      final rawHref = _decodeHtml(match.group(1) ?? '');
      final url = _normalizeSearchUrl(rawHref);
      if (url == null || _isSearchNoise(url)) continue;
      final title = _cleanHtml(match.group(2) ?? '');
      results.add(
        ResearchSourceRecord(
          url: url,
          title: title.isEmpty ? null : title,
          provider: engine == 'bing' ? 'Bing' : 'DuckDuckGo',
        ),
      );
    }
    return _uniqueSources(results);
  }

  Future<List<ResearchSourceRecord>> _providerSourceScout(
    _DirectResearchJob job,
  ) async {
    try {
      final text = await _providerText(
        model: job.model,
        provider: job.provider,
        instruction:
            'You are a source discovery agent. Use web search when available. Return only source titles and full URLs for the research task.',
        input: _formatSourceScoutPrompt(job),
        temperature: 0.1,
        webSearchEnabled: true,
      );
      return _extractSourcesFromText(
        text,
        provider: switch (job.provider) {
          ProviderId.gemini => 'Google Search scout',
          ProviderId.openrouter => 'OpenRouter web search scout',
          ProviderId.cliproxy => 'Web search scout',
        },
      );
    } catch (error) {
      _debugResearchLog('provider source scout failed: $error');
      return const [];
    }
  }

  String _formatSourceScoutPrompt(_DirectResearchJob job) => [
    'Find authoritative, relevant web sources before writing the final answer.',
    'Prefer official product/company pages, primary documentation, reputable reviews, benchmark/testing outlets, and current market/pricing sources when relevant.',
    'Return a concise list of source titles and full URLs only. Do not write the final answer yet.',
    if (job.plan.refinedPrompt.trim().isNotEmpty)
      '\nResearch goal:\n${job.plan.refinedPrompt.trim()}',
    if (job.plan.steps.isNotEmpty)
      '\nResearch plan:\n${[for (var index = 0; index < job.plan.steps.length; index++) '${index + 1}. ${job.plan.steps[index].text}'].join('\n')}',
  ].join('\n').trim();

  List<ResearchSourceRecord> _extractSourcesFromText(
    String text, {
    String provider = 'Generated citation',
  }) {
    final urls =
        RegExp(
          r'https?://[^\s)\]}>"'
          ']+',
        ).allMatches(text).map((match) {
          return match.group(0)!.replaceAll(RegExp(r'[.,;:!?]+$'), '');
        });
    return _uniqueSources([
      for (final url in urls)
        ResearchSourceRecord(url: url, provider: provider),
    ]);
  }

  List<ResearchSourceRecord> _uniqueSources(
    Iterable<ResearchSourceRecord> all,
  ) {
    final seen = <String>{};
    return [
      for (final source in all)
        if (source.url.isNotEmpty && seen.add(source.url)) source,
    ];
  }

  String? _normalizeSearchUrl(String href) {
    if (href.startsWith('//')) href = 'https:$href';
    final uri = Uri.tryParse(href);
    if (uri == null) return null;
    if (uri.host.contains('duckduckgo.com')) {
      final uddg = uri.queryParameters['uddg'];
      if (uddg != null && uddg.startsWith('http')) return Uri.decodeFull(uddg);
    }
    if (!href.startsWith('http://') && !href.startsWith('https://')) {
      return null;
    }
    return href;
  }

  bool _isSearchNoise(String url) {
    final host = Uri.tryParse(url)?.host.toLowerCase() ?? '';
    return host.contains('duckduckgo.com') ||
        host.contains('bing.com') ||
        host.contains('microsoft.com') ||
        host.contains('go.microsoft.com');
  }

  String _cleanHtml(String html) => _decodeHtml(
    html
        .replaceAll(
          RegExp(r'<script[\s\S]*?</script>', caseSensitive: false),
          '',
        )
        .replaceAll(RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), '')
        .replaceAll(RegExp(r'<[^>]+>'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim(),
  );

  String _decodeHtml(String input) => input
      .replaceAll('&amp;', '&')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>');

  String _sourceLabel(String url) {
    final uri = Uri.tryParse(url);
    if (uri == null || uri.host.isEmpty) return url;
    return uri.host.replaceFirst(RegExp(r'^www\.'), '');
  }

  Map<String, dynamic> _extractJsonObject(String text) {
    final trimmed = text.trim();
    final fenced = RegExp(
      r'```(?:json)?\s*([\s\S]*?)```',
      caseSensitive: false,
    ).firstMatch(trimmed)?.group(1)?.trim();
    final candidate = fenced ?? trimmed;
    try {
      return jsonDecode(candidate) as Map<String, dynamic>;
    } catch (_) {
      final start = candidate.indexOf('{');
      final end = candidate.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return jsonDecode(candidate.substring(start, end + 1))
            as Map<String, dynamic>;
      }
      throw StateError('Research preflight did not return valid JSON.');
    }
  }

  ResearchPreflightResult _normalizePreflightResult(Map<String, dynamic> raw) {
    final rawDecision = raw['decision'];
    final decision =
        rawDecision == 'ready' ||
            rawDecision == 'clarify' ||
            rawDecision == 'normal'
        ? rawDecision as String
        : 'clarify';
    final rawPlan = raw['plan'] is Map ? raw['plan'] as Map : null;
    final planSteps = rawPlan?['steps'] is List
        ? (rawPlan!['steps'] as List)
              .whereType<String>()
              .map((step) => step.trim())
              .where((step) => step.isNotEmpty)
              .take(7)
              .toList()
        : raw['plan'] is String
        ? (raw['plan'] as String)
              .split(RegExp(r'\n+'))
              .map(
                (line) => line.replaceFirst(RegExp(r'^[-*\d.)\s]+'), '').trim(),
              )
              .where((line) => line.isNotEmpty)
              .take(7)
              .toList()
        : const <String>[];
    final fallbackSteps = const [
      'Collect authoritative sources.',
      'Compare the strongest available evidence.',
      'Check contradictions and stale information.',
      'Synthesize a cited answer.',
    ];
    return ResearchPreflightResult(
      decision: decision,
      assistantMessage: (raw['assistantMessage'] as String?)?.trim(),
      questions: raw['questions'] is List
          ? (raw['questions'] as List)
                .whereType<String>()
                .map((question) => question.trim())
                .where((question) => question.isNotEmpty)
                .take(4)
                .toList()
          : const [],
      title: decision == 'ready'
          ? ((rawPlan?['title'] as String?)?.trim().isNotEmpty == true
                ? (rawPlan!['title'] as String).trim()
                : 'Deep Research')
          : null,
      steps: decision == 'ready'
          ? (planSteps.length >= 4 ? planSteps : fallbackSteps)
          : const [],
      refinedPrompt: decision == 'ready'
          ? ((rawPlan?['refinedPrompt'] as String?)?.trim().isNotEmpty == true
                ? (rawPlan!['refinedPrompt'] as String).trim()
                : (raw['refinedPrompt'] as String?)?.trim())
          : (raw['refinedPrompt'] as String?)?.trim(),
      confidence: (raw['confidence'] as num?)?.toDouble(),
    );
  }

  String _buildPreflightInput({
    required String styleId,
    required PendingResearchIntentRecord? pendingIntent,
    required List<ChatMessageRecord> history,
  }) => const JsonEncoder.withIndent('  ').convert({
    'selectedStyle': styleId,
    'pendingResearchIntent': pendingIntent == null
        ? null
        : {
            'originalGoal': pendingIntent.originalGoal,
            'clarificationQuestions': pendingIntent.clarificationQuestions,
            'userAnswers': pendingIntent.userAnswers,
            'researchPlan': pendingIntent.researchPlan,
            'refinedPrompt': pendingIntent.refinedPrompt,
          },
    'conversation': [
      for (final message in history)
        {
          'role': message.role == 'model' ? 'assistant' : 'user',
          'content': message.content,
        },
    ],
  });

  String _extractGeminiText(Map<String, dynamic>? data) {
    final parts =
        (((data?['candidates'] as List?)?.firstOrNull
                    as Map<String, dynamic>?)?['content']
                as Map<String, dynamic>?)?['parts']
            as List? ??
        const [];
    return parts
        .whereType<Map>()
        .map((part) => part['text'])
        .whereType<String>()
        .join();
  }

  String _extractOpenRouterText(Map<String, dynamic>? data) {
    final message =
        ((data?['choices'] as List?)?.firstOrNull as Map?)?['message'] as Map?;
    final content = message?['content'];
    if (content is String) return content;
    if (content is List) {
      return content
          .whereType<Map>()
          .map((part) => part['text'] ?? part['content'])
          .whereType<String>()
          .join('\n');
    }
    return '';
  }

  String _extractCliproxyText(Map<String, dynamic>? data) {
    final outputText = data?['output_text'];
    if (outputText is String) return outputText;
    final output = data?['output'];
    if (output is! List) return '';
    return output
        .whereType<Map>()
        .expand(
          (item) => (item['content'] as List? ?? const []).whereType<Map>(),
        )
        .map((part) => part['text'] ?? part['content'])
        .whereType<String>()
        .join('\n');
  }

  void _debugResearchLog(String message) {
    if (kDebugMode) debugPrint('[Privora Research] $message');
  }
}

class _DirectResearchJob {
  const _DirectResearchJob({
    required this.model,
    required this.provider,
    required this.styleId,
    required this.history,
    required this.plan,
  });

  final String model;
  final ProviderId provider;
  final String styleId;
  final List<ChatMessageRecord> history;
  final ResearchPlanRecord plan;
}

String _directResearchInstruction(
  ResearchPlanRecord plan,
  List<ResearchSourceRecord> sources,
) =>
    '''
$_deepResearchInstruction

Follow this accepted research plan:
${[for (var index = 0; index < plan.steps.length; index++) '${index + 1}. ${plan.steps[index].text}'].join('\n')}

Research goal:
${plan.refinedPrompt}

${sources.isEmpty ? '' : 'Already gathered source candidates:\n${[for (var index = 0; index < sources.length && index < 20; index++) '${index + 1}. ${sources[index].title ?? sources[index].url}${sources[index].provider == null ? '' : ' (${sources[index].provider})'}\n   ${sources[index].url}'].join('\n')}\n\nUse these candidates first. Verify important claims with provider-native web search/grounding and add stronger sources only when needed.'}

Return a final answer with compact citations and a short source list when source URLs are available.
''';

const _deepResearchInstruction = '''# Deep Research mode
- Treat the task as a research job, not a normal quick answer.
- Use web search/grounding. Compare multiple sources when available and do not rely on a single weak result.
- Prefer primary or authoritative sources. Distinguish confirmed facts from inference.
- Track contradictions, stale information, and uncertainty explicitly.
- Cite sources inline using compact numbered references like [1], [2] when source URLs are available.
- End with a short "Sources" section listing source titles and URLs when sources are available.
- The selected response style may shape tone, but accuracy, source discipline, and clarity override style.
- If the selected style is Concise, keep the synthesis shorter while preserving citations.
- If the selected style is Creative, use more expressive wording only where it does not weaken factual precision.
- If the selected style is Formal, use a polished report tone.
- If the selected style is Human, explain naturally while keeping evidence visible.
- Do not use emoji in research summaries, citations, or source lists unless the user explicitly requests it.''';

const _deepResearchPreflightInstruction = '''# Deep Research preflight
You decide whether Privora should start a Deep Research job yet.

Return only valid JSON with this schema:
{
  "decision": "normal" | "clarify" | "ready",
  "assistantMessage": "string",
  "questions": ["string"],
  "plan": {
    "title": "string",
    "steps": ["string"],
    "refinedPrompt": "string"
  },
  "refinedPrompt": "string",
  "confidence": 0.0
}

Decision rules:
- Use "normal" for greetings, casual chat, tiny requests, simple transformations, or anything that should not spend a research run.
- Use "clarify" when the user wants research but the goal, audience, timeframe, geography, comparison criteria, output shape, or constraints are missing.
- Use "ready" when the request is specific enough to research without wasting time.
- If a pending research intent already exists and the latest user message answers the questions or confirms the plan, use "ready".
- Ask only useful questions. Do not ask busywork questions.
- For "clarify", ask 2-4 concise questions and keep assistantMessage natural.
- For "ready", produce a compact structured plan with a specific title, 4-7 concrete steps, and a refinedPrompt that combines the original goal, relevant context, and user answers.
- For "normal", assistantMessage should respond naturally or ask what the user wants researched, but it must not mention internal classification.
- Emoji may be used only for normal casual chat in Human or Creative style. Never use emoji in a research plan, citations, or factual summary.''';
