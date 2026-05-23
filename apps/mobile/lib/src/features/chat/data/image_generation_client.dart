import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../data/secure/secure_credential_repository.dart';
import '../../../models/privora_models.dart';

class ImageGenerationRequest {
  const ImageGenerationRequest({
    required this.mode,
    required this.prompt,
    required this.images,
    required this.settings,
  });

  final String mode;
  final String prompt;
  final List<AttachmentRecord> images;
  final ImageSettings settings;
}

class ImageGenerationEvent {
  const ImageGenerationEvent({
    required this.index,
    required this.base64,
    required this.mimeType,
    required this.outputFormat,
    required this.isPartial,
  });

  final int index;
  final String base64;
  final String mimeType;
  final String outputFormat;
  final bool isPartial;
}

abstract interface class ImageGenerationClient {
  Stream<ImageGenerationEvent> generate(ImageGenerationRequest request);
  void stop();
}

final imageGenerationClientProvider = Provider<ImageGenerationClient>((ref) {
  return GatewayImageGenerationClient(
    ref.watch(secureCredentialRepositoryProvider),
  );
});

class GatewayImageGenerationClient implements ImageGenerationClient {
  GatewayImageGenerationClient(this._credentials);

  final SecureCredentialRepository _credentials;
  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 45),
      sendTimeout: const Duration(seconds: 45),
    ),
  );
  CancelToken? _activeCancelToken;

  @override
  void stop() {
    _activeCancelToken?.cancel('Image request stopped.');
    _activeCancelToken = null;
  }

  @override
  Stream<ImageGenerationEvent> generate(ImageGenerationRequest request) async* {
    stop();
    final cancelToken = CancelToken();
    _activeCancelToken = cancelToken;
    final isGemini = request.settings.model.startsWith('gemini-');
    Uri? uri;
    try {
      if (isGemini) {
        uri = await _geminiUri(request);
        _debugAiLog(
          'image request provider=gemini model=${request.settings.model} url=${_redactedUri(uri)}',
        );
        final response = await _dio.postUri<Object?>(
          uri,
          data: _geminiBody(request),
          options: Options(
            contentType: Headers.jsonContentType,
            responseType: ResponseType.json,
            validateStatus: (_) => true,
          ),
          cancelToken: cancelToken,
        );
        final statusCode = response.statusCode ?? 0;
        _debugAiLog(
          'image response provider=gemini status=$statusCode url=${_redactedUri(uri)}',
        );
        if (statusCode < 200 || statusCode >= 300) {
          throw StateError(
            _responseError(
              response.data,
              'Image request failed with $statusCode.',
            ),
          );
        }
        yield* _readGemini(response.data);
      } else {
        uri = await _cliproxyUri(request);
        _debugAiLog(
          'image request provider=cliproxy model=${request.settings.model} url=${_redactedUri(uri)}',
        );
        final response = await _dio.postUri<ResponseBody>(
          uri,
          data: _cliproxyBody(request),
          options: Options(
            contentType: Headers.jsonContentType,
            headers: const {'Authorization': 'Bearer dummy-key'},
            responseType: ResponseType.stream,
            validateStatus: (_) => true,
          ),
          cancelToken: cancelToken,
        );
        final statusCode = response.statusCode ?? 0;
        _debugAiLog(
          'image response provider=cliproxy status=$statusCode url=${_redactedUri(uri)}',
        );
        final body = response.data;
        if (body == null) throw StateError('Image request returned no body.');
        if (statusCode < 200 || statusCode >= 300) {
          final error = await utf8.decoder
              .bind(body.stream.cast<List<int>>())
              .join();
          throw StateError(
            error.trim().isEmpty
                ? 'Image request failed with $statusCode.'
                : error,
          );
        }
        yield* _readCliproxy(body.stream);
      }
    } on DioException catch (error) {
      if (CancelToken.isCancel(error)) return;
      _debugAiLog(
        'image error provider=${isGemini ? 'gemini' : 'cliproxy'} url=${uri == null ? 'unresolved' : _redactedUri(uri)} type=${error.type} message=${error.message}',
      );
      throw StateError(_dioErrorMessage(error, isGemini, uri));
    } finally {
      if (identical(_activeCancelToken, cancelToken)) _activeCancelToken = null;
    }
  }

  Future<Uri> _geminiUri(ImageGenerationRequest request) async {
    final apiKey = await _credentials.geminiApiKey();
    if (apiKey.isEmpty) throw StateError('GEMINI_API_KEY is missing.');
    return Uri.https(
      'generativelanguage.googleapis.com',
      '/v1beta/models/${request.settings.model}:generateContent',
      {'key': apiKey},
    );
  }

  Future<Uri> _cliproxyUri(ImageGenerationRequest request) async {
    final baseUrl = await _credentials.cliproxyEndpoint();
    final route = request.mode == 'edit'
        ? '/v1/images/edits'
        : '/v1/images/generations';
    return Uri.parse(baseUrl).resolve(route);
  }

  Stream<ImageGenerationEvent> _readGemini(Object? source) async* {
    final json = source is Map
        ? source.cast<String, dynamic>()
        : jsonDecode('$source') as Map<String, dynamic>;
    final candidates = json['candidates'] as List? ?? const [];
    var index = 0;
    for (final candidate in candidates.whereType<Map>()) {
      final content = candidate['content'] as Map?;
      final parts = content?['parts'] as List? ?? const [];
      for (final part in parts.whereType<Map>()) {
        final inlineData =
            part['inlineData'] as Map? ?? part['inline_data'] as Map?;
        final data = inlineData?['data'];
        if (data is! String || data.isEmpty) continue;
        final mimeType =
            '${inlineData?['mimeType'] ?? inlineData?['mime_type'] ?? 'image/png'}';
        yield ImageGenerationEvent(
          index: index++,
          base64: _stripDataPrefix(data),
          mimeType: mimeType,
          outputFormat: mimeType == 'image/webp' ? 'webp' : 'png',
          isPartial: false,
        );
      }
    }
    if (index == 0) {
      final text = jsonEncode(json);
      throw StateError('Gemini returned no image data. Response: $text');
    }
  }

  String _responseError(Object? data, String fallback) {
    if (data == null) return fallback;
    if (data is Map && data['error'] != null) return '${data['error']}';
    final text = '$data'.trim();
    return text.isEmpty ? fallback : text;
  }

  String _dioErrorMessage(DioException error, bool isGemini, Uri? uri) {
    final source = error.error ?? error.message ?? error;
    if (error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout) {
      if (!isGemini) {
        return 'Could not connect to CLIProxy at ${uri ?? 'the configured endpoint'}. '
            'For GPT image generation, start CLIProxy and make sure the phone can reach it. '
            'For USB debugging, run adb reverse tcp:8317 tcp:8317 and set CLIProxy to http://127.0.0.1:8317. For Wi-Fi/LAN, use your computer IP, for example http://192.168.1.10:8317. Details: $source';
      }
      return 'Could not connect to the selected image provider. Check the provider endpoint, network access, and API key. Details: $source';
    }
    return 'Image provider request failed. Details: $source';
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

  Map<String, Object?> _cliproxyBody(ImageGenerationRequest request) => {
    'model': 'gpt-image-2',
    'prompt': request.prompt,
    'stream': true,
    'response_format': 'b64_json',
    'output_format': request.settings.outputFormat,
    'partial_images': request.settings.partialImages,
    'size': imageSizeForPreset(request.settings.sizePreset),
    'quality': request.settings.quality,
    if (request.mode != 'edit') 'n': effectiveImageCount(request.settings),
    if (request.mode == 'edit')
      'images': [
        for (final image in request.images)
          if (image.base64 != null)
            {'image_url': 'data:${image.mimeType};base64,${image.base64}'},
      ],
  };

  Map<String, Object?> _geminiBody(ImageGenerationRequest request) => {
    'contents': [
      {
        'role': 'user',
        'parts': [
          {'text': request.prompt},
          for (final image in request.images)
            if (image.base64 != null)
              {
                'inlineData': {
                  'data': image.base64,
                  'mimeType': image.mimeType,
                },
              },
        ],
      },
    ],
    'generationConfig': {
      'responseModalities': ['IMAGE'],
      'imageConfig': {
        if (geminiAspectRatioForPreset(request.settings.sizePreset) != null)
          'aspectRatio': geminiAspectRatioForPreset(
            request.settings.sizePreset,
          ),
        'imageSize': geminiImageSizeForPreset(request.settings.sizePreset),
      },
    },
  };

  Stream<ImageGenerationEvent> _readCliproxy(Stream<List<int>> body) async* {
    var buffer = '';
    await for (final chunk in utf8.decoder.bind(body.cast<List<int>>())) {
      buffer += chunk;
      final parts = buffer.split(RegExp(r'\r?\n\r?\n'));
      buffer = parts.removeLast();
      for (final event in parts) {
        yield* _eventsFromSse(event);
      }
    }
    if (buffer.trim().isNotEmpty) yield* _eventsFromSse(buffer);
  }

  Stream<ImageGenerationEvent> _eventsFromSse(String raw) async* {
    final lines = raw.split('\n');
    final type = lines
        .where((line) => line.startsWith('event:'))
        .map((line) => line.substring(6).trim())
        .firstOrNull;
    for (final line in lines.where((line) => line.startsWith('data:'))) {
      final payload = line.substring(5).trim();
      if (payload.isEmpty || payload == '[DONE]') continue;
      final data = jsonDecode(payload) as Map<String, dynamic>;
      if (data['error'] != null) throw StateError('${data['error']}');
      final combinedType = '$type ${data['type'] ?? ''}';
      final partial = combinedType.contains('partial_image');
      final results = data['data'] as List? ?? [data];
      for (var fallback = 0; fallback < results.length; fallback++) {
        final item = results[fallback] as Map? ?? const {};
        final value =
            item['b64_json'] ?? item['url'] ?? data['partial_image_b64'];
        if (value is! String || value.isEmpty) continue;
        final format =
            '${item['output_format'] ?? data['output_format'] ?? 'png'}';
        yield ImageGenerationEvent(
          index:
              (item['index'] as num?)?.toInt() ??
              (data['index'] as num?)?.toInt() ??
              fallback,
          base64: _stripDataPrefix(value),
          mimeType: format == 'webp' ? 'image/webp' : 'image/png',
          outputFormat: format,
          isPartial: partial,
        );
      }
    }
  }
}

int effectiveImageCount(ImageSettings settings) =>
    const {
      'square_2k',
      'widescreen_4k',
      'story_4k',
      'auto',
    }.contains(settings.sizePreset)
    ? 1
    : settings.count.clamp(1, 4);

String imageSizeForPreset(String preset) => switch (preset) {
  'square_2k' => '2048x2048',
  'landscape' => '1536x1024',
  'widescreen' => '2048x1152',
  'widescreen_4k' => '3840x2160',
  'portrait' => '1024x1536',
  'story_4k' => '2160x3840',
  'auto' => 'auto',
  _ => '1024x1024',
};

String? geminiAspectRatioForPreset(String preset) => switch (preset) {
  'landscape' => '3:2',
  'widescreen' || 'widescreen_4k' => '16:9',
  'portrait' => '2:3',
  'story_4k' => '9:16',
  'auto' => null,
  _ => '1:1',
};

String geminiImageSizeForPreset(String preset) => switch (preset) {
  'widescreen_4k' || 'story_4k' => '4K',
  'square_2k' || 'widescreen' => '2K',
  _ => '1K',
};

String _stripDataPrefix(String value) =>
    value.startsWith('data:') ? value.substring(value.indexOf(',') + 1) : value;
