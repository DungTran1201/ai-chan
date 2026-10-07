import unittest
import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Add src and parent to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.main import app

class TestBackendAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_root(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["service"], "ai-backend")
        self.assertEqual(data["status"], "running")

    def test_health(self):
        response = self.client.get("/api/v1/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")

    def test_chat_mock(self):
        response = self.client.post(
            "/api/v1/chat",
            json={"prompt": "Hello AI", "provider": "gemini"}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("reply", data)
        self.assertEqual(data["provider"], "gemini")
        self.assertGreater(data["tokens_used"], 0)

if __name__ == "__main__":
    unittest.main()
