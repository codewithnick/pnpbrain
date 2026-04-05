/**
 * LLM factory — returns a LangChain chat model.
 *
 * Defaults to hosted/router-backed providers.
 * Local Ollama is kept as an explicit opt-in only.
 *
 * This is the single place to swap models across the entire PNpbrain system.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';

export type LlmProvider =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'huggingface'
  | 'openrouter';

export interface LlmOptions {
  /** Override the provider (defaults to LLM_PROVIDER env var, then a hosted provider) */
  provider?: LlmProvider;
  /** Override the model name */
  model?: string;
  /** Temperature [0, 1] */
  temperature?: number;
  /** Whether to stream responses */
  streaming?: boolean;
  /** API key override (for cloud providers — overrides env var) */
  apiKey?: string;
  /** Base URL override (for hosted routers or explicit Ollama opt-in) */
  baseUrl?: string;
}

const DEFAULT_REMOTE_LLM_PROVIDER: LlmProvider = 'huggingface';

function hasConfiguredValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function inferProviderFromBaseUrl(baseUrl?: string): LlmProvider | undefined {
  const normalized = baseUrl?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes('localhost:11434') || normalized.includes('127.0.0.1:11434')) return 'ollama';
  if (normalized.includes('huggingface.co')) return 'huggingface';
  if (normalized.includes('openrouter.ai')) return 'openrouter';
  if (normalized.includes('deepseek.com')) return 'deepseek';
  if (normalized.includes('anthropic.com')) return 'anthropic';
  if (normalized.includes('googleapis.com')) return 'gemini';
  if (normalized.includes('openai.com')) return 'openai';
  return undefined;
}

function isLocalOllamaBaseUrl(baseUrl?: string): boolean {
  return inferProviderFromBaseUrl(baseUrl) === 'ollama';
}

function getHostedFallbackProvider(): LlmProvider {
  if (
    hasConfiguredValue(process.env['HUGGINGFACE_API_KEY']) ||
    hasConfiguredValue(process.env['HF_TOKEN']) ||
    hasConfiguredValue(process.env['HUGGINGFACEHUB_API_TOKEN'])
  ) {
    return 'huggingface';
  }

  if (hasConfiguredValue(process.env['OPENROUTER_API_KEY'])) return 'openrouter';
  if (hasConfiguredValue(process.env['OPENAI_API_KEY'])) return 'openai';
  if (hasConfiguredValue(process.env['ANTHROPIC_API_KEY'])) return 'anthropic';
  if (hasConfiguredValue(process.env['DEEPSEEK_API_KEY'])) return 'deepseek';
  if (hasConfiguredValue(process.env['GEMINI_API_KEY']) || hasConfiguredValue(process.env['GOOGLE_API_KEY'])) {
    return 'gemini';
  }

  return DEFAULT_REMOTE_LLM_PROVIDER;
}

function resolveProviderFromApiKey(options: LlmOptions): LlmProvider {
  const inferredProvider = inferProviderFromBaseUrl(options.baseUrl);
  if (inferredProvider && inferredProvider !== 'ollama') {
    return inferredProvider;
  }

  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    return getHostedFallbackProvider();
  }

  if (
    apiKey === process.env['HUGGINGFACE_API_KEY'] ||
    apiKey === process.env['HF_TOKEN'] ||
    apiKey === process.env['HUGGINGFACEHUB_API_TOKEN']
  ) {
    return 'huggingface';
  }

  if (apiKey === process.env['OPENROUTER_API_KEY']) return 'openrouter';
  if (apiKey === process.env['DEEPSEEK_API_KEY']) return 'deepseek';
  if (apiKey === process.env['ANTHROPIC_API_KEY']) return 'anthropic';
  if (apiKey === process.env['GEMINI_API_KEY'] || apiKey === process.env['GOOGLE_API_KEY']) {
    return 'gemini';
  }

  return 'openai';
}

