'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AgentModel } from '@/types';

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  created_at?: string;
  isStreaming?: boolean;
}

// Markdown & Code Block Formatter Component with Copy Button
function FormattedMessage({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Tách đoạn văn bản và khối code ```
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="markdown-body">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).trim().split('\n');
          const language = lines[0].match(/^[a-zA-Z0-9_-]+$/) ? lines[0] : 'code';
          const codeBody = language === lines[0] ? lines.slice(1).join('\n') : lines.join('\n');

          return (
            <div key={index} className="code-block-wrapper">
              <div className="code-header">
                <span>{language.toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(codeBody, index)}
                  aria-label="Sao chép mã nguồn"
                >
                  {copiedIndex === index ? '✓ Đã sao chép' : 'Sao chép'}
                </button>
              </div>
              <pre className="code-content">
                <code>{codeBody}</code>
              </pre>
            </div>
          );
        }

        // Render đoạn văn bản thông thường, hỗ trợ in đậm và xuống dòng
        const paragraphs = part.split('\n\n');
        return (
          <React.Fragment key={index}>
            {paragraphs.map((para, pIdx) => {
              if (!para.trim()) return null;
              
              // Xử lý danh sách gạch đầu dòng
              if (para.includes('\n- ') || para.startsWith('- ')) {
                const items = para.split('\n').filter(l => l.trim().startsWith('- '));
                return (
                  <ul key={pIdx}>
                    {items.map((item, itemIdx) => (
                      <li key={itemIdx}>
                        {renderInlineFormatting(item.replace(/^- /, ''))}
                      </li>
                    ))}
                  </ul>
                );
              }

              return (
                <p key={pIdx}>
                  {renderInlineFormatting(para)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
      {isStreaming && <span className="cursor-blink" aria-hidden="true" />}
    </div>
  );
}

function renderInlineFormatting(text: string) {
  // Thay thế **in đậm**
  const boldParts = text.split(/(\*\*.*?\*\*)/g);
  return boldParts.map((bPart, bIdx) => {
    if (bPart.startsWith('**') && bPart.endsWith('**')) {
      return <strong key={bIdx}>{bPart.slice(2, -2)}</strong>;
    }
    // Inline code `code`
    const codeParts = bPart.split(/(`.*?`)/g);
    return codeParts.map((cPart, cIdx) => {
      if (cPart.startsWith('`') && cPart.endsWith('`')) {
        return <code key={cIdx}>{cPart.slice(1, -1)}</code>;
      }
      return cPart;
    });
  });
}

export default function ChatWorkspacePage() {
  const router = useRouter();

  // State quản lý danh sách hội thoại và tin nhắn
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [newTitleValue, setNewTitleValue] = useState('');
  const [deleteModalConv, setDeleteModalConv] = useState<Conversation | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Active Models & Model Selector state (FR-021, FR-026, ADR-003)
  const [activeModels, setActiveModels] = useState<AgentModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-3.8-flash');
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 1. Kiểm tra xác thực người dùng
  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch('/api/v1/auth/me');
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        setCurrentUser(data.user);
        fetchConversations();
      } catch {
        router.push('/login');
      }
    };
    fetchMe();
  }, [router]);

  // Load Active Models for selector
  useEffect(() => {
    const fetchActiveModels = async () => {
      try {
        const res = await fetch('/api/v1/models?status=ACTIVE');
        if (res.ok) {
          const data: AgentModel[] = await res.json();
          setActiveModels(data);
          const defModel = data.find(m => m.is_default);
          if (defModel) {
            setSelectedModelId(defModel.id);
          } else if (data.length > 0) {
            setSelectedModelId(data[0].id);
          }
        }
      } catch {
        // Fallback to default
      }
    };
    fetchActiveModels();
  }, []);

  // 2. Tải danh sách cuộc trò chuyện
  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/v1/conversations/');
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      } else if (res.status === 401) {
        router.push('/login');
      }
    } catch {
      // Tránh console.error gây overlay cảnh báo khi backend đang khởi động
    }
  };

  // 3. Tải tin nhắn của thread đang chọn
  const loadConversationMessages = async (convId: string) => {
    setActiveConvId(convId);
    try {
      const res = await fetch(`/api/v1/conversations/${convId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Lỗi tải messages:', err);
    }
  };

  // 4. Tạo cuộc trò chuyện mới
  const handleCreateNewConversation = async () => {
    try {
      const res = await fetch('/api/v1/conversations/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Cuộc trò chuyện mới' })
      });
      if (res.ok) {
        const data = await res.json();
        const newConv = data.conversation;
        setConversations(prev => [newConv, ...prev]);
        setActiveConvId(newConv.id);
        setMessages([]);
      }
    } catch (err) {
      console.error('Lỗi tạo conversation:', err);
    }
  };

  // 5. Đổi tên cuộc trò chuyện
  const handleRename = async (convId: string) => {
    if (!newTitleValue.trim()) {
      setEditingTitleId(null);
      return;
    }
    try {
      const res = await fetch(`/api/v1/conversations/${convId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitleValue.trim() })
      });
      if (res.ok) {
        setConversations(prev =>
          prev.map(c => c.id === convId ? { ...c, title: newTitleValue.trim() } : c)
        );
      }
    } catch (err) {
      console.error('Lỗi đổi tên:', err);
    } finally {
      setEditingTitleId(null);
      setNewTitleValue('');
    }
  };

  // 6. Xóa cuộc trò chuyện
  const handleDelete = async () => {
    if (!deleteModalConv) return;
    try {
      const res = await fetch(`/api/v1/conversations/${deleteModalConv.id}`, {
        method: 'DELETE'
      });
      if (res.status === 204 || res.ok) {
        setConversations(prev => prev.filter(c => c.id !== deleteModalConv.id));
        if (activeConvId === deleteModalConv.id) {
          setActiveConvId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error('Lỗi xóa conversation:', err);
    } finally {
      setDeleteModalConv(null);
    }
  };

  // 7. Đăng xuất
  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', { method: 'POST' });
      localStorage.removeItem('ai_chan_user');
      localStorage.removeItem('ai_chan_token');
      router.push('/login');
    } catch {
      router.push('/login');
    }
  };

  // 8. Tự động cuộn xuống dưới
  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  useEffect(() => {
    if (!showScrollBottom) {
      scrollToBottom();
    }
  }, [messages, isStreaming, showScrollBottom]);

  // Kiểm tra vị trí scroll người dùng để hiện nút "Cuộn xuống"
  const handleScroll = () => {
    if (!chatScrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatScrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 120;
    setShowScrollBottom(!isAtBottom);
  };

  // 9. Gửi tin nhắn và tiếp nhận phản hồi streaming SSE (FLOW-CHAT-STREAM)
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || inputPrompt;
    if (!textToSend.trim() || isStreaming) return;

    let targetConvId = activeConvId;

    // Nếu chưa chọn thread nào, tự động tạo mới
    if (!targetConvId) {
      try {
        const createRes = await fetch('/api/v1/conversations/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Cuộc trò chuyện mới' })
        });
        if (createRes.ok) {
          const createData = await createRes.json();
          targetConvId = createData.conversation.id;
          setActiveConvId(targetConvId);
          setConversations(prev => [createData.conversation, ...prev]);
        }
      } catch (err) {
        console.error('Lỗi tự tạo cuộc trò chuyện:', err);
        return;
      }
    }

    // Optimistic UI: Render tin nhắn của User ngay lập tức (UX-002)
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend.trim(),
      created_at: new Date().toISOString()
    };

    const assistantPlaceholderId = `assistant-${Date.now()}`;
    const assistantMsgPlaceholder: Message = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
      model: selectedModelId,
      created_at: new Date().toISOString(),
      isStreaming: true
    };

    setMessages(prev => [...prev, userMsg, assistantMsgPlaceholder]);
    setInputPrompt('');
    setIsStreaming(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch(`/api/v1/conversations/${targetConvId}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: textToSend.trim(),
          model: selectedModelId
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error('Lỗi kết nối tới luồng AI.');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      let accumulatedText = '';

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.includes('event: chunk')) {
              const dataMatch = line.match(/data:\s*(.*)/);
              if (dataMatch) {
                try {
                  const chunkObj = JSON.parse(dataMatch[1]);
                  if (chunkObj.token) {
                    accumulatedText += chunkObj.token;
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantPlaceholderId
                          ? { ...m, content: accumulatedText }
                          : m
                      )
                    );
                  }
                } catch {
                  // Skip parse errors
                }
              }
            } else if (line.includes('event: error')) {
              const dataMatch = line.match(/data:\s*(.*)/);
              if (dataMatch) {
                try {
                  const errorObj = JSON.parse(dataMatch[1]);
                  const errorMessage = errorObj.message || 'Đã xảy ra lỗi trong quá trình xử lý phản hồi từ AI.';
                  accumulatedText = `⚠️ **Lỗi:** ${errorMessage}`;
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantPlaceholderId
                        ? { ...m, content: accumulatedText }
                        : m
                    )
                  );
                } catch {
                  // Skip parse errors
                }
              }
            } else if (line.includes('event: done')) {
              // Hoàn tất luồng
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream đã được dừng bởi người dùng.');
      } else {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantPlaceholderId
              ? { ...m, content: m.content || 'Đã xảy ra lỗi khi kết nối với AI Assistant. Vui lòng thử lại.' }
              : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantPlaceholderId
            ? { ...m, isStreaming: false, content: m.content || 'Không nhận được phản hồi từ mô hình. Vui lòng kiểm tra lại cấu hình hoặc thử lại.' }
            : m
        )
      );
      fetchConversations();
    }
  };

  // 10. Dừng sinh phản hồi (UX-003: Stop Generation)
  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };

  // Tự co giãn Textarea khi gõ
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputPrompt(e.target.value);
    e.target.style.height = '48px';
    const newHeight = Math.min(e.target.scrollHeight, 180);
    e.target.style.height = `${newHeight}px`;
  };

  // Phím Enter gửi / Shift+Enter xuống dòng (UX-005)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const activeConversation = conversations.find(c => c.id === activeConvId);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)' }}>
      {/* LEFT SIDEBAR (UX-001) */}
      <aside style={{
        width: sidebarOpen ? '280px' : '0px',
        minWidth: sidebarOpen ? '280px' : '0px',
        transition: 'width 0.25s ease',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: 20
      }}>
        {/* Sidebar Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={handleCreateNewConversation}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '11px',
              background: 'var(--accent-gradient)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: '#ffffff',
              fontSize: '0.925rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--accent-glow)'
            }}
          >
            <span>+</span>
            <span>Cuộc trò chuyện mới</span>
          </button>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', padding: '6px 10px', letterSpacing: '0.05em' }}>
            Lịch sử trò chuyện
          </div>

          {conversations.length === 0 ? (
            <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Chưa có cuộc trò chuyện nào. Bấm nút trên để bắt đầu!
            </div>
          ) : (
            conversations.map(conv => {
              const isActive = conv.id === activeConvId;
              const isEditing = editingTitleId === conv.id;

              return (
                <div
                  key={conv.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '4px',
                    background: isActive ? 'var(--bg-active)' : 'transparent',
                    border: isActive ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                    cursor: 'pointer'
                  }}
                  onClick={() => !isEditing && loadConversationMessages(conv.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.9rem' }}>💬</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={newTitleValue}
                        onChange={(e) => setNewTitleValue(e.target.value)}
                        onBlur={() => handleRename(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(conv.id);
                          if (e.key === 'Escape') setEditingTitleId(null);
                        }}
                        autoFocus
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.3)',
                          border: '1px solid var(--border-focus)',
                          borderRadius: '4px',
                          color: '#fff',
                          padding: '2px 6px',
                          fontSize: '0.85rem'
                        }}
                      />
                    ) : (
                      <span style={{
                        fontSize: '0.875rem',
                        color: isActive ? '#ffffff' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {conv.title}
                      </span>
                    )}
                  </div>

                  {isActive && !isEditing && (
                    <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        aria-label="Đổi tên"
                        onClick={() => {
                          setEditingTitleId(conv.id);
                          setNewTitleValue(conv.title);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '0.8rem'
                        }}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        aria-label="Xóa"
                        onClick={() => setDeleteModalConv(conv)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--danger)',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '0.8rem'
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer: User Profile & Brand */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.2)'
        }}>
          <Link
            href="/settings"
            title="Xem hồ sơ & Cài đặt"
            style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, textDecoration: 'none', cursor: 'pointer' }}
          >
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: currentUser?.avatar_url ? `url(${currentUser.avatar_url}) center/cover no-repeat` : 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0
            }}>
              {!currentUser?.avatar_url && (currentUser?.email?.[0]?.toUpperCase() || 'U')}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser?.full_name || currentUser?.email?.split('@')[0] || 'User'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentUser?.email || ''}
              </div>
            </div>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <Link
              href="/settings"
              title="Cài đặt tài khoản"
              aria-label="Cài đặt tài khoản"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '1rem',
                cursor: 'pointer',
                padding: '6px',
                display: 'flex',
                alignItems: 'center',
                textDecoration: 'none'
              }}
            >
              ⚙️
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              title="Đăng xuất"
              aria-label="Đăng xuất"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '1rem',
                cursor: 'pointer',
                padding: '6px'
              }}
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CHAT CANVAS */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
        {/* Top Navigation Header */}
        <header style={{
          height: '56px',
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(10, 15, 29, 0.7)',
          backdropFilter: 'blur(8px)',
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle Sidebar"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              ☰
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 600, color: '#f8fafc' }}>
                {activeConversation?.title || 'Cuộc trò chuyện mới'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Model Selector Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                title="Chọn mô hình AI phục vụ hội thoại"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(99, 102, 241, 0.12)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  fontSize: '0.78rem',
                  color: '#c7d2fe',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <span>🤖</span>
                <span>{activeModels.find(m => m.id === selectedModelId)?.name || selectedModelId || 'Mô hình AI'}</span>
                <span style={{ fontSize: '0.65rem', marginLeft: '2px' }}>▼</span>
              </button>

              {showModelDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: '120%',
                    right: 0,
                    minWidth: '270px',
                    background: 'rgba(15, 23, 42, 0.95)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5)',
                    padding: '8px',
                    zIndex: 100,
                    backdropFilter: 'blur(16px)'
                  }}
                >
                  <div style={{ padding: '6px 10px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Chọn Mô Hình Hoạt Động ({activeModels.length})
                  </div>

                  {activeModels.map(am => (
                    <div
                      key={am.id}
                      onClick={() => {
                        setSelectedModelId(am.id);
                        setShowModelDropdown(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: am.id === selectedModelId ? 'var(--bg-active)' : 'transparent',
                        border: am.id === selectedModelId ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                        cursor: 'pointer',
                        marginBottom: '4px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: am.id === selectedModelId ? 700 : 500, color: '#fff' }}>
                          {am.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {am.provider.toUpperCase()} • {am.is_default ? '⭐ Mặc định' : `${Math.round(am.context_window / 1000)}k ctx`}
                        </div>
                      </div>
                      {am.id === selectedModelId && <span style={{ color: '#818cf8', fontSize: '0.85rem' }}>✓</span>}
                    </div>
                  ))}

                  <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '6px', paddingTop: '6px' }}>
                    <Link
                      href="/settings?tab=models"
                      onClick={() => setShowModelDropdown(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-sm)',
                        color: '#38bdf8',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        textDecoration: 'none'
                      }}
                    >
                      <span>⚙️</span>
                      <span>Quản lý & Kích hoạt Models</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              fontSize: '0.75rem',
              color: '#34d399'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
              <span>AI-Chan Online (SSE Active)</span>
            </div>

            <Link
              href="/settings"
              title="Cài đặt tài khoản"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.8rem',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontWeight: 500
              }}
            >
              <span>⚙️ Cài đặt</span>
            </Link>
          </div>
        </header>

        {/* Chat Feed Canvas */}
        <div
          ref={chatScrollContainerRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}
        >
          <div style={{ width: '100%', maxWidth: '820px' }}>
            {messages.length === 0 ? (
              /* EMPTY STATE: GREETING & SUGGESTION CHIPS (UX-005) */
              <div style={{
                padding: '60px 20px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '18px',
                  background: 'var(--accent-gradient)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem',
                  boxShadow: 'var(--accent-glow)',
                  marginBottom: '1.25rem'
                }}>
                  ✨
                </div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 700, marginBottom: '0.5rem', color: '#fff' }}>
                  Xin chào! Tôi có thể hỗ trợ gì cho bạn?
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '480px', marginBottom: '2rem', lineHeight: 1.5 }}>
                  Tôi là AI-Chan, trợ lý ảo thông minh hỗ trợ giải đáp lập trình, tư vấn kiến trúc phần mềm, và soạn thảo văn bản.
                </p>

                {/* 4 Interactive Suggestion Chips */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '12px',
                  width: '100%',
                  textAlign: 'left'
                }}>
                  {[
                    {
                      label: 'Giải thích thuật toán Dijkstra bằng Python kèm code mẫu',
                      icon: '🐍'
                    },
                    {
                      label: 'So sánh cơ chế Server-Sent Events (SSE) và WebSockets',
                      icon: '⚡'
                    },
                    {
                      label: 'Hướng dẫn bảo mật ứng dụng web chống tấn công XSS & CSRF',
                      icon: '🛡️'
                    },
                    {
                      label: 'Tóm tắt các nguyên tắc thiết kế phần mềm SOLID với ví dụ',
                      icon: '📐'
                    }
                  ].map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendMessage(chip.label)}
                      style={{
                        padding: '14px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        fontSize: '0.88rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                      }}
                    >
                      <span style={{ fontSize: '1.2rem' }}>{chip.icon}</span>
                      <span style={{ lineHeight: 1.4 }}>{chip.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* MESSAGE LIST */
              messages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    marginBottom: '20px'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    gap: '10px',
                    maxWidth: '85%',
                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
                  }}>
                    {/* Avatar */}
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: msg.role === 'user' ? 'var(--bg-tertiary)' : 'var(--accent-gradient)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      flexShrink: 0,
                      boxShadow: msg.role === 'assistant' ? 'var(--accent-glow)' : 'none'
                    }}>
                      {msg.role === 'user' ? '👤' : '✨'}
                    </div>

                    {/* Bubble Content */}
                    <div>
                      {msg.role === 'assistant' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>AI-Chan</span>
                          {msg.model && (
                            <span style={{
                              padding: '1px 6px',
                              borderRadius: 'var(--radius-full)',
                              background: 'rgba(99, 102, 241, 0.12)',
                              border: '1px solid rgba(99, 102, 241, 0.25)',
                              color: '#a5b4fc',
                              fontSize: '0.68rem',
                              fontFamily: 'var(--font-mono)'
                            }}>
                              {msg.model}
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{
                        padding: '14px 18px',
                        borderRadius: 'var(--radius-md)',
                        background: msg.role === 'user'
                          ? 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(168,85,247,0.2) 100%)'
                          : 'var(--bg-secondary)',
                        border: msg.role === 'user'
                          ? '1px solid rgba(99,102,241,0.4)'
                          : '1px solid var(--border-subtle)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        wordBreak: 'break-word'
                      }}>
                        {msg.role === 'user' ? (
                          <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5, margin: 0, fontSize: '0.95rem' }}>
                            {msg.content}
                          </p>
                        ) : (
                          <FormattedMessage content={msg.content} isStreaming={msg.isStreaming} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Quick Scroll-To-Bottom Floating Button */}
        {showScrollBottom && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            aria-label="Cuộn xuống tin nhắn mới nhất"
            style={{
              position: 'absolute',
              bottom: '90px',
              right: '30px',
              padding: '8px 14px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
              zIndex: 30
            }}
          >
            <span>↓</span>
            <span>Xuống tin nhắn mới nhất</span>
          </button>
        )}

        {/* COMPOSER BAR & CONTROLS (UX-003, UX-005) */}
        <div style={{
          padding: '14px 18px',
          background: 'var(--bg-primary)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}>
          <div style={{ width: '100%', maxWidth: '820px', position: 'relative' }}>
            {/* Dừng phản hồi Button (khi đang stream) */}
            {isStreaming && (
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 18px',
                    background: 'var(--danger-bg)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
                  }}
                >
                  <span style={{ fontSize: '0.8rem' }}>■</span>
                  <span>Dừng phản hồi</span>
                </button>
              </div>
            )}

            {/* Input Box Wrapper */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '10px',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '8px 12px',
              boxShadow: '0 6px 20px rgba(0,0,0,0.25)'
            }}>
              <textarea
                ref={textareaRef}
                value={inputPrompt}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Nhập câu hỏi cho AI-Chan... (Enter để gửi, Shift+Enter để xuống dòng)"
                rows={1}
                disabled={isStreaming}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  fontSize: '0.95rem',
                  lineHeight: '1.5',
                  resize: 'none',
                  maxHeight: '180px',
                  padding: '6px 4px',
                  fontFamily: 'inherit'
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Character Counter (UX-005) */}
                <span style={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: inputPrompt.length >= 4000
                    ? 'var(--danger)'
                    : inputPrompt.length >= 3800
                    ? '#fbbf24'
                    : 'var(--text-muted)'
                }}>
                  {inputPrompt.length}/4000
                </span>

                {/* Send Button */}
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={!inputPrompt.trim() || isStreaming}
                  aria-label="Gửi tin nhắn"
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: (!inputPrompt.trim() || isStreaming)
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'var(--accent-gradient)',
                    border: 'none',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: (!inputPrompt.trim() || isStreaming) ? 'not-allowed' : 'pointer',
                    boxShadow: (!inputPrompt.trim() || isStreaming) ? 'none' : 'var(--accent-glow)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  ➔
                </button>
              </div>
            </div>

            <div style={{
              textAlign: 'center',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
              marginTop: '6px'
            }}>
              AI-Chan có thể đưa ra kết quả chưa hoàn hảo. Vui lòng kiểm chứng lại các thông tin chuyên môn quan trọng.
            </div>
          </div>
        </div>
      </main>

      {/* CONFIRM DELETE MODAL */}
      {deleteModalConv && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '1.5rem'
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '24px',
            maxWidth: '420px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
          }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px', color: '#fff' }}>
              Xác nhận xóa cuộc trò chuyện?
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
              Toàn bộ tin nhắn trong cuộc trò chuyện <strong>&quot;{deleteModalConv.title}&quot;</strong> sẽ bị xóa vĩnh viễn khỏi cơ sở dữ liệu. Thao tác này không thể hoàn tác.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setDeleteModalConv(null)}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  padding: '8px 18px',
                  background: 'var(--danger)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                }}
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
