/**
 * LLM factory — returns a LangChain chat model.
 *
 * In development, defaults to Ollama (local).
 * In production, switch to a cloud provider by setting LLM_PROVIDER
 * (openai | anthropic | gemini | deepseek | huggingface).
 *
 * This is the single place to swap models across the entire GCFIS system.
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';

export type LlmProvider =
  | 'ollama'
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'deepseek'
  | 'huggingface';

export interface LlmOptions {
  /** Override the provider (defaults to LLM_PROVIDER env var, then 'ollama') */
  provider?: LlmProvider;
  /** Override the model name */
  model?: string;
  /** Temperature [0, 1] */
  temperature?: number;
  /** Whether to stream responses */
  streaming?: boolean;
  /** API key override (for cloud providers — overrides env var) */
  apiKey?: string;
  /** Base URL override (for self-hosted Ollama) */
  baseUrl?: string;
}

export class LlmService {
  public getModel(options: LlmOptions = {}): BaseChatModel {
    const provider =
      (options.provider ?? (process.env['LLM_PROVIDER'] as LlmProvider | undefined)) ?? 'ollama';

    const temperature = options.temperature ?? 0.2;
    const streaming = options.streaming ?? true;

    switch (provider) {
      case 'ollama': {
        const baseUrl = options.baseUrl ?? process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
        const model = options.model ?? process.env['OLLAMA_MODEL'] ?? 'llama3.1:8b';
        return new ChatOllama({ baseUrl, model, temperature, streaming });
      }

      case 'openai': {
        // Dynamic import to avoid requiring the package when using Ollama
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatOpenAI } = require('@langchain/openai');
        const apiKey = options.apiKey ?? process.env['OPENAI_API_KEY'];
        if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
        const model = options.model ?? 'gpt-4o-mini';
        return new ChatOpenAI({ apiKey, model, temperature, streaming });
      }

      case 'anthropic': {
        // Dynamic import to avoid requiring the package when using Ollama
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatAnthropic } = require('@langchain/anthropic');
        const apiKey = options.apiKey ?? process.env['ANTHROPIC_API_KEY'];
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
        const model = options.model ?? 'claude-3-5-sonnet-20241022';
        return new ChatAnthropic({ apiKey, model, temperature, streaming });
      }

      case 'gemini': {
        // Dynamic import to avoid requiring the package when this provider isn't used
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
        const apiKey = options.apiKey ?? process.env['GEMINI_API_KEY'] ?? process.env['GOOGLE_API_KEY'];
        if (!apiKey) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) is not set');
        const model = options.model ?? 'gemini-1.5-flash';
        return new ChatGoogleGenerativeAI({ apiKey, model, temperature });
      }

      case 'deepseek': {
        // DeepSeek is OpenAI-compatible, so route through ChatOpenAI with a custom base URL.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { ChatOpenAI } = require('@langchain/openai');
        const apiKey = options.apiKey ?? process.env['DEEPSEEK_API_KEY'];
        if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');
        const model = options.model ?? 'deepseek-chat';
        const baseURL = options.baseUrl ?? process.env['DEEPSEEK_BASE_URL'] ?? 'https://api.deepseek.com/v1';
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
        const model = options.model ?? 'meta-llama/Llama-3.1-8B-Instruct';
        const baseURL =
          options.baseUrl ?? process.env['HUGGINGFACE_BASE_URL'] ?? 'https://router.huggingface.co/v1';
        return new ChatOpenAI({
          apiKey,
          model,
          temperature,
          streaming,
          configuration: { baseURL },
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
 *  - LLM_PROVIDER: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'huggingface' (default: 'ollama')
 *  - OLLAMA_BASE_URL: URL of local Ollama instance (default: http://localhost:11434)
 *  - OLLAMA_MODEL: model tag (default: llama3.1:8b)
 *  - OPENAI_API_KEY: required when LLM_PROVIDER=openai
 *  - ANTHROPIC_API_KEY: required when LLM_PROVIDER=anthropic
 *  - GEMINI_API_KEY or GOOGLE_API_KEY: required when LLM_PROVIDER=gemini
 *  - DEEPSEEK_API_KEY: required when LLM_PROVIDER=deepseek
 *  - HUGGINGFACE_API_KEY (or HF_TOKEN): required when LLM_PROVIDER=huggingface
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
