#!/usr/bin/env python3
"""
Migration runner for Local Taste schema.
Drops old Alex tables if present, then applies 001_schema.sql fresh.
"""

import os
import re
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv(override=True)

cluster_arn = os.environ.get("AURORA_CLUSTER_ARN")
secret_arn  = os.environ.get("AURORA_SECRET_ARN")
database    = os.environ.get("AURORA_DATABASE", "alex")
region      = os.environ.get("DEFAULT_AWS_REGION", "us-east-1")

if not cluster_arn or not secret_arn:
    raise ValueError("Missing AURORA_CLUSTER_ARN or AURORA_SECRET_ARN in environment variables")

client = boto3.client("rds-data", region_name=region)


def run(sql: str, description: str = ""):
    try:
        client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            database=database,
            sql=sql,
        )
        print(f"    ✅ {description or sql[:60]}")
        return True
    except ClientError as e:
        msg = e.response["Error"]["Message"]
        if "already exists" in msg.lower() or "does not exist" in msg.lower():
            print(f"    ⚠️  {description or sql[:60]} — skipped ({msg[:80]})")
            return True
        print(f"    ❌ {description or sql[:60]} — {msg[:120]}")
        return False


# ── 1. Drop old Alex tables (safe — IF EXISTS) ─────────────────────────────
print("\n🧹 Dropping old Alex-schema tables (if present)...")
for drop in [
    "DROP TABLE IF EXISTS positions CASCADE",
    "DROP TABLE IF EXISTS accounts CASCADE",
    "DROP TABLE IF EXISTS instruments CASCADE",
    # jobs and users will be recreated with the correct schema below
    "DROP TABLE IF EXISTS jobs CASCADE",
    "DROP TABLE IF EXISTS users CASCADE",
    # also drop Local Taste tables so we get a clean slate
    "DROP TABLE IF EXISTS passport_entries CASCADE",
    "DROP TABLE IF EXISTS restaurants CASCADE",
    "DROP TABLE IF EXISTS dishes CASCADE",
    "DROP TABLE IF EXISTS cities CASCADE",
]:
    run(drop)

# ── 2. Parse and run 001_schema.sql ────────────────────────────────────────
print("\n🚀 Running 001_schema.sql migrations...")

with open("migrations/001_schema.sql") as f:
    raw = f.read()

# Split on semicolons, skip blank / comment-only chunks
statements = []
for chunk in raw.split(";"):
    stripped = chunk.strip()
    # Remove comment-only lines to check if there's real SQL
    no_comments = "\n".join(
        line for line in stripped.splitlines()
        if not line.strip().startswith("--")
    ).strip()
    if no_comments:
        statements.append(stripped)

success = errors = 0
for stmt in statements:
    first_line = next((l.strip() for l in stmt.splitlines() if l.strip() and not l.strip().startswith("--")), "")
    ok = run(stmt, first_line[:80])
    if ok:
        success += 1
    else:
        errors += 1

print(f"\n{'='*50}")
print(f"Migration complete: {success} ok, {errors} errors")
if errors == 0:
    print("\n✅ Schema is ready. You can now run the local server.")
else:
    print("\n⚠️  Some statements failed — check errors above.")
