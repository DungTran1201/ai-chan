-- ==============================================================================
-- BẢN NÂNG CẤP DỮ LIỆU: 004_discord_oauth_support.sql
-- Mô tả: Mở rộng bảng `users` cho tính năng đăng ký & đăng nhập qua Discord OAuth2
-- Bổ sung: discord_id, discord_username và chỉ mục tìm kiếm duy nhất
-- Quy tắc nghiệp vụ: BR-016, BR-017, BR-018 | Yêu cầu: FR-027, FR-028
-- Dự án: AI-Chan Assistant
-- ==============================================================================

-- Bổ sung các cột mới vào bảng `users`
ALTER TABLE users ADD COLUMN discord_id VARCHAR(50);
ALTER TABLE users ADD COLUMN discord_username VARCHAR(100);

-- Tạo chỉ mục tìm kiếm duy nhất cho discord_id để tăng tốc truy vấn khi callback
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
