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

export interface UserQuotaStatus {
  user_id: string;
  daily_token_limit: number;
  daily_tokens_used: number;
  percent_used: number;
  warning_80: boolean;
  reset_at: string;
}

export interface MetricTrendPoint {
  time: string;
  latency_ms: number;
  ttft_ms: number;
  tokens: number;
}

export interface ResourceSummary {
  time_range: '1h' | '24h' | '7d' | '30d';
  total_requests: number;
  avg_latency_ms: number;
  avg_ttft_ms: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  status_counts: {
    '2xx': number;
    '4xx': number;
    '5xx': number;
  };
  tokens_by_provider: {
    google: number;
    openai: number;
    anthropic: number;
    other: number;
  };
  recent_trend: MetricTrendPoint[];
  quota_status: UserQuotaStatus;
}

export interface ApiMetricLogItem {
  id: string;
  user_id: string | null;
  endpoint: string;
  method: string;
  status_code: number;
  latency_ms: number;
  ttft_ms: number | null;
  model_name: string | null;
  provider: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  error_code: string | null;
  created_at: string;
}

export interface SSEMetricEvent {
  metric: ApiMetricLogItem;
  quota: {
    daily_tokens_used: number;
    daily_token_limit: number;
    percent_used: number;
    warning_80: boolean;
  };
}


