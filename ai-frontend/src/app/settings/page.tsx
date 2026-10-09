'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AgentModel, ModelSearchResponse } from '@/types';

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

  // Tab 4: Models state (FR-021 to FR-026, FR-035 to FR-039)
  const [models, setModels] = useState<AgentModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelFilterStatus, setModelFilterStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>('ALL');
  const [modelFilterProvider, setModelFilterProvider] = useState<string>('ALL');
  const [modelSearchQuery, setModelSearchQuery] = useState<string>('');
  const [modelSort, setModelSort] = useState<'name_asc' | 'latency_asc' | 'context_desc'>('name_asc');
  const [modelOnlyWithKey, setModelOnlyWithKey] = useState<boolean>(false);
  const [searchLatencyMs, setSearchLatencyMs] = useState<number | null>(null);

  const [testingModelId, setTestingModelId] = useState<string | null>(null);
  const [togglingModelId, setTogglingModelId] = useState<string | null>(null);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  // Modal Create state (FR-035, OP-022)
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [createModelForm, setCreateModelForm] = useState({
    id: '',
    name: '',
    provider: 'google',
    context_window: 128000,
    max_tokens: 4096,
    supports_streaming: true
  });
  const [creatingModel, setCreatingModel] = useState<boolean>(false);

  // Modal Edit state (FR-036, OP-023)
  const [editingModel, setEditingModel] = useState<AgentModel | null>(null);
  const [editModelForm, setEditModelForm] = useState({
    name: '',
    context_window: 128000,
    max_tokens: 4096,
    supports_streaming: true
  });
  const [updatingModel, setUpdatingModel] = useState<boolean>(false);

  // Confirm Archive Modal state (FR-039, OP-025, BR-023)
  const [confirmArchiveModel, setConfirmArchiveModel] = useState<AgentModel | null>(null);
  const [archivingModelId, setArchivingModelId] = useState<string | null>(null);

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

  const fetchModels = async (searchQ?: string) => {
    try {
      setLoadingModels(true);
      const q = searchQ !== undefined ? searchQ : modelSearchQuery;
      const params = new URLSearchParams();
      if (q && q.trim()) params.append('q', q.trim());
      if (modelFilterProvider && modelFilterProvider !== 'ALL') params.append('provider', modelFilterProvider);
      if (modelFilterStatus && modelFilterStatus !== 'ALL') params.append('status', modelFilterStatus);
      if (modelSort) params.append('sort', modelSort);
      if (modelOnlyWithKey) params.append('has_api_key', 'true');

      const res = await fetch(`/api/v1/models/search?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Không thể tải danh sách mô hình từ máy chủ.');
      }
      const data: ModelSearchResponse = await res.json();
      setModels(data.items);
      setSearchLatencyMs(data.execution_time_ms);
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
  }, [activeTab, modelFilterStatus, modelFilterProvider, modelSort, modelOnlyWithKey]);

  useEffect(() => {
    if (activeTab !== 'models') return;
    const timer = setTimeout(() => {
      fetchModels(modelSearchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [modelSearchQuery]);

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

  // FR-035: Thêm mô hình mới
  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createModelForm.id.trim() || !createModelForm.name.trim()) {
      showToast('error', 'Vui lòng nhập đầy đủ Mã ID và Tên mô hình.');
      return;
    }
    if (createModelForm.max_tokens > createModelForm.context_window) {
      showToast('error', 'Phản hồi tối đa (max_tokens) không được lớn hơn ngữ cảnh tối đa (BR-024).');
      return;
    }
    if (createModelForm.context_window < 1000 || createModelForm.max_tokens < 256) {
      showToast('error', 'Ngưỡng an toàn tối thiểu: Ngữ cảnh >= 1,000 và Phản hồi >= 256 tokens (BR-024).');
      return;
    }

    setCreatingModel(true);
    try {
      const res = await fetch('/api/v1/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createModelForm)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Không thể đăng ký mô hình mới.');
      }
      showToast('success', `🎉 Đăng ký thành công mô hình ${createModelForm.name}!`);
      setShowCreateModal(false);
      setCreateModelForm({
        id: '',
        name: '',
        provider: 'google',
        context_window: 128000,
        max_tokens: 4096,
        supports_streaming: true
      });
      await fetchModels();
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi khi đăng ký mô hình.');
    } finally {
      setCreatingModel(false);
    }
  };

  // FR-036: Hiệu chỉnh cấu hình mô hình
  const openEditModal = (model: AgentModel) => {
    setEditingModel(model);
    setEditModelForm({
      name: model.name,
      context_window: model.context_window,
      max_tokens: model.max_tokens,
      supports_streaming: model.supports_streaming
    });
  };

  const handleUpdateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModel) return;
    if (!editModelForm.name.trim()) {
      showToast('error', 'Tên mô hình không được để trống.');
      return;
    }
    if (editModelForm.max_tokens > editModelForm.context_window) {
      showToast('error', 'Phản hồi tối đa (max_tokens) không được lớn hơn ngữ cảnh tối đa (BR-024).');
      return;
    }
    if (editModelForm.context_window < 1000 || editModelForm.max_tokens < 256) {
      showToast('error', 'Ngưỡng an toàn tối thiểu: Ngữ cảnh >= 1,000 và Phản hồi >= 256 tokens (BR-024).');
      return;
    }

    setUpdatingModel(true);
    try {
      const res = await fetch(`/api/v1/models/${editingModel.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editModelForm)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Không thể cập nhật cấu hình mô hình.');
      }
      showToast('success', `✅ Cập nhật thành công cấu hình cho ${editingModel.id}!`);
      setEditingModel(null);
      await fetchModels();
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi khi cập nhật mô hình.');
    } finally {
      setUpdatingModel(false);
    }
  };

  // FR-039: Xóa mềm & Lưu trữ an toàn
  const handleArchiveModel = async (model: AgentModel) => {
    if (model.is_default) {
      showToast('error', `Không thể lưu trữ '${model.name}' vì đang là mô hình mặc định của hệ thống (BR-023). Hãy chọn mô hình khác làm mặc định trước.`);
      return;
    }
    setArchivingModelId(model.id);
    try {
      const res = await fetch(`/api/v1/models/${model.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Không thể lưu trữ mô hình.');
      }
      showToast('success', `📦 ${data.message}`);
      setConfirmArchiveModel(null);
      await fetchModels();
    } catch (err: any) {
      showToast('error', err.message || 'Lỗi khi lưu trữ mô hình.');
    } finally {
      setArchivingModelId(null);
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
      case 'ARCHIVED':
        return {
          label: 'Đã lưu trữ',
          badgeBg: 'rgba(239, 68, 68, 0.12)',
          badgeBorder: 'rgba(239, 68, 68, 0.35)',
          textColor: '#f87171',
          dotColor: '#ef4444'
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
        {/* TAB 4: QUẢN LÝ MODELS & AGENTS (FR-021 TO FR-026, FR-035..39)*/}
        {/* ============================================================ */}
        {activeTab === 'models' && (
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '2rem',
            backdropFilter: 'blur(16px)'
          }}>
            {/* Header: Title & Action Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🤖 Danh Mục Mô Hình & AI Agents
                </h2>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
                  Quản lý vòng đời mô hình, tìm kiếm & bộ lọc đa thuộc tính, đo lường độ trễ mạng và cấu hình tham số động.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {/* Button: Add New Model (FR-035) */}
                <button
                  type="button"
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                    border: '1px solid rgba(124, 58, 237, 0.5)',
                    color: '#fff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span>✨</span>
                  <span>+ Thêm mô hình mới</span>
                </button>

                {/* Button: Refresh */}
                <button
                  type="button"
                  onClick={() => fetchModels()}
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
            </div>

            {/* Instant Search Bar (FR-037, NFR-022) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--border-subtle)',
              marginBottom: '1rem'
            }}>
              <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>🔍</span>
              <input
                type="text"
                value={modelSearchQuery}
                onChange={(e) => setModelSearchQuery(e.target.value)}
                placeholder="Tìm kiếm nhanh theo tên mô hình hoặc ID (ví dụ: gemini, claude, gpt)..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#fff',
                  fontSize: '0.88rem'
                }}
              />
              {modelSearchQuery && (
                <button
                  type="button"
                  onClick={() => setModelSearchQuery('')}
                  title="Xóa tìm kiếm"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  ✕
                </button>
              )}
              {searchLatencyMs !== null && (
                <span style={{
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#34d399',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}>
                  ⚡ Phản hồi: {searchLatencyMs} ms (SLA &le; 200ms)
                </span>
              )}
            </div>

            {/* Multi-Attribute Filter & Sort Toolbar (FR-038) */}
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
                {(['ALL', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const).map(st => {
                  const label = st === 'ALL'
                    ? `Tất cả (${models.length})`
                    : st === 'ACTIVE'
                    ? `🟢 Hoạt động`
                    : st === 'INACTIVE'
                    ? `⚪ Tạm dừng`
                    : `📦 Đã lưu trữ`;
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

              {/* Right Selectors: Provider, Sort, Key Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {/* Provider Filter Select */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Hãng:</span>
                  <select
                    value={modelFilterProvider}
                    onChange={(e) => setModelFilterProvider(e.target.value)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0,0,0,0.35)',
                      border: '1px solid var(--border-subtle)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="ALL" style={{ background: '#111827', color: '#fff' }}>Tất cả hãng</option>
                    <option value="google" style={{ background: '#111827', color: '#fff' }}>Google Gemini</option>
                    <option value="openai" style={{ background: '#111827', color: '#fff' }}>OpenAI</option>
                    <option value="anthropic" style={{ background: '#111827', color: '#fff' }}>Anthropic</option>
                    <option value="groq" style={{ background: '#111827', color: '#fff' }}>Groq</option>
                    <option value="ollama" style={{ background: '#111827', color: '#fff' }}>Ollama</option>
                  </select>
                </div>

                {/* Sort Order Select */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sắp xếp:</span>
                  <select
                    value={modelSort}
                    onChange={(e) => setModelSort(e.target.value as any)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(0,0,0,0.35)',
                      border: '1px solid var(--border-subtle)',
                      color: '#fff',
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="name_asc" style={{ background: '#111827', color: '#fff' }}>Tên (A-Z)</option>
                    <option value="latency_asc" style={{ background: '#111827', color: '#fff' }}>Độ trễ thấp nhất</option>
                    <option value="context_desc" style={{ background: '#111827', color: '#fff' }}>Ngữ cảnh lớn nhất</option>
                  </select>
                </div>

                {/* Has API Key Toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={modelOnlyWithKey}
                    onChange={(e) => setModelOnlyWithKey(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Chỉ hiện có API Key</span>
                </label>
              </div>
            </div>

            {/* Models Cards Grid */}
            {loadingModels && models.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>⏳</div>
                <div>Đang tải danh mục mô hình AI...</div>
              </div>
            ) : models.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔍</div>
                <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>Không tìm thấy mô hình nào phù hợp</div>
                <div style={{ fontSize: '0.85rem' }}>Hãy thử thay đổi từ khóa tìm kiếm hoặc điều chỉnh lại bộ lọc trạng thái / nhà cung cấp.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                {models.map(m => {
                  const pMeta = getProviderMeta(m.provider);
                  const sMeta = getStatusMeta(m.status);
                  const isTesting = testingModelId === m.id;
                  const isToggling = togglingModelId === m.id;
                  const isSettingDef = settingDefaultId === m.id;
                  const isArchiving = archivingModelId === m.id;
                  const isArchived = m.status === 'ARCHIVED';

                  return (
                    <div
                      key={m.id}
                      style={{
                        borderRadius: 'var(--radius-md)',
                        background: isArchived ? 'rgba(15, 23, 42, 0.4)' : 'rgba(15, 23, 42, 0.65)',
                        border: m.is_default
                          ? '2px solid rgba(245, 158, 11, 0.6)'
                          : isArchived
                          ? '1px dashed rgba(239, 68, 68, 0.3)'
                          : `1px solid ${pMeta.border}`,
                        boxShadow: m.is_default ? '0 0 20px rgba(245, 158, 11, 0.2)' : 'none',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        backdropFilter: 'blur(10px)',
                        opacity: isArchived ? 0.75 : 1,
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
                        {/* Action Row 1: Ping Test & Edit Model */}
                        <div style={{ display: 'flex', gap: '8px' }}>
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

                          {/* Edit Button (FR-036) */}
                          <button
                            type="button"
                            onClick={() => openEditModal(m)}
                            title="Chỉnh sửa tham số kỹ thuật mô hình (FR-036)"
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(99, 102, 241, 0.12)',
                              border: '1px solid rgba(99, 102, 241, 0.35)',
                              color: '#a5b4fc',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            <span>✏️</span>
                            <span>Sửa</span>
                          </button>
                        </div>

                        {/* Action Row 2: Toggle Status & Soft Archive */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {/* Soft Toggle Button (Activate or Deactivate) */}
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
                              <span>{isToggling ? 'Đang xử lý...' : isArchived ? 'Khôi phục' : 'Kích hoạt'}</span>
                            </button>
                          )}

                          {/* Soft Archive Button (FR-039, BR-023) */}
                          <button
                            type="button"
                            onClick={() => setConfirmArchiveModel(m)}
                            disabled={m.is_default || isArchived || isArchiving}
                            title={
                              m.is_default
                                ? 'Không thể lưu trữ mô hình mặc định hệ thống (BR-023)'
                                : isArchived
                                ? 'Mô hình đã nằm trong trạng thái lưu trữ'
                                : 'Xóa mềm / Chuyển vào trạng thái lưu trữ an toàn (FR-039)'
                            }
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              borderRadius: 'var(--radius-sm)',
                              background: (m.is_default || isArchived) ? 'rgba(255,255,255,0.03)' : 'rgba(244, 63, 94, 0.1)',
                              border: (m.is_default || isArchived) ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(244, 63, 94, 0.3)',
                              color: (m.is_default || isArchived) ? 'var(--text-muted)' : '#fb7185',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: (m.is_default || isArchived || isArchiving) ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            <span>📦</span>
                            <span>{isArchived ? 'Đã lưu trữ' : 'Lưu trữ'}</span>
                          </button>
                        </div>

                        {/* Set As Default Button */}
                        {!m.is_default && !isArchived && (
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

            {/* Invariant Policy Callout Box (BR-012, BR-022, BR-023, BR-024) */}
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
                  <strong style={{ color: '#fff' }}>BR-022 (Bất biến ID & Provider):</strong> Mã ID và hãng cung cấp là bất biến sau khi khởi tạo nhằm bảo vệ toàn vẹn khóa ngoại trong lịch sử hội thoại và số liệu đo đạc tài nguyên.
                </li>
                <li>
                  <strong style={{ color: '#fff' }}>BR-023 (Bảo toàn mô hình mặc định):</strong> Tuyệt đối không thể lưu trữ (xóa mềm) hoặc hủy kích hoạt mô hình đang giữ cờ mặc định (<code>is_default = 1</code>). Hãy chọn mô hình khác làm mặc định trước.
                </li>
                <li>
                  <strong style={{ color: '#fff' }}>BR-024 (Giới hạn biên an toàn):</strong> Tham số kỹ thuật bắt buộc phải thỏa mãn <code>Context Window &ge; 1,000</code>, <code>Max Tokens &ge; 256</code> và <code>Max Tokens &le; Context Window</code>.
                </li>
                <li>
                  <strong style={{ color: '#fff' }}>NFR-022 (SLA Tìm kiếm & Lọc):</strong> Thời gian thực thi tra cứu động được đo lường và đáp ứng ngưỡng dưới 200ms.
                </li>
              </ul>
            </div>

            {/* ============================================================ */}
            {/* MODAL 1: THÊM MÔ HÌNH MỚI (FR-035, OP-022)                  */}
            {/* ============================================================ */}
            {showCreateModal && (
              <div style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '1rem'
              }}>
                <div style={{
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem',
                  maxWidth: '520px',
                  width: '100%',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>✨</span>
                      <span>Đăng Ký Mô Hình AI Mới (FR-035)</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleCreateModel}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                      {/* Model ID */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                          Mã định danh Model ID (Duy nhất toàn cục) *
                        </label>
                        <input
                          type="text"
                          required
                          value={createModelForm.id}
                          onChange={(e) => setCreateModelForm(prev => ({ ...prev, id: e.target.value }))}
                          placeholder="ví dụ: claude-3-5-sonnet, gpt-4.5-turbo..."
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid var(--border-subtle)',
                            color: '#fff',
                            fontSize: '0.85rem',
                            fontFamily: 'var(--font-mono)'
                          }}
                        />
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Mã ID là bất biến sau khi lưu (BR-022).</span>
                      </div>

                      {/* Display Name */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                          Tên hiển thị mô hình *
                        </label>
                        <input
                          type="text"
                          required
                          value={createModelForm.name}
                          onChange={(e) => setCreateModelForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="ví dụ: Anthropic Claude 3.5 Sonnet..."
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid var(--border-subtle)',
                            color: '#fff',
                            fontSize: '0.85rem'
                          }}
                        />
                      </div>

                      {/* Provider */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                          Hãng cung cấp (Provider) *
                        </label>
                        <select
                          value={createModelForm.provider}
                          onChange={(e) => setCreateModelForm(prev => ({ ...prev, provider: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: '#1e293b',
                            border: '1px solid var(--border-subtle)',
                            color: '#fff',
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="google">Google Gemini</option>
                          <option value="openai">OpenAI</option>
                          <option value="anthropic">Anthropic</option>
                          <option value="groq">Groq</option>
                          <option value="ollama">Ollama (Local)</option>
                        </select>
                      </div>

                      {/* Specs: Context & Max Tokens 2 Columns */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                            Ngữ cảnh tối đa (tokens)
                          </label>
                          <input
                            type="number"
                            min="1000"
                            value={createModelForm.context_window}
                            onChange={(e) => setCreateModelForm(prev => ({ ...prev, context_window: parseInt(e.target.value) || 1000 }))}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(0,0,0,0.4)',
                              border: '1px solid var(--border-subtle)',
                              color: '#fff',
                              fontSize: '0.85rem'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                            Phản hồi tối đa (tokens)
                          </label>
                          <input
                            type="number"
                            min="256"
                            value={createModelForm.max_tokens}
                            onChange={(e) => setCreateModelForm(prev => ({ ...prev, max_tokens: parseInt(e.target.value) || 256 }))}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(0,0,0,0.4)',
                              border: '1px solid var(--border-subtle)',
                              color: '#fff',
                              fontSize: '0.85rem'
                            }}
                          />
                        </div>
                      </div>

                      {/* Streaming SSE Checkbox */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#e2e8f0' }}>
                        <input
                          type="checkbox"
                          checked={createModelForm.supports_streaming}
                          onChange={(e) => setCreateModelForm(prev => ({ ...prev, supports_streaming: e.target.checked }))}
                        />
                        <span>Mô hình hỗ trợ truyền luồng thời gian thực (Streaming SSE)</span>
                      </label>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setShowCreateModal(false)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--border-subtle)',
                          color: '#fff',
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={creatingModel}
                        style={{
                          padding: '8px 20px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                          border: 'none',
                          color: '#fff',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: creatingModel ? 'wait' : 'pointer'
                        }}
                      >
                        {creatingModel ? 'Đang lưu...' : 'Lưu mô hình'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 2: HIỆU CHỈNH CẤU HÌNH MÔ HÌNH (FR-036, OP-023)        */}
            {/* ============================================================ */}
            {editingModel && (
              <div style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '1rem'
              }}>
                <div style={{
                  background: '#0f172a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem',
                  maxWidth: '520px',
                  width: '100%',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>✏️</span>
                      <span>Chỉnh Sửa Cấu Hình Mô Hình (FR-036)</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEditingModel(null)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.25rem', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  </div>

                  <form onSubmit={handleUpdateModel}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                      {/* Immutable ID & Provider Info */}
                      <div style={{
                        padding: '10px 14px',
                        background: 'rgba(0,0,0,0.35)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.8rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Mã định danh ID:</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#e2e8f0' }}>{editingModel.id}</div>
                        </div>
                        <div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Nhà cung cấp:</div>
                          <div style={{ fontWeight: 600, color: '#38bdf8' }}>{editingModel.provider.toUpperCase()}</div>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.12)', padding: '2px 6px', borderRadius: '4px' }}>
                          Bất biến (BR-022)
                        </span>
                      </div>

                      {/* Display Name */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                          Tên hiển thị mô hình *
                        </label>
                        <input
                          type="text"
                          required
                          value={editModelForm.name}
                          onChange={(e) => setEditModelForm(prev => ({ ...prev, name: e.target.value }))}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'rgba(0,0,0,0.4)',
                            border: '1px solid var(--border-subtle)',
                            color: '#fff',
                            fontSize: '0.85rem'
                          }}
                        />
                      </div>

                      {/* Specs: Context & Max Tokens 2 Columns */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                            Ngữ cảnh tối đa (tokens)
                          </label>
                          <input
                            type="number"
                            min="1000"
                            value={editModelForm.context_window}
                            onChange={(e) => setEditModelForm(prev => ({ ...prev, context_window: parseInt(e.target.value) || 1000 }))}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(0,0,0,0.4)',
                              border: '1px solid var(--border-subtle)',
                              color: '#fff',
                              fontSize: '0.85rem'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                            Phản hồi tối đa (tokens)
                          </label>
                          <input
                            type="number"
                            min="256"
                            value={editModelForm.max_tokens}
                            onChange={(e) => setEditModelForm(prev => ({ ...prev, max_tokens: parseInt(e.target.value) || 256 }))}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'rgba(0,0,0,0.4)',
                              border: '1px solid var(--border-subtle)',
                              color: '#fff',
                              fontSize: '0.85rem'
                            }}
                          />
                        </div>
                      </div>

                      {/* Streaming SSE Checkbox */}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#e2e8f0' }}>
                        <input
                          type="checkbox"
                          checked={editModelForm.supports_streaming}
                          onChange={(e) => setEditModelForm(prev => ({ ...prev, supports_streaming: e.target.checked }))}
                        />
                        <span>Mô hình hỗ trợ truyền luồng thời gian thực (Streaming SSE)</span>
                      </label>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setEditingModel(null)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--border-subtle)',
                          color: '#fff',
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={updatingModel}
                        style={{
                          padding: '8px 20px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                          border: 'none',
                          color: '#fff',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: updatingModel ? 'wait' : 'pointer'
                        }}
                      >
                        {updatingModel ? 'Đang cập nhật...' : 'Cập nhật cấu hình'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* ============================================================ */}
            {/* MODAL 3: XÁC NHẬN LƯU TRỮ MÔ HÌNH (FR-039, BR-023)           */}
            {/* ============================================================ */}
            {confirmArchiveModel && (
              <div style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                padding: '1rem'
              }}>
                <div style={{
                  background: '#0f172a',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2rem',
                  maxWidth: '460px',
                  width: '100%',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>📦</span>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
                      Xác Nhận Lưu Trữ Mô Hình (Soft Archive)
                    </h3>
                  </div>

                  <p style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                    Bạn có chắc chắn muốn chuyển mô hình <strong style={{ color: '#fff' }}>{confirmArchiveModel.name}</strong> (<code>{confirmArchiveModel.id}</code>) vào trạng thái <strong>ARCHIVED</strong> không?
                  </p>

                  <div style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    fontSize: '0.78rem',
                    color: '#fca5a5',
                    lineHeight: 1.5,
                    marginBottom: '1.5rem'
                  }}>
                    🛡️ <strong>Bảo toàn dữ liệu (BR-012):</strong> Thao tác này là xóa mềm, mô hình sẽ ẩn khỏi danh sách chat nhưng toàn bộ lịch sử tin nhắn và dữ liệu tiêu thụ tài nguyên vẫn được bảo tồn trọn vẹn. Bạn có thể kích hoạt lại bất cứ lúc nào.
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setConfirmArchiveModel(null)}
                      style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid var(--border-subtle)',
                        color: '#fff',
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchiveModel(confirmArchiveModel)}
                      disabled={archivingModelId === confirmArchiveModel.id}
                      style={{
                        padding: '8px 20px',
                        borderRadius: 'var(--radius-sm)',
                        background: '#e11d48',
                        border: 'none',
                        color: '#fff',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        cursor: archivingModelId === confirmArchiveModel.id ? 'wait' : 'pointer'
                      }}
                    >
                      {archivingModelId === confirmArchiveModel.id ? 'Đang lưu trữ...' : 'Xác nhận lưu trữ'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
