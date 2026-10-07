'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

  // Active tab state: 'profile' | 'security' | 'preferences'
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'preferences'>('profile');

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
      </div>
    </div>
  );
}
