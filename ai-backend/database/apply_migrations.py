import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
MIGRATIONS_DIR = BASE_DIR / "migrations"

def run_migration():
    for db_path in [BASE_DIR / "app.db", BASE_DIR.parent / "app.db"]:
        if not db_path.exists():
            continue
        print(f"Applying migration to {db_path}...")
        conn = sqlite3.connect(str(db_path))
        conn.execute("PRAGMA foreign_keys = ON;")
        cur = conn.cursor()
        
        # 1. Check & apply users table extensions (002)
        cols = [c[1] for c in cur.execute("PRAGMA table_info(users)").fetchall()]
        print(f"Current columns in users ({db_path.name}): {cols}")
        
        columns_to_add = [
            ("username", "VARCHAR(50)"),
            ("avatar_url", "VARCHAR(500)"),
            ("bio", "VARCHAR(500)"),
            ("phone_number", "VARCHAR(20)"),
            ("theme_preference", "VARCHAR(10) DEFAULT 'DARK'"),
            ("language_preference", "VARCHAR(10) DEFAULT 'vi'"),
            ("last_login_at", "TIMESTAMP"),
            ("password_changed_at", "TIMESTAMP"),
        ]
        
        for col_name, col_def in columns_to_add:
            if col_name not in cols:
                print(f"Adding column {col_name} to users...")
                cur.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")
                
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        conn.commit()

        # 2. Apply 003_agent_model_management.sql
        migration_003_file = MIGRATIONS_DIR / "003_agent_model_management.sql"
        if migration_003_file.exists():
            print(f"Executing {migration_003_file.name} on {db_path.name}...")
            with open(migration_003_file, "r", encoding="utf-8") as f:
                cur.executescript(f.read())
            conn.commit()

        # 3. Apply 004_discord_oauth_support.sql if columns missing
        user_cols = [c[1] for c in cur.execute("PRAGMA table_info(users)").fetchall()]
        if "discord_id" not in user_cols:
            print(f"Adding discord_id and discord_username to users in {db_path.name}...")
            cur.execute("ALTER TABLE users ADD COLUMN discord_id VARCHAR(50)")
            cur.execute("ALTER TABLE users ADD COLUMN discord_username VARCHAR(100)")
            cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)")
            conn.commit()

        # 4. Apply 005_resource_telemetry_and_quotas.sql
        migration_005_file = MIGRATIONS_DIR / "005_resource_telemetry_and_quotas.sql"
        if migration_005_file.exists():
            print(f"Executing {migration_005_file.name} on {db_path.name}...")
            with open(migration_005_file, "r", encoding="utf-8") as f:
                cur.executescript(f.read())
            conn.commit()

        # 5. Seed default quotas for existing users without quota records
        cur.execute("""
            INSERT OR IGNORE INTO user_quotas (user_id, daily_token_limit, daily_tokens_used, reset_at)
            SELECT id, 100000, 0, datetime('now', '+1 day', 'start of day')
            FROM users
            WHERE id NOT IN (SELECT user_id FROM user_quotas)
        """)
        conn.commit()

        # 6. Apply 006_model_archival_and_catalog_extensions.sql (if status constraint does not yet include ARCHIVED)
        models_sql_row = cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='models'").fetchone()
        if models_sql_row and "ARCHIVED" not in models_sql_row[0]:
            migration_006_file = MIGRATIONS_DIR / "006_model_archival_and_catalog_extensions.sql"
            if migration_006_file.exists():
                print(f"Executing {migration_006_file.name} on {db_path.name}...")
                with open(migration_006_file, "r", encoding="utf-8") as f:
                    cur.executescript(f.read())
                conn.commit()
                print(f"Applied 006 migration successfully to {db_path.name}.")

        # Verify tables
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        print(f"Tables in {db_path.name}: {tables}")
        if "api_metric_logs" in tables and "user_quotas" in tables:
            quota_count = cur.execute("SELECT COUNT(*) FROM user_quotas").fetchone()[0]
            print(f"Total user quotas in {db_path.name}: {quota_count}")
            
        conn.close()

if __name__ == "__main__":
    run_migration()

