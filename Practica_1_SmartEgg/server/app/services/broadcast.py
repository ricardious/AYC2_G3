from __future__ import annotations

import asyncio
from collections import defaultdict

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, incubator_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[incubator_id].add(websocket)

    async def disconnect(self, incubator_id: int, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[incubator_id].discard(websocket)

    async def broadcast(self, incubator_id: int, payload: dict) -> None:
        async with self._lock:
            connections = list(self._connections[incubator_id])
        stale: list[WebSocket] = []
        for websocket in connections:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale.append(websocket)
        if stale:
            async with self._lock:
                for websocket in stale:
                    self._connections[incubator_id].discard(websocket)