function resolveLlmProvider(options: LlmOptions): LlmProvider {
  const configuredProvider = options.provider ?? (process.env['LLM_PROVIDER'] as LlmProvider | undefined);
  if (configuredProvider && configuredProvider !== 'ollama') {
    return configuredProvider;
  }

  const allowLocalOllama =
    process.env['ALLOW_LOCAL_OLLAMA'] === 'true' || process.env['ALLOW_LOCAL_LLM'] === 'true';

  if ((configuredProvider === 'ollama' || isLocalOllamaBaseUrl(options.baseUrl)) && allowLocalOllama) {
    return 'ollama';
  }

  if (options.apiKey) {
    return resolveProviderFromApiKey(options);
  }

  const inferredProvider = inferProviderFromBaseUrl(options.baseUrl);
  if (inferredProvider && inferredProvider !== 'ollama') {
    return inferredProvider;
  }

  return getHostedFallbackProvider();
}

function resolveModel(provider: LlmProvider, requestedModel?: string): string {
  const trimmedModel = requestedModel?.trim();
  const looksLikeLegacyOllamaModel = trimmedModel?.includes(':') ?? false;

  if (trimmedModel && !(provider !== 'ollama' && looksLikeLegacyOllamaModel)) {
    return trimmedModel;
  }

  switch (provider) {
    case 'openai':
      return 'gpt-4o-mini';
    case 'anthropic':
      return 'claude-3-5-sonnet-20241022';
    case 'gemini':
      return 'gemini-1.5-flash';
    case 'deepseek':
      return 'deepseek-chat';
    case 'huggingface':
      return 'meta-llama/Llama-3.1-8B-Instruct';
    case 'openrouter':
      return 'openai/gpt-4o-mini';
    case 'ollama':
    default:
      return process.env['OLLAMA_MODEL'] ?? 'llama3.1:8b';
  }
}

export class LlmService {
  public getModel(options: LlmOptions = {}): BaseChatModel {
    const provider = resolveLlmProvider(options);
    const requestedProvider = options.provider ?? (process.env['LLM_PROVIDER'] as LlmProvider | undefined);
    const temperature = options.temperature ?? 0.2;
    const streaming = options.streaming ?? true;
    const baseUrlOverride = provider !== 'ollama' && isLocalOllamaBaseUrl(options.baseUrl)
      ? undefined
      : options.baseUrl;
    const model = resolveModel(provider, options.model);

    const baseUrlSuffix = baseUrlOverride ? ` baseUrl=${baseUrlOverride}` : '';
    const apiKeySource = options.apiKey ? 'provided' : 'env';
    console.log(
      `[AGENT/llm] provider=${provider} requested=${requestedProvider ?? 'unset'} model=${model}${baseUrlSuffix} apiKey=${apiKeySource}`
    );

    switch (provider) {
      case 'ollama': {
        const baseUrl = baseUrlOverride ?? process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
        return new ChatOllama({ baseUrl, model, temperature, streaming });
      }

      case 'openai': {
        // Dynamic import to avoid requiring the package when using a different provider.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatOpenAI } = require('@langchain/openai');
        const apiKey = options.apiKey ?? process.env['OPENAI_API_KEY'];
        if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
        return new ChatOpenAI({
          apiKey,
          model,
          temperature,
          streaming,
          ...(baseUrlOverride ? { configuration: { baseURL: baseUrlOverride } } : {}),
        });
      }

      case 'anthropic': {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatAnthropic } = require('@langchain/anthropic');
        const apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY'];
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
        return new ChatAnthropic({ apiKey, model, temperature, streaming });
      }

      case 'gemini': {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
        const apiKey = options.apiKey ?? process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
        if (!apiKey) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) is not set');
        return new ChatGoogleGenerativeAI({ apiKey, model, temperature });
      }

      case 'deepseek': {
        // DeepSeek is OpenAI-compatible, so route through ChatOpenAI with a custom base URL.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatOpenAI } = require('@langchain/openai');
        const apiKey = options.apiKey ?? process.env['DEEPSEEK_API_KEY'];
        if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');
        const baseURL = baseUrlOverride ?? process.env['DEEPSEEK_BASE_URL'] ?? 'https://api.deepseek.com/v1';
        return new ChatOpenAI({
          apiKey,
          model,
          temperature,
          streaming,
          configuration: { baseURL },
        });
      }

