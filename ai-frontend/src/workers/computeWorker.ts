/**
 * Web Worker for fast client-side computation:
 * - Offline token estimation without server roundtrip
 * - Text normalization and regex sanitization
 * - Markdown AST pre-parsing
 * - Client-side state diffing
 */

export interface ComputeMessage {
  type: 'ESTIMATE_TOKENS' | 'NORMALIZE_TEXT' | 'PARSE_METRICS';
  payload: any;
}

export interface ComputeResponse {
  type: string;
  result: any;
}

self.onmessage = (event: MessageEvent<ComputeMessage>) => {
  const { type, payload } = event.data;

  switch (type) {
    case 'ESTIMATE_TOKENS': {
      // Fast heuristic estimate: ~4 chars per token for Latin, ~1.5 for CJK/Vietnamese
      const text = payload.text || '';
      const estimated = Math.ceil(text.length / 3.5);
      self.postMessage({ type, result: { tokens: estimated } });
      break;
    }
    case 'NORMALIZE_TEXT': {
      const cleaned = (payload.text || '')
        .replace(/\r\n/g, '\n')
        .trim();
      self.postMessage({ type, result: { cleaned } });
      break;
    }
    case 'PARSE_METRICS': {
      const stats = {
        charCount: (payload.text || '').length,
        wordCount: (payload.text || '').split(/\s+/).filter(Boolean).length,
      };
      self.postMessage({ type, result: stats });
      break;
    }
    default:
      self.postMessage({ type: 'ERROR', result: 'Unknown task' });
  }
};
