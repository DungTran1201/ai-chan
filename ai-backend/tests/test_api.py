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
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["service"], "ai-backend")

    def test_rate_limiter_blocks_excessive_requests(self):
        from src.core.security import InMemoryRateLimiter
        from fastapi import HTTPException
        test_limiter = InMemoryRateLimiter(requests_per_minute=2)
        test_limiter.check("1.2.3.4")
        test_limiter.check("1.2.3.4")
        with self.assertRaises(HTTPException) as cm:
            test_limiter.check("1.2.3.4")
        self.assertEqual(cm.exception.status_code, 429)

if __name__ == "__main__":
    unittest.main()
