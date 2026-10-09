import unittest
import sys
import uuid
from pathlib import Path
from fastapi.testclient import TestClient

# Add src and parent to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.main import app
from src.core.security import hash_password, create_access_token
from src.db import execute_commit, query_one

class TestModelsAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.user_id = str(uuid.uuid4())
        self.email = f"model_tester_{uuid.uuid4().hex[:8]}@example.com"
        self.password = "ValidSecret123!"
        self.hashed_pw = hash_password(self.password)
        
        # Insert test user
        execute_commit(
            """
            INSERT INTO users (id, email, full_name, hashed_password, status)
            VALUES (?, ?, 'Model Tester', ?, 'ACTIVE')
            """,
            (self.user_id, self.email, self.hashed_pw)
        )
        
        self.token = create_access_token(self.user_id, self.email)
        self.cookies = {"access_token": self.token}

    def tearDown(self):
        execute_commit("DELETE FROM users WHERE id = ?", (self.user_id,))
        execute_commit("DELETE FROM models WHERE id LIKE 'test_%'")
        # Reset default model to gemini-3.8-flash and active state
        execute_commit("UPDATE models SET is_default = 0")
        execute_commit("UPDATE models SET is_default = 1, status = 'ACTIVE' WHERE id = 'gemini-3.8-flash'")

    def test_list_models_all(self):
        response = self.client.get("/api/v1/models", cookies=self.cookies)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertGreaterEqual(len(data), 6)
        
        # Verify schema of returned items
        first = data[0]
        self.assertIn("id", first)
        self.assertIn("name", first)
        self.assertIn("provider", first)
        self.assertIn("status", first)
        self.assertIn("is_default", first)
        self.assertIn("supports_streaming", first)
        self.assertIn("has_api_key", first)

    def test_list_models_filtered(self):
        res_active = self.client.get("/api/v1/models?status=ACTIVE", cookies=self.cookies)
        self.assertEqual(res_active.status_code, 200)
        active_items = res_active.json()
        for item in active_items:
            self.assertEqual(item["status"], "ACTIVE")

        res_inactive = self.client.get("/api/v1/models?status=INACTIVE", cookies=self.cookies)
        self.assertEqual(res_inactive.status_code, 200)
        inactive_items = res_inactive.json()
        for item in inactive_items:
            self.assertEqual(item["status"], "INACTIVE")

    def test_get_model_detail(self):
        response = self.client.get("/api/v1/models/gemini-3.8-flash", cookies=self.cookies)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], "gemini-3.8-flash")
        self.assertEqual(data["provider"], "google")

        # Non-existent model
        res_not_found = self.client.get("/api/v1/models/unknown-model-xyz", cookies=self.cookies)
        self.assertEqual(res_not_found.status_code, 404)

    def test_deactivate_default_model_forbidden(self):
        # BR-013: Cannot deactivate default model
        response = self.client.patch("/api/v1/models/gemini-3.8-flash/deactivate", cookies=self.cookies)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("mô hình mặc định", data["detail"].lower())

    def test_activate_and_deactivate_flow(self):
        # Activate gemini-3.5-flash (Google has API key in .env)
        res_act = self.client.patch("/api/v1/models/gemini-3.5-flash/activate", cookies=self.cookies)
        self.assertEqual(res_act.status_code, 200)
        self.assertEqual(res_act.json()["status"], "ACTIVE")

        # Deactivate gemini-3.5-flash (not default)
        res_deact = self.client.patch("/api/v1/models/gemini-3.5-flash/deactivate", cookies=self.cookies)
        self.assertEqual(res_deact.status_code, 200)
        self.assertEqual(res_deact.json()["status"], "INACTIVE")

    def test_activate_model_missing_key_rejected(self):
        # BR-014: Cannot activate model if provider key is missing
        # Anthropic key is empty in test environment
        response = self.client.patch("/api/v1/models/claude-3-7-sonnet/activate", cookies=self.cookies)
        self.assertEqual(response.status_code, 400)
        self.assertIn("chưa cấu hình api key", response.json()["detail"].lower())

    def test_set_default_model_success_and_invariants(self):
        # Ensure gemini-3.5-flash is ACTIVE first
        self.client.patch("/api/v1/models/gemini-3.5-flash/activate", cookies=self.cookies)
        
        # Set gemini-3.5-flash as default
        res_set = self.client.patch("/api/v1/models/default", json={"model_id": "gemini-3.5-flash"}, cookies=self.cookies)
        self.assertEqual(res_set.status_code, 200)
        self.assertEqual(res_set.json()["default_model"], "gemini-3.5-flash")

        # Verify in DB that only gemini-3.5-flash is default
        m35 = query_one("SELECT is_default FROM models WHERE id = 'gemini-3.5-flash'")
        m38 = query_one("SELECT is_default FROM models WHERE id = 'gemini-3.8-flash'")
        self.assertEqual(m35["is_default"], 1)
        self.assertEqual(m38["is_default"], 0)

        # Attempt to set INACTIVE model (claude-3-7-sonnet) as default should fail
        res_fail = self.client.patch("/api/v1/models/default", json={"model_id": "claude-3-7-sonnet"}, cookies=self.cookies)
        self.assertEqual(res_fail.status_code, 400)

    def test_test_model_missing_key_rejected(self):
        # BR-014: Cannot ping/test model if provider key is missing
        response = self.client.post("/api/v1/models/gpt-4o-mini/test", cookies=self.cookies)
        self.assertEqual(response.status_code, 400)
        self.assertIn("chưa cấu hình api key", response.json()["detail"].lower())

    # ==========================================================================
    # TC-027: Thêm mô hình mới & Xác thực biên an toàn (FR-035, BR-022, BR-024)
    # ==========================================================================
    def test_create_model_success_and_validations(self):
        # 1. Tạo thành công mô hình hợp lệ
        payload = {
            "id": "test_claude_35",
            "name": "Claude 3.5 Test",
            "provider": "anthropic",
            "context_window": 128000,
            "max_tokens": 4096,
            "supports_streaming": True
        }
        res = self.client.post("/api/v1/models", json=payload, cookies=self.cookies)
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["id"], "test_claude_35")
        self.assertEqual(data["status"], "INACTIVE")
        self.assertFalse(data["is_default"])

        # 2. BR-022: Từ chối ID trùng lặp (409 Conflict)
        res_dup = self.client.post("/api/v1/models", json=payload, cookies=self.cookies)
        self.assertEqual(res_dup.status_code, 409)
        self.assertIn("đã tồn tại", res_dup.json()["detail"].lower())

        # 3. Provider không hợp lệ (422)
        res_bad_p = self.client.post(
            "/api/v1/models",
            json={**payload, "id": "test_bad_provider", "provider": "invalid_vendor"},
            cookies=self.cookies
        )
        self.assertEqual(res_bad_p.status_code, 422)

        # 4. BR-024: max_tokens > context_window
        res_bad_cw = self.client.post(
            "/api/v1/models",
            json={**payload, "id": "test_bad_cw", "context_window": 2000, "max_tokens": 3000},
            cookies=self.cookies
        )
        self.assertEqual(res_bad_cw.status_code, 422)

        # 5. BR-024: context_window < 1000
        res_low_cw = self.client.post(
            "/api/v1/models",
            json={**payload, "id": "test_low_cw", "context_window": 500, "max_tokens": 300},
            cookies=self.cookies
        )
        self.assertEqual(res_low_cw.status_code, 422)

    # ==========================================================================
    # TC-028: Hiệu chỉnh cấu hình mô hình & Tính bất biến (FR-036, BR-022, BR-024)
    # ==========================================================================
    def test_update_model_success_and_invariants(self):
        # Tạo mô hình chuẩn bị sửa
        self.client.post(
            "/api/v1/models",
            json={"id": "test_update_model", "name": "Original Name", "provider": "openai", "context_window": 100000, "max_tokens": 4096},
            cookies=self.cookies
        )

        # 1. Cập nhật thành công
        update_payload = {
            "name": "Updated Name Pro",
            "context_window": 150000,
            "max_tokens": 8192,
            "supports_streaming": False
        }
        res = self.client.put("/api/v1/models/test_update_model", json=update_payload, cookies=self.cookies)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["name"], "Updated Name Pro")
        self.assertEqual(data["context_window"], 150000)
        self.assertEqual(data["max_tokens"], 8192)
        self.assertFalse(data["supports_streaming"])
        # Provider và ID không thay đổi (BR-022)
        self.assertEqual(data["id"], "test_update_model")
        self.assertEqual(data["provider"], "openai")

        # 2. Không tìm thấy mô hình (404)
        res_404 = self.client.put("/api/v1/models/test_non_existent", json={"name": "New"}, cookies=self.cookies)
        self.assertEqual(res_404.status_code, 404)

        # 3. Vi phạm ngưỡng biên an toàn (BR-024)
        res_err = self.client.put(
            "/api/v1/models/test_update_model",
            json={"context_window": 2000, "max_tokens": 5000},
            cookies=self.cookies
        )
        self.assertEqual(res_err.status_code, 422)

    # ==========================================================================
    # TC-029: Tìm kiếm toàn văn & Bộ lọc đa tiêu chí (FR-037, FR-038, NFR-022)
    # ==========================================================================
    def test_search_and_filter_models(self):
        # 1. Tìm kiếm theo từ khóa q
        res_search = self.client.get("/api/v1/models/search?q=gemini", cookies=self.cookies)
        self.assertEqual(res_search.status_code, 200)
        data = res_search.json()
        self.assertIn("execution_time_ms", data)
        self.assertIn("items", data)
        self.assertGreaterEqual(data["total"], 2)
        # NFR-022 SLA <= 200ms
        self.assertLessEqual(data["execution_time_ms"], 200.0)
        for item in data["items"]:
            self.assertTrue("gemini" in item["id"].lower() or "gemini" in item["name"].lower())

        # 2. Lọc theo provider
        res_provider = self.client.get("/api/v1/models/search?provider=openai", cookies=self.cookies)
        self.assertEqual(res_provider.status_code, 200)
        for item in res_provider.json()["items"]:
            self.assertEqual(item["provider"], "openai")

        # 3. Lọc theo status
        res_status = self.client.get("/api/v1/models/search?status=ACTIVE", cookies=self.cookies)
        self.assertEqual(res_status.status_code, 200)
        for item in res_status.json()["items"]:
            self.assertEqual(item["status"], "ACTIVE")

        # 4. Sắp xếp theo ngữ cảnh context_desc
        res_sort = self.client.get("/api/v1/models/search?sort=context_desc", cookies=self.cookies)
        self.assertEqual(res_sort.status_code, 200)
        items = res_sort.json()["items"]
        if len(items) >= 2:
            self.assertGreaterEqual(items[0]["context_window"], items[1]["context_window"])

    # ==========================================================================
    # TC-030: Xóa mềm & Chốt chặn bảo vệ mô hình mặc định (FR-039, BR-023)
    # ==========================================================================
    def test_soft_archive_model_and_default_guard(self):
        # 1. BR-023: Chặn xóa mềm mô hình đang là mặc định (gemini-3.8-flash)
        res_guard = self.client.delete("/api/v1/models/gemini-3.8-flash", cookies=self.cookies)
        self.assertEqual(res_guard.status_code, 400)
        self.assertIn("mặc định", res_guard.json()["detail"].lower())

        # 2. Xóa mềm thành công mô hình không phải mặc định
        self.client.post(
            "/api/v1/models",
            json={"id": "test_archive_target", "name": "Archive Target", "provider": "groq", "context_window": 100000, "max_tokens": 4096},
            cookies=self.cookies
        )
        res_del = self.client.delete("/api/v1/models/test_archive_target", cookies=self.cookies)
        self.assertEqual(res_del.status_code, 200)
        self.assertEqual(res_del.json()["status"], "ARCHIVED")

        # BR-012: Xác nhận bản ghi vẫn tồn tại trong CSDL với status = 'ARCHIVED'
        row = query_one("SELECT * FROM models WHERE id = 'test_archive_target'")
        self.assertIsNotNone(row)
        self.assertEqual(row["status"], "ARCHIVED")

        # 3. Xóa mềm mô hình không tồn tại (404)
        res_404 = self.client.delete("/api/v1/models/test_unknown_archive", cookies=self.cookies)
        self.assertEqual(res_404.status_code, 404)

if __name__ == "__main__":
    unittest.main()
