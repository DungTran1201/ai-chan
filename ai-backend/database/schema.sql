-- ==============================================================================
-- DATABASE ARCHITECTURE SCHEMA: AI-CHAN VIRTUAL ASSISTANT
-- Target DBMS: SQLite 3 / ANSI SQL Compatible (PostgreSQL Ready)
-- Derived from: docs/07-domain/, docs/08-api/, docs/06-architecture/
-- ==============================================================================

-- Bật cưỡng chế ràng buộc khóa ngoại cho SQLite
PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------------------------
-- 1. BẢNG NGƯỜI DÙNG (USERS)
-- Đại diện cho tài khoản người dùng đã đăng ký trong hệ thống
-- Bounded Context: Identity & Authentication Context
-- Invariants: Email duy nhất, mật khẩu đã qua băm bcrypt, trạng thái ACTIVE/DISABLED
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE COLLATE NOCASE,
    full_name VARCHAR(255),
    hashed_password VARCHAR(255), -- Cho phép NULL đối với tài khoản đăng ký thuần túy qua Discord OAuth2 (BR-018)
    username VARCHAR(50) UNIQUE COLLATE NOCASE,
    avatar_url VARCHAR(500),
    bio VARCHAR(500),
    phone_number VARCHAR(20),
    discord_id VARCHAR(50) UNIQUE, -- Mã định danh Discord duy nhất (FR-027, FR-028)
    discord_username VARCHAR(100), -- Tên hiển thị người dùng Discord
    theme_preference VARCHAR(10) NOT NULL DEFAULT 'DARK' CHECK (theme_preference IN ('DARK', 'LIGHT', 'SYSTEM')),
    language_preference VARCHAR(10) NOT NULL DEFAULT 'vi' CHECK (language_preference IN ('vi', 'en')),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
    last_login_at TIMESTAMP,
    password_changed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chỉ mục tối ưu hóa tìm kiếm người dùng theo Email khi đăng nhập (PROC-002, SEQ-002)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Chỉ mục tối ưu hóa tìm kiếm theo Tên đăng nhập Username (PROC-011, BR-007)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Chỉ mục tối ưu hóa định danh Discord OAuth2 (FR-027, FR-028, PROC-014)
CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);

-- Trigger tự động cập nhật updated_at cho users khi có thay đổi bản ghi
CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;


-- ------------------------------------------------------------------------------
-- 2. BẢNG CUỘC TRÒ CHUYỆN (CONVERSATIONS)
-- Đại diện cho một phiên hội thoại độc lập giữa một người dùng và AI Assistant
-- Bounded Context: Conversation Context (Aggregate Root)
-- Invariants: Thuộc về duy nhất 1 User (BR-002), xóa User sẽ CASCADE xóa Conversation
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL DEFAULT 'Cuộc trò chuyện mới',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Chỉ mục lọc cuộc trò chuyện theo chủ sở hữu (Anti-IDOR Query & Sidebar list)
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);

-- Chỉ mục kết hợp (Composite Index) phục vụ tải danh sách hội thoại sắp xếp theo thời gian mới nhất (Cursor Pagination)
CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);

-- Trigger tự động cập nhật updated_at cho conversations khi đổi tên hoặc cập nhật
CREATE TRIGGER IF NOT EXISTS trg_conversations_updated_at
AFTER UPDATE ON conversations
FOR EACH ROW
BEGIN
    UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;


-- ------------------------------------------------------------------------------
-- 3. BẢNG TIN NHẮN ĐÀM THOẠI (MESSAGES)
-- Đại diện cho một lượt phát ngôn văn bản trong cuộc trò chuyện (USER hoặc ASSISTANT)
-- Bounded Context: Chat Context (Child Entity thuộc Conversation Aggregate)
-- Invariants: Xóa Conversation sẽ CASCADE xóa Message, nội dung văn bản không rỗng
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model_used VARCHAR(100),
    tokens_prompt INTEGER DEFAULT 0,
    tokens_completion INTEGER DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Chỉ mục truy vấn dòng tin nhắn theo thứ tự thời gian tăng dần để render cuộc trò chuyện trên UI (SEQ-003)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_asc ON messages(conversation_id, created_at ASC);

