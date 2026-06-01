import { useState, useEffect, useCallback } from 'react'

const STORAGE_PREFIX = 'toki:'

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void] {
  const storageKey = `${STORAGE_PREFIX}${key}`

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
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }, [storageKey, value])

  const setStoredValue = useCallback((next: T | ((prev: T) => T)) => {
    setValue(next)
  }, [])

  return [value, setStoredValue]
}
