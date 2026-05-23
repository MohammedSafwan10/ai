import '../../../models/privora_models.dart';

const maxAttachments = 15;
const cliproxyMaxPayloadBytes = 50 * 1024 * 1024;
const geminiMaxInlinePayloadBytes = 20 * 1024 * 1024;

const _cliproxyMimes = {
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/csv',
  'application/json',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/typescript',
  'text/x-typescript',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/rtf',
  'text/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
};
const _cliproxyExtensions = {
  'pdf',
  'txt',
  'md',
  'markdown',
  'json',
  'html',
  'htm',
  'xml',
  'csv',
  'tsv',
  'doc',
  'docx',
  'rtf',
  'odt',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'java',
  'cs',
  'cpp',
  'c',
  'css',
  'sql',
  'log',
  'yml',
  'yaml',
  'toml',
  'ini',
  'sh',
  'bat',
  'ps1',
  'dart',
  'go',
  'rs',
};
const _geminiMimes = {
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/html',
  'text/xml',
  'application/xml',
  'application/json',
  'text/csv',
  'application/csv',
};
const _geminiExtensions = {
  'png',
  'jpg',
  'jpeg',
  'webp',
  'heic',
  'heif',
  'pdf',
  'txt',
  'md',
  'markdown',
  'html',
  'htm',
  'xml',
  'json',
  'csv',
  'tsv',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'java',
  'cs',
  'cpp',
  'c',
  'css',
  'sql',
  'log',
  'yml',
  'yaml',
  'toml',
  'ini',
  'sh',
  'bat',
  'ps1',
  'dart',
  'go',
  'rs',
};

String? validateAttachments(
  List<AttachmentRecord> attachments,
  ProviderId provider,
) {
  if (attachments.length > maxAttachments) {
    return 'You can attach up to $maxAttachments files per message.';
  }
  if (provider == ProviderId.openrouter && attachments.isNotEmpty) {
    return 'OpenRouter free models are text-only in Privora right now. Remove attachments or switch to Gemini/GPT.';
  }
  final supported = provider == ProviderId.cliproxy
      ? _cliproxyMimes
      : _geminiMimes;
  final extensions = provider == ProviderId.cliproxy
      ? _cliproxyExtensions
      : _geminiExtensions;
  for (final attachment in attachments) {
    final extension = attachment.name.split('.').last.toLowerCase();
    if (!supported.contains(attachment.mimeType) &&
        !extensions.contains(extension)) {
      return provider == ProviderId.cliproxy
          ? 'GPT through CLIProxy does not support "${attachment.name}". Remove it or switch models.'
          : 'Gemini does not support "${attachment.name}" here. Convert it to PDF or text first.';
    }
  }
  final totalBytes = attachments.fold<int>(
    0,
    (total, attachment) => total + (attachment.size ?? 0),
  );
  if (provider == ProviderId.cliproxy && totalBytes > cliproxyMaxPayloadBytes) {
    return 'GPT file input is limited to 50 MB total per request.';
  }
  if (provider == ProviderId.gemini &&
      totalBytes > geminiMaxInlinePayloadBytes) {
    return 'Gemini inline uploads are kept under 20 MB in this app.';
  }
  return null;
}

String inferredMimeType(String filename, [String? reportedType]) {
  if (reportedType != null && reportedType.trim().isNotEmpty) {
    return reportedType;
  }
  final extension = filename.split('.').last.toLowerCase();
  return switch (extension) {
    'png' => 'image/png',
    'jpg' || 'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    'gif' => 'image/gif',
    'heic' => 'image/heic',
    'heif' => 'image/heif',
    'pdf' => 'application/pdf',
    'md' || 'markdown' => 'text/markdown',
    'json' => 'application/json',
    'csv' => 'text/csv',
    'html' || 'htm' => 'text/html',
    'css' => 'text/css',
    'js' || 'jsx' => 'text/javascript',
    'ts' || 'tsx' => 'application/typescript',
    _ => 'text/plain',
  };
}
