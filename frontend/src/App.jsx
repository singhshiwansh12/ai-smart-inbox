import { useState, useEffect } from 'react'
import Login from './Login.jsx'
import ContactsList from './ContactsList.jsx'
import ChatWindow from './ChatWindow.jsx'

const BACKEND_WS = import.meta.env.VITE_BACKEND_WS || 'ws://localhost:8000/ws/chat'

function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [token, setToken] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [socket, setSocket] = useState(null)
  
  const [onlineUsers, setOnlineUsers] = useState(new Set())

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setCurrentUser(JSON.parse(savedUser))
    }
  }, [])

  useEffect(() => {
    if (!currentUser) return

    const ws = new WebSocket(`${BACKEND_WS}/${currentUser.id}`)
    ws.onopen = () => console.log('✅ Connected')
    ws.onclose = () => console.log('❌ Disconnected')
    setSocket(ws)

    return () => ws.close()
  }, [currentUser])

  useEffect(() => {
    if (!socket) return

    const handleMessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'status') {
        setOnlineUsers((prev) => {
          const newSet = new Set(prev)
          if (data.is_online) {
            newSet.add(data.user_id)
          } else {
            newSet.delete(data.user_id)
          }
          return newSet
        })
      }
    }
    
    socket.addEventListener('message', handleMessage)
    return () => socket.removeEventListener('message', handleMessage)
  }, [socket])

  const handleLoginSuccess = (user, accessToken) => {
    setCurrentUser(user)
    setToken(accessToken)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setCurrentUser(null)
    setToken(null)
    setSelectedUser(null)
    socket?.close()
  }

  const handleBack = () => {
    setSelectedUser(null)
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className={`app-layout ${selectedUser ? 'show-chat' : 'show-contacts'}`}>
      <div className="sidebar">
        <div className="user-header">
          <strong>{currentUser.username}</strong>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
        <ContactsList
          token={token}
          onSelectUser={setSelectedUser}
          selectedUserId={selectedUser?.id}
          onlineUsers={onlineUsers}
        />
      </div>

      <ChatWindow
        currentUser={currentUser}
        otherUser={selectedUser}
        socket={socket}
        token={token}
        onBack={handleBack}
      />
    </div>
  )
}
export default App
