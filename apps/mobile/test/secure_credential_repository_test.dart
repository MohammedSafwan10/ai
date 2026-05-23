import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/data/secure/secure_credential_repository.dart';

void main() {
  test(
    'secure credential repository saves, trims, reads, and deletes secrets',
    () async {
      final repository = SecureCredentialRepository(_MemorySecureStore());

      expect(await repository.has(ApiCredential.geminiApiKey), isFalse);

      await repository.save(ApiCredential.geminiApiKey, '  test-key  ');

      expect(await repository.has(ApiCredential.geminiApiKey), isTrue);
      expect(await repository.read(ApiCredential.geminiApiKey), 'test-key');

      await repository.save(ApiCredential.geminiApiKey, '   ');

      expect(await repository.has(ApiCredential.geminiApiKey), isFalse);
      expect(await repository.read(ApiCredential.geminiApiKey), isNull);
    },
  );
}

class _MemorySecureStore implements SecureKeyValueStore {
  final _values = <String, String>{};

  @override
  Future<bool> containsKey({required String key}) async =>
      _values.containsKey(key);

  @override
  Future<void> delete({required String key}) async {
    _values.remove(key);
  }

  @override
  Future<String?> read({required String key}) async => _values[key];

  @override
  Future<void> write({required String key, required String value}) async {
    _values[key] = value;
  }
}
