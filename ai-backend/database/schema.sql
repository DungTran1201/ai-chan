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
    hashed_password VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chỉ mục tối ưu hóa tìm kiếm người dùng theo Email khi đăng nhập (PROC-002, SEQ-002)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

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
