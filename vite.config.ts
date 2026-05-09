import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {GoogleGenAI, ThinkingLevel} from '@google/genai';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'path';
import pino, {type Logger} from 'pino';
import {randomUUID} from 'node:crypto';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import {geminiArtifactFunctionDeclaration} from './src/lib/artifacts';
import {getOpenRouterModelCapabilities, modelSupportsOpenRouterParameter} from './src/lib/openrouter/models';

const readJsonBody = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
};

const sendJson = (res: ServerResponse, statusCode: number, body: unknown) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const extractGeminiInlineImages = (response: any) => {
  const parts = response?.candidates?.[0]?.content?.parts || response?.parts || [];
  return parts
    .map((part: any, index: number) => {
      const inlineData = part?.inlineData || part?.inline_data;
      const data = inlineData?.data;
      if (!data) return null;
      const mimeType = inlineData?.mimeType || inlineData?.mime_type || 'image/png';
      const outputFormat = mimeType.includes('webp') ? 'webp' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpeg' : 'png';
      return {base64: data, mimeType, outputFormat, index};
    })
    .filter(Boolean);
};

type ResearchStatus = 'queued' | 'searching' | 'reading' | 'synthesizing' | 'completed' | 'stopped' | 'failed';

interface ResearchSource {
  title?: string;
  url: string;
  provider?: string;
}

interface ResearchEvidenceNote {
  source: ResearchSource;
  title?: string;
  description?: string;
  excerpt: string;
  wordCount: number;
}

type ResearchPlanStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

interface ResearchActivity {
  phase: string;
  title: string;
  detail?: string;
  source?: ResearchSource;
  timestamp: number;
}

type ResearchEvent =
  | {type: 'status'; status: ResearchStatus; message?: string}
  | {type: 'activity'; activity: ResearchActivity}
  | {type: 'planStep'; index: number; status: ResearchPlanStepStatus; message?: string}
  | {type: 'sources'; sources: ResearchSource[]}
  | {type: 'text'; text: string}
  | {type: 'completed'; text: string; sources?: ResearchSource[]}
  | {type: 'stopped'; text?: string; sources?: ResearchSource[]}
  | {type: 'error'; error: string};

interface ResearchJob {
  id: string;
  body: any;
  events: ResearchEvent[];
  subscribers: Set<ServerResponse>;
  controller: AbortController;
  cancelled: boolean;
  cancelReason?: 'user' | 'timeout';
  completed: boolean;
  text: string;
  sources: ResearchSource[];
}

interface ResearchRuntime {
  run: (job: ResearchJob, emit: (event: ResearchEvent) => void) => Promise<void>;
}

type ResearchPreflightDecision = 'normal' | 'clarify' | 'ready';

interface ResearchPreflightResult {
  decision: ResearchPreflightDecision;
  assistantMessage?: string;
  questions?: string[];
  plan?: {title: string; steps: string[]; refinedPrompt: string};
  refinedPrompt?: string;
  confidence?: number;
}

const uniqueSources = (sources: ResearchSource[]) => {
  const seen = new Set<string>();
  return sources.filter(source => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
};

const toGeminiResearchContents = (messages: any[]) =>
  messages.map(message => ({
    role: message.role === 'model' ? 'model' : 'user',
    parts: [{text: message.content || ''}],
  }));

const toCliproxyResearchInput = (messages: any[]) =>
  messages.map(message => ({
    role: message.role === 'model' ? 'assistant' : 'user',
    content: [{type: message.role === 'model' ? 'output_text' : 'input_text', text: message.content || ''}],
  }));

const extractCliproxyText = (data: any): string => {
  if (data?.response && data.response !== data) return extractCliproxyText(data.response);
  if (data?.result && data.result !== data) return extractCliproxyText(data.result);
  if (typeof data?.output_text === 'string') return data.output_text;
  if (typeof data?.text === 'string') return data.text;
  if (typeof data?.message?.content === 'string') return data.message.content;
  if (Array.isArray(data?.output)) {
    return data.output
      .flatMap((item: any) => item?.content || [])
      .map((content: any) => content?.text || content?.content || '')
      .filter(Boolean)
      .join('\n');
  }
  if (Array.isArray(data?.choices)) {
    return data.choices.map((choice: any) => choice?.message?.content || '').filter(Boolean).join('\n');
  }
  return '';
};

const extractCliproxyStreamTextDelta = (event: string | undefined, data: any): string => {
  if (event?.includes('response.output_text.delta') && typeof data?.delta === 'string') return data.delta;
  if (event?.includes('output_text.delta') && typeof data?.delta === 'string') return data.delta;
  if (typeof data?.delta === 'string' && (data?.type === 'response.output_text.delta' || data?.type === 'output_text.delta')) return data.delta;
  if (typeof data?.text === 'string' && (data?.type === 'text_delta' || data?.type === 'output_text_delta')) return data.text;
  return '';
};

const extractCliproxyStreamFinalText = (event: string | undefined, data: any): string => {
  if (event?.includes('output_text.done') && typeof data?.text === 'string') return data.text;
  if (typeof data?.text === 'string' && (data?.type === 'response.output_text.done' || data?.type === 'output_text.done')) return data.text;
  if (event?.includes('response.completed') || data?.type === 'response.completed') return extractCliproxyText(data);
  return '';
};

const extractOpenRouterText = (data: any): string => {
  if (typeof data?.output_text === 'string') return data.output_text;
  if (typeof data?.text === 'string') return data.text;
  if (typeof data?.message?.content === 'string') return data.message.content;
  if (Array.isArray(data?.choices)) {
    return data.choices
      .map((choice: any) => choice?.message?.content || choice?.text || '')
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

const extractOpenRouterStreamTextDelta = (data: any): string => {
  const delta = data?.choices?.[0]?.delta;
  if (typeof delta?.content === 'string') return delta.content;
  if (typeof data?.delta === 'string') return data.delta;
  return '';
};

const extractOpenRouterStreamFinalText = (data: any): string => {
  if (data?.choices?.[0]?.finish_reason === 'stop') return extractOpenRouterText(data);
  return '';
};

const parseCliproxySseEvent = (rawEvent: string) => {
  const lines = rawEvent.split('\n');
  const event = lines.find(line => line.startsWith('event:'))?.slice('event:'.length).trim();
  const dataLines = lines.filter(line => line.startsWith('data:')).map(line => line.slice('data:'.length).trim());
  return {event, dataLines};
};

const formatResearchPrompt = (body: any, gatheredSources: ResearchSource[] = [], evidenceNotes: ResearchEvidenceNote[] = []) => {
  const prompt = body.plan?.refinedPrompt || body.history?.at?.(-1)?.content || '';
  const steps = Array.isArray(body.plan?.steps)
    ? body.plan.steps.map((step: any, index: number) => `${index + 1}. ${typeof step === 'string' ? step : step?.text || ''}`).join('\n')
    : '';
  const sourceList = uniqueSources(gatheredSources)
    .slice(0, 20)
    .map((source, index) => {
      const label = source.title?.trim() || getSourceLabel(source);
      const provider = source.provider ? ` (${source.provider})` : '';
      return `${index + 1}. ${label}${provider}\n   ${source.url}`;
    })
    .join('\n');
  const evidenceList = evidenceNotes
    .slice(0, 10)
    .map((note, index) => {
      const label = note.title?.trim() || note.source.title?.trim() || getSourceLabel(note.source);
      const description = note.description ? `\n   Summary: ${note.description}` : '';
      return `${index + 1}. ${label}\n   URL: ${note.source.url}${description}\n   Extracted evidence:\n   ${note.excerpt}`;
    })
    .join('\n\n');
  return [
    prompt,
    steps ? `\nResearch plan:\n${steps}` : '',
    evidenceList
      ? `\nPre-read source evidence:\n${evidenceList}\n\nUse this pre-read evidence as the first factual grounding. Still verify uncertain/current claims with provider-native web search when needed.`
      : '',
    sourceList
      ? `\nAlready gathered source candidates:\n${sourceList}\n\nUse these candidates first. Verify important claims with provider-native web search/grounding and add stronger sources only when needed.`
      : '',
    '\nReturn a final answer with compact citations and a short source list when source URLs are available.',
  ].join('\n').trim();
};

const formatSourceScoutPrompt = (body: any) => {
  const prompt = body.plan?.refinedPrompt || body.history?.at?.(-1)?.content || '';
  const steps = Array.isArray(body.plan?.steps)
    ? body.plan.steps.map((step: any, index: number) => `${index + 1}. ${typeof step === 'string' ? step : step?.text || ''}`).join('\n')
    : '';
  return [
    'Find authoritative, relevant web sources before writing the final answer.',
    'Prefer official product/company pages, primary documentation, reputable reviews, benchmark/testing outlets, and current market/pricing sources when relevant.',
    'Return a concise list of source titles and full URLs only. Do not write the final answer yet.',
    prompt ? `\nResearch goal:\n${prompt}` : '',
    steps ? `\nResearch plan:\n${steps}` : '',
  ].join('\n').trim();
};

const extractJsonObject = (text: string): Record<string, any> => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }
    throw new Error('Research preflight did not return valid JSON.');
  }
};

