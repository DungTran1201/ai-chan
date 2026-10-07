import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

def run_migration():
    for db_path in [BASE_DIR / "app.db", BASE_DIR.parent / "app.db"]:
        if not db_path.exists():
            continue
        print(f"Applying migration to {db_path}...")
        conn = sqlite3.connect(str(db_path))
        cur = conn.cursor()
        cols = [c[1] for c in cur.execute("PRAGMA table_info(users)").fetchall()]
        print(f"Current columns in {db_path.name}: {cols}")
        
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
        
        # Verify
        updated_cols = [c[1] for c in cur.execute("PRAGMA table_info(users)").fetchall()]
        print(f"Updated columns in {db_path.name}: {updated_cols}")
        conn.close()

if __name__ == "__main__":
    run_migration()