-- Chỉ mục truy vấn trượt 20 tin nhắn gần nhất làm ngữ cảnh đưa vào LLM (INV-04, Sliding Context Window)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created_desc ON messages(conversation_id, created_at DESC);

-- Chỉ mục lọc tin nhắn theo model_used để thống kê sử dụng theo mô hình
CREATE INDEX IF NOT EXISTS idx_messages_model_used ON messages(model_used);


-- ------------------------------------------------------------------------------
-- 4. BẢNG MÔ HÌNH AGENT (MODELS)
-- Quản lý danh mục mô hình LLM từ nhiều nhà cung cấp (Google, Anthropic, OpenAI, Groq, Ollama)
-- Bounded Context: Model Catalog Context & Agent Orchestration (Aggregate Root)
-- Invariants: Soft toggle trạng thái (BR-012), Tối thiểu 1 model ACTIVE là mặc định (BR-013),
--             Kiểm tra kết nối và độ trễ Round-Trip (FR-023, BR-014, BR-015)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS models (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'anthropic', 'openai', 'groq', 'ollama')),
    status VARCHAR(20) NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DEGRADED', 'ARCHIVED')),
    is_default BOOLEAN NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    context_window INTEGER NOT NULL DEFAULT 128000,
    max_tokens INTEGER NOT NULL DEFAULT 4096,
    supports_streaming BOOLEAN NOT NULL DEFAULT 1 CHECK (supports_streaming IN (0, 1)),
    latency_ms INTEGER,
    last_checked_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chỉ mục lọc mô hình theo nhà cung cấp
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);

-- Chỉ mục lọc mô hình theo trạng thái hoạt động (ACTIVE, INACTIVE, DEGRADED)
CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);

-- Chỉ mục lọc mô hình mặc định hệ thống
CREATE INDEX IF NOT EXISTS idx_models_is_default ON models(is_default);

-- Trigger tự động cập nhật updated_at cho models khi có cập nhật cấu hình hoặc trạng thái
CREATE TRIGGER IF NOT EXISTS trg_models_updated_at
AFTER UPDATE ON models
FOR EACH ROW
BEGIN
    UPDATE models SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Dữ liệu khởi tạo (Seed data) cho các mô hình hệ thống mặc định
INSERT OR IGNORE INTO models (id, name, provider, status, is_default, context_window, max_tokens, supports_streaming)
VALUES
    ('gemini-3.8-flash', 'Google Gemini 3.8 Flash', 'google', 'ACTIVE', 1, 1000000, 8192, 1),
    ('gemini-3.5-flash', 'Google Gemini 3.5 Flash', 'google', 'ACTIVE', 0, 1000000, 8192, 1),
    ('gpt-4o-mini', 'OpenAI GPT-4o Mini', 'openai', 'INACTIVE', 0, 128000, 4096, 1),
    ('claude-3-7-sonnet', 'Anthropic Claude 3.7 Sonnet', 'anthropic', 'INACTIVE', 0, 200000, 8192, 1),
    ('llama-3.3-70b-versatile', 'Groq Llama 3.3 70B', 'groq', 'INACTIVE', 0, 128000, 8192, 1),
    ('llama3', 'Ollama Local Llama 3', 'ollama', 'INACTIVE', 0, 8192, 2048, 1);

-- ==============================================================================
-- 5. BẢNG NHẬT KÝ ĐO ĐẠC TELEMETRY & QUẢN LÝ QUOTA TÀI NGUYÊN (RESOURCE TELEMETRY)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS api_metric_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    latency_ms REAL NOT NULL,
    ttft_ms REAL DEFAULT NULL,
    model_name VARCHAR(100) DEFAULT NULL,
    provider VARCHAR(50) DEFAULT NULL,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    error_code VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_metric_user_created ON api_metric_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_metric_created ON api_metric_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_metric_endpoint ON api_metric_logs(endpoint);

CREATE TABLE IF NOT EXISTS user_quotas (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    daily_token_limit INTEGER NOT NULL DEFAULT 100000,
    daily_tokens_used INTEGER NOT NULL DEFAULT 0,
    reset_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_quotas_reset ON user_quotas(reset_at);


