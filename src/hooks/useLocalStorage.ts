import { useState, useEffect, useCallback, useRef } from 'react'

const STORAGE_PREFIX = 'toki:'

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `${STORAGE_PREFIX}${key}`
  const isWritable = useRef(true)

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored !== null) {
        return JSON.parse(stored) as T
      }
    } catch {
      // Fall through to initial value
    }
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue
  })

  useEffect(() => {
    if (!isWritable.current) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }, [storageKey, value])

  // Stop writing if the page is about to unload (prevents re-persisting after a reset clear)
  useEffect(() => {
    const handleBeforeUnload = () => { isWritable.current = false }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const setStoredValue = useCallback((next: T | ((prev: T) => T)) => {
    setValue(next)
  }, [])

  return [value, setStoredValue]
}
