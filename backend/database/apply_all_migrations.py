#!/usr/bin/env python3
"""
Apply all migrations in order (004 through latest).
Usage: uv run apply_all_migrations.py
"""

import os
import sys
import glob
import subprocess

migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))

if not files:
    print("No migration files found.")
    sys.exit(1)

print(f"Found {len(files)} migration(s):\n")
for f in files:
    print(f"  {os.path.basename(f)}")
print()

total_ok = 0
total_fail = 0

for f in files:
    result = subprocess.run(
        ["uv", "run", "apply_migration.py", f],
        cwd=os.path.dirname(__file__),
    )
    if result.returncode == 0:
        total_ok += 1
    else:
        total_fail += 1
        print(f"\n❌ Stopping — migration failed: {os.path.basename(f)}")
        sys.exit(1)

print(f"\n✅ All {total_ok} migration(s) applied successfully.")
