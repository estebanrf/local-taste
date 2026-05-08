#!/usr/bin/env python3
"""
Run test_simple.py for all active agents.
"""

import os
import subprocess
import sys
from pathlib import Path


def test_agent(agent_name):
    backend_dir = Path(__file__).parent
    agent_dir = backend_dir / agent_name
    test_path = agent_dir / "test_simple.py"

    if not agent_dir.exists():
        print(f"  {agent_name}: directory not found, skipping")
        return True

    if not test_path.exists():
        print(f"  {agent_name}: no test_simple.py, skipping")
        return True

    result = subprocess.run(
        ["uv", "run", "test_simple.py"],
        cwd=str(agent_dir),
        capture_output=True,
        text=True,
        env={**os.environ, "MOCK_LAMBDAS": "true"},
    )

    if result.returncode == 0:
        print(f"  {agent_name}: passed")
        return True
    else:
        print(f"  {agent_name}: FAILED")
        if result.stderr:
            print(f"    {result.stderr.splitlines()[0][:120]}")
        return False


def main():
    agents = ["dish-discoverer", "restaurant-ranker"]
    print("=" * 50)
    results = {a: test_agent(a) for a in agents}
    print("=" * 50)
    passed = sum(results.values())
    print(f"Passed: {passed}/{len(agents)}")
    sys.exit(0 if passed == len(agents) else 1)


if __name__ == "__main__":
    main()
