import unittest
import sys
import uuid
from pathlib import Path
from fastapi.testclient import TestClient

# Add src and backend root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.main import app
from src.core.telemetry import QuotaManager, metric_logger, sse_manager
from src.core.security import create_access_token, hash_password
from src.db import query_one, execute_commit

class TestResourceManagement(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.test_user_id = str(uuid.uuid4())
        self.test_email = f"test_res_{uuid.uuid4().hex[:6]}@example.com"

        # Tạo user thử nghiệm trong DB
        execute_commit(
            """
            INSERT INTO users (id, email, full_name, hashed_password, status)
            VALUES (?, ?, 'Resource Tester', ?, 'ACTIVE')
            """,
            (self.test_user_id, self.test_email, hash_password("Password123!"))
        )

        self.token = create_access_token(self.test_user_id, self.test_email)
        self.client.cookies.set("access_token", self.token)

    def tearDown(self):
        # Dọn dẹp bản ghi kiểm thử
        execute_commit("DELETE FROM api_metric_logs WHERE user_id = ?", (self.test_user_id,))
        execute_commit("DELETE FROM user_quotas WHERE user_id = ?", (self.test_user_id,))
        execute_commit("DELETE FROM users WHERE id = ?", (self.test_user_id,))

    def test_01_quota_initialization(self):
        """Kiểm tra khởi tạo hạn ngạch mặc định 100,000 tokens."""
        quota = QuotaManager.get_or_create_quota(self.test_user_id)
        self.assertEqual(quota["user_id"], self.test_user_id)
        self.assertEqual(quota["daily_token_limit"], 100000)
        self.assertEqual(quota["daily_tokens_used"], 0)
        self.assertTrue(quota["reset_at"] is not None)

    def test_02_quota_warning_at_80_percent(self):
        """Kiểm tra kích hoạt cờ cảnh báo 80% (BR-020)."""
        # Tiêu thụ 85,000 tokens (85%)
        QuotaManager.consume_quota(self.test_user_id, 85000)
        is_allowed, used, limit, warning_80 = QuotaManager.check_quota(self.test_user_id, estimated_tokens=100)
        self.assertTrue(is_allowed)
        self.assertEqual(used, 85000)
        self.assertTrue(warning_80)

    def test_03_quota_throttling_at_100_percent(self):
        """Kiểm tra chặn vượt ngưỡng quota 100% (BR-020)."""
        QuotaManager.consume_quota(self.test_user_id, 100000)
        is_allowed, used, limit, warning_80 = QuotaManager.check_quota(self.test_user_id, estimated_tokens=100)
        self.assertFalse(is_allowed)
        self.assertEqual(used, 100000)

    def test_04_metric_logging_and_summary(self):
        """Kiểm tra ghi nhật ký đo đạc telemetry và truy vấn tổng hợp KPI."""
        metric_logger.log_metric(
            endpoint="/api/v1/test",
            method="GET",
            status_code=200,
            latency_ms=45.2,
            user_id=self.test_user_id,
            ttft_ms=18.5,
            model_name="gemini-3.8-flash",
            provider="google",
            prompt_tokens=120,
            completion_tokens=250,
            total_tokens=370
        )

        # Kiểm tra CSDL
        row = query_one(
            "SELECT * FROM api_metric_logs WHERE user_id = ? AND endpoint = '/api/v1/test'",
            (self.test_user_id,)
        )
        self.assertIsNotNone(row)
        self.assertEqual(row["status_code"], 200)
        self.assertEqual(row["total_tokens"], 370)
        self.assertEqual(row["latency_ms"], 45.2)

        # Kiểm tra Summary
        summary = metric_logger.get_metrics_summary(self.test_user_id, time_range="24h")
        self.assertEqual(summary["total_requests"], 1)
        self.assertEqual(summary["total_tokens"], 370)
        self.assertEqual(summary["avg_latency_ms"], 45.2)
        self.assertEqual(summary["tokens_by_provider"]["google"], 370)

    def test_05_resources_summary_api(self):
        """Kiểm tra endpoint GET /api/v1/resources/summary."""
        res = self.client.get("/api/v1/resources/summary?range=24h")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("avg_latency_ms", data["data"])
        self.assertIn("quota_status", data["data"])

    def test_06_resources_quota_api(self):
        """Kiểm tra endpoint GET /api/v1/resources/quota."""
        res = self.client.get("/api/v1/resources/quota")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["data"]["user_id"], self.test_user_id)
        self.assertEqual(data["data"]["daily_token_limit"], 100000)

    def test_07_resources_history_api(self):
        """Kiểm tra endpoint GET /api/v1/resources/history."""
        # Ghi 2 metrics
        metric_logger.log_metric("/api/v1/h1", "GET", 200, 10.0, user_id=self.test_user_id)
        metric_logger.log_metric("/api/v1/h2", "POST", 201, 20.0, user_id=self.test_user_id)

        res = self.client.get("/api/v1/resources/history?limit=10")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertGreaterEqual(data["data"]["count"], 2)

    def test_08_chat_stream_quota_throttling_429(self):
        """Kiểm tra chặn gọi LLM khi hết hạn ngạch ngày với HTTP 429."""
        # Tạo conversation giả lập
        conv_id = str(uuid.uuid4())
        execute_commit(
            "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, 'Test Conv')",
            (conv_id, self.test_user_id)
        )

        # Tiêu thụ hết Quota (100,000 / 100,000)
        QuotaManager.consume_quota(self.test_user_id, 100000)

        # Gửi request chat
        res = self.client.post(
            f"/api/v1/conversations/{conv_id}/messages/stream",
            json={"content": "Xin chào, hãy trả lời tôi!"}
        )
        self.assertEqual(res.status_code, 429)
        err = res.json()
        self.assertIn("DAILY_QUOTA_EXCEEDED", str(err))
        self.assertIn("Retry-After", res.headers)

        execute_commit("DELETE FROM conversations WHERE id = ?", (conv_id,))

if __name__ == "__main__":
    unittest.main()
