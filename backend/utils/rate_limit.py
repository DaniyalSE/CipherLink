"""Simple in-memory rate limiting helpers for security-sensitive endpoints."""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict

@dataclass
class RateBucket:
    max_requests: int
    per_seconds: int
    timestamps: Deque[float] = field(default_factory=deque)

    def allow(self) -> bool:
        now = time.monotonic()
        while self.timestamps and now - self.timestamps[0] > self.per_seconds:
            self.timestamps.popleft()
        if len(self.timestamps) >= self.max_requests:
            return False
        self.timestamps.append(now)
        return True


class RateLimiter:
    def __init__(self, max_requests: int, per_seconds: int) -> None:
        self.max_requests = max_requests
        self.per_seconds = per_seconds
        self._buckets: Dict[str, RateBucket] = {}

    def check(self, key: str) -> bool:
        bucket = self._buckets.get(key)
        if not bucket:
            bucket = RateBucket(self.max_requests, self.per_seconds)
            self._buckets[key] = bucket
        return bucket.allow()
