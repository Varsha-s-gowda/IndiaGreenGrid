"""Create the database schema and print the resulting tables.

Usage (from the backend directory):
    python scripts/init_db.py
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import inspect  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.database import engine, init_db  # noqa: E402


def main() -> int:
    configure_logging(settings.log_level)
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    init_db()
    tables = sorted(inspect(engine).get_table_names())
    print(f"Schema ready. Tables ({len(tables)}): {', '.join(tables)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
