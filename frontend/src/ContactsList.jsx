import { useState, useEffect } from 'react'
const BACKEND_HTTP = 'http://localhost:8000'

function ContactsList({ token, onSelectUser, selectedUserId, onlineUsers }) {
  const [users, setUsers] = useState([])

  useEffect(() => {
    fetch(`${BACKEND_HTTP}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch((err) => console.log('Users load error:', err))
  }, [token])

  return (
    <div className="contacts-list">
      <h3>Contacts</h3>
      {users.length === 0 && <p className="empty-text">Koi aur user nahi hai abhi.</p>}
      {users.map((user) => {
        const isOnline = onlineUsers.has(user.id) || user.is_online
        return (
          <div
            key={user.id}
            className={`contact-item ${selectedUserId === user.id ? 'active' : ''}`}
            onClick={() => onSelectUser(user)}
          >
            {user.username} {isOnline && <span className="online-dot" title="Online">🟢</span>}
          </div>
        )
      })}
    </div>
  )
}
export default ContactsList
