# Kiến Trúc Cơ Sở Dữ Liệu & Hướng Dẫn Vận Hành (Database Architecture)
## Dự Án: Website Chatbot Trợ Lý Ảo (AI-Chan Assistant)

---

| Thông Tin Tài Liệu | Chi Tiết |
| :--- | :--- |
| **Thành phần** | `ai-backend/database` |
| **Vai trò** | Database Architecture Specification & Schemas |
| **DBMS Mục Tiêu** | SQLite 3 (Local Development) / PostgreSQL 16 (Staging & Production) |
| **Nguồn sự thật** | [docs/07-domain/](file:///c:/Users/PC/Project/ai-chan/docs/07-domain/) và [docs/08-api/](file:///c:/Users/PC/Project/ai-chan/docs/08-api/) |

---

## 1. Thiết Kế Mô Hình Thực Thể - Quan Hệ (ERD & Relational Schema)

Cơ sở dữ liệu được chuẩn hóa theo dạng chuẩn 3NF và tuân thủ chặt chẽ mô hình Domain-Driven Design (DDD):

```
┌──────────────────────────────────────┐          ┌──────────────────────────────────────┐
│                users                 │          │                models                │
├──────────────────────────────────────┤          ├──────────────────────────────────────┤
│ PK  id               VARCHAR(36)     │          │ PK  id               VARCHAR(100)    │
│ UQ  email            VARCHAR(255)    │          │     name             VARCHAR(255)    │
│     full_name        VARCHAR(255)    │          │     provider         VARCHAR(50)     │
│     hashed_password  VARCHAR(255)    │          │     status           VARCHAR(20)     │
│     status           VARCHAR(20)     │          │     is_default       BOOLEAN (0/1)   │
│     created_at       TIMESTAMP       │          │     context_window   INTEGER         │
│     updated_at       TIMESTAMP       │          │     max_tokens       INTEGER         │
└──────────────────┬───────────────────┘          │     supports_streaming BOOLEAN (0/1) │
                   │                              │     latency_ms       INTEGER         │
                   │ 1 : N (CASCADE DELETE)       │     last_checked_at  TIMESTAMP       │
                   ▼                              │     created_at       TIMESTAMP       │
┌──────────────────────────────────────┐          │     updated_at       TIMESTAMP       │
│            conversations             │          └──────────────────┬───────────────────┘
├──────────────────────────────────────┤                             │
│ PK  id               VARCHAR(36)     │                             │ 1 : N (Tham chiếu lỏng)
│ FK  user_id          VARCHAR(36)     │                             │
│     title            VARCHAR(255)    │                             │
│     created_at       TIMESTAMP       │                             │
│     updated_at       TIMESTAMP       │                             │
└──────────────────┬───────────────────┘                             │
                   │                                                 │
                   │ 1 : N (CASCADE DELETE)                          │
                   ▼                                                 │
┌──────────────────────────────────────┐                             │
│               messages               │                             │
├──────────────────────────────────────┤                             │
│ PK  id               VARCHAR(36)     │                             │
│ FK  conversation_id  VARCHAR(36)     │                             │
│     role             VARCHAR(20)     │                             │
│     content          TEXT            │                             │
│     model_used       VARCHAR(100)────┼─────────────────────────────┘
│     tokens_prompt    INTEGER         │
│     tokens_completionINTEGER         │
│     created_at       TIMESTAMP       │
└──────────────────────────────────────┘
```

---

## 2. Đặc Tả Chi Tiết Các Bảng & Ràng Buộc

### 2.1 Bảng `users` (Tài khoản người dùng)
- **`id`**: Khóa chính UUID dạng chuỗi (36 ký tự).
- **`email`**: Địa chỉ email duy nhất, so sánh không phân biệt hoa thường (`NOCASE`).
- **`hashed_password`**: Chuỗi băm 60 ký tự theo chuẩn Bcrypt (`$2b$...`). Tuyệt đối không lưu plain-text.
- **`status`**: Ràng buộc `CHECK (status IN ('ACTIVE', 'DISABLED'))`.
- **`updated_at`**: Tự động cập nhật qua Trigger `trg_users_updated_at`.

### 2.2 Bảng `conversations` (Cuộc trò chuyện)
- **`id`**: Khóa chính UUID.
- **`user_id`**: Khóa ngoại tham chiếu `users(id) ON DELETE CASCADE`.
- **`title`**: Tiêu đề hội thoại (mặc định: `"Cuộc trò chuyện mới"`).
- **`updated_at`**: Tự động cập nhật khi đổi tên hoặc có tin nhắn mới qua Trigger `trg_conversations_updated_at`.

### 2.3 Bảng `messages` (Tin nhắn đàm thoại)
- **`id`**: Khóa chính UUID.
- **`conversation_id`**: Khóa ngoại tham chiếu `conversations(id) ON DELETE CASCADE`.
- **`role`**: Ràng buộc `CHECK (role IN ('user', 'assistant', 'system'))`.
- **`content`**: Nội dung văn bản tin nhắn (tối đa 4000 ký tự cho vai trò user).
- **`model_used`**: Ghi nhận mô hình AI đã sinh phản hồi (tham chiếu `models.id`).
- **`tokens_prompt`, `tokens_completion`**: Theo dõi lượng token tiêu thụ phục vụ giám sát chi phí.

### 2.4 Bảng `models` (Danh mục mô hình Agent & Trạng thái Soft-State)
- **`id`**: Khóa chính Model Identifier (`gemini-3.8-flash`, `claude-3-7-sonnet`, `gpt-4o-mini`,...).
- **`name`**: Tên hiển thị thân thiện trên UI.
- **`provider`**: Nhà cung cấp `CHECK (provider IN ('google', 'anthropic', 'openai', 'groq', 'ollama'))`.
- **`status`**: Trạng thái vòng đời `CHECK (status IN ('ACTIVE', 'INACTIVE', 'DEGRADED'))`. Cấm xóa cứng (`BR-012`).
- **`is_default`**: Cờ mô hình mặc định (0 hoặc 1). Luôn có ít nhất một model `ACTIVE` là mặc định (`BR-013`).
- **`context_window`**, **`max_tokens`**: Giới hạn ngữ cảnh và số token xuất ra tối đa.
- **`supports_streaming`**: Hỗ trợ truyền luồng SSE (0 hoặc 1).
- **`latency_ms`**, **`last_checked_at`**: Chỉ số đo lường độ trễ mạng sau khi Ping kiểm tra kết nối (`FR-023`).
- **`updated_at`**: Tự động cập nhật qua Trigger `trg_models_updated_at`.

---

## 3. Chiến Lược Chỉ Mục Tối Ưu Hóa (Indexing Strategy)

1. **`idx_users_email`**: Tăng tốc độ truy vấn đăng nhập theo email (`O(log n)`).
2. **`idx_conversations_user_id`**: Lọc nhanh các cuộc trò chuyện thuộc sở hữu của một người dùng (chống tấn công IDOR).
3. **`idx_conversations_user_updated`**: Chỉ mục kết hợp `(user_id, updated_at DESC)` hỗ trợ phân trang Cursor Pagination và hiển thị Sidebar sắp xếp theo thời gian mới nhất.
4. **`idx_messages_conv_created_asc`**: Tải lịch sử đàm thoại của một thread theo thứ tự thời gian tự nhiên để render UI.
5. **`idx_messages_conv_created_desc`**: Truy vấn nhanh 20 tin nhắn gần nhất (`LIMIT 20`) làm ngữ cảnh trượt (Sliding Window Context) đưa vào LLM Gateway (`INV-04`).

---

## 4. Hướng Dẫn Khởi Tạo & Sử Dụng

### Khởi tạo SQLite Database (`app.db`):
```bash
# Khởi tạo hoặc cập nhật cấu trúc database từ file schema.sql
sqlite3 app.db < schema.sql
```

### Sử dụng với Python:
```python
import sqlite3

conn = sqlite3.connect("ai-backend/database/app.db")
conn.execute("PRAGMA foreign_keys = ON;")
cursor = conn.cursor()
```
