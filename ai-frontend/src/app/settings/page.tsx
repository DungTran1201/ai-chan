'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AgentModel } from '@/types';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  username: string;
  avatar_url: string;
  bio: string;
  phone_number: string;
  theme_preference: 'DARK' | 'LIGHT' | 'SYSTEM';
  language_preference: 'vi' | 'en';
  status: string;
  created_at: string;
  last_login_at?: string;
}

interface UserStats {
  total_conversations: number;
  total_messages: number;
}

export default function SettingsPage() {
  const router = useRouter();

  // Active tab state: 'profile' | 'security' | 'preferences' | 'models'
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences' | 'models'>('profile');

  // User data
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats>({ total_conversations: 0, total_messages: 0 });
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Notifications
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Tab 1: Profile form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [showAvatarEdit, setShowAvatarEdit] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  // Tab 2: Security form state
  // Change Email
  const [newEmail, setNewEmail] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  // Change Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Tab 3: Preferences state
  const [themePreference, setThemePreference] = useState<'DARK' | 'LIGHT' | 'SYSTEM'>('DARK');
  const [languagePreference, setLanguagePreference] = useState<'vi' | 'en'>('vi');
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Tab 4: Models state (FR-021 to FR-026, BR-012 to BR-015)
  const [models, setModels] = useState<AgentModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelFilterStatus, setModelFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [modelFilterProvider, setModelFilterProvider] = useState<string>('ALL');
  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [togglingModelId, setTogglingModelId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch initial profile & stats
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/v1/users/me');
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login');
            return;
          }
          throw new Error('Không thể tải thông tin hồ sơ.');
        }
        const data = await res.json();
        const u = data.user;
        setUser(u);
        setStats(data.stats || { total_conversations: 0, total_messages: 0 });

        // Populate forms
        setFullName(u.full_name || '');
        setUsername(u.username || '');
        setBio(u.bio || '');
        setPhoneNumber(u.phone_number || '');
        setAvatarUrl(u.avatar_url || '');
        setThemePreference(u.theme_preference || 'DARK');
        setLanguagePreference(u.language_preference || 'vi');

        // Apply theme
        applyTheme(u.theme_preference || 'DARK');
      } catch (err: any) {
        showToast('error', err.message || 'Lỗi kết nối máy chủ.');
      } finally {
        setLoadingInitial(false);
      }
    };

    fetchProfile();
  }, [router]);

  // Read URL query parameter ?tab=models on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'models' || tabParam === 'security' || tabParam === 'preferences' || tabParam === 'profile') {
        setActiveTab(tabParam as any);
      }
    }
  }, []);

  const fetchModels = async () => {
    try {
      setLoadingModels(true);
      const res = await fetch('/api/v1/models?status=ALL');
      if (!res.ok) {
        throw new Error('Không thể tải danh sách mô hình từ máy chủ.');
      }
      const data: AgentModel[] = await res.json();
      setModels(data);
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi khi tải danh sách mô hình.');
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'models') {
      fetchModels();
    }
  }, [activeTab]);

  const handleTestConnection = async (model: AgentModel) => {
    setTestingModelId(model.id);
    try {
      const res = await fetch(`/api/v1/models/${model.id}/test`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Kiểm tra kết nối thất bại.');
      }
      setModels(prev =>
        prev.map(m => (m.id === model.id ? { ...m, latency_ms: data.latency_ms, last_checked_at: data.tested_at } : m))
      );
      showToast('success', `⚡ ${data.message} (Độ trễ Round-Trip: ${data.latency_ms} ms)`);
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi kiểm tra kết nối.');
    } finally {
      setTestingModelId(null);
    }
  };

  const handleActivateModel = async (model: AgentModel) => {
    setTogglingModelId(model.id);
    try {
      const res = await fetch(`/api/v1/models/${model.id}/activate`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Không thể kích hoạt mô hình.');
      }
      setModels(prev =>
        prev.map(m => (m.id === model.id ? { ...m, status: 'ACTIVE' } : m))
      );
      showToast('success', data.message || `Đã kích hoạt ${model.name}.`);
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi khi kích hoạt mô hình.');
    } finally {
      setTogglingModelId(null);
    }
  };

  const handleDeactivateModel = async (model: AgentModel) => {
    if (model.is_default) {
      showToast('error', `Không thể hủy kích hoạt '${model.name}' vì đang là mô hình mặc định của hệ thống (BR-013). Hãy chọn mô hình khác làm mặc định trước.`);
      return;
    }
    setTogglingModelId(model.id);
    try {
      const res = await fetch(`/api/v1/models/${model.id}/deactivate`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Không thể hủy kích hoạt mô hình.');
      }
      setModels(prev =>
        prev.map(m => (m.id === model.id ? { ...m, status: 'INACTIVE' } : m))
      );
      showToast('success', `${data.message} (Đã chuyển sang INACTIVE, không xóa dữ liệu - BR-012)`);
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi khi hủy kích hoạt mô hình.');
    } finally {
      setTogglingModelId(null);
    }
  };

  const handleSetDefaultModel = async (model: AgentModel) => {
    if (model.status !== 'ACTIVE') {
      showToast('error', `Chỉ có thể đặt mô hình đang ở trạng thái ACTIVE làm mặc định (BR-013). Hãy kích hoạt mô hình trước.`);
      return;
    }
    setSettingDefaultId(model.id);
    try {
      const res = await fetch('/api/v1/models/default', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_id: model.id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Không thể thiết lập mô hình mặc định.');
      }
      setModels(prev =>
        prev.map(m => ({ ...m, is_default: m.id === model.id }))
      );
      showToast('success', data.message || `Đã đặt '${model.name}' làm mô hình mặc định thành công.`);
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi khi thiết lập mô hình mặc định.');
    } finally {
      setSettingDefaultId(null);
    }
  };

  const getProviderMeta = (provider: string) => {
    switch (provider.toLowerCase()) {
      case 'google':
        return {
          label: 'Google Gemini',
          icon: '✨',
          gradient: 'linear-gradient(135deg, rgba(66, 133, 244, 0.15), rgba(168, 85, 247, 0.15))',
          border: 'rgba(66, 133, 244, 0.35)',
          textColor: '#60a5fa',
          badgeBg: 'rgba(59, 130, 246, 0.15)'
        };
      case 'openai':
        return {
          label: 'OpenAI',
          icon: '🟢',
          gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(20, 184, 166, 0.15))',
          border: 'rgba(16, 185, 129, 0.35)',
          textColor: '#34d399',
          badgeBg: 'rgba(16, 185, 129, 0.15)'
        };
      case 'anthropic':
        return {
          label: 'Anthropic Claude',
          icon: '🪸',
          gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15))',
          border: 'rgba(245, 158, 11, 0.35)',
          textColor: '#fbbf24',
          badgeBg: 'rgba(245, 158, 11, 0.15)'
        };
      case 'groq':
        return {
          label: 'Groq LPU',
          icon: '⚡',
          gradient: 'linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(234, 88, 12, 0.15))',
          border: 'rgba(249, 115, 22, 0.35)',
          textColor: '#fb923c',
          badgeBg: 'rgba(249, 115, 22, 0.15)'
        };
      case 'ollama':
        return {
          label: 'Ollama Local',
          icon: '🦙',
          gradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(99, 102, 241, 0.15))',
          border: 'rgba(139, 92, 246, 0.35)',
          textColor: '#a78bfa',
          badgeBg: 'rgba(139, 92, 246, 0.15)'
        };
      default:
        return {
          label: provider.toUpperCase(),
          icon: '🤖',
          gradient: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.04))',
          border: 'var(--border-subtle)',
          textColor: 'var(--text-secondary)',
          badgeBg: 'rgba(255, 255, 255, 0.1)'
        };
    }
  };

  const getStatusMeta = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return {
          label: 'Hoạt động',
          badgeBg: 'rgba(16, 185, 129, 0.15)',
          badgeBorder: 'rgba(16, 185, 129, 0.4)',
          textColor: '#34d399',
          dotColor: '#10b981'
        };
      case 'INACTIVE':
        return {
          label: 'Đã tạm dừng',
          badgeBg: 'rgba(148, 163, 184, 0.1)',
          badgeBorder: 'rgba(148, 163, 184, 0.25)',
          textColor: '#94a3b8',
          dotColor: '#64748b'
        };
      case 'DEGRADED':
        return {
          label: 'Hiệu năng giảm',
          badgeBg: 'rgba(245, 158, 11, 0.15)',
          badgeBorder: 'rgba(245, 158, 11, 0.4)',
          textColor: '#fbbf24',
          dotColor: '#f59e0b'
        };
      default:
        return {
          label: status,
          badgeBg: 'rgba(255, 255, 255, 0.1)',
          badgeBorder: 'var(--border-subtle)',
          textColor: 'var(--text-secondary)',
          dotColor: '#94a3b8'
        };
    }
  };

  const applyTheme = (theme: 'DARK' | 'LIGHT' | 'SYSTEM') => {
    if (typeof document !== 'undefined') {
      if (theme === 'LIGHT') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else if (theme === 'DARK') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          document.documentElement.removeAttribute('data-theme');
        } else {
          document.documentElement.setAttribute('data-theme', 'light');
        }
      }
    }
  };

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: '', color: 'transparent' };
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (pass.length >= 12) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass)) score += 1;

    if (score <= 2) return { score: 33, label: 'Yếu', color: '#ef4444' };
    if (score <= 4) return { score: 66, label: 'Trung bình', color: '#f59e0b' };
    return { score: 100, label: 'Mạnh', color: '#10b981' };
  };

  // 1. Submit Profile Update
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);

    try {
      const res = await fetch('/api/v1/users/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          username: username.trim() || null,
          bio: bio.trim(),
          phone_number: phoneNumber.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Cập nhật hồ sơ thất bại.');
      }

      setUser(prev => prev ? { ...prev, ...data.user } : data.user);
      showToast('success', 'Đã lưu thông tin hồ sơ thành công!');
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi cập nhật hồ sơ.');
    } finally {
      setSavingProfile(false);
    }
  };

  // 2. Submit Avatar Update
  const handleUpdateAvatar = async () => {
    if (!avatarUrl.trim()) {
      showToast('error', 'Vui lòng nhập đường dẫn ảnh đại diện.');
      return;
    }

    try {
      const res = await fetch('/api/v1/users/me/avatar', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: avatarUrl.trim() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Cập nhật ảnh đại diện thất bại.');

      setUser(prev => prev ? { ...prev, avatar_url: avatarUrl.trim() } : null);
      setShowAvatarEdit(false);
      showToast('success', 'Đã cập nhật ảnh đại diện!');
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi cập nhật ảnh đại diện.');
    }
  };

  // 3. Submit Change Email
  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || !emailCurrentPassword) {
      showToast('error', 'Vui lòng điền đầy đủ Email mới và Mật khẩu hiện tại.');
      return;
    }

    setSavingEmail(true);
    try {
      const res = await fetch('/api/v1/users/me/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_email: newEmail.trim(),
          current_password: emailCurrentPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Đổi email thất bại.');

      setUser(prev => prev ? { ...prev, email: data.email } : null);
      setNewEmail('');
      setEmailCurrentPassword('');
      showToast('success', 'Địa chỉ email đã được cập nhật thành công!');
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi đổi email.');
    } finally {
      setSavingEmail(false);
    }
  };

  // 4. Submit Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      showToast('error', 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới.');
      return;
    }

    if (newPassword.length < 8) {
      showToast('error', 'Mật khẩu mới phải có tối thiểu 8 ký tự.');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('error', 'Xác nhận mật khẩu mới không khớp.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/v1/users/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Đổi mật khẩu thất bại.');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('success', 'Đổi mật khẩu thành công! Phiên bảo mật đã được làm mới.');
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi đổi mật khẩu.');
    } finally {
      setSavingPassword(false);
    }
  };

  // 5. Submit Preferences Update
  const handleUpdatePreferences = async (theme: 'DARK' | 'LIGHT' | 'SYSTEM', lang: 'vi' | 'en') => {
    setThemePreference(theme);
    setLanguagePreference(lang);
    applyTheme(theme);

    setSavingPreferences(true);
    try {
      const res = await fetch('/api/v1/users/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme_preference: theme,
          language_preference: lang
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Lưu tùy chọn thất bại.');

      showToast('success', 'Đã lưu tùy chọn giao diện!');
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi lưu tùy chọn.');
    } finally {
      setSavingPreferences(false);
    }
  };

  if (loadingInitial) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚙️</div>
          <p>Đang tải thông tin tài khoản...</p>
        </div>
      </div>
    );
  }

  const pwdStrength = getPasswordStrength(newPassword);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 10%, rgba(99, 102, 241, 0.08) 0%, var(--bg-primary) 70%)',
      color: 'var(--text-primary)',
      padding: '2rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          background: toast.type === 'success' ? '#065f46' : '#991b1b',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: '0.9rem',
          boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeIn 0.25s ease'
        }}>
          <span>{toast.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Container */}
      <div style={{ width: '100%', maxWidth: '820px' }}>
        {/* Top Header Navigation */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2rem'
        }}>
          <Link
            href="/chat"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              padding: '8px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-hover)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            ← Quay lại Cuộc trò chuyện
          </Link>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Phiên bản: <strong>1.0.0</strong>
          </div>
        </div>

        {/* Page Title & User Summary Card */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem',
          marginBottom: '1.5rem',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.5rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {/* Avatar display */}
            <div style={{ position: 'relative' }}>
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: user?.avatar_url ? `url(${user.avatar_url}) center/cover no-repeat` : 'var(--accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                fontWeight: 700,
                color: '#fff',
                boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
                border: '2px solid rgba(255, 255, 255, 0.2)'
              }}>
                {!user?.avatar_url && (user?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
              </div>
            </div>

            <div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
                {user?.full_name || 'Người dùng'}
              </h1>
              <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <span>{user?.email}</span>
                {user?.username && (
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: 'var(--accent-primary)',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}>
                    @{user.username}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats Badges */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 16px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
                {stats.total_conversations}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cuộc trò chuyện</div>
            </div>
            <div style={{
              background: 'rgba(0,0,0,0.25)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 16px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#10b981' }}>
                {stats.total_messages}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tin nhắn đã gửi</div>
            </div>
          </div>
        </div>

        {/* Tab Navigation Buttons */}
        <div style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid var(--border-subtle)',
          marginBottom: '1.5rem',
          paddingBottom: '2px'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
              background: activeTab === 'profile' ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'profile' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'profile' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'profile' ? 600 : 500,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            👤 Thông tin hồ sơ
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
              background: activeTab === 'security' ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'security' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'security' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'security' ? 600 : 500,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🔒 Bảo mật & Đăng nhập
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
              background: activeTab === 'preferences' ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'preferences' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'preferences' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'preferences' ? 600 : 500,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ⚙️ Tùy chọn giao diện
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('models')}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
              background: activeTab === 'models' ? 'var(--bg-active)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'models' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'models' ? '#fff' : 'var(--text-secondary)',
              fontWeight: activeTab === 'models' ? 600 : 500,
              fontSize: '0.92rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            🤖 Quản lý Models & Agents
          </button>
        </div>

        {/* ============================================================ */}
        {/* TAB 1: THÔNG TIN HỒ SƠ (PROFILE)                             */}
        {/* ============================================================ */}
        {activeTab === 'profile' && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem',
            backdropFilter: 'blur(16px)'
          }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.25rem' }}>
              Chỉnh sửa thông tin cá nhân
            </h2>

            {/* Avatar Setting Section */}
            <div style={{
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              marginBottom: '1.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '2px' }}>
                  Ảnh đại diện (Avatar)
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Hỗ trợ định dạng URL HTTPS hoặc ảnh trực tuyến.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAvatarEdit(!showAvatarEdit)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                {showAvatarEdit ? 'Đóng' : 'Đổi ảnh đại diện'}
              </button>

              {showAvatarEdit && (
                <div style={{ width: '100%', marginTop: '0.75rem', display: 'flex', gap: '8px' }}>
                  <input
                    type="url"
                    placeholder="Nhập URL ảnh (https://...)"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid var(--border-subtle)',
                      color: '#fff',
                      fontSize: '0.85rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleUpdateAvatar}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-primary)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Lưu ảnh
                  </button>
                </div>
              )}
            </div>

            {/* Profile Form */}
            <form onSubmit={handleUpdateProfile}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid var(--border-subtle)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Tên đăng nhập (Username)
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="vana_nguyen"
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid var(--border-subtle)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    3-30 ký tự (chữ cái, chữ số, dấu gạch dưới _, dấu chấm .)
                  </span>
                </div>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                  Số điện thoại
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="0912345678"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid var(--border-subtle)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Tiểu sử (Bio)</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{bio.length}/500</span>
                </div>
                <textarea
                  value={bio}
                  maxLength={500}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Giới thiệu đôi nét về bản thân bạn..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(0,0,0,0.25)',
                    border: '1px solid var(--border-subtle)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={savingProfile}
                style={{
                  padding: '10px 22px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--accent-primary)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: savingProfile ? 'not-allowed' : 'pointer',
                  opacity: savingProfile ? 0.7 : 1,
                  boxShadow: 'var(--accent-glow)'
                }}
              >
                {savingProfile ? 'Đang lưu...' : 'Lưu thông tin hồ sơ'}
              </button>
            </form>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 2: BẢO MẬT & ĐĂNG NHẬP (SECURITY)                        */}
        {/* ============================================================ */}
        {activeTab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Card 1: Change Email */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem',
              backdropFilter: 'blur(16px)'
            }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Thay đổi địa chỉ Email
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Email hiện tại: <strong>{user?.email}</strong>. Cần xác thực mật khẩu hiện tại để hoàn tất.
              </p>

              <form onSubmit={handleChangeEmail}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      Địa chỉ Email mới
                    </label>
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="email.moi@domain.com"
                      required
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid var(--border-subtle)',
                        color: '#fff',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      Mật khẩu hiện tại
                    </label>
                    <input
                      type="password"
                      value={emailCurrentPassword}
                      onChange={(e) => setEmailCurrentPassword(e.target.value)}
                      placeholder="Nhập mật khẩu hiện tại"
                      required
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid var(--border-subtle)',
                        color: '#fff',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingEmail}
                  style={{
                    padding: '10px 22px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: savingEmail ? 'not-allowed' : 'pointer',
                    opacity: savingEmail ? 0.7 : 1
                  }}
                >
                  {savingEmail ? 'Đang xác thực...' : 'Xác nhận đổi Email'}
                </button>
              </form>
            </div>

            {/* Card 2: Change Password */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '2rem',
              backdropFilter: 'blur(16px)'
            }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Thay đổi Mật khẩu
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Sau khi đổi mật khẩu, phiên làm việc sẽ được cấp phát khóa bảo mật mới tự động.
              </p>

              <form onSubmit={handleChangePassword}>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                    Mật khẩu hiện tại
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Mật khẩu đang sử dụng"
                    required
                    style={{
                      width: '100%',
                      maxWidth: '400px',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0,0,0,0.25)',
                      border: '1px solid var(--border-subtle)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      Mật khẩu mới
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Ít nhất 8 ký tự"
                      required
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid var(--border-subtle)',
                        color: '#fff',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>
                      Xác nhận mật khẩu mới
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                      required
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(0,0,0,0.25)',
                        border: '1px solid var(--border-subtle)',
                        color: '#fff',
                        fontSize: '0.9rem'
                      }}
                    />
                  </div>
                </div>

                {/* Password Strength Meter */}
                {newPassword && (
                  <div style={{ marginBottom: '1.25rem', maxWidth: '400px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Độ mạnh mật khẩu:</span>
                      <span style={{ color: pwdStrength.color, fontWeight: 600 }}>{pwdStrength.label}</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pwdStrength.score}%`,
                        background: pwdStrength.color,
                        transition: 'all 0.3s ease'
                      }} />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingPassword}
                  style={{
                    padding: '10px 22px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: savingPassword ? 'not-allowed' : 'pointer',
                    opacity: savingPassword ? 0.7 : 1
                  }}
                >
                  {savingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 3: TÙY CHỌN GIAO DIỆN (PREFERENCES)                      */}
        {/* ============================================================ */}
        {activeTab === 'preferences' && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem',
            backdropFilter: 'blur(16px)'
          }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1.25rem' }}>
              Tùy biến hiển thị & Ngôn ngữ
            </h2>

            {/* Theme Selector */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '10px' }}>
                Chủ đề giao diện (Theme Mode)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {/* Dark Theme Card */}
                <div
                  onClick={() => handleUpdatePreferences('DARK', languagePreference)}
                  style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    background: '#0a0f1d',
                    border: themePreference === 'DARK' ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: themePreference === 'DARK' ? 'var(--accent-glow)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>🌙</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>Dark Mode</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Giao diện tối</div>
                </div>

                {/* Light Theme Card */}
                <div
                  onClick={() => handleUpdatePreferences('LIGHT', languagePreference)}
                  style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    background: '#f8fafc',
                    color: '#0f172a',
                    border: themePreference === 'LIGHT' ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: themePreference === 'LIGHT' ? 'var(--accent-glow)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>☀️</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#0f172a' }}>Light Mode</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>Giao diện sáng</div>
                </div>

                {/* System Theme Card */}
                <div
                  onClick={() => handleUpdatePreferences('SYSTEM', languagePreference)}
                  style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(255,255,255,0.05)',
                    border: themePreference === 'SYSTEM' ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    boxShadow: themePreference === 'SYSTEM' ? 'var(--accent-glow)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '6px' }}>💻</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>System</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Theo hệ thống</div>
                </div>
              </div>
            </div>

            {/* Language Selector */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.88rem', fontWeight: 600, marginBottom: '8px' }}>
                Ngôn ngữ giao diện (Language)
              </label>
              <select
                value={languagePreference}
                onChange={(e) => handleUpdatePreferences(themePreference, e.target.value as 'vi' | 'en')}
                style={{
                  width: '100%',
                  maxWidth: '300px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid var(--border-subtle)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <option value="vi" style={{ background: '#111827', color: '#fff' }}>🇻🇳 Tiếng Việt</option>
                <option value="en" style={{ background: '#111827', color: '#fff' }}>🇬🇧 English</option>
              </select>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* TAB 4: QUẢN LÝ MODELS & AGENTS (FR-021 TO FR-026, BR-012)    */}
        {/* ============================================================ */}
        {activeTab === 'models' && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem',
            backdropFilter: 'blur(16px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🤖 Danh Mục Mô Hình & AI Agents
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
                  Quản lý trạng thái Soft-Toggle, đo lường độ trễ mạng và thiết lập mô hình mặc định từ các nhà cung cấp bên ngoài.
                </p>
              </div>

              <button
                type="button"
                onClick={fetchModels}
                disabled={loadingModels}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--border-subtle)',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: loadingModels ? 'not-allowed' : 'pointer'
                }}
              >
                <span>{loadingModels ? '⏳' : '🔄'}</span>
                <span>{loadingModels ? 'Đang tải...' : 'Làm mới'}</span>
              </button>
            </div>

            {/* Quick Filter Toolbar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '1.5rem'
            }}>
              {/* Status Filter Tabs */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map(st => {
                  const label = st === 'ALL' ? `Tất cả (${models.length})` : st === 'ACTIVE' ? `🟢 Hoạt động (${models.filter(m => m.status === 'ACTIVE').length})` : `⚪ Tạm dừng (${models.filter(m => m.status === 'INACTIVE').length})`;
                  const isSelected = modelFilterStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setModelFilterStatus(st)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.82rem',
                        fontWeight: isSelected ? 600 : 500,
                        background: isSelected ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                        border: isSelected ? '1px solid var(--accent-secondary)' : '1px solid transparent',
                        color: isSelected ? '#fff' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Provider Filter Select */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Nhà cung cấp:</span>
                <select
                  value={modelFilterProvider}
                  onChange={(e) => setModelFilterProvider(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(0,0,0,0.35)',
                    border: '1px solid var(--border-subtle)',
                    color: '#fff',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value="ALL" style={{ background: '#111827', color: '#fff' }}>Tất cả nhà cung cấp</option>
                  <option value="google" style={{ background: '#111827', color: '#fff' }}>Google Gemini</option>
                  <option value="openai" style={{ background: '#111827', color: '#fff' }}>OpenAI</option>
                  <option value="anthropic" style={{ background: '#111827', color: '#fff' }}>Anthropic</option>
                  <option value="groq" style={{ background: '#111827', color: '#fff' }}>Groq</option>
                  <option value="ollama" style={{ background: '#111827', color: '#fff' }}>Ollama</option>
                </select>
              </div>
            </div>

            {/* Models Cards Grid */}
            {loadingModels && models.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
                <div>Đang tải danh mục mô hình AI...</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                {models
                  .filter(m => {
                    const passStatus = modelFilterStatus === 'ALL' || m.status === modelFilterStatus;
                    const passProvider = modelFilterProvider === 'ALL' || m.provider.toLowerCase() === modelFilterProvider.toLowerCase();
                    return passStatus && passProvider;
                  })
                  .map(m => {
                    const pMeta = getProviderMeta(m.provider);
                    const sMeta = getStatusMeta(m.status);
                    const isTesting = testingModelId === m.id;
                    const isToggling = togglingModelId === m.id;
                    const isSettingDef = settingDefaultId === m.id;

                    return (
                      <div
                        key={m.id}
                        style={{
                          borderRadius: 'var(--radius-md)',
                          background: 'rgba(15, 23, 42, 0.65)',
                          border: m.is_default ? '2px solid rgba(245, 158, 11, 0.6)' : `1px solid ${pMeta.border}`,
                          boxShadow: m.is_default ? '0 0 20px rgba(245, 158, 11, 0.2)' : 'none',
                          padding: '1.25rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          backdropFilter: 'blur(10px)',
                          transition: 'transform 0.2s ease, border-color 0.2s ease'
                        }}
                      >
                        {/* Top: Header with Provider, Name & Status */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            {/* Provider pill */}
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 10px',
                              borderRadius: 'var(--radius-full)',
                              background: pMeta.badgeBg,
                              border: `1px solid ${pMeta.border}`,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: pMeta.textColor
                            }}>
                              <span>{pMeta.icon}</span>
                              <span>{pMeta.label}</span>
                            </span>

                            {/* Status & Default Badges */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {m.is_default && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '3px 8px',
                                  borderRadius: 'var(--radius-full)',
                                  background: 'rgba(245, 158, 11, 0.2)',
                                  border: '1px solid rgba(245, 158, 11, 0.5)',
                                  color: '#fbbf24',
                                  fontSize: '0.72rem',
                                  fontWeight: 700
                                }}>
                                  ⭐ Mặc định
                                </span>
                              )}
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: 'var(--radius-full)',
                                background: sMeta.badgeBg,
                                border: `1px solid ${sMeta.badgeBorder}`,
                                color: sMeta.textColor,
                                fontSize: '0.72rem',
                                fontWeight: 600
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: sMeta.dotColor }} />
                                <span>{sMeta.label}</span>
                              </span>
                            </div>
                          </div>

                          {/* Model Title & ID */}
                          <div style={{ marginBottom: '12px' }}>
                            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc', marginBottom: '2px' }}>
                              {m.name}
                            </h3>
                            <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                              ID: {m.id}
                            </div>
                          </div>

                          {/* Key Presence Indicator */}
                          <div style={{
                            padding: '6px 10px',
                            borderRadius: 'var(--radius-sm)',
                            background: m.has_api_key ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                            border: `1px solid ${m.has_api_key ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: '12px'
                          }}>
                            <span style={{ color: m.has_api_key ? '#34d399' : '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{m.has_api_key ? '🔑' : '⚠️'}</span>
                              <span>{m.has_api_key ? 'API Key đã cấu hình trong .env' : 'Chưa cấu hình API Key trong .env'}</span>
                            </span>
                            {m.latency_ms ? (
                              <span style={{ color: '#38bdf8', fontWeight: 600 }}>
                                ⚡ {m.latency_ms} ms
                              </span>
                            ) : null}
                          </div>

                          {/* Technical Specs 2x2 Grid */}
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(2, 1fr)',
                            gap: '8px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '10px',
                            marginBottom: '14px',
                            fontSize: '0.78rem'
                          }}>
                            <div>
                              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Ngữ cảnh tối đa</span>
                              <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{m.context_window.toLocaleString()} tokens</span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Phản hồi tối đa</span>
                              <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{m.max_tokens.toLocaleString()} tokens</span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Streaming SSE</span>
                              <span style={{ fontWeight: 600, color: m.supports_streaming ? '#34d399' : '#94a3b8' }}>
                                {m.supports_streaming ? '✓ Hỗ trợ' : '✗ Không'}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.72rem' }}>Kiểm tra gần nhất</span>
                              <span style={{ fontWeight: 500, color: '#94a3b8' }}>
                                {m.last_checked_at ? new Date(m.last_checked_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Chưa đo'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions Footer Toolbar */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {/* Ping / Test Button */}
                            <button
                              type="button"
                              onClick={() => handleTestConnection(m)}
                              disabled={isTesting}
                              title="Kiểm tra kết nối và đo độ trễ tới API nhà cung cấp"
                              style={{
                                flex: 1,
                                padding: '8px 10px',
                                borderRadius: 'var(--radius-sm)',
                                background: 'rgba(56, 189, 248, 0.1)',
                                border: '1px solid rgba(56, 189, 248, 0.3)',
                                color: '#38bdf8',
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                cursor: isTesting ? 'wait' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>{isTesting ? '⏳' : '⚡'}</span>
                              <span>{isTesting ? 'Đang ping...' : 'Ping test'}</span>
                            </button>

                            {/* Soft Toggle Button (Activate or Deactivate - BR-012) */}
                            {m.status === 'ACTIVE' ? (
                              <button
                                type="button"
                                onClick={() => handleDeactivateModel(m)}
                                disabled={isToggling || m.is_default}
                                title={m.is_default ? 'Không thể tạm dừng mô hình đang làm mặc định (BR-013)' : 'Tạm dừng mô hình (Soft toggle - BR-012)'}
                                style={{
                                  flex: 1,
                                  padding: '8px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: m.is_default ? 'rgba(255,255,255,0.04)' : 'rgba(239, 68, 68, 0.1)',
                                  border: m.is_default ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(239, 68, 68, 0.3)',
                                  color: m.is_default ? 'var(--text-muted)' : '#f87171',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: (isToggling || m.is_default) ? 'not-allowed' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px'
                                }}
                              >
                                <span>{isToggling ? '⏳' : '⏸️'}</span>
                                <span>{isToggling ? 'Đang xử lý...' : 'Tạm dừng'}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleActivateModel(m)}
                                disabled={isToggling}
                                title="Kích hoạt mô hình đưa vào giao diện chat"
                                style={{
                                  flex: 1,
                                  padding: '8px 10px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'rgba(16, 185, 129, 0.12)',
                                  border: '1px solid rgba(16, 185, 129, 0.35)',
                                  color: '#34d399',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: isToggling ? 'wait' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '6px'
                                }}
                              >
                                <span>{isToggling ? '⏳' : '▶️'}</span>
                                <span>{isToggling ? 'Đang xử lý...' : 'Kích hoạt'}</span>
                              </button>
                            )}
                          </div>

                          {/* Set As Default Button */}
                          {!m.is_default && (
                            <button
                              type="button"
                              onClick={() => handleSetDefaultModel(m)}
                              disabled={isSettingDef || m.status !== 'ACTIVE'}
                              title={m.status !== 'ACTIVE' ? 'Chỉ có thể đặt mô hình đang ACTIVE làm mặc định' : 'Thiết lập làm mô hình mặc định cho các phiên chat mới'}
                              style={{
                                width: '100%',
                                padding: '6px 12px',
                                borderRadius: 'var(--radius-sm)',
                                background: m.status === 'ACTIVE' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.03)',
                                border: m.status === 'ACTIVE' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid var(--border-subtle)',
                                color: m.status === 'ACTIVE' ? '#fbbf24' : 'var(--text-muted)',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                cursor: (isSettingDef || m.status !== 'ACTIVE') ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <span>⭐</span>
                              <span>{isSettingDef ? 'Đang thiết lập...' : 'Đặt làm mô hình mặc định'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {/* Invariant Policy Callout Box (BR-012, BR-013, BR-014, BR-015) */}
            <div style={{
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              fontSize: '0.82rem',
              lineHeight: 1.6
            }}>
              <div style={{ fontWeight: 700, color: '#e2e8f0', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🛡️</span>
                <span>Quy Tắc Vận Hành & Bảo Vệ Toàn Vẹn Dữ Liệu (Data & Model Invariants)</span>
              </div>
              <ul style={{ listStyleType: 'disc', paddingLeft: '1.25rem', color: 'var(--text-secondary)' }}>
                <li>
                  <strong style={{ color: '#fff' }}>BR-012 (Không xóa cứng):</strong> Hệ thống tuyệt đối không cung cấp thao tác xóa vật lý (Hard Delete) mô hình khỏi CSDL để bảo toàn tính toàn vẹn của lịch sử đàm thoại và số liệu token. Thay vào đó, áp dụng cơ chế <em>Soft Toggle</em> (Kích hoạt ↔ Tạm dừng).
                </li>
                <li>
                  <strong style={{ color: '#fff' }}>BR-013 (Bảo toàn mô hình mặc định):</strong> Hệ thống luôn duy trì ít nhất 1 mô hình ở trạng thái <code>ACTIVE</code> làm mặc định. Bạn không thể hủy kích hoạt mô hình đang là mặc định trước khi chỉ định mô hình thay thế.
                </li>
                <li>
                  <strong style={{ color: '#fff' }}>BR-014 (Kiểm tra khóa API):</strong> Việc kích hoạt mô hình đòi hỏi API Key tương ứng phải được cấu hình trong tệp <code>.env</code> tại backend.
                </li>
                <li>
                  <strong style={{ color: '#fff' }}>FR-023 (Đo lường độ trễ):</strong> Nút <em>Ping test</em> kiểm tra kết nối trực tiếp Round-Trip tới API nhà cung cấp và tự động lưu độ trễ mới nhất vào cơ sở dữ liệu.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
