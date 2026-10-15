import { useEffect, useState } from 'react'

/** 주소창의 #/... 부분을 라우트로 쓴다. 링크를 그대로 공유할 수 있고 서버 설정이 필요 없다. */
export function useHashRoute(): string[] {
  const read = () => window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  const [parts, setParts] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setParts(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return parts
}

type AsyncState<T> = { data: T | null; error: boolean; loading: boolean }

/** deps가 바뀔 때마다 load를 다시 호출하고, 늦게 도착한 이전 응답은 버린다. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: false, loading: true })
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: false }))
    load()
      .then((data) => alive && setState({ data, error: false, loading: false }))
      .catch(() => alive && setState({ data: null, error: true, loading: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