const normalizePreflightResult = (raw: Record<string, any>): ResearchPreflightResult => {
  const decision: ResearchPreflightDecision =
    raw.decision === 'ready' || raw.decision === 'clarify' || raw.decision === 'normal'
      ? raw.decision
      : 'clarify';

  const rawPlan = raw.plan && typeof raw.plan === 'object' ? raw.plan : undefined;
  const planSteps = Array.isArray(rawPlan?.steps)
    ? rawPlan.steps.filter((step: unknown): step is string => typeof step === 'string' && step.trim().length > 0).map(step => step.trim()).slice(0, 7)
    : typeof raw.plan === 'string'
      ? raw.plan.split(/\n+/).map((line: string) => line.replace(/^[-*\d.)\s]+/, '').trim()).filter(Boolean).slice(0, 7)
      : [];

  return {
    decision,
    assistantMessage: typeof raw.assistantMessage === 'string' ? raw.assistantMessage.trim() : undefined,
    questions: Array.isArray(raw.questions)
      ? raw.questions.filter((question: unknown): question is string => typeof question === 'string' && question.trim().length > 0).map(question => question.trim()).slice(0, 4)
      : undefined,
    plan: decision === 'ready'
      ? {
          title: typeof rawPlan?.title === 'string' && rawPlan.title.trim() ? rawPlan.title.trim() : 'Deep Research',
          steps: planSteps.length >= 4 ? planSteps : [
            'Collect authoritative sources.',
            'Compare the strongest available evidence.',
            'Check contradictions and stale information.',
            'Synthesize a cited answer.',
          ],
          refinedPrompt: typeof rawPlan?.refinedPrompt === 'string' && rawPlan.refinedPrompt.trim()
            ? rawPlan.refinedPrompt.trim()
            : typeof raw.refinedPrompt === 'string'
              ? raw.refinedPrompt.trim()
              : '',
        }
      : undefined,
    refinedPrompt: typeof raw.refinedPrompt === 'string' ? raw.refinedPrompt.trim() : undefined,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : undefined,
  };
};

const buildPreflightInput = (body: any) => JSON.stringify({
  selectedStyle: body.styleId,
  pendingResearchIntent: body.pendingIntent || null,
  conversation: (body.history || []).map((message: any) => ({
    role: message.role === 'model' ? 'assistant' : 'user',
    content: message.content || '',
  })),
}, null, 2);

const collectUrls = (value: unknown, urls = new Set<string>()) => {
  if (!value || typeof value !== 'object') return urls;
  if (Array.isArray(value)) {
    value.forEach(item => collectUrls(item, urls));
    return urls;
  }

  const record = value as Record<string, unknown>;
  for (const [key, nestedValue] of Object.entries(record)) {
    if ((key === 'url' || key === 'uri') && typeof nestedValue === 'string' && /^https?:\/\//.test(nestedValue)) {
      urls.add(nestedValue);
    } else {
      collectUrls(nestedValue, urls);
    }
  }
  return urls;
};

const extractUrlsFromText = (text: string) =>
  Array.from(text.matchAll(/https?:\/\/[^\s)\]}>"']+/g), match => match[0].replace(/[.,;:!?]+$/, ''));

const getSourceLabel = (source: ResearchSource) => {
  if (source.title?.trim()) return source.title.trim();
  try {
    return new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    return source.url;
  }
};

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const stripHtml = (value: string) => decodeHtmlEntities(value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

const extractHtmlTagContent = (html: string, tagName: string) => {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return match ? stripHtml(match[1]) : undefined;
};

const extractMetaContent = (html: string, name: string) => {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapedName}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]).replace(/\s+/g, ' ').trim();
  }
  return undefined;
};

const extractReadableText = (html: string) => {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const cleaned = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<(h[1-3]|p|li|td|th)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  return stripHtml(cleaned)
    .split(/\n+|(?<=\.)\s{2,}/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line.length >= 35)
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .slice(0, 35)
    .join('\n');
};

const compactEvidenceExcerpt = (text: string, maxChars = 2_200) => {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const lastBreak = Math.max(clipped.lastIndexOf('\n'), clipped.lastIndexOf('. '));
  return `${clipped.slice(0, lastBreak > 900 ? lastBreak + 1 : maxChars).trim()}...`;
};

const fetchReadableSource = async (source: ResearchSource, parentSignal: AbortSignal): Promise<ResearchEvidenceNote | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  const abort = () => controller.abort();
  parentSignal.addEventListener('abort', abort, {once: true});
  try {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 PrivoraResearch/1.0',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) return null;
    const rawText = await response.text();
    const title = contentType.includes('text/plain') ? source.title : extractHtmlTagContent(rawText, 'title') || source.title;
    const description = contentType.includes('text/plain')
      ? undefined
      : extractMetaContent(rawText, 'description') || extractMetaContent(rawText, 'og:description');
    const readableText = contentType.includes('text/plain') ? rawText.replace(/\s+/g, ' ').trim() : extractReadableText(rawText);
    const excerpt = compactEvidenceExcerpt(readableText);
    if (excerpt.length < 160) return null;
    return {
      source: {...source, title: title || source.title},
      title,
      description,
      excerpt,
      wordCount: readableText.split(/\s+/).filter(Boolean).length,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    parentSignal.removeEventListener('abort', abort);
  }
};

const resolveDuckDuckGoUrl = (href: string) => {
  const decodedHref = decodeHtmlEntities(href);
  try {
    const parsed = new URL(decodedHref, 'https://duckduckgo.com');
    const redirected = parsed.searchParams.get('uddg');
    return redirected ? decodeURIComponent(redirected) : parsed.href;
  } catch {
    return decodedHref;
  }
};

const extractDuckDuckGoResults = (html: string): ResearchSource[] => {
  const results: ResearchSource[] = [];
  const resultPattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(resultPattern)) {
    const url = resolveDuckDuckGoUrl(match[1]);
    if (!/^https?:\/\//.test(url) || url.includes('duckduckgo.com')) continue;
    results.push({
      title: stripHtml(match[2]),
      url,
      provider: 'Direct web scout',
    });
    if (results.length >= 6) break;
  }
  return results;
};

