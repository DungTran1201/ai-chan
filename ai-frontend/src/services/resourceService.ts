import { ResourceSummary, UserQuotaStatus, ApiMetricLogItem, SSEMetricEvent } from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api/v1';

export class ResourceService {
  /**
   * Lấy dữ liệu KPI tổng hợp hiệu năng và hạn ngạch (OP-018)
   */
  static async getSummary(range: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<ResourceSummary> {
    const res = await fetch(`${BASE_URL}/resources/summary?range=${range}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Không thể lấy dữ liệu thống kê tài nguyên');
    }

    const json = await res.json();
    return json.data;
  }

  /**
   * Lấy thông tin chi tiết Quota token người dùng (OP-020)
   */
  static async getQuota(): Promise<UserQuotaStatus> {
    const res = await fetch(`${BASE_URL}/resources/quota`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Không thể lấy thông tin hạn ngạch');
    }

    const json = await res.json();
    return json.data;
  }

  /**
   * Lấy lịch sử các bản ghi telemetry gần nhất (OP-021)
   */
  static async getHistory(limit: number = 50, offset: number = 0): Promise<ApiMetricLogItem[]> {
    const res = await fetch(`${BASE_URL}/resources/history?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Không thể lấy lịch sử API');
    }

    const json = await res.json();
    return json.data.items || [];
  }

  /**
   * Khởi tạo kết nối SSE EventSource phát luồng telemetry thời gian thực (OP-019)
   */
  static subscribeStream(
    callbacks: {
      onInitialState?: (data: ResourceSummary) => void;
      onMetricUpdate?: (data: SSEMetricEvent) => void;
      onQuotaAlert?: (data: any) => void;
      onError?: (err: any) => void;
      onOpen?: () => void;
    }
  ): () => void {
    const sseUrl = `${BASE_URL}/resources/stream`;
    const eventSource = new EventSource(sseUrl, { withCredentials: true });

    eventSource.onopen = () => {
      if (callbacks.onOpen) callbacks.onOpen();
    };

    eventSource.addEventListener('initial_state', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (callbacks.onInitialState) callbacks.onInitialState(data);
      } catch (err) {
        console.error('Lỗi phân tích initial_state SSE:', err);
      }
    });

    eventSource.addEventListener('metric_update', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (callbacks.onMetricUpdate) callbacks.onMetricUpdate(data);
      } catch (err) {
        console.error('Lỗi phân tích metric_update SSE:', err);
      }
    });

    eventSource.addEventListener('quota_alert', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (callbacks.onQuotaAlert) callbacks.onQuotaAlert(data);
      } catch (err) {
        console.error('Lỗi phân tích quota_alert SSE:', err);
      }
    });

    eventSource.onerror = (err) => {
      if (callbacks.onError) callbacks.onError(err);
    };

    // Hàm dọn dẹp đóng kết nối
    return () => {
      eventSource.close();
    };
  }
}
