import React, { useEffect, useRef, useState } from 'react'

interface LayoutProps {
  children: React.ReactNode
  currentScreen: 'home' | 'scanning' | 'results' | 'settings'
  onNavigate: (screen: 'home' | 'scanning' | 'results' | 'settings') => void
}

export default function Layout({ children, currentScreen }: LayoutProps) {
  const scrollRef = useRef<HTMLElement | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const [thumbHeight, setThumbHeight] = useState(0)
  const [thumbTop, setThumbTop] = useState(0)
  const [hasOverflow, setHasOverflow] = useState(false)

  const updateScrollbar = () => {
    const node = scrollRef.current
    if (!node) return

    const { clientHeight, scrollHeight, scrollTop } = node
    const overflow = scrollHeight > clientHeight + 1
    setHasOverflow(overflow)

    if (!overflow) {
      setThumbHeight(0)
      setThumbTop(0)
      return
    }

    const nextThumbHeight = Math.max(40, (clientHeight * clientHeight) / scrollHeight)
    const maxThumbTop = clientHeight - nextThumbHeight
    const maxScrollTop = scrollHeight - clientHeight
    const nextThumbTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxThumbTop : 0

    setThumbHeight(nextThumbHeight)
    setThumbTop(nextThumbTop)
  }

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return

    const handleScroll = () => {
      updateScrollbar()
      setIsScrolling(true)

      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
      }

      hideTimerRef.current = window.setTimeout(() => {
        setIsScrolling(false)
      }, 700)
    }

    updateScrollbar()
    node.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', updateScrollbar)

    const resizeObserver = new ResizeObserver(() => {
      updateScrollbar()
    })
    resizeObserver.observe(node)

    return () => {
      node.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', updateScrollbar)
      resizeObserver.disconnect()
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    updateScrollbar()
  }, [currentScreen])

  return (
    <div className="app-shell relative h-screen overflow-hidden bg-surface font-body text-on-surface">
      <div className="app-drag-region absolute top-0 left-0 right-0 z-10 h-8" />
      <div className="absolute inset-x-0 bottom-3 top-8">
        <main
          ref={scrollRef}
          className="app-scrollbar h-full overflow-y-auto bg-surface px-6 pt-8 pb-8 md:px-12 lg:px-20"
        >
          {children}
        </main>
        {hasOverflow && (
          <div className="pointer-events-none absolute bottom-2 right-1 top-2 w-3">
            <div
              className="absolute right-0 w-3 rounded-full border-3 border-surface transition-opacity duration-200"
              style={{
                top: `${thumbTop}px`,
                height: `${thumbHeight}px`,
                opacity: isScrolling ? 1 : 0,
                background: '#e9b7bf',
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
