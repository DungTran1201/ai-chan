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

        # Verify models table
        tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        print(f"Tables in {db_path.name}: {tables}")
        if "models" in tables:
            model_count = cur.execute("SELECT COUNT(*) FROM models").fetchone()[0]
            print(f"Total models registered in {db_path.name}: {model_count}")
            
        conn.close()

if __name__ == "__main__":
    run_migration()

