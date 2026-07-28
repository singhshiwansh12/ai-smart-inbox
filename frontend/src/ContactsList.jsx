import { useState, useEffect } from 'react'
const BACKEND_HTTP = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

function ContactsList({ token, onSelectUser, selectedUser, onlineUsers }) {
  const [users, setUsers] = useState([])
  const [groups, setGroups] = useState([])
  const [isCreatingGroup, setIsCreatingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedMembers, setSelectedMembers] = useState(new Set())

  const fetchData = async () => {
    try {
      const uRes = await fetch(`${BACKEND_HTTP}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (uRes.ok) setUsers(await uRes.json())
      
      const gRes = await fetch(`${BACKEND_HTTP}/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (gRes.ok) setGroups(await gRes.json())
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    fetchData()
  }, [token])

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedMembers.size === 0) return
    try {
      const res = await fetch(`${BACKEND_HTTP}/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: groupName,
          member_ids: Array.from(selectedMembers)
        })
      })
      if (res.ok) {
        setIsCreatingGroup(false)
        setGroupName('')
        setSelectedMembers(new Set())
        fetchData()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const toggleMember = (id) => {
    const newMembers = new Set(selectedMembers)
    if (newMembers.has(id)) newMembers.delete(id)
    else newMembers.add(id)
    setSelectedMembers(newMembers)
  }

  return (
    <div className="contacts-list">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
        <h3 style={{margin: 0}}>Groups</h3>
        <button className="create-group-btn" onClick={() => setIsCreatingGroup(!isCreatingGroup)}>
          {isCreatingGroup ? 'Cancel' : '+ New Group'}
        </button>
      </div>

      {isCreatingGroup && (
        <div className="create-group-form">
          <input 
            type="text" 
            placeholder="Group Name" 
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <div className="member-selection">
            {users.map(u => (
              <label key={u.id} className="member-checkbox">
                <input 
                  type="checkbox" 
                  checked={selectedMembers.has(u.id)}
                  onChange={() => toggleMember(u.id)}
                />
                {u.username}
              </label>
            ))}
          </div>
          <button onClick={handleCreateGroup} disabled={!groupName || selectedMembers.size === 0}>
            Create
          </button>
        </div>
      )}

      {groups.length === 0 && !isCreatingGroup && <p className="empty-text">No groups yet.</p>}
      {groups.map((group) => (
        <div
          key={`g_${group.id}`}
          className={`contact-item ${selectedUser?.is_group && selectedUser?.id === group.id ? 'active' : ''}`}
          onClick={() => onSelectUser({ ...group, is_group: true })}
        >
          👥 {group.name}
        </div>
      ))}

      <h3 style={{marginTop: '20px'}}>Direct Messages</h3>
      {users.length === 0 && <p className="empty-text">No other users available.</p>}
      {users.map((user) => {
        const isOnline = onlineUsers.has(user.id) || user.is_online
        return (
          <div
            key={`u_${user.id}`}
            className={`contact-item ${!selectedUser?.is_group && selectedUser?.id === user.id ? 'active' : ''}`}
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
