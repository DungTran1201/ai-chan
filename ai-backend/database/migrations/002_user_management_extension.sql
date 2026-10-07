-- ==============================================================================
-- BẢN NÂNG CẤP DỮ LIỆU: 002_user_management_extension.sql
-- Mô tả: Mở rộng bảng `users` cho tính năng quản lý hồ sơ & cài đặt tài khoản
-- Dự án: AI-Chan Assistant
-- ==============================================================================

-- Bổ sung các cột mới vào bảng `users`
ALTER TABLE users ADD COLUMN username VARCHAR(50);
ALTER TABLE users ADD COLUMN avatar_url VARCHAR(500);
ALTER TABLE users ADD COLUMN bio VARCHAR(500);
ALTER TABLE users ADD COLUMN phone_number VARCHAR(20);
ALTER TABLE users ADD COLUMN theme_preference VARCHAR(10) DEFAULT 'DARK';
ALTER TABLE users ADD COLUMN language_preference VARCHAR(10) DEFAULT 'vi';
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMP;

-- Tạo chỉ mục tìm kiếm nhanh theo username
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
