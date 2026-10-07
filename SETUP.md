# AI-Chan Setup & Operation Guide

Tài liệu hướng dẫn thiết lập môi trường, vận hành hệ thống website 3 tầng (`ai-frontend`, `ai-backend`, `ai-infra`) và quy trình chuẩn Antigravity.

---

## 1. Mở Workspace & Kiểm tra Discovery

Mở thư mục gốc `ai-chan` trong Antigravity. Hệ thống sẽ tự động phát hiện:
- Workspace skills: `.agents/skills/<skill>/SKILL.md`
- Workspace rules: `.agents/rules/*.md`
- Workspace agents: `.agents/agents/<name>.md`
- Lifecycle hooks: `.agents/hooks.json`

Cài đặt thư viện kiểm tra nội bộ:
```powershell
py -m pip install -r requirements-dev.txt
py tools/validators/run_all.py
```

---

## 2. Hướng dẫn Cài đặt & Chạy Cục bộ (Python Uvicorn + Node npm)

Phương pháp này khuyên dùng khi phát triển mã nguồn cục bộ (Local Development) với tính năng Hot-Reload. Hãy mở 2 cửa sổ Terminal song song:

### 2.1. Khởi chạy Backend (`ai-backend`) — Terminal 1

**Bước 1: Di chuyển vào thư mục backend và tạo file cấu hình `.env`**
```powershell
cd c:\Users\sv\Desktop\ai-chan\ai-backend
Copy-Item .env.example .env
```
*(Mở file `.env` và cấu hình `GEMINI_API_KEY` hoặc `OPENAI_API_KEY` nếu muốn gọi model AI trực tiếp)*.

**Bước 2: Kích hoạt môi trường ảo Python và cài đặt thư viện**
```powershell
# Tạo môi trường ảo (nếu chưa có):
py -m venv .venv

# Kích hoạt môi trường ảo:
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1

# Cài đặt toàn bộ dependencies:
pip install -r requirements.txt
```

**Bước 3: Khởi chạy server Uvicorn**
```powershell
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```
> [!TIP]
> Bạn có thể chạy nhanh trực tiếp mà không cần activate:
> `.\.venv\Scripts\python.exe -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000`

**Địa chỉ truy cập Backend:**
- **API Base URL**: `http://localhost:8000`
- **Swagger Interactive API Docs**: `http://localhost:8000/docs`
- **ReDoc Documentation**: `http://localhost:8000/redoc`
- **Healthcheck Endpoint**: `http://localhost:8000/api/v1/health`

---

### 2.2. Khởi chạy Frontend (`ai-frontend`) — Terminal 2

**Bước 1: Di chuyển vào thư mục frontend và tạo file `.env.local`**
```powershell
cd c:\Users\sv\Desktop\ai-chan\ai-frontend
Copy-Item .env.example .env.local
```

**Bước 2: Cài đặt thư viện npm**
```powershell
npm.cmd install
```

**Bước 3: Khởi chạy server giao diện**
- **Chế độ Phát triển (Development with Fast Refresh)**:
  ```powershell
  npm.cmd run dev
  ```
- **Chế độ Sản xuất (Production Optimized)**:
  ```powershell
  npm.cmd run build
  npm.cmd run start
  ```

**Địa chỉ truy cập Frontend:**
- **Giao diện Web Người Dùng**: `http://localhost:3000`

---

## 3. Hướng dẫn Cài đặt & Vận hành bằng Docker (`ai-infra`)

Đóng gói và vận hành đồng bộ toàn bộ cụm dịch vụ qua Docker Compose với HTTPS/TLS 1.3, Nginx Ingress, giới hạn tần suất request (Rate Limiting) và điều tiết băng thông.

### 3.1. Chuẩn bị: Khởi động Docker Desktop & Tạo chứng chỉ SSL

1. Mở ứng dụng **Docker Desktop** trên máy tính và đảm bảo Docker Engine đang chạy (*Engine running màu xanh*).
2. Tạo cặp chứng chỉ SSL Self-signed cục bộ (phục vụ kết nối HTTPS an toàn):
   ```powershell
   cd c:\Users\sv\Desktop\ai-chan
   powershell.exe -ExecutionPolicy Bypass -File ai-infra/scripts/generate-ssl.ps1
   ```
   *(Trên Linux/macOS: `bash ai-infra/scripts/generate-ssl.sh`)*

### 3.2. Khởi chạy toàn bộ cụm dịch vụ bằng Docker Compose

```powershell
cd c:\Users\sv\Desktop\ai-chan

# Khởi tạo file biến môi trường infra (nếu chưa có):
Copy-Item ai-infra\.env.example ai-infra\.env

# Khởi chạy toàn bộ hệ thống dưới chế độ nền (-d):
docker compose -f ai-infra/compose/docker-compose.yml up --build -d
```

### 3.3. Bảng định tuyến & Địa chỉ truy cập khi chạy Docker

| Dịch vụ | Địa chỉ URL / Cổng kết nối | Chức năng |
|---|---|---|
| **HTTPS Ingress Gateway** | `https://localhost` *(Port 443)* | Cổng bảo mật chính, tự động chuyển hướng từ `http://localhost` (Port 80) |
| **Giao diện Web Frontend** | `https://localhost/` *(hoặc `http://localhost:3000`)* | Giao diện Next.js Portal |
| **Backend API & SSE Stream** | `https://localhost/api/` *(hoặc `http://localhost:8000`)* | FastAPI Router & Động cơ điều phối LLM |
| **Swagger API Documentation** | `http://localhost:8000/docs` | Tài liệu API tương tác trực tiếp |
| **Cơ sở dữ liệu PostgreSQL** | `localhost:5432` | User: `postgres`, Pass: `postgres`, DB: `ai_chan_db` |
| **In-Memory Cache Redis** | `localhost:6379` | Cache lưu trữ phiên và token rate limiter |

### 3.4. Các lệnh quản lý & Giám sát Docker

```powershell
# Xem trạng thái hoạt động của các container:
docker compose -f ai-infra/compose/docker-compose.yml ps

# Xem log thời gian thực của toàn bộ hệ thống:
docker compose -f ai-infra/compose/docker-compose.yml logs -f

# Chỉ xem log của Backend:
docker compose -f ai-infra/compose/docker-compose.yml logs -f ai-backend

# Dừng toàn bộ cụm dịch vụ:
docker compose -f ai-infra/compose/docker-compose.yml down
```

---

## 4. Kiểm tra Chất lượng & Phê duyệt rủi ro

### 4.1. Chạy bài kiểm tra tự động
```powershell
# Chạy bộ unit test API Backend:
cd c:\Users\sv\Desktop\ai-chan\ai-backend
.\.venv\Scripts\python.exe tests/test_api.py

# Chạy kiểm tra cấu trúc toàn bộ workspace:
cd c:\Users\sv\Desktop\ai-chan
py tools/validators/run_all.py
```

### 4.2. Chính sách Phê duyệt (Approval Policy)
- **R0/R1 (Thay đổi nhỏ/Documentation)**: Review thông thường.
- **R2 (Tính năng chuẩn/Refactor)**: Sử dụng lệnh `/plan` và review kế hoạch thực thi trước khi chạm vào mã nguồn.
- **R3 (Bảo mật/Cơ sở dữ liệu/Tích hợp bên ngoài)**: Bắt buộc phân tích Threat Model và người dùng xác nhận tường minh.
- **R4 (Hạ tầng Production/Phá hủy dữ liệu)**: Bắt buộc người dùng phê duyệt từng bước.
