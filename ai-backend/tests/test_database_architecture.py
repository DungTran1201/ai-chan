import unittest
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "database" / "app.db"

class TestDatabaseArchitecture(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(str(DB_PATH))
        self.conn.execute("PRAGMA foreign_keys = ON;")
        self.cur = self.conn.cursor()

    def tearDown(self):
        self.conn.close()

    def test_tables_exist(self):
        """Kiểm tra các bảng bắt buộc tồn tại theo tài liệu kiến trúc cơ sở dữ liệu."""
        tables = [r[0] for r in self.cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        expected_tables = ["users", "conversations", "messages", "models"]
        for table in expected_tables:
            self.assertIn(table, tables, f"Table '{table}' must exist in database")

    def test_models_columns_schema(self):
        """Kiểm tra schema các cột của bảng models."""
        cols_info = self.cur.execute("PRAGMA table_info(models)").fetchall()
        cols = {c[1]: c[2].upper() for c in cols_info}
        
        expected_cols = [
            "id", "name", "provider", "status", "is_default",
            "context_window", "max_tokens", "supports_streaming",
            "latency_ms", "last_checked_at", "created_at", "updated_at"
        ]
        for col in expected_cols:
            self.assertIn(col, cols, f"Column '{col}' must exist in models table")

    def test_default_seed_models(self):
        """Kiểm tra các mô hình khởi tạo mặc định (Google Gemini active & default)."""
        models = self.cur.execute("SELECT id, provider, status, is_default FROM models").fetchall()
        self.assertGreaterEqual(len(models), 6, "Must contain at least 6 initial seed models")
        
        model_dict = {m[0]: {"provider": m[1], "status": m[2], "is_default": bool(m[3])} for m in models}
        
        # Verify gemini-3.8-flash is ACTIVE and default (BR-013)
        self.assertIn("gemini-3.8-flash", model_dict)
        self.assertEqual(model_dict["gemini-3.8-flash"]["status"], "ACTIVE")
        self.assertTrue(model_dict["gemini-3.8-flash"]["is_default"])
        self.assertEqual(model_dict["gemini-3.8-flash"]["provider"], "google")

        # Verify other providers are configured
        self.assertIn("gpt-4o-mini", model_dict)
        self.assertEqual(model_dict["gpt-4o-mini"]["provider"], "openai")
        self.assertIn("claude-3-7-sonnet", model_dict)
        self.assertEqual(model_dict["claude-3-7-sonnet"]["provider"], "anthropic")
        self.assertIn("llama-3.3-70b-versatile", model_dict)
        self.assertEqual(model_dict["llama-3.3-70b-versatile"]["provider"], "groq")
        self.assertIn("llama3", model_dict)
        self.assertEqual(model_dict["llama3"]["provider"], "ollama")

    def test_provider_check_constraint(self):
        """Kiểm tra CHECK constraint cho cột provider (chỉ chấp nhận google, anthropic, openai, groq, ollama)."""
        with self.assertRaises(sqlite3.IntegrityError):
            self.cur.execute(
                "INSERT INTO models (id, name, provider) VALUES ('invalid-model', 'Invalid Model', 'unsupported_provider')"
            )
            self.conn.commit()
        self.conn.rollback()

    def test_status_check_constraint(self):
        """Kiểm tra CHECK constraint cho cột status (chỉ chấp nhận ACTIVE, INACTIVE, DEGRADED)."""
        with self.assertRaises(sqlite3.IntegrityError):
            self.cur.execute(
                "INSERT INTO models (id, name, provider, status) VALUES ('invalid-status', 'Invalid Status', 'google', 'DELETED')"
            )
            self.conn.commit()
        self.conn.rollback()

    def test_indices_exist(self):
        """Kiểm tra các chỉ mục tối ưu hóa truy vấn."""
        indices = [r[0] for r in self.cur.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()]
        expected_indices = [
            "idx_models_provider",
            "idx_models_status",
            "idx_models_is_default",
            "idx_messages_model_used"
        ]
        for idx in expected_indices:
            self.assertIn(idx, indices, f"Index '{idx}' must exist in database")

    def test_models_updated_at_trigger(self):
        """Kiểm tra trigger trg_models_updated_at tự động cập nhật thời gian."""
        # Update latency_ms on gemini-3.8-flash
        self.cur.execute(
            "UPDATE models SET latency_ms = 120 WHERE id = 'gemini-3.8-flash'"
        )
        self.conn.commit()
        row = self.cur.execute("SELECT latency_ms, updated_at FROM models WHERE id = 'gemini-3.8-flash'").fetchone()
        self.assertEqual(row[0], 120)
        self.assertIsNotNone(row[1])

if __name__ == "__main__":
    unittest.main()
