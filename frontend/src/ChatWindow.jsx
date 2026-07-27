import { useState, useEffect, useRef } from 'react'
const BACKEND_HTTP = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function ChatWindow({ currentUser, otherUser, socket, token, onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [summary, setSummary] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const bottomRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  useEffect(() => {
    if (!otherUser) return
    setActiveTab('All')
    setSummary(null)
    setSearchQuery('')
    fetchMessages()
  }, [otherUser, token])

  const fetchMessages = async () => {
    try {
      if (!otherUser) return;
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
        setMessages(otherUser.is_group ? data : data.messages || [])
        if (!otherUser.is_group) setConversationId(data.conversation_id)
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (!socket) return

    const handleMessage = (event) => {
      const data = JSON.parse(event.data)
      
      if (data.type === 'chat' || data.type === 'group_chat') {
        const isForThisGroup = otherUser.is_group && data.group_id === otherUser.id
        const isForThisChat = !otherUser.is_group && (data.conversation_id === conversationId || data.sender_id === otherUser.id)
        
        if (isForThisGroup || isForThisChat) {
          setMessages(prev => {
            const exists = prev.find(m => m.id === data.id)
            if (exists) {
              return prev.map(m => m.id === data.id ? data : m)
            }
            return [...prev, data]
          })
          setIsTyping(false)
        }
      } else if (data.type === 'typing') {
        if (!otherUser.is_group && data.sender_id === otherUser.id) {
          setIsTyping(true)
          clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000)
        } else if (otherUser.is_group && data.group_id === otherUser.id && data.sender_id !== currentUser.id) {
          setIsTyping(true)
          clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000)
        }
      }
    }

    socket.addEventListener('message', handleMessage)
    return () => socket.removeEventListener('message', handleMessage)
  }, [socket, otherUser, currentUser, conversationId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const sendMessage = () => {
    if (!input.trim() || !otherUser) return

    const payload = {
      type: otherUser.is_group ? "group_chat" : "chat",
      text: input,
    }
    if (otherUser.is_group) {
      payload.group_id = otherUser.id
    } else {
      payload.receiver_id = otherUser.id
    }
    socket.send(JSON.stringify(payload))
    setInput('')
  }

  const handleTyping = (e) => {
    setInput(e.target.value)
    if (socket && socket.readyState === WebSocket.OPEN) {
      const payload = { type: 'typing' }
      if (otherUser.is_group) payload.group_id = otherUser.id
      else payload.receiver_id = otherUser.id
      socket.send(JSON.stringify(payload))
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
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setSummary(data.summary)
      } else {
        setSummary("Could not generate summary.")
      }
    } catch (err) {
      console.log('Summary error:', err)
    }
  }

  if (!otherUser) {
    return <div className="chat-window empty-state">Select a contact to start chatting</div>
  }
  
  const filteredMessages = messages.filter(msg => {
    if (activeTab === 'All') return true
    return msg.ai_category === activeTab
  })

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="header-top">
          <div className="user-info">
            <button className="mobile-back-btn" onClick={onBack}>← Back</button>
            <div className="other-username">{otherUser.is_group ? otherUser.name : otherUser.username}</div>
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
        {filteredMessages.map((msg, index) => (
          <div
            key={msg.id || index}
            className={`bubble tag-${msg.ai_category.toLowerCase().replace('...', '')} ${
              msg.sender_id === currentUser.id ? 'mine' : 'theirs'
            }`}
          >
            <div className="bubble-header">
              {otherUser.is_group && msg.sender_id !== currentUser.id && (
                <span style={{fontSize: '0.75rem', opacity: 0.8, marginRight: '8px'}}>{msg.sender_name}</span>
              )}
              <span className="tag-label">{msg.ai_category}</span>
            </div>
            <p>{msg.text}</p>
          </div>
        ))}
        {isTyping && <div className="typing-indicator">Someone is typing...</div>}
        <div ref={bottomRef} />
      </div>

      <div className="input-bar">
        <input
          value={input}
          onChange={handleTyping}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  )
}
export default ChatWindow
