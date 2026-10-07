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

class TestUserManagementAPI(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.user_id = str(uuid.uuid4())
        self.email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        self.password = "ValidSecret123!"
        self.hashed_pw = hash_password(self.password)
        
        # Insert test user
        execute_commit(
            """
            INSERT INTO users (id, email, full_name, hashed_password, status, theme_preference, language_preference)
            VALUES (?, ?, 'Nguyen Van Test', ?, 'ACTIVE', 'DARK', 'vi')
            """,
            (self.user_id, self.email, self.hashed_pw)
        )
        
        # Token and cookies
        self.token = create_access_token(self.user_id, self.email)
        self.cookies = {"access_token": self.token}

    def tearDown(self):
        # Cleanup
        execute_commit("DELETE FROM users WHERE id = ?", (self.user_id,))

    def test_get_profile_and_stats(self):
        response = self.client.get("/api/v1/users/me", cookies=self.cookies)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("user", data)
        self.assertIn("stats", data)
        self.assertEqual(data["user"]["email"], self.email)
        self.assertEqual(data["user"]["full_name"], "Nguyen Van Test")
        self.assertIn("total_conversations", data["stats"])
        self.assertIn("total_messages", data["stats"])

    def test_update_profile_success(self):
        new_username = f"user_{uuid.uuid4().hex[:6]}"
        response = self.client.patch(
            "/api/v1/users/me/profile",
            json={
                "full_name": "Test Updated",
                "username": new_username,
                "bio": "Developer and AI researcher",
                "phone_number": "0987654321"
            },
            cookies=self.cookies
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["user"]["full_name"], "Test Updated")
        self.assertEqual(data["user"]["username"], new_username)
        self.assertEqual(data["user"]["bio"], "Developer and AI researcher")
        self.assertEqual(data["user"]["phone_number"], "0987654321")

    def test_update_profile_invalid_username(self):
        # Username with invalid characters or too short
        response = self.client.patch(
            "/api/v1/users/me/profile",
            json={"username": "ab"},
            cookies=self.cookies
        )
        self.assertEqual(response.status_code, 422)

    def test_update_avatar(self):
        avatar_url = "https://example.com/avatars/test.png"
        response = self.client.patch(
            "/api/v1/users/me/avatar",
            json={"avatar_url": avatar_url},
            cookies=self.cookies
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["avatar_url"], avatar_url)

    def test_change_email_wrong_password(self):
        response = self.client.post(
            "/api/v1/users/me/change-email",
            json={
                "new_email": "new_email@example.com",
                "current_password": "WrongPassword!"
            },
            cookies=self.cookies
        )
        self.assertEqual(response.status_code, 401)

    def test_change_email_success(self):
        new_email = f"new_{uuid.uuid4().hex[:8]}@example.com"
        response = self.client.post(
            "/api/v1/users/me/change-email",
            json={
                "new_email": new_email,
                "current_password": self.password
            },
            cookies=self.cookies
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["email"], new_email)

    def test_change_password_success(self):
        new_pw = "BrandNewPassword2026!"
        response = self.client.post(
            "/api/v1/users/me/change-password",
            json={
                "current_password": self.password,
                "new_password": new_pw
            },
            cookies=self.cookies
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("token", response.json())
        # Verify cookie is updated
        self.assertIn("access_token", response.cookies)

    def test_change_password_same_password_rejected(self):
        response = self.client.post(
            "/api/v1/users/me/change-password",
            json={
                "current_password": self.password,
                "new_password": self.password
            },
            cookies=self.cookies
        )
        self.assertEqual(response.status_code, 422)

    def test_update_preferences(self):
        response = self.client.patch(
            "/api/v1/users/me/preferences",
            json={
                "theme_preference": "LIGHT",
                "language_preference": "en"
            },
            cookies=self.cookies
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["theme_preference"], "LIGHT")
        self.assertEqual(data["language_preference"], "en")

if __name__ == "__main__":
    unittest.main()
