import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {GoogleGenAI, ThinkingLevel} from '@google/genai';
import type {IncomingMessage, ServerResponse} from 'node:http';
import path from 'path';
import pino, {type Logger} from 'pino';
import {randomUUID} from 'node:crypto';
import {defineConfig, loadEnv, type Plugin} from 'vite';

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

type ResearchStatus = 'queued' | 'searching' | 'reading' | 'synthesizing' | 'completed' | 'stopped' | 'failed';

interface ResearchSource {
  title?: string;
  url: string;
  provider?: string;
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

const parseCliproxySseEvent = (rawEvent: string) => {
  const lines = rawEvent.split('\n');
  const event = lines.find(line => line.startsWith('event:'))?.slice('event:'.length).trim();
  const dataLines = lines.filter(line => line.startsWith('data:')).map(line => line.slice('data:'.length).trim());
  return {event, dataLines};
};

const formatResearchPrompt = (body: any) => {
  const prompt = body.plan?.refinedPrompt || body.history?.at?.(-1)?.content || '';
  const steps = Array.isArray(body.plan?.steps)
    ? body.plan.steps.map((step: any, index: number) => `${index + 1}. ${typeof step === 'string' ? step : step?.text || ''}`).join('\n')
    : '';
  return [
    prompt,
    steps ? `\nResearch plan:\n${steps}` : '',
    '\nReturn a final answer with compact citations and a short source list when source URLs are available.',
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
    ? ` I gathered ${sources.length} source${sources.length === 1 ? '' : 's'}, but the provider did not return a final synthesis before the limit.`
    : ' No usable sources were returned before the limit.';
  return `Deep Research reached its time limit before the final synthesis.${sourceNote} Try again with a narrower scope or a longer research window.`;
};

const createProviderResearchRuntime = ({
  ai,
  cliproxyBaseUrl,
}: {
  ai: GoogleGenAI | null;
  cliproxyBaseUrl: string;
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
      emit({type: 'sources', sources: mergedSources});
      nextSources.slice(0, 6).forEach(source => emitActivity('source', source.title || source.url, undefined, source));
      return mergedSources;
    };
    const throwIfStopped = () => {
      if (job.cancelled || job.controller.signal.aborted) {
        throw new Error('Research job stopped.');
      }
    };

    try {
      emitActivity('planning', 'Research plan accepted', body.plan?.title);
      emit({type: 'planStep', index: 0, status: 'active', message: getPlanStepText(body.plan, 0)});
      emit({type: 'status', status: 'searching', message: 'Searching the web'});
      emitActivity('searching', 'Searching for relevant sources');
      await new Promise(resolve => setTimeout(resolve, 250));
      throwIfStopped();

      emit({type: 'planStep', index: 0, status: 'completed'});
      emit({type: 'planStep', index: 1, status: 'active', message: getPlanStepText(body.plan, 1)});
      emit({type: 'status', status: 'reading', message: 'Reading and comparing sources'});
      emitActivity('reading', 'Reading and comparing sources');

      if (provider === 'gemini') {
        if (!ai) throw new Error('GEMINI_API_KEY is not configured.');
        let text = '';
        let didEnterSynthesis = false;
        let sources: ResearchSource[] = [];
        const seenSourceUrls = new Set<string>();
        const responseStream = await ai.models.generateContentStream({
          model: body.model,
          contents: [
            ...toGeminiResearchContents(body.history || []),
            {role: 'user', parts: [{text: formatResearchPrompt(body)}]},
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

        for await (const chunk of responseStream) {
          throwIfStopped();

          const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
          const nextSources = groundingChunks
            .map((chunkItem: any) => chunkItem?.web)
            .filter(Boolean)
            .map((web: any) => ({title: web.title, url: web.uri, provider: 'Google Search'}))
            .filter((source: ResearchSource) => source.url && !seenSourceUrls.has(source.url));
          if (nextSources.length > 0) {
            nextSources.forEach((source: ResearchSource) => seenSourceUrls.add(source.url));
            sources = uniqueSources([...sources, ...nextSources]);
            emit({type: 'sources', sources});
            nextSources.slice(0, 6).forEach((source: ResearchSource) => emitActivity('source', source.title || source.url, undefined, source));
          }

          const parts = chunk.candidates?.[0]?.content?.parts || [];
          const textDelta = parts
            .filter((part: any) => !part.thought && typeof part.text === 'string')
            .map((part: any) => part.text)
            .join('') || chunk.text || '';
          if (textDelta) {
            if (!didEnterSynthesis) {
              emit({type: 'planStep', index: 1, status: 'completed'});
              emit({type: 'planStep', index: 2, status: 'active', message: getPlanStepText(body.plan, 2)});
              emitActivity('comparing', 'Checking source agreement and contradictions');
              emit({type: 'planStep', index: 2, status: 'completed'});
              emit({type: 'planStep', index: 3, status: 'active', message: getPlanStepText(body.plan, 3)});
              emit({type: 'status', status: 'synthesizing', message: 'Synthesizing answer'});
              emitActivity('synthesizing', 'Synthesizing cited answer');
              didEnterSynthesis = true;
            }
            sources = addTextSources(textDelta, sources, seenSourceUrls, 'Generated citation');
            text += textDelta;
            emit({type: 'text', text});
          }
        }

        if (!didEnterSynthesis) {
          emit({type: 'planStep', index: 1, status: 'completed'});
          emit({type: 'planStep', index: 2, status: 'completed'});
          emit({type: 'planStep', index: 3, status: 'active', message: getPlanStepText(body.plan, 3)});
          emit({type: 'status', status: 'synthesizing', message: 'Synthesizing answer'});
          emitActivity('synthesizing', 'Synthesizing cited answer');
        }
        (body.plan?.steps || []).forEach((_step: string, index: number) => {
          if (index >= 3) emit({type: 'planStep', index, status: 'completed'});
        });
        emit({type: 'completed', text, sources});
        return;
      }

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
            {role: 'user', content: [{type: 'input_text', text: formatResearchPrompt(body)}]},
          ],
          tools: [{type: 'web_search_preview'}],
          reasoning: {effort: 'medium', summary: 'auto'},
          stream: true,
          temperature: 0.35,
        }),
        signal: job.controller.signal,
      });

      if (!response.ok) {
        throw new Error((await response.text().catch(() => '')) || `CLIProxy research failed with ${response.status}`);
      }

      if (!response.body) {
        throw new Error('CLIProxy research response did not include a stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      let didEnterSynthesis = false;
      let sources: ResearchSource[] = [];
      const seenSourceUrls = new Set<string>();
      const flushCliproxyEvent = (rawEvent: string) => {
        const {event, dataLines} = parseCliproxySseEvent(rawEvent);
        for (const dataLine of dataLines) {
          if (!dataLine || dataLine === '[DONE]') continue;
          try {
            const data = JSON.parse(dataLine);
            const urls = Array.from(collectUrls(data)).filter(url => !seenSourceUrls.has(url));
            if (urls.length > 0) {
              urls.forEach(url => seenSourceUrls.add(url));
              const nextSources: ResearchSource[] = urls.map(url => ({url, provider: 'Web search'}));
              sources = uniqueSources([...sources, ...nextSources]);
              emit({type: 'sources', sources});
              nextSources.slice(0, 6).forEach(source => emitActivity('source', source.title || source.url, undefined, source));
            }

            const textDelta = extractCliproxyStreamTextDelta(event, data);
            if (textDelta) {
              if (!didEnterSynthesis) {
                emit({type: 'planStep', index: 1, status: 'completed'});
                emit({type: 'planStep', index: 2, status: 'active', message: getPlanStepText(body.plan, 2)});
                emitActivity('comparing', 'Checking source agreement and contradictions');
                emit({type: 'planStep', index: 2, status: 'completed'});
                emit({type: 'planStep', index: 3, status: 'active', message: getPlanStepText(body.plan, 3)});
                emit({type: 'status', status: 'synthesizing', message: 'Synthesizing answer'});
                emitActivity('synthesizing', 'Synthesizing cited answer');
                didEnterSynthesis = true;
              }
              sources = addTextSources(textDelta, sources, seenSourceUrls, 'Generated citation');
              text += textDelta;
              emit({type: 'text', text});
            }

            const finalText = extractCliproxyStreamFinalText(event, data);
            if (finalText && finalText.length > text.length) {
              if (!didEnterSynthesis) {
                emit({type: 'planStep', index: 1, status: 'completed'});
                emit({type: 'planStep', index: 2, status: 'completed'});
                emit({type: 'planStep', index: 3, status: 'active', message: getPlanStepText(body.plan, 3)});
                emit({type: 'status', status: 'synthesizing', message: 'Synthesizing answer'});
                emitActivity('synthesizing', 'Synthesizing cited answer');
                didEnterSynthesis = true;
              }
              sources = addTextSources(finalText, sources, seenSourceUrls, 'Generated citation');
              text = finalText;
              emit({type: 'text', text});
            }
          } catch {
            if (dataLine.startsWith('{')) return;
            if (!didEnterSynthesis) {
              emit({type: 'status', status: 'synthesizing', message: 'Synthesizing answer'});
              emitActivity('synthesizing', 'Synthesizing cited answer');
              didEnterSynthesis = true;
            }
            text += dataLine;
            sources = addTextSources(dataLine, sources, seenSourceUrls, 'Generated citation');
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
          urls.forEach(url => seenSourceUrls.add(url));
          sources = uniqueSources([...sources, ...urls.map(url => ({url, provider: 'Web search'}))]);
          text ||= extractCliproxyText(data);
          if (text) sources = addTextSources(text, sources, seenSourceUrls, 'Generated citation');
          if (text) emit({type: 'text', text});
          if (sources.length > 0) emit({type: 'sources', sources});
        } catch {
          flushCliproxyEvent(buffer);
        }
      }

      if (!didEnterSynthesis) {
        emit({type: 'planStep', index: 1, status: 'completed'});
        emit({type: 'planStep', index: 2, status: 'completed'});
        emit({type: 'planStep', index: 3, status: 'active', message: getPlanStepText(body.plan, 3)});
        emit({type: 'status', status: 'synthesizing', message: 'Synthesizing answer'});
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
      clearTimeout(timeout);
    }
  },
});

const createResearchApiPlugin = ({
  ai,
  cliproxyBaseUrl,
  logger,
}: {
  ai: GoogleGenAI | null;
  cliproxyBaseUrl: string;
  logger: Logger;
}): Plugin => {
  const jobs = new Map<string, ResearchJob>();
  const runtime = createProviderResearchRuntime({ai, cliproxyBaseUrl});

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
            throw new Error((await response.text().catch(() => '')) || `CLIProxy preflight failed with ${response.status}`);
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

      if (requestPath === '/stream' || requestPath === '/api/gemini/stream') {
        let textEvents = 0;
        let thoughtEvents = 0;
        let webSearchEvents = 0;
        let firstEventMs: number | undefined;
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
            ...(body.webSearchEnabled ? {tools: [{googleSearch: {}}]} : {}),
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
            if (part.thought && part.text) {
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

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const logger = createLogger(mode);
  const geminiAi = env.GEMINI_API_KEY ? new GoogleGenAI({apiKey: env.GEMINI_API_KEY}) : null;
  const cliproxyBaseUrl = env.CLIPROXY_BASE_URL || 'http://127.0.0.1:8317';
  const cliproxyRequests = new WeakMap<IncomingMessage, {requestId: string; startedAt: number; path: string}>();
  return {
    plugins: [
      createGeminiApiPlugin(env.GEMINI_API_KEY, logger),
      createResearchApiPlugin({ai: geminiAi, cliproxyBaseUrl, logger}),
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