const extractBingResults = (html: string): ResearchSource[] => {
  const results: ResearchSource[] = [];
  const resultPattern = /<li[^>]+class="[^"]*b_algo[^"]*"[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(resultPattern)) {
    const url = decodeHtmlEntities(match[1]);
    if (!/^https?:\/\//.test(url) || url.includes('bing.com')) continue;
    results.push({
      title: stripHtml(match[2]),
      url,
      provider: 'Direct web scout',
    });
    if (results.length >= 6) break;
  }
  return results;
};

const buildDirectSearchQueries = (body: any) => {
  const title = typeof body.plan?.title === 'string' ? body.plan.title : '';
  const prompt = typeof body.plan?.refinedPrompt === 'string'
    ? body.plan.refinedPrompt
    : typeof body.history?.at?.(-1)?.content === 'string'
      ? body.history.at(-1).content
      : '';
  const stepQueries = Array.isArray(body.plan?.steps)
    ? body.plan.steps
        .map((step: any) => typeof step === 'string' ? step : step?.text)
        .filter((step: unknown): step is string => typeof step === 'string' && step.trim().length > 0)
        .slice(0, 3)
    : [];
  return uniqueSources([
    {url: `query:${[title, 'official sources'].filter(Boolean).join(' ')}`},
    {url: `query:${[title, 'current pricing availability'].filter(Boolean).join(' ')}`},
    ...stepQueries.map(step => ({url: `query:${[title, step].filter(Boolean).join(' ')}`})),
    {url: `query:${prompt.slice(0, 140)}`},
  ])
    .map(item => item.url.replace(/^query:/, '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 5);
};

const fetchDirectSearchResults = async (query: string, engine: 'duckduckgo' | 'bing', signal: AbortSignal): Promise<ResearchSource[]> => {
  const endpoint = engine === 'duckduckgo'
    ? `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    : `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    headers: {
      'User-Agent': 'Mozilla/5.0 PrivoraResearch/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal,
  });
  if (!response.ok) return [];
  const html = await response.text();
  const provider = engine === 'duckduckgo' ? 'DuckDuckGo scout' : 'Bing scout';
  const results = engine === 'duckduckgo' ? extractDuckDuckGoResults(html) : extractBingResults(html);
  return results.map(source => ({...source, provider}));
};

const withTimeoutSignal = async <T>(timeoutMs: number, run: (signal: AbortSignal) => Promise<T>, fallback: T): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
};

const MIN_DIRECT_SOURCES_TO_SKIP_PROVIDER_SCOUT = 5;

const getPlanStepText = (plan: any, index: number) => {
  const step = Array.isArray(plan?.steps) ? plan.steps[index] : undefined;
  if (typeof step === 'string') return step;
  if (typeof step?.text === 'string') return step.text;
  return undefined;
};

const isUrlOnlyText = (text: string) => {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every(token => /^https?:\/\//.test(token));
};

const buildTimeLimitedResearchText = (text: string, sources: ResearchSource[]) => {
  const trimmedText = text.trim();
  if (trimmedText && !isUrlOnlyText(trimmedText)) {
    return `${trimmedText}\n\nNote: Deep Research reached its time limit, so this answer is based on the sources gathered before timeout.`;
  }

  const sourceNote = sources.length > 0
    ? ` I gathered ${sources.length} source${sources.length === 1 ? '' : 's'}, but the final report was not ready before the limit.`
    : ' No usable sources were returned before the limit.';
  return `Deep Research reached its time limit before the final report was ready.${sourceNote} Try again with a narrower scope or a longer research window.`;
};

const createProviderResearchRuntime = ({
  ai,
  cliproxyBaseUrl,
  openrouterApiKey,
}: {
  ai: GoogleGenAI | null;
  cliproxyBaseUrl: string;
  openrouterApiKey?: string;
}): ResearchRuntime => ({
  async run(job, emit) {
    const body = job.body;
    const provider = body.provider;
    const softBudgetMs = Math.max(30_000, Math.min(Number(body.timeBudgetMs) || 180_000, 20 * 60_000));
    const hardTimeoutMs = Math.max(8 * 60_000, Math.min(softBudgetMs * 3, 20 * 60_000));
    const timeout = setTimeout(() => {
      job.cancelReason = 'timeout';
      job.controller.abort();
    }, hardTimeoutMs);
    const emitActivity = (phase: string, title: string, detail?: string, source?: ResearchSource) =>
      emit({type: 'activity', activity: {phase, title, detail, source, timestamp: Date.now()}});
    let activePhase = 'searching';
    let liveSourceCount = 0;
    let liveTextLength = 0;
    let heartbeatCount = 0;
    const startedAt = Date.now();
    const emitStatus = (status: ResearchStatus, message: string) => {
      activePhase =
        status === 'searching' ? 'searching' :
        status === 'reading' ? 'reading' :
        status === 'synthesizing' ? 'synthesizing' :
        activePhase;
      emit({type: 'status', status, message});
    };
    const emitSourceActivities = (sources: ResearchSource[]) => {
      sources.slice(0, 20).forEach(source => emitActivity('source', getSourceLabel(source), undefined, source));
    };
    const heartbeat = setInterval(() => {
      if (job.completed || job.cancelled || job.controller.signal.aborted) return;
      heartbeatCount += 1;
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      if (activePhase === 'searching') {
        emitActivity(
          'heartbeat',
          'Finding sources',
          liveSourceCount > 0
            ? `${elapsedSeconds}s elapsed. ${liveSourceCount} source${liveSourceCount === 1 ? '' : 's'} found so far.`
            : `${elapsedSeconds}s elapsed. Checking fast web results first.`,
        );
        return;
      }
      if (activePhase === 'reading') {
        emitActivity(
          'heartbeat',
          liveSourceCount > 0 ? `Checking evidence from ${liveSourceCount} sources` : 'Checking web evidence',
          `${elapsedSeconds}s elapsed. More source links can appear in batches while the report is being prepared.`,
        );
        return;
      }
      emitActivity(
        'heartbeat',
        liveTextLength > 0 ? 'Writing and checking the final report' : 'Preparing the final report',
        `${elapsedSeconds}s elapsed. ${liveSourceCount} source${liveSourceCount === 1 ? '' : 's'} available.`,
      );
    }, 12_000);
    const addTextSources = (
      textDelta: string,
      sources: ResearchSource[],
      seenSourceUrls: Set<string>,
      provider: string,
    ) => {
      const urls = extractUrlsFromText(textDelta).filter(url => !seenSourceUrls.has(url));
      if (urls.length === 0) return sources;
      urls.forEach(url => seenSourceUrls.add(url));
      const nextSources: ResearchSource[] = urls.map(url => ({url, provider}));
      const mergedSources = uniqueSources([...sources, ...nextSources]);
      liveSourceCount = mergedSources.length;
      emit({type: 'sources', sources: mergedSources});
      emitSourceActivities(nextSources);
      return mergedSources;
    };
    const mergeLiveSources = (
      sources: ResearchSource[],
      seenSourceUrls: Set<string>,
      nextSources: ResearchSource[],
    ) => {
      const freshSources = nextSources.filter(source => source.url && !seenSourceUrls.has(source.url));
      if (freshSources.length === 0) return sources;
      freshSources.forEach(source => seenSourceUrls.add(source.url));
      const mergedSources = uniqueSources([...sources, ...freshSources]);
      liveSourceCount = mergedSources.length;
      emit({type: 'sources', sources: mergedSources});
      emitSourceActivities(freshSources);
      return mergedSources;
    };
    const throwIfStopped = () => {
      if (job.cancelled || job.controller.signal.aborted) {
        throw new Error('Research job stopped.');
      }
    };

    try {
      let didFindSources = false;
      let sources: ResearchSource[] = [];
      let evidenceNotes: ResearchEvidenceNote[] = [];
      const seenSourceUrls = new Set<string>();
      const enterReadingStage = () => {
        if (didFindSources) return;
        didFindSources = true;
        emit({type: 'planStep', index: 0, status: 'completed'});
        emit({type: 'planStep', index: 1, status: 'active', message: getPlanStepText(body.plan, 1)});
        emitStatus('reading', 'Reading and comparing sources');
        emitActivity('reading', 'Reading and comparing sources');
      };
      const readSourceEvidence = async () => {
        if (evidenceNotes.length > 0 || sources.length === 0) return evidenceNotes;
        const readableCandidates = uniqueSources(sources)
          .filter(source => /^https?:\/\//.test(source.url))
          .slice(0, 8);
        if (readableCandidates.length === 0) return evidenceNotes;

        const startedReadingAt = Date.now();
        emitActivity('reading', 'Reading source pages', `Reading ${readableCandidates.length} page${readableCandidates.length === 1 ? '' : 's'} in parallel before writing.`);
        const settledNotes = await Promise.allSettled(
          readableCandidates.map(source => fetchReadableSource(source, job.controller.signal))
        );
        throwIfStopped();
        evidenceNotes = settledNotes
          .filter((result): result is PromiseFulfilledResult<ResearchEvidenceNote | null> => result.status === 'fulfilled')
          .map(result => result.value)
          .filter((note): note is ResearchEvidenceNote => Boolean(note))
          .slice(0, 8);

        const readingSeconds = Math.max(1, Math.round((Date.now() - startedReadingAt) / 1000));
        if (evidenceNotes.length > 0) {
          sources = uniqueSources([
            ...evidenceNotes.map(note => note.source),
            ...sources,
          ]);
          liveSourceCount = sources.length;
          emit({type: 'sources', sources});
          emitActivity(
            'reading',
            'Source evidence prepared',
            `${evidenceNotes.length}/${readableCandidates.length} pages read in ${readingSeconds}s.`,
          );
          evidenceNotes.slice(0, 5).forEach(note => {
            emitActivity('source', `Read ${getSourceLabel(note.source)}`, `${note.wordCount} words extracted.`, note.source);
          });
        } else {
          emitActivity('reading', 'Source page reading skipped', `No readable pages returned within ${readingSeconds}s; continuing with web evidence from the research model.`);
        }
        return evidenceNotes;
      };
      emitActivity('planning', 'Research plan accepted', body.plan?.title);
      emit({type: 'planStep', index: 0, status: 'active', message: getPlanStepText(body.plan, 0)});
      emitStatus('searching', 'Searching the web');
      emitActivity('searching', 'Searching for relevant sources');
      await new Promise(resolve => setTimeout(resolve, 250));
      throwIfStopped();

      emitActivity('searching', 'Scanning the web');
      const directScoutStartedAt = Date.now();
      const directQueries = buildDirectSearchQueries(body);
      const directResults = await Promise.all(
        directQueries.flatMap(query =>
          (['duckduckgo', 'bing'] as const).map(engine =>
            withTimeoutSignal(4_500, signal => fetchDirectSearchResults(query, engine, signal), [])
          )
        )
      );
      throwIfStopped();
      const directScoutMs = Date.now() - directScoutStartedAt;
      const sourceCountBeforeDirectScout = sources.length;
      sources = mergeLiveSources(sources, seenSourceUrls, directResults.flat().slice(0, 14));
      if (sources.length > 0) {
        const freshDirectSources = sources.length - sourceCountBeforeDirectScout;
        emitActivity(
          'searching',
          'Source candidates ready',
          `${freshDirectSources} candidate${freshDirectSources === 1 ? '' : 's'} from DuckDuckGo/Bing in ${Math.max(1, Math.round(directScoutMs / 1000))}s.`,
        );
        enterReadingStage();
      } else {
        emitActivity('debug', 'Direct source scout unavailable', 'Continuing with provider-native web search.');
      }

      if (provider === 'gemini') {
        if (!ai) throw new Error('GEMINI_API_KEY is not configured.');
        let text = '';
        let didEnterSynthesis = false;
        if (sources.length < MIN_DIRECT_SOURCES_TO_SKIP_PROVIDER_SCOUT) {
          emitActivity('debug', 'Provider source scout started');
          const scoutStream = await ai.models.generateContentStream({
            model: body.model,
            contents: [{role: 'user', parts: [{text: formatSourceScoutPrompt(body)}]}],
            config: {
              systemInstruction: 'You are a source discovery agent. Use web search grounding and return only source titles and full URLs for the research task.',
              temperature: 0.1,
              tools: [{googleSearch: {}}],
            },
          });

          for await (const chunk of scoutStream) {
            throwIfStopped();
            const groundingSources: ResearchSource[] = (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
              .map((chunkItem: any) => chunkItem?.web)
              .filter(Boolean)
              .map((web: any) => ({title: web.title, url: web.uri, provider: 'Google Search scout'}))
              .filter((source: ResearchSource) => Boolean(source.url));
            const scoutText = (chunk.candidates?.[0]?.content?.parts || [])
              .filter((part: any) => typeof part.text === 'string')
              .map((part: any) => part.text)
              .join('') || chunk.text || '';
            const textSources: ResearchSource[] = extractUrlsFromText(scoutText).map(url => ({url, provider: 'Google Search scout'}));
            sources = mergeLiveSources(sources, seenSourceUrls, [...groundingSources, ...textSources]);
            if (sources.length > 0) enterReadingStage();
            if (sources.length >= 10) break;
          }
        } else {
          emitActivity('reading', 'Using gathered sources', `${sources.length} source candidate${sources.length === 1 ? '' : 's'} are ready, so Privora skipped an extra source-finding pass.`);
        }

        await readSourceEvidence();
        const providerResearchStartedAt = Date.now();
        emitActivity('synthesizing', 'Writing final answer', `Using ${sources.length} source candidate${sources.length === 1 ? '' : 's'} and ${evidenceNotes.length} page note${evidenceNotes.length === 1 ? '' : 's'}.`);
        const responseStream = await ai.models.generateContentStream({
          model: body.model,
          contents: [
            ...toGeminiResearchContents(body.history || []),
            {role: 'user', parts: [{text: formatResearchPrompt(body, sources, evidenceNotes)}]},
          ],
          config: {
            systemInstruction: body.systemInstruction,
            temperature: 0.35,
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.MEDIUM,
              includeThoughts: true,
            },
            tools: [{googleSearch: {}}],
          },
        });
        emitStatus('synthesizing', 'Writing final answer');
        emitActivity('synthesizing', 'Answer stream ready', `Connected in ${Math.max(1, Math.round((Date.now() - providerResearchStartedAt) / 1000))}s. The report will appear after evidence checks finish.`);

        for await (const chunk of responseStream) {
          throwIfStopped();

          const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          const nextSources = groundingChunks
            .map((chunkItem: any) => chunkItem?.web)
            .filter(Boolean)
            .map((web: any) => ({title: web.title, url: web.uri, provider: 'Google Search'}))
            .filter((source: ResearchSource) => source.url && !seenSourceUrls.has(source.url));
          if (nextSources.length > 0) {
            sources = mergeLiveSources(sources, seenSourceUrls, nextSources);
            enterReadingStage();
          }

          const parts = chunk.candidates?.[0]?.content?.parts || [];
          const textDelta = parts
            .filter((part: any) => !part.thought && typeof part.text === 'string')
            .map((part: any) => part.text)
            .join('') || chunk.text || '';
          if (textDelta) {
            if (!didEnterSynthesis) {
              if (!didFindSources) {
                enterReadingStage();
              }
              emit({type: 'planStep', index: 1, status: 'completed'});
              emit({type: 'planStep', index: 2, status: 'active', message: getPlanStepText(body.plan, 2)});
              emitActivity('comparing', 'Checking source agreement and contradictions');
              emitStatus('synthesizing', 'Synthesizing answer');
              emitActivity('synthesizing', 'Synthesizing cited answer');
              didEnterSynthesis = true;
            }
            sources = addTextSources(textDelta, sources, seenSourceUrls, 'Generated citation');
            text += textDelta;
            liveTextLength = text.length;
            emit({type: 'text', text});
          }
        }

        if (!didEnterSynthesis) {
              if (!didFindSources) {
            enterReadingStage();
          }
          emit({type: 'planStep', index: 1, status: 'completed'});
          emit({type: 'planStep', index: 2, status: 'active', message: getPlanStepText(body.plan, 2)});
          emitStatus('synthesizing', 'Synthesizing answer');
          emitActivity('synthesizing', 'Synthesizing cited answer');
        }
        (body.plan?.steps || []).forEach((_step: string, index: number) => {
          if (index >= 3) emit({type: 'planStep', index, status: 'completed'});
        });
        emit({type: 'completed', text, sources});
        return;
      }

      if (provider === 'openrouter') {
        if (!openrouterApiKey) throw new Error('OPENROUTER_API_KEY is not configured.');
        const capabilities = getOpenRouterModelCapabilities(body.model);
        const canUseTools = Boolean(capabilities?.supportsTools);
        const openRouterMessages = (prompt: string, systemInstruction: string) => [
          {role: 'system', content: systemInstruction},
          ...(body.history || []).map((message: any) => ({
            role: message.role === 'model' ? 'assistant' : 'user',
            content: message.content || '',
          })),
          {role: 'user', content: prompt},
        ];
        const openRouterTools = canUseTools
          ? [{type: 'openrouter:web_search', parameters: {max_results: 5, max_total_results: 12}}]
          : undefined;
        const openRouterReasoning = capabilities?.supportsReasoning
          ? {reasoning: {effort: 'medium', exclude: false}, include_reasoning: true}
          : {};
        let text = '';
        let didEnterSynthesis = false;

        if (sources.length < MIN_DIRECT_SOURCES_TO_SKIP_PROVIDER_SCOUT && canUseTools) {
          try {
            emitActivity('debug', 'Provider source scout started');
            const scoutController = new AbortController();
            const scoutTimeout = setTimeout(() => scoutController.abort(), 25_000);
            const abortScout = () => scoutController.abort();
            job.controller.signal.addEventListener('abort', abortScout, {once: true});
            const scoutResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${openrouterApiKey}`,
                'X-Title': 'Privora',
              },
              body: JSON.stringify({
                model: body.model,
                messages: [
                  {
                    role: 'system',
                    content: 'You are a source discovery agent. Use web search when available. Return only source titles and full URLs for the research task.',
                  },
                  {role: 'user', content: formatSourceScoutPrompt(body)},
                ],
                tools: openRouterTools,
                stream: true,
                ...(modelSupportsOpenRouterParameter(body.model, 'temperature') ? {temperature: 0.1} : {}),
              }),
              signal: scoutController.signal,
            });

            if (scoutResponse.ok && scoutResponse.body) {
              const scoutReader = scoutResponse.body.getReader();
              const scoutDecoder = new TextDecoder();
              let scoutBuffer = '';
              const flushScoutEvent = (rawEvent: string) => {
                const dataLines = rawEvent.split('\n').map(line => line.trim()).filter(line => line.startsWith('data:')).map(line => line.slice('data:'.length).trim());
                for (const dataLine of dataLines) {
                  if (!dataLine || dataLine === '[DONE]') continue;
                  try {
                    const data = JSON.parse(dataLine);
                    const structuredUrls = Array.from(collectUrls(data)).map(url => ({url, provider: 'OpenRouter web search scout'}));
                    const scoutText = [extractOpenRouterStreamTextDelta(data), extractOpenRouterStreamFinalText(data), extractOpenRouterText(data)].filter(Boolean).join('\n');
                    const textUrls = extractUrlsFromText(scoutText).map(url => ({url, provider: 'OpenRouter web search scout'}));
                    sources = mergeLiveSources(sources, seenSourceUrls, [...structuredUrls, ...textUrls]);
                    if (sources.length > 0) enterReadingStage();
                  } catch {
                    const textUrls = extractUrlsFromText(dataLine).map(url => ({url, provider: 'OpenRouter web search scout'}));
                    sources = mergeLiveSources(sources, seenSourceUrls, textUrls);
                    if (sources.length > 0) enterReadingStage();
                  }
                }
              };

              while (sources.length < 12) {
                throwIfStopped();
                const {done, value} = await scoutReader.read();
                if (done) break;
                scoutBuffer += scoutDecoder.decode(value, {stream: true});
                const scoutEvents = scoutBuffer.split('\n\n');
                scoutBuffer = scoutEvents.pop() ?? '';
                scoutEvents.forEach(event => {
                  if (event.trim().startsWith(':')) return;
                  flushScoutEvent(event);
                });
              }
              if (scoutBuffer.trim() && !scoutBuffer.trim().startsWith(':')) flushScoutEvent(scoutBuffer);
              await scoutReader.cancel().catch(() => undefined);
            } else {
              emitActivity('debug', 'Source scout fell back to direct sources', `Scout returned ${scoutResponse.status}; continuing with gathered evidence.`);
            }
            clearTimeout(scoutTimeout);
            job.controller.signal.removeEventListener('abort', abortScout);
          } catch (error) {
            if (job.cancelled || job.controller.signal.aborted) throw error;
            emitActivity('debug', 'Source scout fell back to direct sources', 'Continuing with gathered evidence.');
          }
        } else {
          emitActivity(
            sources.length > 0 ? 'reading' : 'debug',
            sources.length > 0 ? 'Using gathered sources' : 'Provider source scout skipped',
            canUseTools
              ? `${sources.length} source candidate${sources.length === 1 ? '' : 's'} are ready.`
              : 'This OpenRouter model does not advertise tool support, so Deep Research is using direct source gathering.',
          );
        }

        await readSourceEvidence();
        const providerResearchStartedAt = Date.now();
        emitActivity('synthesizing', 'Writing final answer', `Using ${sources.length} source candidate${sources.length === 1 ? '' : 's'} and ${evidenceNotes.length} page note${evidenceNotes.length === 1 ? '' : 's'}.`);
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openrouterApiKey}`,
            'X-Title': 'Privora',
          },
          body: JSON.stringify({
            model: body.model,
            messages: openRouterMessages(formatResearchPrompt(body, sources, evidenceNotes), body.systemInstruction),
            ...(openRouterTools ? {tools: openRouterTools} : {}),
            ...openRouterReasoning,
            stream: true,
            ...(modelSupportsOpenRouterParameter(body.model, 'temperature') ? {temperature: 0.35} : {}),
          }),
          signal: job.controller.signal,
        });
        emitStatus('synthesizing', 'Writing final answer');
        emitActivity('synthesizing', 'Answer stream ready', `Connected in ${Math.max(1, Math.round((Date.now() - providerResearchStartedAt) / 1000))}s. The report will appear after evidence checks finish.`);

        if (!response.ok) {
          throw new Error((await response.text().catch(() => '')) || `OpenRouter research failed with ${response.status}`);
        }
        if (!response.body) {
          throw new Error('OpenRouter research did not return a live stream.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const flushOpenRouterEvent = (rawEvent: string) => {
          const dataLines = rawEvent.split('\n').map(line => line.trim()).filter(line => line.startsWith('data:')).map(line => line.slice('data:'.length).trim());
          for (const dataLine of dataLines) {
            if (!dataLine || dataLine === '[DONE]') continue;
            try {
              const data = JSON.parse(dataLine);
              const urls = Array.from(collectUrls(data)).filter(url => !seenSourceUrls.has(url));
              if (urls.length > 0) {
                sources = mergeLiveSources(sources, seenSourceUrls, urls.map(url => ({url, provider: 'OpenRouter web search'})));
                enterReadingStage();
              }

              const textDelta = extractOpenRouterStreamTextDelta(data);
              if (textDelta) {
                if (!didEnterSynthesis) {
                  if (!didFindSources) enterReadingStage();
                  emit({type: 'planStep', index: 1, status: 'completed'});
                  emit({type: 'planStep', index: 2, status: 'active', message: getPlanStepText(body.plan, 2)});
                  emitActivity('comparing', 'Checking source agreement and contradictions');
                  emitStatus('synthesizing', 'Synthesizing answer');
                  emitActivity('synthesizing', 'Synthesizing cited answer');
                  didEnterSynthesis = true;
                }
                sources = addTextSources(textDelta, sources, seenSourceUrls, 'Generated citation');
                text += textDelta;
                liveTextLength = text.length;
                emit({type: 'text', text});
              }
            } catch {
              if (dataLine.startsWith('{')) return;
              if (!didEnterSynthesis) {
                if (!didFindSources) enterReadingStage();
                emitStatus('synthesizing', 'Synthesizing answer');
                emitActivity('synthesizing', 'Synthesizing cited answer');
                didEnterSynthesis = true;
              }
              text += dataLine;
              sources = addTextSources(dataLine, sources, seenSourceUrls, 'Generated citation');
              liveTextLength = text.length;
              emit({type: 'text', text});
            }
          }
        };

        while (true) {
          throwIfStopped();
          const {done, value} = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, {stream: true});
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';
          events.forEach(event => {
            if (event.trim().startsWith(':')) return;
            flushOpenRouterEvent(event);
          });
        }
        if (buffer.trim() && !buffer.trim().startsWith(':')) flushOpenRouterEvent(buffer);

        if (!didEnterSynthesis) {
          if (!didFindSources) enterReadingStage();
          emit({type: 'planStep', index: 1, status: 'completed'});
          emit({type: 'planStep', index: 2, status: 'active', message: getPlanStepText(body.plan, 2)});
          emitStatus('synthesizing', 'Synthesizing answer');
          emitActivity('synthesizing', 'Synthesizing cited answer');
        }
        (body.plan?.steps || []).forEach((_step: string, index: number) => {
          if (index >= 3) emit({type: 'planStep', index, status: 'completed'});
        });
        emit({type: 'completed', text, sources});
        return;
      }

      let text = '';
      let didEnterSynthesis = false;

      if (sources.length < MIN_DIRECT_SOURCES_TO_SKIP_PROVIDER_SCOUT) {
      try {
        emitActivity('debug', 'Provider source scout started');
        const scoutController = new AbortController();
        const scoutTimeout = setTimeout(() => scoutController.abort(), 25_000);
        const abortScout = () => scoutController.abort();
        job.controller.signal.addEventListener('abort', abortScout, {once: true});
        const scoutResponse = await fetch(`${cliproxyBaseUrl.replace(/\/$/, '')}/v1/responses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer dummy-key',
          },
          body: JSON.stringify({
            model: body.model,
            instructions: [
              'You are a source discovery agent.',
              'Use web search. Return only a concise source list with titles and full URLs.',
              'Prioritize official, primary, reputable, current sources. Do not write the final report.',
            ].join('\n'),
            input: [{role: 'user', content: [{type: 'input_text', text: formatSourceScoutPrompt(body)}]}],
            tools: [{type: 'web_search_preview'}],
            reasoning: {effort: 'low', summary: 'auto'},
            stream: true,
            temperature: 0.1,
          }),
          signal: scoutController.signal,
        });

        if (scoutResponse.ok && scoutResponse.body) {
          const scoutReader = scoutResponse.body.getReader();
          const scoutDecoder = new TextDecoder();
          let scoutBuffer = '';
          const flushScoutEvent = (rawEvent: string) => {
            const {event, dataLines} = parseCliproxySseEvent(rawEvent);
            for (const dataLine of dataLines) {
              if (!dataLine || dataLine === '[DONE]') continue;
              try {
                const data = JSON.parse(dataLine);
                const structuredUrls = Array.from(collectUrls(data)).map(url => ({url, provider: 'Web search scout'}));
                const scoutText = [
                  extractCliproxyStreamTextDelta(event, data),
                  extractCliproxyStreamFinalText(event, data),
                  extractCliproxyText(data),
                ].filter(Boolean).join('\n');
                const textUrls = extractUrlsFromText(scoutText).map(url => ({url, provider: 'Web search scout'}));
                sources = mergeLiveSources(sources, seenSourceUrls, [...structuredUrls, ...textUrls]);
                if (sources.length > 0) enterReadingStage();
              } catch {
                const textUrls = extractUrlsFromText(dataLine).map(url => ({url, provider: 'Web search scout'}));
                sources = mergeLiveSources(sources, seenSourceUrls, textUrls);
                if (sources.length > 0) enterReadingStage();
              }
            }
          };

          while (sources.length < 12) {
            throwIfStopped();
            const {done, value} = await scoutReader.read();
            if (done) break;
            scoutBuffer += scoutDecoder.decode(value, {stream: true});
            const scoutEvents = scoutBuffer.split('\n\n');
            scoutBuffer = scoutEvents.pop() ?? '';
            scoutEvents.forEach(flushScoutEvent);
          }
          if (scoutBuffer.trim()) flushScoutEvent(scoutBuffer);
          await scoutReader.cancel().catch(() => undefined);
        } else {
          emitActivity('debug', 'Source scout fell back to main research', `Scout returned ${scoutResponse.status}; continuing with provider search.`);
        }
        clearTimeout(scoutTimeout);
        job.controller.signal.removeEventListener('abort', abortScout);
      } catch (error) {
        if (job.cancelled || job.controller.signal.aborted) throw error;
        emitActivity('debug', 'Source scout fell back to main research', 'Continuing with provider search.');
      }
      } else {
        emitActivity('reading', 'Using gathered sources', `${sources.length} source candidate${sources.length === 1 ? '' : 's'} are ready, so Privora skipped an extra source-finding pass.`);
      }

      await readSourceEvidence();
      const providerResearchStartedAt = Date.now();
      emitActivity('synthesizing', 'Writing final answer', `Using ${sources.length} source candidate${sources.length === 1 ? '' : 's'} and ${evidenceNotes.length} page note${evidenceNotes.length === 1 ? '' : 's'}.`);
      const response = await fetch(`${cliproxyBaseUrl.replace(/\/$/, '')}/v1/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer dummy-key',
        },
        body: JSON.stringify({
          model: body.model,
          instructions: body.systemInstruction,
          input: [
            ...toCliproxyResearchInput(body.history || []),
            {role: 'user', content: [{type: 'input_text', text: formatResearchPrompt(body, sources, evidenceNotes)}]},
          ],
          tools: [{type: 'web_search_preview'}],
          reasoning: {effort: 'medium', summary: 'auto'},
          stream: true,
          temperature: 0.35,
        }),
        signal: job.controller.signal,
      });
      emitStatus('synthesizing', 'Writing final answer');
      emitActivity('synthesizing', 'Answer stream ready', `Connected in ${Math.max(1, Math.round((Date.now() - providerResearchStartedAt) / 1000))}s. The report will appear after evidence checks finish.`);

      if (!response.ok) {
        throw new Error((await response.text().catch(() => '')) || `Research service failed with ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Research service did not return a live stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const flushCliproxyEvent = (rawEvent: string) => {
        const {event, dataLines} = parseCliproxySseEvent(rawEvent);
        for (const dataLine of dataLines) {
          if (!dataLine || dataLine === '[DONE]') continue;
          try {
            const data = JSON.parse(dataLine);
            const urls = Array.from(collectUrls(data)).filter(url => !seenSourceUrls.has(url));
            if (urls.length > 0) {
              const nextSources: ResearchSource[] = urls.map(url => ({url, provider: 'Web search'}));
              sources = mergeLiveSources(sources, seenSourceUrls, nextSources);
              enterReadingStage();
            }

            const textDelta = extractCliproxyStreamTextDelta(event, data);
            if (textDelta) {
              if (!didEnterSynthesis) {
                if (!didFindSources) {
                  enterReadingStage();
                }
                emit({type: 'planStep', index: 1, status: 'completed'});
                emit({type: 'planStep', index: 2, status: 'active', message: getPlanStepText(body.plan, 2)});
                emitActivity('comparing', 'Checking source agreement and contradictions');
                emitStatus('synthesizing', 'Synthesizing answer');
                emitActivity('synthesizing', 'Synthesizing cited answer');
                didEnterSynthesis = true;
              }
              sources = addTextSources(textDelta, sources, seenSourceUrls, 'Generated citation');
              text += textDelta;
              liveTextLength = text.length;
              emit({type: 'text', text});
            }

            const finalText = extractCliproxyStreamFinalText(event, data);
            if (finalText && finalText.length > text.length) {
              if (!didEnterSynthesis) {
                if (!didFindSources) {
                  enterReadingStage();
                }
                emit({type: 'planStep', index: 1, status: 'completed'});
                emit({type: 'planStep', index: 2, status: 'active', message: getPlanStepText(body.plan, 2)});
                emitStatus('synthesizing', 'Synthesizing answer');
                emitActivity('synthesizing', 'Synthesizing cited answer');
                didEnterSynthesis = true;
              }
              sources = addTextSources(finalText, sources, seenSourceUrls, 'Generated citation');
              text = finalText;
              liveTextLength = text.length;
              emit({type: 'text', text});
            }
          } catch {
            if (dataLine.startsWith('{')) return;
            if (!didEnterSynthesis) {
              if (!didFindSources) {
                enterReadingStage();
              }
              emitStatus('synthesizing', 'Synthesizing answer');
              emitActivity('synthesizing', 'Synthesizing cited answer');
              didEnterSynthesis = true;
            }
            text += dataLine;
            sources = addTextSources(dataLine, sources, seenSourceUrls, 'Generated citation');
            liveTextLength = text.length;
            emit({type: 'text', text});
          }
        }
      };

      while (true) {
        throwIfStopped();
        const {done, value} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        events.forEach(flushCliproxyEvent);
      }

      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          const urls = Array.from(collectUrls(data)).filter(url => !seenSourceUrls.has(url));
          sources = mergeLiveSources(sources, seenSourceUrls, urls.map(url => ({url, provider: 'Web search'})));
          if (urls.length > 0) enterReadingStage();
          text ||= extractCliproxyText(data);
          if (text) sources = addTextSources(text, sources, seenSourceUrls, 'Generated citation');
          if (text) {
            liveTextLength = text.length;
            emit({type: 'text', text});
          }
          if (sources.length > 0) emit({type: 'sources', sources});
        } catch {
          flushCliproxyEvent(buffer);
        }
      }

      if (!didEnterSynthesis) {
        if (!didFindSources) {
          enterReadingStage();
        }
        emit({type: 'planStep', index: 1, status: 'completed'});
        emit({type: 'planStep', index: 2, status: 'active', message: getPlanStepText(body.plan, 2)});
        emitStatus('synthesizing', 'Synthesizing answer');
        emitActivity('synthesizing', 'Synthesizing cited answer');
      }
      (body.plan?.steps || []).forEach((_step: string, index: number) => {
        if (index >= 3) emit({type: 'planStep', index, status: 'completed'});
      });
      emit({type: 'completed', text, sources});
    } catch (error) {
      if (job.cancelled || job.controller.signal.aborted) {
        if (job.cancelReason === 'timeout') {
          emit({type: 'completed', text: buildTimeLimitedResearchText(job.text, job.sources), sources: job.sources});
          return;
        }
        emit({type: 'stopped', text: job.text, sources: job.sources});
        return;
      }

      const message = error instanceof Error ? error.message : 'Research failed.';
      emit({type: 'error', error: message});
    } finally {
      clearInterval(heartbeat);
      clearTimeout(timeout);
    }
  },
});

const createResearchApiPlugin = ({
  ai,
  cliproxyBaseUrl,
  openrouterApiKey,
  logger,
}: {
  ai: GoogleGenAI | null;
  cliproxyBaseUrl: string;
  openrouterApiKey?: string;
  logger: Logger;
}): Plugin => {
  const jobs = new Map<string, ResearchJob>();
  const runtime = createProviderResearchRuntime({ai, cliproxyBaseUrl, openrouterApiKey});

  const writeEvent = (res: ServerResponse, event: ResearchEvent) => {
    res.write(`${JSON.stringify(event)}\n`);
  };

  const emitJobEvent = (job: ResearchJob, event: ResearchEvent) => {
    const isTerminalEvent = event.type === 'completed' || event.type === 'stopped' || event.type === 'error';
    if (job.completed && isTerminalEvent) return;
    if (event.type === 'text' || event.type === 'completed') job.text = event.text;
    if ((event.type === 'sources' || event.type === 'completed' || event.type === 'stopped') && event.sources) {
      job.sources = event.sources;
    }
    if (isTerminalEvent) {
      job.completed = true;
    }

    job.events.push(event);
    if (event.type === 'status') {
      logger.debug({jobId: job.id, status: event.status, message: event.message}, 'Research status event');
    } else if (event.type === 'activity') {
      logger.debug(
        {jobId: job.id, phase: event.activity.phase, title: event.activity.title, sourceUrl: event.activity.source?.url},
        'Research activity event',
      );
    } else if (event.type === 'planStep') {
      logger.debug({jobId: job.id, stepIndex: event.index, status: event.status, message: event.message}, 'Research plan step event');
    } else if (event.type === 'sources') {
      logger.info({jobId: job.id, sourceCount: event.sources.length}, 'Research sources updated');
    } else if (event.type === 'text') {
      logger.debug({jobId: job.id, textLength: event.text.length}, 'Research text streamed');
    } else if (event.type === 'completed') {
      logger.info({jobId: job.id, textLength: event.text.length, sourceCount: event.sources?.length ?? job.sources.length}, 'Research job completed');
    } else if (event.type === 'stopped') {
      logger.info({jobId: job.id, textLength: event.text?.length ?? job.text.length, sourceCount: event.sources?.length ?? job.sources.length}, 'Research job stopped');
    } else if (event.type === 'error') {
      logger.error({jobId: job.id, error: event.error}, 'Research job failed');
    }
    job.subscribers.forEach(res => writeEvent(res, event));
    if (job.completed) {
      job.subscribers.forEach(res => res.end());
      job.subscribers.clear();
    }
  };

  const handleResearchRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const requestPath = req.url?.split('?')[0] || '/';
    const pathParts = requestPath.split('/').filter(Boolean);

    if (req.method === 'POST' && requestPath === '/preflight') {
      try {
        const body = await readJsonBody(req);
        const input = buildPreflightInput(body);
        let text = '';

        if (body.provider === 'gemini') {
          if (!ai) throw new Error('GEMINI_API_KEY is not configured.');
          const response = await ai.models.generateContent({
            model: body.model,
            contents: [{role: 'user', parts: [{text: input}]}],
            config: {
              systemInstruction: body.instruction,
              temperature: 0.2,
            },
          });
          text = response.text || '';
        } else if (body.provider === 'openrouter') {
          if (!openrouterApiKey) throw new Error('OPENROUTER_API_KEY is not configured.');
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openrouterApiKey}`,
              'X-Title': 'Privora',
            },
            body: JSON.stringify({
              model: body.model,
              messages: [
                {role: 'system', content: body.instruction},
                {role: 'user', content: input},
              ],
              ...(modelSupportsOpenRouterParameter(body.model, 'temperature') ? {temperature: 0.2} : {}),
            }),
          });

          if (!response.ok) {
            throw new Error((await response.text().catch(() => '')) || `Research planning failed with ${response.status}`);
          }

          text = extractOpenRouterText(await response.json());
        } else {
          const response = await fetch(`${cliproxyBaseUrl.replace(/\/$/, '')}/v1/responses`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer dummy-key',
            },
            body: JSON.stringify({
              model: body.model,
              instructions: body.instruction,
              input: [{role: 'user', content: [{type: 'input_text', text: input}]}],
              temperature: 0.2,
            }),
          });

          if (!response.ok) {
            throw new Error((await response.text().catch(() => '')) || `Research planning failed with ${response.status}`);
          }

          text = extractCliproxyText(await response.json());
        }

        sendJson(res, 200, normalizePreflightResult(extractJsonObject(text)));
      } catch (error) {
        sendJson(res, 500, {error: error instanceof Error ? error.message : 'Could not run research preflight.'});
      }
      return;
    }

    if (req.method === 'POST' && requestPath === '/jobs') {
      try {
        const body = await readJsonBody(req);
        const job: ResearchJob = {
          id: randomUUID(),
          body,
          events: [],
          subscribers: new Set(),
          controller: new AbortController(),
          cancelled: false,
          cancelReason: undefined,
          completed: false,
          text: '',
          sources: [],
        };
        jobs.set(job.id, job);
        emitJobEvent(job, {type: 'status', status: 'queued', message: 'Queued research'});
        sendJson(res, 200, {jobId: job.id});
        logger.info({jobId: job.id, provider: body.provider, model: body.model, timeBudgetMs: body.timeBudgetMs}, 'Research job started');
        void runtime.run(job, event => emitJobEvent(job, event));
      } catch (error) {
        sendJson(res, 500, {error: error instanceof Error ? error.message : 'Could not start research job.'});
      }
      return;
    }

    const jobId = pathParts[1];
    const job = jobId ? jobs.get(jobId) : undefined;
    if (!job) {
      sendJson(res, 404, {error: 'Research job not found.'});
      return;
    }

    if (req.method === 'GET' && pathParts[0] === 'jobs' && pathParts.length === 2) {
      sendJson(res, 200, {
        jobId: job.id,
        completed: job.completed,
        cancelled: job.cancelled,
        text: job.text,
        sources: job.sources,
        events: job.events,
      });
      return;
    }

    if (req.method === 'GET' && pathParts[0] === 'jobs' && pathParts[2] === 'stream') {
      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      });
      res.flushHeaders?.();
      res.socket?.setNoDelay(true);
      job.events.forEach(event => writeEvent(res, event));
      if (job.completed) {
        res.end();
        return;
      }
      job.subscribers.add(res);
      req.on('close', () => job.subscribers.delete(res));
      return;
    }

    if (req.method === 'POST' && pathParts[0] === 'jobs' && pathParts[2] === 'cancel') {
      job.cancelled = true;
      job.cancelReason = 'user';
      job.controller.abort();
      emitJobEvent(job, {type: 'stopped', text: job.text, sources: job.sources});
      sendJson(res, 200, {ok: true});
      logger.info({jobId}, 'Research job cancelled');
      return;
    }

    sendJson(res, 404, {error: 'Not found'});
  };

  return {
    name: 'privora-research-api',
    configureServer(server) {
      server.middlewares.use('/api/research', handleResearchRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/research', handleResearchRequest);
    },
  };
};

