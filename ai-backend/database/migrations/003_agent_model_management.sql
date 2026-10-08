-- ==============================================================================
-- BẢN NÂNG CẤP DỮ LIỆU: 003_agent_model_management.sql
-- Mô tả: Khởi tạo bảng `models` và chỉ mục cho tính năng Quản lý Agent / Model Đa Nhà Cung Cấp
-- Bounded Context: Model Catalog Context & Agent Orchestration
-- Ràng buộc nghiệp vụ: BR-012, BR-013, BR-014, BR-015
-- ==============================================================================

-- 1. BẢNG MÔ HÌNH AGENT (MODELS)
CREATE TABLE IF NOT EXISTS models (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('google', 'anthropic', 'openai', 'groq', 'ollama')),
    status VARCHAR(20) NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DEGRADED')),
    is_default BOOLEAN NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
    context_window INTEGER NOT NULL DEFAULT 128000,
    max_tokens INTEGER NOT NULL DEFAULT 4096,
    supports_streaming BOOLEAN NOT NULL DEFAULT 1 CHECK (supports_streaming IN (0, 1)),
    latency_ms INTEGER,
    last_checked_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. CHỈ MỤC TỐI ƯU TRUY VẤN
-- Tối ưu hóa lọc theo nhà cung cấp (Google, Anthropic, OpenAI, Groq, Ollama)
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);

-- Tối ưu hóa lọc danh sách theo trạng thái (ACTIVE vs INACTIVE)
CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);

-- Tối ưu hóa truy vấn mô hình mặc định hệ thống
CREATE INDEX IF NOT EXISTS idx_models_is_default ON models(is_default);

-- Tối ưu hóa tra cứu tin nhắn theo model_used trong bảng messages
CREATE INDEX IF NOT EXISTS idx_messages_model_used ON messages(model_used);

-- 3. TRIGGER TỰ ĐỘNG CẬP NHẬT THỜI GIAN
CREATE TRIGGER IF NOT EXISTS trg_models_updated_at
AFTER UPDATE ON models
FOR EACH ROW
BEGIN
    UPDATE models SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- 4. DỮ LIỆU KHỞI TẠO (SEED DATA)
-- Khởi tạo danh mục mô hình ban đầu với Google Gemini là mô hình mặc định hoạt động
INSERT OR IGNORE INTO models (id, name, provider, status, is_default, context_window, max_tokens, supports_streaming)
VALUES
    ('gemini-3.8-flash', 'Google Gemini 3.8 Flash', 'google', 'ACTIVE', 1, 1000000, 8192, 1),
    ('gemini-3.5-flash', 'Google Gemini 3.5 Flash', 'google', 'ACTIVE', 0, 1000000, 8192, 1),
    ('gpt-4o-mini', 'OpenAI GPT-4o Mini', 'openai', 'INACTIVE', 0, 128000, 4096, 1),
    ('claude-3-7-sonnet', 'Anthropic Claude 3.7 Sonnet', 'anthropic', 'INACTIVE', 0, 200000, 8192, 1),
    ('llama-3.3-70b-versatile', 'Groq Llama 3.3 70B', 'groq', 'INACTIVE', 0, 128000, 8192, 1),
    ('llama3', 'Ollama Local Llama 3', 'ollama', 'INACTIVE', 0, 8192, 2048, 1);
