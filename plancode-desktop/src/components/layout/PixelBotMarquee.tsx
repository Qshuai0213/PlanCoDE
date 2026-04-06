import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

const ROBOT_CELLS = [
  '00111100',
  '01111110',
  '11011011',
  '11111111',
  '10111101',
  '00100100',
  '01100110',
  '11000011',
]

const PIXEL_COUNT = 20
const CLICK_THRESHOLD = 5

function buildParticles() {
  return Array.from({ length: PIXEL_COUNT }, (_, index) => {
    const angle = (Math.PI * 2 * index) / PIXEL_COUNT
    const distance = 24 + (index % 5) * 11
    return {
      id: index,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      delay: (index % 4) * 22,
      size: 5 + (index % 3),
    }
  })
}

export function PixelBotMarquee() {
  const [clickCount, setClickCount] = useState(0)
  const [isTapped, setIsTapped] = useState(false)
  const [isTriggered, setIsTriggered] = useState(false)
  const [isExploding, setIsExploding] = useState(false)
  const [frozenLeft, setFrozenLeft] = useState<number | null>(null)
  const particles = useMemo(() => buildParticles(), [])
  const stageRef = useRef<HTMLDivElement | null>(null)
  const walkerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isTapped || isTriggered) return
    const timer = window.setTimeout(() => setIsTapped(false), 220)
    return () => window.clearTimeout(timer)
  }, [isTapped, isTriggered])

  useEffect(() => {
    if (!clickCount || isTriggered) return
    const timer = window.setTimeout(() => setClickCount(0), 900)
    return () => window.clearTimeout(timer)
  }, [clickCount, isTriggered])

  useEffect(() => {
    if (clickCount < CLICK_THRESHOLD || isTriggered) return
    const stageRect = stageRef.current?.getBoundingClientRect()
    const walkerRect = walkerRef.current?.getBoundingClientRect()
    if (stageRect && walkerRect) {
      setFrozenLeft(walkerRect.left - stageRect.left)
    }
    setIsExploding(true)
    setIsTriggered(true)
    const timer = window.setTimeout(() => setIsExploding(false), 760)
    return () => window.clearTimeout(timer)
  }, [clickCount, isTriggered])

  return (
    <div ref={stageRef} className={`pixel-bot-stage ${isTriggered ? 'is-triggered' : ''}`} aria-hidden="true">
      <div
        ref={walkerRef}
        className={`pixel-bot-walker ${isTriggered ? 'is-triggered' : ''} ${isTapped ? 'is-tapped' : ''}`}
        style={isTriggered && frozenLeft != null ? { left: `${frozenLeft}px` } : undefined}
      >
        <button
          type="button"
          className={`pixel-bot ${isTriggered ? 'is-triggered' : ''} ${isExploding ? 'is-exploding' : ''} ${isTapped ? 'is-tapped' : ''}`}
          onClick={() => {
            if (!isTriggered) {
              setIsTapped(true)
            }
            setClickCount((current) => current + 1)
          }}
          title={isTriggered ? '像素机器人已进入待机跳跃状态' : '连续点几下试试'}
        >
          <span className="pixel-bot-shadow" />
          <span className="pixel-bot-spark" />
          <span className="pixel-bot-grid">
            {ROBOT_CELLS.flatMap((row, rowIndex) =>
              row.split('').map((cell, colIndex) => (
                <span
                  key={`${rowIndex}-${colIndex}`}
                  className={`pixel-bot-cell ${cell === '1' ? 'is-filled' : ''}`}
                  style={{
                    gridColumn: colIndex + 1,
                    gridRow: rowIndex + 1,
                  }}
                />
              )),
            )}
          </span>

          {isExploding && (
            <span className="pixel-bot-burst">
              {particles.map((particle) => (
                <span
                  key={particle.id}
                  className="pixel-bot-fragment"
                  style={
                    {
                      '--fragment-x': `${particle.x}px`,
                      '--fragment-y': `${particle.y}px`,
                      '--fragment-delay': `${particle.delay}ms`,
                      '--fragment-size': `${particle.size}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
