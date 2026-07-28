import { useState, useEffect, useRef } from 'react'
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
  const [connectionStatus, setConnectionStatus] = useState('connecting') // connecting | connected | disconnected
  const reconnectAttemptRef = useRef(0)
  const socketRef = useRef(null)

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setCurrentUser(JSON.parse(savedUser))
    }
  }, [])

  // Build WebSocket with token in query string (required for backend auth)
  const buildSocket = (user, tkn) => {
    const ws = new WebSocket(`${BACKEND_WS}/${user.id}?token=${tkn}`)

    ws.onopen = () => {
      setConnectionStatus('connected')
      reconnectAttemptRef.current = 0
      console.log('✅ WebSocket connected')
    }

    ws.onclose = () => {
      setConnectionStatus('disconnected')
      console.log('❌ WebSocket disconnected — attempting reconnect...')
      scheduleReconnect(user, tkn)
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'status') {
        setOnlineUsers((prev) => {
          const newSet = new Set(prev)
          if (data.is_online) newSet.add(data.user_id)
          else newSet.delete(data.user_id)
          return newSet
        })
      }
    }

    socketRef.current = ws
    setSocket(ws)
    return ws
  }

  // Exponential backoff reconnect (max 30s delay)
  const scheduleReconnect = (user, tkn) => {
    reconnectAttemptRef.current += 1
    const delay = Math.min(1000 * 2 ** reconnectAttemptRef.current, 30000)
    console.log(`Reconnecting in ${delay / 1000}s (attempt ${reconnectAttemptRef.current})...`)
    setTimeout(() => {
      buildSocket(user, tkn)
    }, delay)
  }

  useEffect(() => {
    if (!currentUser || !token) return
    const ws = buildSocket(currentUser, token)
    return () => {
      ws.onclose = null // Prevent reconnect loop on intentional logout
      ws.close()
    }
  }, [currentUser, token])

  const handleLoginSuccess = (user, accessToken) => {
    setCurrentUser(user)
    setToken(accessToken)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    if (socketRef.current) {
      socketRef.current.onclose = null
      socketRef.current.close()
    }
    setCurrentUser(null)
    setToken(null)
    setSelectedUser(null)
    setSocket(null)
  }

  const handleBack = () => {
    setSelectedUser(null)
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className={`app-layout ${selectedUser ? 'show-chat' : 'show-contacts'}`}>
      {/* Connection status banner */}
      {connectionStatus === 'disconnected' && (
        <div className="connection-banner">
          ⚠️ Connection lost. Reconnecting... Your messages will send once you're back online.
        </div>
      )}

      <div className="sidebar">
        <div className="user-header">
          <strong>{currentUser.username}</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`conn-dot ${connectionStatus}`} title={connectionStatus} />
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
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
