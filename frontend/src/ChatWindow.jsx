import { useState, useEffect, useRef, useMemo } from 'react'
const BACKEND_HTTP = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function ChatWindow({ currentUser, otherUser, socketRef, socketTick, token, onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [summary, setSummary] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  // Helper: get current open socket (always fresh via ref)
  const getSocket = () => {
    const ws = socketRef?.current
    if (ws && ws.readyState === WebSocket.OPEN) return ws
    return null
  }

  useEffect(() => {
    if (!otherUser) return
    setActiveTab('All')
    setSummary(null)
    setSearchQuery('')
    setMessages([])
    setConversationId(null)
    fetchMessages()
  }, [otherUser])

  const fetchMessages = async () => {
    try {
      if (!otherUser) return
      setIsLoading(true)
      let url = otherUser.is_group
        ? `${BACKEND_HTTP}/groups/${otherUser.id}/messages`
        : `${BACKEND_HTTP}/conversation/${otherUser.id}`

      if (searchQuery.trim() && !otherUser.is_group) {
        url = `${BACKEND_HTTP}/conversation/${otherUser.id}/search?q=${encodeURIComponent(searchQuery)}`
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setMessages(otherUser.is_group ? data : (data.messages || []))
        if (!otherUser.is_group) setConversationId(data.conversation_id)
      }
    } catch (err) {
      console.error('fetchMessages error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Re-attach message listener whenever socket changes (socketTick changes when socket reconnects)
  useEffect(() => {
    const ws = socketRef?.current
    if (!ws) return

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data)

        if (data.type === 'chat' || data.type === 'group_chat') {
          const isForThisGroup = otherUser?.is_group && Number(data.group_id) === Number(otherUser.id)
          const isForThisChat = !otherUser?.is_group && (
            data.conversation_id === conversationId || Number(data.sender_id) === Number(otherUser?.id)
          )

          if (isForThisGroup || isForThisChat) {
            setMessages(prev => {
              const exists = prev.find(m => m.id === data.id || m.tempId === String(data.id))
              if (exists) {
                return prev.map(m => (m.id === data.id || m.tempId === String(data.id)) ? { ...data, _updated: true } : m)
              }
              return [...prev, data]
            })
            setIsTyping(false)
          }
        } else if (data.type === 'typing') {
          const isFromGroup = otherUser?.is_group && Number(data.group_id) === Number(otherUser.id) && data.sender_id !== currentUser.id
          const isFromUser = !otherUser?.is_group && Number(data.sender_id) === Number(otherUser?.id)
          if (isFromGroup || isFromUser) {
            setIsTyping(true)
            clearTimeout(typingTimeoutRef.current)
            typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000)
          }
        }
      } catch (e) {
        console.error('WS message parse error:', e)
      }
    }

    ws.addEventListener('message', handleMessage)
    return () => ws.removeEventListener('message', handleMessage)
  }, [socketTick, otherUser, currentUser, conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const sendMessage = () => {
    if (!input.trim() || !otherUser) return

    const ws = getSocket()
    if (!ws) {
      console.warn('Socket not open, cannot send message')
      return
    }

    const tempId = `temp-${Date.now()}`
    const optimisticMsg = {
      id: tempId,
      tempId,
      sender_id: currentUser.id,
      text: input,
      ai_category: 'General',
      created_at: new Date().toISOString(),
      status: 'sending',
      sender_name: currentUser.username,
      group_id: otherUser.is_group ? otherUser.id : undefined,
    }
    setMessages(prev => [...prev, optimisticMsg])

    const payload = {
      type: otherUser.is_group ? 'group_chat' : 'chat',
      text: input,
      tempId,
    }
    if (otherUser.is_group) payload.group_id = otherUser.id
    else payload.receiver_id = otherUser.id

    ws.send(JSON.stringify(payload))
    setInput('')
  }

  const handleTyping = (e) => {
    setInput(e.target.value)
    const ws = getSocket()
    if (ws) {
      const payload = { type: 'typing' }
      if (otherUser.is_group) payload.group_id = otherUser.id
      else payload.receiver_id = otherUser.id
      ws.send(JSON.stringify(payload))
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') sendMessage()
  }

  const handleSearch = (e) => {
    if (e.key === 'Enter') fetchMessages()
  }

  const getSummary = async () => {
    try {
      const url = otherUser.is_group
        ? `${BACKEND_HTTP}/groups/${otherUser.id}/summary`
        : `${BACKEND_HTTP}/conversation/${otherUser.id}/summary`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setSummary(data.summary)
      } else {
        setSummary('Could not generate summary.')
      }
    } catch (err) {
      console.log('Summary error:', err)
    }
  }

  if (!otherUser) {
    return (
      <div className="chat-window empty-state">
        <div style={{ textAlign: 'center', opacity: 0.5 }}>
          <div style={{ fontSize: '3rem', marginBottom: '12px' }}>💬</div>
          <p>Select a contact or group to start chatting</p>
        </div>
      </div>
    )
  }

  const filteredMessages = useMemo(() => {
    if (activeTab === 'All') return messages
    return messages.filter(msg => msg.ai_category === activeTab)
  }, [messages, activeTab])

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="header-top">
          <div className="user-info">
            <button className="mobile-back-btn" onClick={onBack}>← Back</button>
            <div className="other-username">
              {otherUser.is_group ? `👥 ${otherUser.name}` : otherUser.username}
            </div>
          </div>
          <div className="header-actions">
            {!otherUser.is_group && (
              <div className="search-bar">
                <input
                  placeholder="Search chat..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearch}
                />
                <button onClick={fetchMessages}>🔍</button>
              </div>
            )}
            <button className="summary-btn" onClick={getSummary}>✨ AI Summary</button>
          </div>
        </div>

        <div className="tabs">
          {['All', 'Important', 'General', 'Spam'].map(tab => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {summary && (
        <div className="chat-summary">
          <div className="summary-content">
            <strong>🤖 AI Summary:</strong> {summary}
          </div>
          <button className="close-btn" onClick={() => setSummary(null)}>✖</button>
        </div>
      )}

      <div className="chat-window">
        {isLoading && (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className={`bubble skeleton-bubble ${i % 2 === 0 ? 'mine' : 'theirs'}`}>
              <div className="skeleton-line" style={{ width: `${60 + i * 10}%` }} />
            </div>
          ))
        )}

        {!isLoading && filteredMessages.length === 0 && (
          <div style={{ textAlign: 'center', opacity: 0.4, marginTop: '40px' }}>
            {activeTab === 'All'
              ? <p>No messages yet — say hi 👋</p>
              : <p>Nothing tagged "{activeTab}" here</p>}
          </div>
        )}

        {!isLoading && filteredMessages.map((msg, index) => {
          const isMe = Number(msg.sender_id) === Number(currentUser.id)
          const cat = (msg.ai_category || 'general').toLowerCase().replace('...', '')
          return (
            <div
              key={msg.id || index}
              className={`bubble tag-${cat} ${isMe ? 'mine' : 'theirs'} ${msg.status === 'sending' ? 'sending' : ''} ${msg.status === 'failed' ? 'failed' : ''}`}
            >
              {otherUser.is_group && !isMe && (
                <div style={{ fontSize: '0.72rem', opacity: 0.75, marginBottom: '3px', fontWeight: 600 }}>
                  {msg.sender_name}
                </div>
              )}
              <div className="bubble-header">
                <span className={`tag-label ${msg._updated ? 'tag-updated' : ''}`}>
                  {msg.ai_category}
                </span>
                {msg.status === 'sending' && <span style={{ fontSize: '0.7rem', opacity: 0.5, marginLeft: '4px' }}>⏳</span>}
                {msg.status === 'failed' && <span style={{ fontSize: '0.7rem', color: '#ff4444', marginLeft: '4px' }}>❌</span>}
              </div>
              <p>{msg.text}</p>
            </div>
          )
        })}

        {isTyping && (
          <div className="typing-indicator">
            {otherUser.is_group ? 'Someone' : otherUser.username} is typing...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="input-bar">
        <input
          value={input}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          placeholder={getSocket() ? 'Type a message...' : '⚠️ Reconnecting...'}
        />
        <button onClick={sendMessage} disabled={!getSocket()}>Send</button>
      </div>
    </div>
  )
}
export default ChatWindow