const createLogger = (mode: string) =>
  pino({
    level: process.env.LOG_LEVEL || (mode === 'production' ? 'info' : 'debug'),
    redact: ['req.headers.authorization', 'apiKey', '*.apiKey'],
    ...(mode !== 'production' && process.stdout.isTTY
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : {}),
  });

const createGeminiApiPlugin = (apiKey: string | undefined, logger: Logger): Plugin => {
  const ai = apiKey ? new GoogleGenAI({apiKey}) : null;

  const handleGeminiRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const startedAt = Date.now();
    const requestPath = req.url?.split('?')[0] || 'unknown';
    const requestLogger = logger.child({
      requestId: randomUUID(),
      method: req.method,
      path: requestPath,
    });

    if (!ai) {
      requestLogger.error('Gemini API key is not configured');
      sendJson(res, 500, {error: 'GEMINI_API_KEY is not configured.'});
      return;
    }

    try {
      const body = await readJsonBody(req);
      requestLogger.debug(
        {
          model: body.model,
          contentTurns: Array.isArray(body.contents) ? body.contents.length : undefined,
          bodyBytes: Buffer.byteLength(JSON.stringify(body), 'utf8'),
          thinkingEnabled: Boolean(body.thinkingEnabled),
          webSearchEnabled: Boolean(body.webSearchEnabled),
        },
        'Gemini request received',
      );

      if (requestPath === '/title' || requestPath === '/api/gemini/title') {
        const response = await ai.models.generateContent({
          model: body.model,
          contents: body.contents,
        });
        requestLogger.info({durationMs: Date.now() - startedAt}, 'Gemini title generated');
        sendJson(res, 200, {text: response.text || ''});
        return;
      }

      if (requestPath === '/image' || requestPath === '/api/gemini/image') {
        const contents = [
          {text: String(body.prompt || '')},
          ...((Array.isArray(body.images) ? body.images : [])
            .filter((image: any) => image?.base64 && image?.mimeType)
            .map((image: any) => ({
              inlineData: {
                data: image.base64,
                mimeType: image.mimeType,
              },
            }))),
        ];
        const responseFormat = body.aspectRatio || body.imageSize
          ? {
              image: {
                ...(body.aspectRatio ? {aspectRatio: body.aspectRatio} : {}),
                ...(body.imageSize ? {imageSize: body.imageSize} : {}),
              },
            }
          : undefined;
        const response = await ai.models.generateContent({
          model: body.model || 'gemini-3.1-flash-image-preview',
          contents,
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            ...(responseFormat ? {responseFormat} : {}),
          } as any,
        });
        const images = extractGeminiInlineImages(response);
        if (images.length === 0) {
          throw new Error('Gemini finished without returning an image.');
        }
        requestLogger.info({durationMs: Date.now() - startedAt, imageCount: images.length}, 'Gemini image generated');
        sendJson(res, 200, {images});
        return;
      }

      if (requestPath === '/stream' || requestPath === '/api/gemini/stream') {
        let textEvents = 0;
        let thoughtEvents = 0;
        let artifactToolEvents = 0;
        let webSearchEvents = 0;
        let firstEventMs: number | undefined;
        const tools = [
          ...(body.webSearchEnabled ? [{googleSearch: {}}] : []),
          ...(body.artifactToolsEnabled ? [{functionDeclarations: [geminiArtifactFunctionDeclaration]}] : []),
        ];
        const responseStream = await ai.models.generateContentStream({
          model: body.model,
          contents: body.contents,
          config: {
            systemInstruction: body.systemInstruction,
            temperature: body.temperature ?? 0.85,
            thinkingConfig: {
              thinkingLevel: body.thinkingEnabled ? ThinkingLevel.MEDIUM : ThinkingLevel.MINIMAL,
              ...(body.thinkingEnabled ? {includeThoughts: true} : {}),
            },
            ...(tools.length > 0 ? {tools} : {}),
          },
        });

        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
          Connection: 'keep-alive',
        });
        res.flushHeaders?.();
        res.socket?.setNoDelay(true);

        for await (const chunk of responseStream) {
          if (res.destroyed) {
            break;
          }

          firstEventMs ??= Date.now() - startedAt;
          const parts = chunk.candidates?.[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.functionCall?.name === geminiArtifactFunctionDeclaration.name) {
              artifactToolEvents += 1;
              res.write(`${JSON.stringify({type: 'artifactToolCall', payload: part.functionCall.args || {}})}\n`);
            } else if (part.thought && part.text) {
              thoughtEvents += 1;
              res.write(`${JSON.stringify({type: 'thought', text: part.text})}\n`);
            } else if (!part.thought && part.text) {
              textEvents += 1;
              res.write(`${JSON.stringify({type: 'text', text: part.text})}\n`);
            }
          }

          if (parts.length === 0 && chunk.text) {
            textEvents += 1;
            res.write(`${JSON.stringify({type: 'text', text: chunk.text})}\n`);
          }

          const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
          if (groundingMetadata) {
            const queries = [
              ...(groundingMetadata.webSearchQueries || []),
              ...(groundingMetadata.imageSearchQueries || []),
              ...(groundingMetadata.retrievalQueries || []),
            ];
            webSearchEvents += 1;
            res.write(`${JSON.stringify({type: 'webSearch', status: 'searched', queries})}\n`);
          }
        }

        res.end();
        requestLogger.info(
          {
            durationMs: Date.now() - startedAt,
            firstEventMs,
            clientClosed: res.destroyed && !res.writableEnded,
            textEvents,
            thoughtEvents,
            artifactToolEvents,
            webSearchEvents,
          },
          'Gemini stream completed',
        );
        return;
      }

      requestLogger.warn('Unknown Gemini API route');
      sendJson(res, 404, {error: 'Not found'});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gemini request failed.';
      requestLogger.error({err: error, durationMs: Date.now() - startedAt}, 'Gemini request failed');
      if (!res.headersSent) {
        sendJson(res, 500, {error: message});
      } else {
        res.write(`${JSON.stringify({type: 'error', error: message})}\n`);
        res.end();
      }
    }
  };

  return {
    name: 'privora-gemini-api',
    configureServer(server) {
      server.middlewares.use('/api/gemini', handleGeminiRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/gemini', handleGeminiRequest);
    },
  };
};

