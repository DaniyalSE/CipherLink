"""Linear congruential pseudo random generator."""

from __future__ import annotations

from typing import List

# Multiplier/offset sourced from SMS reference (glibc style LCG)
A = 1103515245
C = 12345
M = 2 ** 31


def generate(seed: int, length: int) -> str:
    if length <= 0:
        raise ValueError("length must be positive")
    state = seed % M
    bytes_out: List[int] = []
    for _ in range(length):
        state = (A * state + C) % M
        # take higher-order byte for better distribution
        byte = (state >> 16) & 0xFF
        bytes_out.append(byte)
    return bytes(bytes_out).hex()
