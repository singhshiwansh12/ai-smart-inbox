"""
connection_manager.py — Real-Time WebSockets (IMPROVED)

Improvements:
1. Multiple connections per user supported (phone + laptop open at same time).
2. disconnect() method properly removes dead sockets (no memory leak).
3. send_to_user fans out to all devices concurrently, silently removes dead sockets.
4. broadcast_to_users for efficient group message fan-out.
"""

import asyncio
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # list of sockets per user, not a single socket
        self.active_connections: dict[int, list[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        """Remove a specific socket. If user has no more sockets, remove user entry."""
        connections = self.active_connections.get(user_id)
        if not connections:
            return
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self.active_connections.pop(user_id, None)

    def is_online(self, user_id: int) -> bool:
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

    def get_online_users(self) -> list[int]:
        return list(self.active_connections.keys())

    async def send_to_user(self, user_id: int, message: dict):
        """Send to all of a user's connected devices concurrently."""
        connections = list(self.active_connections.get(user_id, []))
        if not connections:
            return

        dead_sockets = []

        async def _safe_send(ws: WebSocket):
            try:
                await ws.send_json(message)
            except Exception:
                dead_sockets.append(ws)

        await asyncio.gather(*(_safe_send(ws) for ws in connections))

        # Clean up any sockets that failed
        for ws in dead_sockets:
            self.disconnect(user_id, ws)

    async def broadcast_to_users(self, user_ids: list[int], message: dict):
        """Fan out one message to many users in parallel (used for group chat)."""
        await asyncio.gather(*(self.send_to_user(uid, message) for uid in user_ids))


manager = ConnectionManager()
