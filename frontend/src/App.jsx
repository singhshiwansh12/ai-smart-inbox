import { useState, useEffect, useRef, useCallback } from 'react'
import Login from './Login.jsx'
import ContactsList from './ContactsList.jsx'
import ChatWindow from './ChatWindow.jsx'

const BACKEND_WS = import.meta.env.VITE_BACKEND_WS || 'ws://localhost:8000/ws/chat'

function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [token, setToken] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [onlineUsers, setOnlineUsers] = useState(new Set())
  const [connectionStatus, setConnectionStatus] = useState('connecting')

  // Use a ref so ChatWindow always has the LATEST socket, even after reconnect
  const socketRef = useRef(null)
  // Keep a stable socket state for rendering triggers only
  const [socketTick, setSocketTick] = useState(0)

  const reconnectTimerRef = useRef(null)
  const shouldReconnectRef = useRef(false)
  const reconnectAttemptRef = useRef(0)

  const connectSocket = useCallback((user, tkn) => {
    // Clear any existing socket cleanly
    if (socketRef.current) {
      socketRef.current.onclose = null
      socketRef.current.onerror = null
      socketRef.current.close()
    }

    const ws = new WebSocket(`${BACKEND_WS}/${user.id}?token=${tkn}`)
    socketRef.current = ws

    ws.onopen = () => {
      setConnectionStatus('connected')
      reconnectAttemptRef.current = 0
      setSocketTick(t => t + 1) // notify children that socket changed
      console.log('✅ WebSocket connected')
    }

    ws.onclose = () => {
      setConnectionStatus('disconnected')
      console.log('❌ WebSocket disconnected')

      if (!shouldReconnectRef.current) return

      reconnectAttemptRef.current += 1
      const delay = Math.min(2000 * reconnectAttemptRef.current, 30000)
      console.log(`Reconnecting in ${delay}ms...`)

      reconnectTimerRef.current = setTimeout(() => {
        if (shouldReconnectRef.current) connectSocket(user, tkn)
      }, delay)
    }

    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'status') {
          setOnlineUsers((prev) => {
            const newSet = new Set(prev)
            if (data.is_online) newSet.add(data.user_id)
            else newSet.delete(data.user_id)
            return newSet
          })
        }
      } catch (e) {
        console.error('Bad WS message:', e)
      }
    }
  }, [])

  useEffect(() => {
    const savedToken = localStorage.getItem('token')
    const savedUser = localStorage.getItem('user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setCurrentUser(JSON.parse(savedUser))
    }
  }, [])

  useEffect(() => {
    if (!currentUser || !token) return
    shouldReconnectRef.current = true
    connectSocket(currentUser, token)

    return () => {
      shouldReconnectRef.current = false
      clearTimeout(reconnectTimerRef.current)
      if (socketRef.current) {
        socketRef.current.onclose = null
        socketRef.current.close()
      }
    }
  }, [currentUser, token, connectSocket])

  const handleLoginSuccess = (user, accessToken) => {
    setCurrentUser(user)
    setToken(accessToken)
  }

  const handleLogout = () => {
    shouldReconnectRef.current = false
    clearTimeout(reconnectTimerRef.current)
    if (socketRef.current) {
      socketRef.current.onclose = null
      socketRef.current.close()
      socketRef.current = null
    }
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setCurrentUser(null)
    setToken(null)
    setSelectedUser(null)
    setConnectionStatus('connecting')
  }

  if (!currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className={`app-layout ${selectedUser ? 'show-chat' : 'show-contacts'}`}>
      {connectionStatus === 'disconnected' && (
        <div className="connection-banner">
          ⚠️ Connection lost. Reconnecting... Messages will send once back online.
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
          selectedUser={selectedUser}
          onlineUsers={onlineUsers}
        />
      </div>

      <ChatWindow
        currentUser={currentUser}
        otherUser={selectedUser}
        socketRef={socketRef}
        socketTick={socketTick}
        token={token}
        onBack={() => setSelectedUser(null)}
      />
    </div>
  )
}
export default App
