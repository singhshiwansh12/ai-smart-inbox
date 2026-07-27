from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, WebSocket] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        await self.broadcast_status(user_id, True)

    async def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            await self.broadcast_status(user_id, False)

    async def send_to_user(self, user_id: int, data: dict):
        websocket = self.active_connections.get(user_id)
        if websocket:
            try:
                await websocket.send_json(data)
            except Exception as e:
                print(f"Error sending to user {user_id}: {e}")

    async def broadcast_status(self, user_id: int, is_online: bool):
        payload = {
            "type": "status",
            "user_id": user_id,
            "is_online": is_online
        }
        for uid, ws in self.active_connections.items():
            if uid != user_id:
                try:
                    await ws.send_json(payload)
                except:
                    pass

    def is_online(self, user_id: int) -> bool:
        return user_id in self.active_connections
        
    def get_online_users(self) -> list[int]:
        return list(self.active_connections.keys())

manager = ConnectionManager()
