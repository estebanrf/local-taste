#!/usr/bin/env python3
"""
Watch CloudWatch logs from all Local Taste agents in real-time.
"""

import boto3
import time
import sys
from datetime import datetime, timedelta
from typing import Dict, List
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed

COLORS = {
    'DISCOVERER': '\033[92m',   # Green
    'RANKER':     '\033[96m',   # Cyan
    'ERROR':      '\033[91m',   # Red
    'RESET':      '\033[0m',
    'BOLD':       '\033[1m',
}

LOG_GROUPS = {
    'DISCOVERER': '/aws/lambda/lt-discoverer',
    'RANKER':     '/aws/lambda/lt-ranker',
}


class AgentLogWatcher:
    def __init__(self, region: str = 'eu-west-1', lookback_minutes: int = 5):
        self.logs_client = boto3.client('logs', region_name=region)
        self.lookback_minutes = lookback_minutes
        self.last_timestamps = {agent: 0 for agent in LOG_GROUPS}

    def get_log_events(self, agent: str, start_time: int) -> List[Dict]:
        log_group = LOG_GROUPS[agent]
        try:
            response = self.logs_client.describe_log_streams(
                logGroupName=log_group, orderBy='LastEventTime', descending=True, limit=5
            )
            if not response.get('logStreams'):
                return []

            all_events = []
            for stream in response['logStreams']:
                try:
                    events_response = self.logs_client.filter_log_events(
                        logGroupName=log_group,
                        logStreamNames=[stream['logStreamName']],
                        startTime=start_time,
                        limit=100,
                    )
                    all_events.extend(events_response.get('events', []))
                except Exception:
                    continue

            all_events.sort(key=lambda x: x['timestamp'])
            if all_events:
                self.last_timestamps[agent] = all_events[-1]['timestamp'] + 1
            return all_events

        except self.logs_client.exceptions.ResourceNotFoundException:
            return []
        except Exception as e:
            print(f"{COLORS['ERROR']}Error fetching {agent} logs: {e}{COLORS['RESET']}")
            return []

    def format_message(self, agent: str, event: Dict) -> str:
        timestamp = datetime.fromtimestamp(event['timestamp'] / 1000).strftime('%H:%M:%S.%f')[:-3]
        message = event['message'].rstrip()
        color = COLORS.get(agent, '')
        label = f"{color}[{agent:11}]{COLORS['RESET']}"
        if 'ERROR' in message or 'Exception' in message:
            message = f"{COLORS['ERROR']}{message}{COLORS['RESET']}"
        return f"{timestamp} {label} {message}"

    def watch(self, poll_interval: int = 2):
        print(f"{COLORS['BOLD']}Watching Local Taste agent logs...{COLORS['RESET']}")
        print(f"Press Ctrl+C to stop\n")

        initial_start = int((datetime.now() - timedelta(minutes=self.lookback_minutes)).timestamp() * 1000)
        for agent in LOG_GROUPS:
            self.last_timestamps[agent] = initial_start

        try:
            while True:
                with ThreadPoolExecutor(max_workers=len(LOG_GROUPS)) as executor:
                    futures = {
                        executor.submit(self.get_log_events, agent, self.last_timestamps[agent]): agent
                        for agent in LOG_GROUPS
                    }
                    all_messages = []
                    for future in as_completed(futures):
                        agent = futures[future]
                        for event in future.result():
                            all_messages.append(self.format_message(agent, event))

                all_messages.sort()
                for msg in all_messages:
                    print(msg)

                time.sleep(poll_interval)

        except KeyboardInterrupt:
            print(f"\n{COLORS['BOLD']}Stopped.{COLORS['RESET']}")
            sys.exit(0)


def main():
    parser = argparse.ArgumentParser(description='Watch Local Taste agent logs')
    parser.add_argument('--region', default='eu-west-1')
    parser.add_argument('--lookback', type=int, default=5)
    parser.add_argument('--interval', type=int, default=2)
    args = parser.parse_args()

    AgentLogWatcher(region=args.region, lookback_minutes=args.lookback).watch(args.interval)


if __name__ == "__main__":
    main()
