export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  tokens?: number;
  model?: string;
  status?: 'pending' | 'streaming' | 'completed' | 'error';
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface LLMProviderOption {
  id: string;
  name: string;
  provider: 'openai' | 'gemini' | 'anthropic' | 'ollama';
  modelId: string;
}

export interface AgentModel {
  id: string;
  name: string;
  provider: 'google' | 'anthropic' | 'openai' | 'groq' | 'ollama';
  status: 'ACTIVE' | 'INACTIVE' | 'DEGRADED';
  is_default: boolean;
  context_window: number;
  max_tokens: number;
  supports_streaming: boolean;
  has_api_key: boolean;
  latency_ms: number | null;
  last_checked_at: string | null;
  created_at?: string;
  updated_at?: string;
}

