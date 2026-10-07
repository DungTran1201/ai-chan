import React from 'react';
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI-Chan — Virtual Assistant Platform',
  description: 'Trợ lý ảo AI-Chan thông minh, giao tiếp thời gian thực với phản hồi dòng chảy SSE, hỗ trợ lập trình, tư vấn và phân tích đa lĩnh vực.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
