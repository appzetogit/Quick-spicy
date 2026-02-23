// CSS-only AnimatedPage - no GSAP dependency
import { useEffect, useRef } from "react"

export default function AnimatedPage({ children, className = "" }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Simple fade-in using CSS
    container.style.opacity = '0'
    container.style.transform = 'translateY(20px)'
    
    // Trigger animation on next frame
    requestAnimationFrame(() => {
      container.style.opacity = '1'
      container.style.transform = 'translateY(0)'
    })
  }, [])

  return (
    <div ref={containerRef} className={`${className}  md:pb-0`}>
      {children}
    </div>
  )
}
