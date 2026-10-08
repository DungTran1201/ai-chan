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

if __name__ == "__main__":
    unittest.main()
