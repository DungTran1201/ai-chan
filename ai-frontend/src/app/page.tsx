'use client';

import React from 'react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Navigation Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '1.25rem 2rem',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(10, 15, 29, 0.85)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'var(--accent-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            boxShadow: 'var(--accent-glow)'
          }}>
            ✨
          </div>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            AI-Chan
          </span>
        </div>

        <nav style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/login" style={{
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: 500,
            padding: '8px 16px',
            borderRadius: 'var(--radius-sm)',
            transition: 'color 0.2s'
          }}>
            Đăng nhập
          </Link>
          <Link href="/register" style={{
            background: 'var(--accent-gradient)',
            color: '#fff',
            textDecoration: 'none',
            fontSize: '0.9rem',
            fontWeight: 600,
            padding: '8px 18px',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--accent-glow)'
          }}>
            Đăng ký miễn phí
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1.5rem',
        textAlign: 'center',
        position: 'relative'
      }}>
        {/* Glow ambient background */}
        <div style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '500px',
          height: '350px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, rgba(168,85,247,0.08) 50%, transparent 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
          zIndex: 0
        }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: '780px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: '#c7d2fe',
            fontSize: '0.85rem',
            fontWeight: 500,
            marginBottom: '1.75rem'
          }}>
            <span>🚀 Phiên bản Demo Trực Tiếp — Next.js 15 & FastAPI</span>
          </div>

          <h1 style={{
            fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            marginBottom: '1.25rem'
          }}>
            Trợ Lý Ảo Thông Minh <br />
            <span style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Thời Gian Thực
            </span> Cho Mọi Nhiệm Vụ
          </h1>

          <p style={{
            fontSize: '1.15rem',
            lineHeight: 1.6,
            color: 'var(--text-secondary)',
            marginBottom: '2.5rem',
            maxWidth: '640px',
            margin: '0 auto 2.5rem'
          }}>
            Trải nghiệm hội thoại tự nhiên với cơ chế truyền dòng Server-Sent Events (SSE), khả năng tự phục hồi Multi-Provider Failover giữa Gemini và OpenAI, lưu trữ ACID bền vững trên PostgreSQL / SQLite.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/chat" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--accent-gradient)',
              color: '#ffffff',
              padding: '14px 28px',
              borderRadius: 'var(--radius-md)',
              fontSize: '1.05rem',
              fontWeight: 600,
              textDecoration: 'none',
              boxShadow: 'var(--accent-glow)',
              transition: 'transform 0.2s ease'
            }}>
              <span>Vào Khung Chat Ngay</span>
              <span>→</span>
            </Link>

            <Link href="/login" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              padding: '14px 24px',
              borderRadius: 'var(--radius-md)',
              fontSize: '1.05rem',
              fontWeight: 500,
              textDecoration: 'none'
            }}>
              Đăng Nhập Tài Khoản
            </Link>
          </div>
        </div>

        {/* Feature Cards Grid */}
        <section style={{
          marginTop: '5rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.5rem',
          maxWidth: '1000px',
          width: '100%',
          position: 'relative',
          zIndex: 1
        }}>
          {[
            {
              icon: '⚡',
              title: 'Streaming SSE Thời Gian Thực',
              desc: 'Từng token phản hồi được truyền trực tiếp về trình duyệt với độ trễ dưới 2 giây và hỗ trợ hủy luồng tức thì.'
            },
            {
              icon: '🛡️',
              title: 'Bảo Mật Phòng Thủ Đa Lớp',
              desc: 'Xác thực HttpOnly Cookie JWT chống XSS, cách ly dữ liệu cá nhân tuyệt đối chống tấn công IDOR.'
            },
            {
              icon: '🔄',
              title: 'Multi-Provider Failover',
              desc: 'Tự động bắt lỗi và chuyển đổi dự phòng từ Google Gemini sang OpenAI trong suốt với người dùng.'
            },
            {
              icon: '🎨',
              title: 'Giao Diện Chuẩn UX & Markdown',
              desc: 'Hỗ trợ định dạng bảng, toán học, tô màu mã nguồn và sao chép code chỉ với một cú nhấp chuột.'
            }
          ].map((item, idx) => (
            <div key={idx} style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '1.5rem',
              textAlign: 'left',
              backdropFilter: 'blur(8px)',
              transition: 'border-color 0.2s ease'
            }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>{item.icon}</div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.5rem', color: '#f1f5f9' }}>{item.title}</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{item.desc}</p>
            </div>
          ))}
        </section>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '1.5rem',
        textAlign: 'center',
        fontSize: '0.85rem',
        color: 'var(--text-muted)'
      }}>
        © 2026 AI-Chan Assistant Platform. Xây dựng theo quy chuẩn BA + Fullstack Lifecycle Engineering.
      </footer>
    </div>
  );
}
