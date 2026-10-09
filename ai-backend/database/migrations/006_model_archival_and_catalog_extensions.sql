-- ==============================================================================
-- BẢN NÂNG CẤP DỮ LIỆU: 006_model_archival_and_catalog_extensions.sql
-- Mô tả: Mở rộng ràng buộc status của bảng `models` hỗ trợ trạng thái ARCHIVED
-- Bounded Context: Model Catalog Context & Agent Orchestration
-- Ràng buộc nghiệp vụ: BR-012, BR-022, BR-023, BR-024, FR-039
-- ==============================================================================

PRAGMA foreign_keys = OFF;

-- Tạo bảng models_new với ràng buộc status mở rộng bao gồm ARCHIVED
CREATE TABLE IF NOT EXISTS models_new (
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

-- Sao chép toàn bộ dữ liệu hiện có từ models sang models_new
INSERT OR IGNORE INTO models_new (id, name, provider, status, is_default, context_window, max_tokens, supports_streaming, latency_ms, last_checked_at, created_at, updated_at)
SELECT id, name, provider, status, is_default, context_window, max_tokens, supports_streaming, latency_ms, last_checked_at, created_at, updated_at
FROM models;

-- Xóa bảng cũ và hoán đổi tên bảng mới
DROP TABLE IF EXISTS models;
ALTER TABLE models_new RENAME TO models;

-- Tái thiết lập các chỉ mục tối ưu hóa truy vấn
CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider);
CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);
CREATE INDEX IF NOT EXISTS idx_models_is_default ON models(is_default);

-- Tái tạo trigger tự động cập nhật thời gian
DROP TRIGGER IF EXISTS trg_models_updated_at;
CREATE TRIGGER trg_models_updated_at
AFTER UPDATE ON models
FOR EACH ROW
BEGIN
    UPDATE models SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

PRAGMA foreign_keys = ON;
