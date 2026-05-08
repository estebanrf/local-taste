#!/usr/bin/env python3
"""
Apply a single migration file to the live database without dropping any tables.
Usage: uv run apply_migration.py migrations/002_add_coordinates.sql
"""

import sys
import os
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv(override=True)

cluster_arn = os.environ.get("AURORA_CLUSTER_ARN")
secret_arn  = os.environ.get("AURORA_SECRET_ARN")
database    = os.environ.get("AURORA_DATABASE", "alex")
region      = os.environ.get("DEFAULT_AWS_REGION", "eu-west-1")

if not cluster_arn or not secret_arn:
    raise ValueError("Missing AURORA_CLUSTER_ARN or AURORA_SECRET_ARN")

if len(sys.argv) < 2:
    print("Usage: uv run apply_migration.py <migration_file.sql>")
    sys.exit(1)

migration_file = sys.argv[1]
if not os.path.exists(migration_file):
    print(f"File not found: {migration_file}")
    sys.exit(1)

client = boto3.client("rds-data", region_name=region)

with open(migration_file) as f:
    raw = f.read()

statements = [s.strip() for s in raw.split(";") if s.strip() and not s.strip().startswith("--")]

print(f"\nApplying {migration_file} ({len(statements)} statements)...")
errors = 0
for stmt in statements:
    try:
        client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            database=database,
            sql=stmt,
        )
        print(f"  ✅ {stmt[:80]}")
    except ClientError as e:
        msg = e.response["Error"]["Message"]
        if "already exists" in msg.lower():
            print(f"  ⚠️  Already applied: {stmt[:80]}")
        else:
            print(f"  ❌ {stmt[:80]} — {msg}")
            errors += 1

print(f"\n{'OK' if errors == 0 else 'FAILED'}: {len(statements) - errors}/{len(statements)} statements applied.")
sys.exit(0 if errors == 0 else 1)
