import unittest
import sys
import time
from pathlib import Path
from fastapi.testclient import TestClient

# Add src and parent to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.main import app
from src.core.security import generate_oauth_state, verify_oauth_state
from src.db import query_one, execute_commit

class TestDiscordOAuth(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_state_generation_and_verification(self):
        state = generate_oauth_state()
        self.assertTrue(verify_oauth_state(state, state))
        
        # Test state with mismatched cookie
        self.assertFalse(verify_oauth_state(state, "different_state"))
        self.assertFalse(verify_oauth_state(state, None))

        # Test tampered state signature
        parts = state.split(":")
        tampered_state = f"{parts[0]}:{parts[1]}:invalid_signature"
        self.assertFalse(verify_oauth_state(tampered_state, tampered_state))

        # Test expired state (15 minutes ago)
        expired_ts = int(time.time()) - 900
        import hmac, hashlib
        from src.core.config import settings
        expired_data = f"{parts[0]}:{expired_ts}"
        expired_sig = hmac.new(settings.SECRET_KEY.encode(), expired_data.encode(), hashlib.sha256).hexdigest()
        expired_state = f"{expired_data}:{expired_sig}"
        self.assertFalse(verify_oauth_state(expired_state, expired_state))

    def test_discord_login_endpoint(self):
        # Follow redirects = False to inspect HTTP 307 and cookies
        response = self.client.get("/api/v1/auth/discord/login", follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertIn("Location", response.headers)
        self.assertIn("oauth_state", response.cookies)
        cookie_state = response.cookies["oauth_state"]
        self.assertTrue(verify_oauth_state(cookie_state, cookie_state))

    def test_discord_callback_csrf_rejection(self):
        # 1. No cookie
        resp = self.client.get("/api/v1/auth/discord/callback?code=abc&state=xyz", follow_redirects=False)
        self.assertEqual(resp.status_code, 307)
        self.assertIn("error=invalid_state", resp.headers.get("Location", ""))

        # 2. Tampered state with cookie
        state = generate_oauth_state()
        self.client.cookies.set("oauth_state", state)
        resp2 = self.client.get("/api/v1/auth/discord/callback?code=abc&state=forged_state", follow_redirects=False)
        self.assertEqual(resp2.status_code, 307)
        self.assertIn("error=invalid_state", resp2.headers.get("Location", ""))

    def test_discord_callback_cancelled(self):
        resp = self.client.get("/api/v1/auth/discord/callback?error=access_denied", follow_redirects=False)
        self.assertEqual(resp.status_code, 307)
        self.assertIn("error=oauth_cancelled", resp.headers.get("Location", ""))

    def test_discord_callback_new_user_and_null_password_invariant(self):
        state = generate_oauth_state()
        self.client.cookies.set("oauth_state", state)

        # Call callback with mock code
        resp = self.client.get(f"/api/v1/auth/discord/callback?code=mock_code_test&state={state}", follow_redirects=False)
        self.assertEqual(resp.status_code, 307)
        self.assertEqual(resp.headers.get("Location"), "/chat")
        self.assertIn("access_token", resp.cookies)

        # Verify user in database
        user = query_one("SELECT * FROM users WHERE email = 'discord.guest@example.com'")
        self.assertIsNotNone(user)
        self.assertEqual(user["discord_id"], "discord_987654321")
        self.assertIsNone(user["hashed_password"])

        # BR-018: Traditional login should reject this null-password user
        login_resp = self.client.post("/api/v1/auth/login", json={
            "email": "discord.guest@example.com",
            "password": "anypassword123"
        })
        self.assertEqual(login_resp.status_code, 400)
        self.assertIn("Discord", login_resp.json()["detail"])

    def test_discord_callback_existing_user_auto_linking(self):
        # Create an existing user with normal email/password
        execute_commit(
            """
            INSERT OR REPLACE INTO users (id, email, full_name, hashed_password, status)
            VALUES ('link-test-uuid', 'link.user@example.com', 'Link User', '$2b$12$test', 'ACTIVE')
            """
        )

        state = generate_oauth_state()
        self.client.cookies.set("oauth_state", state)

        # Mock user profile matching link.user@example.com
        from unittest.mock import patch
        mock_profile = {
            "id": "discord_linked_777",
            "username": "DiscordLinkedName",
            "email": "link.user@example.com",
            "verified": True,
            "avatar": None
        }

        with patch("src.api.v1.auth.fetch_discord_user_profile", return_value=mock_profile):
            resp = self.client.get(f"/api/v1/auth/discord/callback?code=mock_link_code&state={state}", follow_redirects=False)
            self.assertEqual(resp.status_code, 307)
            self.assertEqual(resp.headers.get("Location"), "/chat")

        # Verify user record has discord_id linked
        user = query_one("SELECT * FROM users WHERE id = 'link-test-uuid'")
        self.assertEqual(user["discord_id"], "discord_linked_777")
        self.assertEqual(user["discord_username"], "DiscordLinkedName")

    def test_unverified_email_rejected(self):
        state = generate_oauth_state()
        self.client.cookies.set("oauth_state", state)

        from unittest.mock import patch
        mock_profile = {
            "id": "discord_unverified_888",
            "username": "UnverifiedUser",
            "email": "unverified@example.com",
            "verified": False,
            "avatar": None
        }

        with patch("src.api.v1.auth.fetch_discord_user_profile", return_value=mock_profile):
            resp = self.client.get(f"/api/v1/auth/discord/callback?code=mock_code&state={state}", follow_redirects=False)
            self.assertEqual(resp.status_code, 307)
            self.assertIn("error=unverified_email", resp.headers.get("Location", ""))

if __name__ == "__main__":
    unittest.main()
