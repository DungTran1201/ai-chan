import sqlite3
import os
from pathlib import Path
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

# Resolve database path relative to project root or backend
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "database" / "app.db"

# Fallback to backend root app.db if database/app.db does not exist
if not DB_PATH.exists():
    ALT_PATH = BASE_DIR / "app.db"
    if ALT_PATH.exists():
        DB_PATH = ALT_PATH

def dict_factory(cursor, row):
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d

@contextmanager
def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = dict_factory
    try:
        yield conn
    finally:
        conn.close()

def query_one(sql: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        return cursor.fetchone()

def query_all(sql: str, params: tuple = ()) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        return cursor.fetchall()

def execute_commit(sql: str, params: tuple = ()) -> int:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        conn.commit()
        return cursor.rowcount
