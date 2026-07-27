import { useState, useEffect, useRef } from 'react'
const BACKEND_HTTP = 'http://localhost:8000'

function ChatWindow({ currentUser, otherUser, socket, token }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState('All') // V2.1 feature
  const [searchQuery, setSearchQuery] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [summary, setSummary] = useState(null)
  const bottomRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  useEffect(() => {
    if (!otherUser) return
    setActiveTab('All')
    setSummary(null)
    setSearchQuery('')
    fetchMessages()
  }, [otherUser, token])

  const fetchMessages = () => {
    if (!otherUser) return
    let url = `${BACKEND_HTTP}/conversation/${otherUser.id}`
    if (searchQuery.trim()) {
      url = `${BACKEND_HTTP}/conversation/${otherUser.id}/search?q=${encodeURIComponent(searchQuery)}`
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.json())
        .then((data) => setMessages(data || []))
        .catch((err) => console.log('Search error:', err))
    } else {
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => res.json())
        .then((data) => setMessages(data.messages || []))
        .catch((err) => console.log('History error:', err))
    }
  }

  useEffect(() => {
    if (!socket) return

    const handleMessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'typing') {
        if (otherUser && data.sender_id === otherUser.id) {
          setIsTyping(true)
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000)
        }
        return
      }

      if (data.type === 'chat') {
        setMessages((prev) => {
          const existingIndex = prev.findIndex((m) => m.id === data.id)
          if (existingIndex !== -1) {
            const updated = [...prev]
            updated[existingIndex] = data
            return updated
          }
          return [...prev, data]
        })
      }
    }

    socket.addEventListener('message', handleMessage)
    return () => socket.removeEventListener('message', handleMessage)
  }, [socket, otherUser, currentUser])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  const sendMessage = () => {
    if (!input.trim() || !otherUser) return
    socket.send(
      JSON.stringify({
        type: 'chat',
        receiver_id: otherUser.id,
        text: input,
      })
    )
    setInput('')
  }

  const handleTyping = (e) => {
    setInput(e.target.value)
    if (socket && otherUser) {
      socket.send(JSON.stringify({ type: 'typing', receiver_id: otherUser.id }))
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') sendMessage()
  }
  
  const handleSearch = (e) => {
    if (e.key === 'Enter') fetchMessages()
  }
  
  const getSummary = () => {
    fetch(`${BACKEND_HTTP}/conversation/${otherUser.id}/summary`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.json())
      .then((data) => setSummary(data.summary))
      .catch((err) => console.log('Summary error:', err))
  }

  if (!otherUser) {
    return <div className="chat-window empty-state">Chat shuru karne ke liye ek contact chuno</div>
  }
  
  const filteredMessages = messages.filter(msg => {
    if (activeTab === 'All') return true
    return msg.ai_category === activeTab
  })

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="header-top">
          <div className="other-username">{otherUser.username}</div>
          <div className="header-actions">
            <div className="search-bar">
              <input 
                placeholder="Search chat..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearch}
              />
              <button onClick={fetchMessages}>🔍</button>
            </div>
            <button className="summary-btn" onClick={getSummary}>✨ AI Summary</button>
          </div>
        </div>
        
        {/* V2.1 Tabs */}
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
              <span className="tag-label">{msg.ai_category}</span>
            </div>
            <p>{msg.text}</p>
          </div>
        ))}
        {isTyping && <div className="typing-indicator">{otherUser.username} is typing...</div>}
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