      case 'huggingface': {
        // Hugging Face router is OpenAI-compatible, so route through ChatOpenAI.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatOpenAI } = require('@langchain/openai');
        const apiKey =
          options.apiKey ??
          process.env['HUGGINGFACE_API_KEY'] ??
          process.env['HF_TOKEN'] ??
          process.env['HUGGINGFACEHUB_API_TOKEN'];
        if (!apiKey) {
          throw new Error('HUGGINGFACE_API_KEY (or HF_TOKEN / HUGGINGFACEHUB_API_TOKEN) is not set');
        }
        const baseURL =
          baseUrlOverride ?? process.env['HUGGINGFACE_BASE_URL'] ?? 'https://router.huggingface.co/v1';
        return new ChatOpenAI({
          apiKey,
          model,
          temperature,
          streaming,
          configuration: { baseURL },
        });
      }

      case 'openrouter': {
        // OpenRouter is OpenAI-compatible, so route through ChatOpenAI.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatOpenAI } = require('@langchain/openai');
        const apiKey = options.apiKey ?? process.env['OPENROUTER_API_KEY'];
        if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
        const baseURL =
          baseUrlOverride ?? process.env['OPENROUTER_BASE_URL'] ?? 'https://openrouter.ai/api/v1';
        const referer = process.env['OPENROUTER_HTTP_REFERER'];
        const title = process.env['OPENROUTER_X_TITLE'];
        const defaultHeaders: Record<string, string> = {};
        if (referer) defaultHeaders['HTTP-Referer'] = referer;
        if (title) defaultHeaders['X-Title'] = title;

        return new ChatOpenAI({
          apiKey,
          model,
          temperature,
          streaming,
          configuration: {
            baseURL,
            ...(Object.keys(defaultHeaders).length > 0 ? { defaultHeaders } : {}),
          },
        });
      }

      default:
        throw new Error(`Unknown LLM provider: ${String(provider)}`);
    }
  }

  public getSyncModel(options: Omit<LlmOptions, 'streaming'> = {}): BaseChatModel {
    return this.getModel({ ...options, streaming: false });
  }
}

const defaultLlmService = new LlmService();

/**
 * Returns a configured LangChain chat model based on environment variables.
 *
 * Environment variables:
 *  - LLM_PROVIDER: 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'huggingface' | 'openrouter' | 'ollama' (default: hosted fallback, prefers huggingface)
 *  - OLLAMA_BASE_URL: URL of local Ollama instance (only used when local Ollama is explicitly allowed)
 *  - OLLAMA_MODEL: model tag for explicit Ollama usage
 *  - OPENAI_API_KEY: required when LLM_PROVIDER=openai
 *  - ANTHROPIC_API_KEY: required when LLM_PROVIDER=anthropic
 *  - GEMINI_API_KEY or GOOGLE_API_KEY: required when LLM_PROVIDER=gemini
 *  - DEEPSEEK_API_KEY: required when LLM_PROVIDER=deepseek
 *  - HUGGINGFACE_API_KEY (or HF_TOKEN): required when LLM_PROVIDER=huggingface
 *  - OPENROUTER_API_KEY: required when LLM_PROVIDER=openrouter
 *  - OPENROUTER_BASE_URL: optional override (default: https://openrouter.ai/api/v1)
 *  - OPENROUTER_HTTP_REFERER / OPENROUTER_X_TITLE: optional attribution headers
 */
export function getLlm(options: LlmOptions = {}): BaseChatModel {
  return defaultLlmService.getModel(options);
}

/**
 * Returns a non-streaming LLM for tasks where streaming isn't needed
 * (e.g. embedding generation, structured extraction).
 */
export function getLlmSync(options: Omit<LlmOptions, 'streaming'> = {}): BaseChatModel {
  return defaultLlmService.getSyncModel(options);
}
