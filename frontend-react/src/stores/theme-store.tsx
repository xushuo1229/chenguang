import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark'
export type Density = 'comfortable' | 'compact'

type ThemeState = {
  theme: Theme
  density: Density
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setDensity: (density: Density) => void
}

const THEME_KEY = 'zeno_theme'
const DENSITY_KEY = 'zeno_density'

const ThemeContext = createContext<ThemeState | null>(null)

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'dark' || stored === 'light' ? stored : systemTheme()
}

function initialDensity(): Density {
  return localStorage.getItem(DENSITY_KEY) === 'compact'
    ? 'compact'
    : 'comfortable'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)
  const [density, setDensityState] = useState<Density>(initialDensity)

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.density = density === 'compact' ? 'compact' : 'comfortable'
    localStorage.setItem(DENSITY_KEY, density)
  }, [density])

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      density,
      setTheme: setThemeState,
      toggleTheme: () =>
        setThemeState((current) => (current === 'dark' ? 'light' : 'dark')),
      setDensity: setDensityState,
    }),
    [theme, density],
  )

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

export function useTheme(): ThemeState {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