const createOpenRouterApiPlugin = (apiKey: string | undefined, appUrl: string | undefined, logger: Logger): Plugin => {
  const handleOpenRouterRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const startedAt = Date.now();
    const requestPath = req.url?.split('?')[0] || 'unknown';
    const requestLogger = logger.child({
      requestId: randomUUID(),
      method: req.method,
      path: requestPath,
      service: 'openrouter',
    });

    if (req.method !== 'POST' || (requestPath !== '/chat' && requestPath !== '/api/openrouter/chat')) {
      sendJson(res, 404, {error: 'Not found'});
      return;
    }

    if (!apiKey) {
      requestLogger.error('OpenRouter API key is not configured');
      sendJson(res, 500, {error: 'OPENROUTER_API_KEY is not configured.'});
      return;
    }

    try {
      const body = await readJsonBody(req);
      requestLogger.debug(
        {
          model: body.model,
          stream: Boolean(body.stream),
          toolCount: Array.isArray(body.tools) ? body.tools.length : 0,
          bodyBytes: Buffer.byteLength(JSON.stringify(body), 'utf8'),
        },
        'OpenRouter request received',
      );

      const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(appUrl ? {'HTTP-Referer': appUrl} : {}),
          'X-Title': 'Privora',
        },
        body: JSON.stringify(body),
      });

      if (!upstream.ok) {
        const errorText = await upstream.text().catch(() => '');
        requestLogger.error({statusCode: upstream.status, errorText, durationMs: Date.now() - startedAt}, 'OpenRouter upstream failed');
        sendJson(res, upstream.status, {error: errorText || `OpenRouter request failed with ${upstream.status}`});
        return;
      }

      if (body.stream && upstream.body) {
        res.writeHead(200, {
          'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
          Connection: 'keep-alive',
        });
        res.flushHeaders?.();
        res.socket?.setNoDelay(true);

        const reader = upstream.body.getReader();
        while (true) {
          const {done, value} = await reader.read();
          if (done || res.destroyed) break;
          res.write(Buffer.from(value));
        }
        res.end();
        requestLogger.info({durationMs: Date.now() - startedAt, clientClosed: res.destroyed && !res.writableEnded}, 'OpenRouter stream completed');
        return;
      }

      const data = await upstream.json();
      requestLogger.info({durationMs: Date.now() - startedAt}, 'OpenRouter request completed');
      sendJson(res, 200, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'OpenRouter request failed.';
      requestLogger.error({err: error, durationMs: Date.now() - startedAt}, 'OpenRouter request failed');
      if (!res.headersSent) {
        sendJson(res, 500, {error: message});
      } else {
        res.write(`data: ${JSON.stringify({error: {message}})}\n\n`);
        res.end();
      }
    }
  };

  return {
    name: 'privora-openrouter-api',
    configureServer(server) {
      server.middlewares.use('/api/openrouter', handleOpenRouterRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/openrouter', handleOpenRouterRequest);
    },
  };
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const logger = createLogger(mode);
  const geminiAi = env.GEMINI_API_KEY ? new GoogleGenAI({apiKey: env.GEMINI_API_KEY}) : null;
  const cliproxyBaseUrl = env.CLIPROXY_BASE_URL || 'http://127.0.0.1:8317';
  const cliproxyRequests = new WeakMap<IncomingMessage, {requestId: string; startedAt: number; path: string}>();
  return {
    plugins: [
      createGeminiApiPlugin(env.GEMINI_API_KEY, logger),
      createOpenRouterApiPlugin(env.OPENROUTER_API_KEY, env.APP_URL, logger),
      createResearchApiPlugin({ai: geminiAi, cliproxyBaseUrl, openrouterApiKey: env.OPENROUTER_API_KEY, logger}),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR can be disabled for automated editing sessions via DISABLE_HMR.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/cliproxy': {
          target: cliproxyBaseUrl,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/cliproxy/, ''),
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq, req: IncomingMessage) => {
              const requestId = randomUUID();
              const requestPath = req.url?.split('?')[0] || 'unknown';
              cliproxyRequests.set(req, {
                requestId,
                startedAt: Date.now(),
                path: requestPath,
              });
              proxyReq.setHeader('x-request-id', requestId);
              logger
                .child({requestId, method: req.method, path: requestPath, service: 'cliproxy'})
                .debug('CLIProxy request forwarded');
            });
            proxy.on('proxyRes', (proxyRes, req: IncomingMessage) => {
              const meta = cliproxyRequests.get(req);
              const requestLogger = logger.child({
                requestId: meta?.requestId || randomUUID(),
                method: req.method,
                path: meta?.path || req.url?.split('?')[0] || 'unknown',
                service: 'cliproxy',
              });
              requestLogger.info(
                {
                  statusCode: proxyRes.statusCode,
                  durationMs: meta ? Date.now() - meta.startedAt : undefined,
                },
                'CLIProxy response completed',
              );
            });
            proxy.on('error', (error, req: IncomingMessage) => {
              const meta = cliproxyRequests.get(req);
              logger
                .child({
                  requestId: meta?.requestId || randomUUID(),
                  method: req.method,
                  path: meta?.path || req.url?.split('?')[0] || 'unknown',
                  service: 'cliproxy',
                })
                .error({err: error, durationMs: meta ? Date.now() - meta.startedAt : undefined}, 'CLIProxy proxy failed');
            });
          },
        },
      },
    },
  };
});
