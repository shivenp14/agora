import { useState, useEffect } from 'react'
import HomeScreen from './screens/HomeScreen'
import ScanningScreen from './screens/ScanningScreen'
import ResultsScreen from './screens/ResultsScreen'
import SettingsScreen from './screens/SettingsScreen'
import { useScan } from './hooks/useScan'

import Layout from './components/layout/Layout'

type Screen = 'home' | 'scanning' | 'results' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const scan = useScan()
  const hydrateResult = scan.hydrateResult

  useEffect(() => {
    let active = true

    const restoreCachedScan = async () => {
      try {
        const cached = await window.api.getCachedScan()
        if (!active) return
        if (cached) {
          hydrateResult(cached)
          setScreen('results')
        }
      } catch (error) {
        console.error('Failed to restore cached scan:', error)
      } finally {
        if (active) setIsBootstrapping(false)
      }
    }

    void restoreCachedScan()

    return () => {
      active = false
    }
  }, [hydrateResult])

  useEffect(() => {
    if (isBootstrapping) return

    if (scan.state === 'scanning' || scan.state === 'error') {
      setScreen('scanning')
    }
    if (scan.state === 'done') {
      setScreen('results')
    }
  }, [isBootstrapping, scan.state, scan.events])

  const handleNavigate = (nextScreen: Screen) => {
    if (nextScreen === 'home') {
      setScreen(scan.state === 'done' ? 'results' : 'home')
      return
    }

    setScreen(nextScreen)
  }

  const beginScan = (forceRefresh = false) => {
    setScreen('scanning')
    void scan.startScan(forceRefresh)
  }

  if (isBootstrapping) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          background:
            'radial-gradient(circle at top, rgba(255, 218, 218, 0.72), transparent 38%), #f8f9fa',
          color: '#191c1d',
          fontFamily: '"Inter", sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '520px',
            borderRadius: '28px',
            padding: '28px 32px',
            backgroundColor: 'rgba(255, 255, 255, 0.88)',
            boxShadow: '0 24px 40px rgba(25, 28, 29, 0.05)',
            border: '1px solid rgba(223, 191, 191, 0.65)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '12px',
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#006350',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '999px',
                backgroundColor: '#006350',
              }}
            />
            Loading
          </div>
          <div
            style={{
              fontFamily: '"Manrope", sans-serif',
              fontSize: '34px',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.03em',
            }}
          >
            Loading today&apos;s feed...
          </div>
        </div>
      </div>
    )
  }

  return (
    <Layout currentScreen={screen} onNavigate={handleNavigate}>
      {screen === 'home' && (
        <HomeScreen
          onScan={() => beginScan()}
          onSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'scanning' && (
        <ScanningScreen
          state={scan.state}
          progress={scan.progress}
          error={scan.error}
          onCancel={() => {
            setScreen('home')
            scan.cancelScan()
          }}
          onRetry={() => {
            beginScan(true)
          }}
          onBack={() => {
            setScreen('home')
            scan.reset()
          }}
        />
      )}
      {screen === 'results' && (
        <ResultsScreen
          events={scan.events}
          foodEvents={scan.foodEvents}
          fromCache={scan.fromCache}
          onSettings={() => setScreen('settings')}
          onRefresh={() => {
            beginScan(true)
          }}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen onBack={() => handleNavigate('home')} />
      )}
    </Layout>
  )
}
