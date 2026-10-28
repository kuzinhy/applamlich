"""Xuat toan bo du lieu lich cong tac tu SQLite sang JSON.

Dung khi chuyen giua ban FastAPI/SQLite va ban Node/Firestore, hoac khi can
nap lai lich that vao ung dung sau khi reset.

Chay:  python tools/export_sqlite_to_json.py   [duong dan db]   [duong dan output]
"""
import json
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

SCHEMA_VERSION = 1

DEFAULT_DB = Path(r"D:\TuyenGiaoCalendarAI\database\calendar_ai.db")
DEFAULT_OUT = Path(r"D:\TuyenGiaoCalendarAI\data\schedule_export.json")

# stored_path bi lo duong dan may local, file_hash/notes khong can cho tai
# phep dung -> loai khoi ban xuat.
EXCLUDED_COLUMNS = {
    "sources": {"stored_path", "file_hash"},
}

TABLES = [
    "sources",
    "participants",
    "events",
    "conflicts",
    "settings",
    "agency_schedules",
    "bxdd_personnel",
    "schedule_learning_memory",
]


def export(db_path: Path, out_path: Path) -> dict:
    if not db_path.exists():
        raise SystemExit(f"Khong thay database tai {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        payload = {
            "schema_version": SCHEMA_VERSION,
            "exported_at": datetime.now().isoformat(timespec="seconds"),
            "source_database": db_path.name,
            "tables": {},
        }
        for table in TABLES:
            drop = EXCLUDED_COLUMNS.get(table, set())
            rows = conn.execute(f"SELECT * FROM {table}").fetchall()  # noqa: S608 - ten bang tinh
            payload["tables"][table] = [
                {k: r[k] for k in r.keys() if k not in drop} for r in rows
            ]
    finally:
        conn.close()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    return payload


def main() -> None:
    db_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DB
    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    payload = export(db_path, out_path)

    print(f"Da xuat {out_path}")
    for table, rows in payload["tables"].items():
        print(f"  {table:26s} {len(rows):4d} dong")


if __name__ == "__main__":
    main()
