import { useEffect, useState } from 'react'
import './App.css'

type Health = { status: string }

function App() {
  const [health, setHealth] = useState<string>('확인 중...')

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json() as Promise<Health>)
      .then((data) => setHealth(data.status))
      .catch(() => setHealth('백엔드에 연결할 수 없음'))
  }, [])

  return (
    <>
      <h1>React + FastAPI</h1>
      <p>백엔드 상태: {health}</p>
    </>
  )
}

export default App
