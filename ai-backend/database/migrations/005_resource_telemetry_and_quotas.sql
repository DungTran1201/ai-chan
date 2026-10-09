-- ==============================================================================
-- BẢN NÂNG CẤP DỮ LIỆU: 005_resource_telemetry_and_quotas.sql
-- Mô tả: Bổ sung bảng `api_metric_logs` và `user_quotas` cho chức năng Quản lý tài nguyên & Telemetry Dashboard
-- Quy tắc nghiệp vụ: BR-019, BR-020, BR-021 | Yêu cầu: FR-029, FR-030, FR-031, FR-032, FR-033, FR-034
-- Dự án: AI-Chan Assistant
-- ==============================================================================

-- 1. Bảng lưu trữ nhật ký đo đạc hiệu năng & tài nguyên API (Telemetry Logs)
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

-- Chỉ mục tối ưu hóa truy vấn telemetry theo người dùng và thời gian
CREATE INDEX IF NOT EXISTS idx_metric_user_created ON api_metric_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_metric_created ON api_metric_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_metric_endpoint ON api_metric_logs(endpoint);

-- 2. Bảng quản lý hạn ngạch Quota sử dụng Token hàng ngày của người dùng
CREATE TABLE IF NOT EXISTS user_quotas (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    daily_token_limit INTEGER NOT NULL DEFAULT 100000,
    daily_tokens_used INTEGER NOT NULL DEFAULT 0,
    reset_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_quotas_reset ON user_quotas(reset_at);
