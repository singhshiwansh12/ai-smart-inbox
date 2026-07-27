import { useState } from 'react'
const BACKEND_HTTP = 'http://localhost:8000'

function Login({ onLoginSuccess }) {
  const [isSignup, setIsSignup] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    setError('')
    const endpoint = isSignup ? '/signup' : '/login'

    try {
      const res = await fetch(`${BACKEND_HTTP}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const errData = await res.json()
        setError(errData.detail || 'Something went wrong')
        return
      }

      const data = await res.json()
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      onLoginSuccess(data.user, data.access_token)
    } catch (err) {
      setError('Server se connect nahi ho paya')
    }
  }

  return (
    <div className="auth-container">
      <h1>🧠 AI Smart Inbox</h1>
      <h2>{isSignup ? 'Sign Up' : 'Login'}</h2>

      <input
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error && <p className="error-text">{error}</p>}

      <button onClick={handleSubmit}>{isSignup ? 'Sign Up' : 'Login'}</button>

      <p className="switch-text" onClick={() => setIsSignup(!isSignup)}>
        {isSignup ? 'Already have an account? Login' : "New here? Sign Up"}
      </p>
    </div>
  )
}
export default Login
