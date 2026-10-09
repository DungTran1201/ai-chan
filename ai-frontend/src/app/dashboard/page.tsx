'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ResourceService } from '@/services/resourceService';
import { ResourceSummary, UserQuotaStatus, ApiMetricLogItem, SSEMetricEvent } from '@/types';

type TimeRange = '1h' | '24h' | '7d' | '30d';

export default function ResourceDashboardPage() {
  const router = useRouter();

  // State quản lý dữ liệu
  const [range, setRange] = useState<TimeRange>('24h');
  const [summary, setSummary] = useState<ResourceSummary | null>(null);
  const [history, setHistory] = useState<ApiMetricLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sseStatus, setSseStatus] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<{ x: number; y: number; data: any } | null>(null);

  // Tải dữ liệu ban đầu
  const loadData = async (selectedRange: TimeRange) => {
    try {
      const [sumData, histData] = await Promise.all([
        ResourceService.getSummary(selectedRange),
        ResourceService.getHistory(30)
      ]);
      setSummary(sumData);
      setHistory(histData);
    } catch (err: any) {
      console.error('Lỗi khi tải dữ liệu dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(range);
  }, [range]);

  // Thiết lập luồng SSE thời gian thực
  useEffect(() => {
    setSseStatus('reconnecting');
    const unsubscribe = ResourceService.subscribeStream({
      onOpen: () => {
        setSseStatus('connected');
      },
      onInitialState: (data) => {
        setSummary(data);
      },
      onMetricUpdate: (event: SSEMetricEvent) => {
        // Cập nhật bản ghi mới vào bảng live feed
        setHistory((prev) => [event.metric, ...prev.slice(0, 49)]);
        setHighlightId(event.metric.id);
        setTimeout(() => setHighlightId(null), 2500);

        // Cập nhật tóm tắt KPI & Quota tức thời
        setSummary((prev) => {
          if (!prev) return prev;
          const newTotalReqs = prev.total_requests + 1;
          const newTotalTokens = prev.total_tokens + event.metric.total_tokens;
          const newAvgLatency = Math.round(
            ((prev.avg_latency_ms * prev.total_requests) + event.metric.latency_ms) / newTotalReqs * 10
          ) / 10;

          const updatedTrend = [
            ...prev.recent_trend.slice(-29),
            {
              time: event.metric.created_at.split(' ')[1] || 'Now',
              latency_ms: event.metric.latency_ms,
              ttft_ms: event.metric.ttft_ms || 0,
              tokens: event.metric.total_tokens
            }
          ];

          return {
            ...prev,
            total_requests: newTotalReqs,
            total_tokens: newTotalTokens,
            avg_latency_ms: newAvgLatency,
            recent_trend: updatedTrend,
            quota_status: {
              ...prev.quota_status,
              daily_tokens_used: event.quota.daily_tokens_used,
              percent_used: event.quota.percent_used,
              warning_80: event.quota.warning_80
            }
          };
        });
      },
      onQuotaAlert: () => {
        // Làm mới dữ liệu quota
        ResourceService.getQuota().then((q) => {
          setSummary((prev) => prev ? { ...prev, quota_status: q } : prev);
        }).catch(() => {});
      },
      onError: () => {
        setSseStatus('reconnecting');
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const quota = summary?.quota_status;
  const percentUsed = quota?.percent_used || 0;
  const isWarning80 = percentUsed >= 80 && percentUsed < 100;
  const isExhausted = percentUsed >= 100;

  // Tính toán màu sắc Gauge
  const gaugeColor = isExhausted ? '#ef4444' : isWarning80 ? '#f59e0b' : '#10b981';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', paddingBottom: '60px' }}>
      {/* 1. Header Bar */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        backdropFilter: 'blur(16px)',
        background: 'rgba(10, 15, 29, 0.85)',
        borderBottom: '1px solid var(--border-subtle)',
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link
            href="/chat"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '0.85rem',
              transition: 'all 0.2s ease'
            }}
          >
            <span>← Quay lại Chat</span>
          </Link>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>📊 Quản Lý Tài Nguyên & Telemetry Dashboard</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
              Giám sát hiệu năng hệ thống, độ trễ phản hồi, mức tiêu thụ Token và hạn ngạch API thời gian thực
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Trạng thái SSE */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            background: sseStatus === 'connected' ? 'rgba(16, 185, 129, 0.12)' : sseStatus === 'reconnecting' ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${sseStatus === 'connected' ? 'rgba(16, 185, 129, 0.35)' : sseStatus === 'reconnecting' ? 'rgba(245, 158, 11, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
            fontSize: '0.75rem',
            fontWeight: 600,
            color: sseStatus === 'connected' ? '#34d399' : sseStatus === 'reconnecting' ? '#fbbf24' : '#f87171'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: sseStatus === 'connected' ? '#10b981' : sseStatus === 'reconnecting' ? '#f59e0b' : '#ef4444',
              boxShadow: sseStatus === 'connected' ? '0 0 8px #10b981' : 'none',
              display: 'inline-block'
            }} />
            <span>
              {sseStatus === 'connected' ? 'LIVE SSE CONNECTED' : sseStatus === 'reconnecting' ? 'CONNECTING...' : 'DISCONNECTED'}
            </span>
          </div>

          {/* Bộ lọc Time Range */}
          <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.05)', borderRadius: 'var(--radius-sm)', padding: '3px', border: '1px solid var(--border-subtle)' }}>
            {(['1h', '24h', '7d', '30d'] as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: 'none',
                  background: range === r ? 'var(--accent-primary)' : 'transparent',
                  color: range === r ? '#fff' : 'var(--text-muted)',
                  fontSize: '0.78rem',
                  fontWeight: range === r ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
              >
                {r === '1h' ? '1 Giờ' : r === '24h' ? '24 Giờ' : r === '7d' ? '7 Ngày' : '30 Ngày'}
              </button>
            ))}
          </div>

          {/* Nút Làm mới thủ công */}
          <button
            type="button"
            onClick={() => loadData(range)}
            title="Làm mới số liệu"
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            🔄 Tải lại
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px' }}>
        {/* 2. Banner Cảnh Báo Quota (BR-020) */}
        {isExhausted && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.15) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            boxShadow: '0 0 20px rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.6rem' }}>🚨</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fca5a5' }}>
                  HẠN NGẠCH TOKEN TRONG NGÀY ĐÃ HẾT (100% TIÊU THỤ)
                </div>
                <div style={{ fontSize: '0.82rem', color: '#fecaca' }}>
                  Bạn đã sử dụng hết định mức <strong>{quota?.daily_tokens_used.toLocaleString()} / {quota?.daily_token_limit.toLocaleString()} tokens</strong>. Các yêu cầu đàm thoại mới sẽ bị chặn (HTTP 429). Hạn ngạch sẽ được tự động làm mới vào <strong>00:00 UTC</strong> ({quota?.reset_at}).
                </div>
              </div>
            </div>
            <span style={{
              background: '#ef4444',
              color: '#fff',
              fontSize: '0.75rem',
              fontWeight: 700,
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)'
            }}>
              THROTTLED (HTTP 429)
            </span>
          </div>
        )}

        {isWarning80 && !isExhausted && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.1) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.45)',
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.15)',
            borderRadius: 'var(--radius-md)',
            padding: '14px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span style={{ fontSize: '1.5rem' }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#fcd34d' }}>
                CẢNH BÁO: BẠN ĐÃ TIÊU THỤ HƠN 80% HẠN NGẠCH TOKEN TRONG NGÀY
              </div>
              <div style={{ fontSize: '0.82rem', color: '#fde68a' }}>
                Hiện đã tiêu thụ <strong>{quota?.daily_tokens_used.toLocaleString()} / {quota?.daily_token_limit.toLocaleString()} tokens ({percentUsed}%)</strong>. Vui lòng theo dõi để tránh gián đoạn các luồng sinh văn bản.
              </div>
            </div>
          </div>
        )}

        {/* 3. Lưới 4 Thẻ KPI Metrics */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          {/* KPI 1: Latency */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            backdropFilter: 'blur(12px)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Độ Trễ Phản Hồi TB
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8' }}>
                {summary ? summary.avg_latency_ms.toLocaleString() : '0'}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ms</span>
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                color: (summary?.avg_latency_ms || 0) < 500 ? '#10b981' : (summary?.avg_latency_ms || 0) < 1500 ? '#f59e0b' : '#ef4444',
                fontWeight: 700
              }}>
                {(summary?.avg_latency_ms || 0) < 500 ? '● Tốc độ cao' : (summary?.avg_latency_ms || 0) < 1500 ? '● Tiêu chuẩn' : '● Cần tối ưu'}
              </span>
              <span>• Khung {range}</span>
            </div>
          </div>

          {/* KPI 2: TTFT */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            backdropFilter: 'blur(12px)'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Thời Gian Đến Token Đầu (TTFT)
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#a855f7' }}>
                {summary ? summary.avg_ttft_ms.toLocaleString() : '0'}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ms</span>
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Đo lường thời gian khởi động streaming LLM
            </div>
          </div>

          {/* KPI 3: Total Tokens */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            backdropFilter: 'blur(12px)'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Tổng Tokens Tiêu Thụ
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#f43f5e' }}>
                {summary ? summary.total_tokens.toLocaleString() : '0'}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>tokens</span>
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Prompt: {summary?.prompt_tokens.toLocaleString() || '0'} | Completion: {summary?.completion_tokens.toLocaleString() || '0'}
            </div>
          </div>

          {/* KPI 4: Total Requests */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '20px',
            backdropFilter: 'blur(12px)'
          }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Tổng Yêu Cầu API (Requests)
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
              <span style={{ fontSize: '2rem', fontWeight: 800, color: '#10b981' }}>
                {summary ? summary.total_requests.toLocaleString() : '0'}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>calls</span>
            </div>
            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', fontSize: '0.72rem' }}>
              <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 6px', borderRadius: '4px' }}>
                2xx: {summary?.status_counts['2xx'] || 0}
              </span>
              <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '2px 6px', borderRadius: '4px' }}>
                4xx: {summary?.status_counts['4xx'] || 0}
              </span>
              <span style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', padding: '2px 6px', borderRadius: '4px' }}>
                5xx: {summary?.status_counts['5xx'] || 0}
              </span>
            </div>
          </div>
        </div>

        {/* 4. Khối Quota Gauge & Model Distribution */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '20px', marginBottom: '24px' }}>
          {/* Quota Gauge */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            backdropFilter: 'blur(12px)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Đồng Hồ Hạn Ngạch Token Trong Ngày</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: gaugeColor }}>
                {percentUsed}% đã dùng
              </span>
            </h2>

            {/* Visual Progress Bar */}
            <div style={{ height: '14px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: 'var(--radius-full)', overflow: 'hidden', position: 'relative', marginBottom: '16px' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(percentUsed, 100)}%`,
                background: `linear-gradient(90deg, #10b981 0%, ${percentUsed > 80 ? '#f59e0b' : '#3b82f6'} 75%, ${gaugeColor} 100%)`,
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '12px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Đã sử dụng: </span>
                <strong style={{ color: '#fff' }}>{quota?.daily_tokens_used.toLocaleString()}</strong> tokens
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Hạn ngạch: </span>
                <strong style={{ color: '#fff' }}>{quota?.daily_token_limit.toLocaleString()}</strong> tokens
              </div>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>Chu kỳ làm mới (00:00 UTC):</span>
              <span style={{ fontWeight: 600, color: '#38bdf8' }}>{quota?.reset_at || 'Tự động hàng ngày'}</span>
            </div>
          </div>

          {/* Phân bổ theo Model Provider */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            backdropFilter: 'blur(12px)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 16px 0' }}>
              Phân Bổ Token Theo Nhà Cung Cấp
            </h2>

            {summary && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { name: 'Google Gemini', key: 'google', color: '#38bdf8' },
                  { name: 'OpenAI GPT', key: 'openai', color: '#10b981' },
                  { name: 'Anthropic Claude', key: 'anthropic', color: '#a855f7' },
                  { name: 'Khác / Local', key: 'other', color: '#94a3b8' },
                ].map((item) => {
                  const val = summary.tokens_by_provider[item.key as keyof typeof summary.tokens_by_provider] || 0;
                  const pct = summary.total_tokens > 0 ? Math.round((val / summary.total_tokens) * 100) : 0;
                  return (
                    <div key={item.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{item.name}</span>
                        <span style={{ fontWeight: 600 }}>{val.toLocaleString()} tokens ({pct}%)</span>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: item.color, borderRadius: '4px', transition: 'width 0.4s' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 5. Biểu đồ sóng độ trễ thời gian thực (SVG Time-Series Chart) */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
          backdropFilter: 'blur(12px)',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                Biểu Đồ Xu Hướng Độ Trễ & TTFT (30 Điểm Đo Gần Nhất)
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Tự động cập nhật mỗi khi có API request hoàn tất thông qua SSE
              </p>
            </div>
            <div style={{ display: 'flex', gap: '14px', fontSize: '0.78rem' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '3px', background: '#38bdf8', display: 'inline-block' }} />
                <span>Latency (ms)</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '12px', height: '3px', background: '#a855f7', display: 'inline-block' }} />
                <span>TTFT (ms)</span>
              </span>
            </div>
          </div>

          {/* SVG Canvas Chart */}
          <div style={{ width: '100%', height: '220px', position: 'relative' }}>
            {summary && summary.recent_trend.length > 1 ? (
              (() => {
                const points = summary.recent_trend;
                const maxVal = Math.max(...points.map((p) => Math.max(p.latency_ms, p.ttft_ms)), 100);
                const width = 1000;
                const height = 180;
                const padding = 20;

                const getX = (idx: number) => padding + (idx / (points.length - 1)) * (width - 2 * padding);
                const getY = (val: number) => height - padding - (val / maxVal) * (height - 2 * padding);

                const latencyD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(p.latency_ms)}`).join(' ');
                const ttftD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${getX(idx)} ${getY(p.ttft_ms)}`).join(' ');

                return (
                  <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    {/* Grid lines */}
                    <line x1={padding} y1={getY(0)} x2={width - padding} y2={getY(0)} stroke="rgba(255,255,255,0.08)" />
                    <line x1={padding} y1={getY(maxVal / 2)} x2={width - padding} y2={getY(maxVal / 2)} stroke="rgba(255,255,255,0.04)" strokeDasharray="4 4" />
                    <line x1={padding} y1={getY(maxVal)} x2={width - padding} y2={getY(maxVal)} stroke="rgba(255,255,255,0.08)" />

                    {/* Latency line */}
                    <path d={latencyD} fill="none" stroke="#38bdf8" strokeWidth="2.5" />
                    {/* TTFT line */}
                    <path d={ttftD} fill="none" stroke="#a855f7" strokeWidth="2.5" strokeDasharray="3 3" />

                    {/* Circles */}
                    {points.map((p, idx) => (
                      <g key={idx}>
                        <circle
                          cx={getX(idx)}
                          cy={getY(p.latency_ms)}
                          r="3.5"
                          fill="#38bdf8"
                          style={{ cursor: 'pointer' }}
                        />
                      </g>
                    ))}
                  </svg>
                );
              })()
            ) : (
              <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.85rem'
              }}>
                Chưa đủ điểm đo đạc để vẽ biểu đồ. Hãy thực hiện vài tin nhắn chat để thấy đường sóng trực quan!
              </div>
            )}
          </div>
        </div>

        {/* 6. Bảng theo dõi API Request Feed thời gian thực (FR-031) */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
          backdropFilter: 'blur(12px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                Live API Request Feed
              </h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Nhật ký đo đạc các cuộc gọi API gần nhất (Tự động cập nhật không cần F5)
              </p>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {history.length} bản ghi gần nhất
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '10px 12px' }}>Thời Điểm</th>
                  <th style={{ padding: '10px 12px' }}>Phương Thức</th>
                  <th style={{ padding: '10px 12px' }}>Endpoint</th>
                  <th style={{ padding: '10px 12px' }}>HTTP Status</th>
                  <th style={{ padding: '10px 12px' }}>Độ Trễ</th>
                  <th style={{ padding: '10px 12px' }}>TTFT</th>
                  <th style={{ padding: '10px 12px' }}>Tokens</th>
                  <th style={{ padding: '10px 12px' }}>Mô Hình / Provider</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const isHighlighted = item.id === highlightId;
                  const is2xx = item.status_code >= 200 && item.status_code < 300;
                  const is4xx = item.status_code >= 400 && item.status_code < 500;

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                        background: isHighlighted ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                        transition: 'background 0.5s ease'
                      }}
                    >
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {item.created_at.split(' ')[1] || item.created_at}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          background: item.method === 'POST' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          color: item.method === 'POST' ? '#c084fc' : '#60a5fa'
                        }}>
                          {item.method}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#cbd5e1' }}>
                        {item.endpoint}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: is2xx ? 'rgba(16, 185, 129, 0.15)' : is4xx ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: is2xx ? '#34d399' : is4xx ? '#fbbf24' : '#f87171'
                        }}>
                          {item.status_code}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#38bdf8' }}>
                        {item.latency_ms} ms
                      </td>
                      <td style={{ padding: '10px 12px', color: '#a855f7' }}>
                        {item.ttft_ms ? `${item.ttft_ms} ms` : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: item.total_tokens > 0 ? 600 : 400 }}>
                        {item.total_tokens > 0 ? item.total_tokens.toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                        {item.model_name ? `${item.model_name} (${item.provider})` : '—'}
                      </td>
                    </tr>
                  );
                })}

                {history.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Chưa có bản ghi API nào được ghi nhận.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
