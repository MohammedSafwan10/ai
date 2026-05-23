import 'package:flutter_test/flutter_test.dart';
import 'package:privora_mobile/src/features/chat/data/attachment_rules.dart';
import 'package:privora_mobile/src/models/privora_models.dart';

void main() {
  test('attachment validation follows selected provider limits', () {
    const pdf = AttachmentRecord(
      url: 'report.pdf',
      mimeType: 'application/pdf',
      name: 'report.pdf',
      size: 1024,
    );
    const heic = AttachmentRecord(
      url: 'photo.heic',
      mimeType: 'image/heic',
      name: 'photo.heic',
      size: 1024,
    );

    expect(validateAttachments([pdf], ProviderId.gemini), isNull);
    expect(validateAttachments([pdf], ProviderId.cliproxy), isNull);
    expect(
      validateAttachments([pdf], ProviderId.openrouter),
      contains('text-only'),
    );
    expect(validateAttachments([heic], ProviderId.gemini), isNull);
    expect(
      validateAttachments([heic], ProviderId.cliproxy),
      contains('does not support'),
    );
  });
}
