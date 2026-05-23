import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

const configuredCliproxyBaseUrl = String.fromEnvironment(
  'CLIPROXY_BASE_URL',
  defaultValue: '',
);

String _env(String key, {String dartDefine = ''}) {
  final fromDotenv = dotenv.maybeGet(key)?.trim();
  if (fromDotenv != null && fromDotenv.isNotEmpty) {
    return _unquote(fromDotenv);
  }
  return _unquote(dartDefine.trim());
}

String _unquote(String value) {
  if (value.length < 2) return value;
  final first = value.codeUnitAt(0);
  final last = value.codeUnitAt(value.length - 1);
  if ((first == 34 && last == 34) || (first == 39 && last == 39)) {
    return value.substring(1, value.length - 1);
  }
  return value;
}

String envGeminiApiKey() => _env(
  'GEMINI_API_KEY',
  dartDefine: const String.fromEnvironment('GEMINI_API_KEY'),
);

String envOpenRouterApiKey() => _env(
  'OPENROUTER_API_KEY',
  dartDefine: const String.fromEnvironment('OPENROUTER_API_KEY'),
);

String envCliproxyBaseUrl() =>
    _env('CLIPROXY_BASE_URL', dartDefine: configuredCliproxyBaseUrl);

String defaultCliproxyBaseUrl() {
  if (configuredCliproxyBaseUrl.isNotEmpty) return configuredCliproxyBaseUrl;
  return 'http://127.0.0.1:8317';
}

enum ApiCredential {
  geminiApiKey('gemini_api_key'),
  openRouterApiKey('openrouter_api_key'),
  cliproxyEndpoint('cliproxy_endpoint');

  const ApiCredential(this.storageKey);
  final String storageKey;
}

abstract interface class SecureKeyValueStore {
  Future<void> write({required String key, required String value});
  Future<String?> read({required String key});
  Future<void> delete({required String key});
  Future<bool> containsKey({required String key});
}

class FlutterSecureKeyValueStore implements SecureKeyValueStore {
  const FlutterSecureKeyValueStore(this._storage);

  final FlutterSecureStorage _storage;

  @override
  Future<void> write({required String key, required String value}) {
    return _storage.write(key: key, value: value);
  }

  @override
  Future<String?> read({required String key}) {
    return _storage.read(key: key);
  }

  @override
  Future<void> delete({required String key}) {
    return _storage.delete(key: key);
  }

  @override
  Future<bool> containsKey({required String key}) {
    return _storage.containsKey(key: key);
  }
}

class SecureCredentialRepository {
  const SecureCredentialRepository(this._store);

  final SecureKeyValueStore _store;

  Future<void> save(ApiCredential credential, String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return delete(credential);
    return _store.write(key: credential.storageKey, value: trimmed);
  }

  Future<String?> read(ApiCredential credential) {
    return _store.read(key: credential.storageKey);
  }

  Future<void> delete(ApiCredential credential) {
    return _store.delete(key: credential.storageKey);
  }

  Future<bool> has(ApiCredential credential) {
    return _store.containsKey(key: credential.storageKey);
  }

  Future<String> geminiApiKey() async {
    final stored = await read(ApiCredential.geminiApiKey);
    return stored?.trim().isNotEmpty == true
        ? stored!.trim()
        : envGeminiApiKey();
  }

  Future<String> openRouterApiKey() async {
    final stored = await read(ApiCredential.openRouterApiKey);
    return stored?.trim().isNotEmpty == true
        ? stored!.trim()
        : envOpenRouterApiKey();
  }

  Future<String> cliproxyEndpoint() async {
    final stored = await read(ApiCredential.cliproxyEndpoint);
    if (stored?.trim().isNotEmpty == true) {
      final endpoint = stored!.trim();
      _debugCredentialLog(
        'CLIProxy endpoint source=secure-storage value=$endpoint',
      );
      return endpoint;
    }
    final endpoint = envCliproxyBaseUrl();
    if (endpoint.isNotEmpty) {
      _debugCredentialLog('CLIProxy endpoint source=env value=$endpoint');
      return endpoint;
    }
    final fallback = defaultCliproxyBaseUrl();
    _debugCredentialLog('CLIProxy endpoint source=default value=$fallback');
    return fallback;
  }

  void _debugCredentialLog(String message) {
    if (kDebugMode) debugPrint('[Privora AI] $message');
  }
}

final secureKeyValueStoreProvider = Provider<SecureKeyValueStore>((ref) {
  return const FlutterSecureKeyValueStore(
    FlutterSecureStorage(
      aOptions: AndroidOptions(resetOnError: true),
      iOptions: IOSOptions(
        accessibility: KeychainAccessibility.unlocked_this_device,
      ),
    ),
  );
});

final secureCredentialRepositoryProvider = Provider<SecureCredentialRepository>(
  (ref) {
    return SecureCredentialRepository(ref.watch(secureKeyValueStoreProvider));
  },
);
