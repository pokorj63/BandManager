# app/token_store.py
from __future__ import annotations
from typing import Any

# DEV ONLY: in-memory token store
TOKENS: dict[str, dict[str, Any]] = {}