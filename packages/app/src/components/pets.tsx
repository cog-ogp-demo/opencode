import { For, createMemo, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useSettings } from "@/context/settings"

// A playful overlay of animated pets that wander around the app, inspired by
// the Codex pets easter egg. Pets pick random targets, walk toward them with a
// little bob, idle for a beat, then move on. Clicking a pet makes it hop.
//
// The overlay is pointer-events: none so it never blocks the UI; only the pet
// sprites themselves capture clicks.

const SPECIES = ["🐱", "🐶", "🐉", "🐰"] as const

const SPEED = 70 // px per second
const MARGIN_X = 24
const MARGIN_TOP = 88 // keep clear of the titlebar/tab strip
const MARGIN_BOTTOM = 24
const SPRITE = 30 // px

interface Pet {
  emoji: string
  x: number
  y: number
  targetX: number
  targetY: number
  facing: number // 1 = right, -1 = left
  walking: boolean
  hopping: boolean
  idleUntil: number
}

function viewport() {
  if (typeof window === "undefined") return { w: 1280, h: 800 }
  return { w: window.innerWidth, h: window.innerHeight }
}

function randomTarget() {
  const { w, h } = viewport()
  return {
    x: MARGIN_X + Math.random() * Math.max(1, w - MARGIN_X * 2 - SPRITE),
    y: MARGIN_TOP + Math.random() * Math.max(1, h - MARGIN_TOP - MARGIN_BOTTOM - SPRITE),
  }
}

function createPet(emoji: string): Pet {
  const start = randomTarget()
  const target = randomTarget()
  return {
    emoji,
    x: start.x,
    y: start.y,
    targetX: target.x,
    targetY: target.y,
    facing: target.x >= start.x ? 1 : -1,
    walking: true,
    hopping: false,
    idleUntil: 0,
  }
}

export function Pets() {
  const settings = useSettings()
  const enabled = createMemo(() => settings.general.showPets())

  const reducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false

  const [pets, setPets] = createStore<Pet[]>(SPECIES.map(createPet))

  let frame = 0
  let last = 0

  const step = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0
    last = now

    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i]
      if (pet.hopping) continue

      if (!pet.walking) {
        if (now >= pet.idleUntil) {
          const target = randomTarget()
          setPets(i, {
            targetX: target.x,
            targetY: target.y,
            facing: target.x >= pet.x ? 1 : -1,
            walking: true,
          })
        }
        continue
      }

      const dx = pet.targetX - pet.x
      const dy = pet.targetY - pet.y
      const dist = Math.hypot(dx, dy)

      if (dist < 4) {
        setPets(i, { walking: false, idleUntil: now + 1000 + Math.random() * 3000 })
        continue
      }

      const move = Math.min(dist, SPEED * dt)
      setPets(i, {
        x: pet.x + (dx / dist) * move,
        y: pet.y + (dy / dist) * move,
        facing: dx >= 0 ? 1 : -1,
      })
    }

    frame = requestAnimationFrame(step)
  }

  onMount(() => {
    if (reducedMotion) return
    frame = requestAnimationFrame(step)

    const onResize = () => {
      const { w, h } = viewport()
      for (let i = 0; i < pets.length; i++) {
        setPets(i, {
          x: Math.min(pets[i].x, w - MARGIN_X - SPRITE),
          y: Math.min(pets[i].y, h - MARGIN_BOTTOM - SPRITE),
        })
      }
    }
    window.addEventListener("resize", onResize)
    onCleanup(() => window.removeEventListener("resize", onResize))
  })

  onCleanup(() => cancelAnimationFrame(frame))

  const hop = (index: number) => {
    if (pets[index].hopping) return
    setPets(index, { hopping: true, walking: false })
    setTimeout(() => setPets(index, { hopping: false, idleUntil: performance.now() + 400 }), 520)
  }

  return (
    <div data-component="pets" class="pointer-events-none fixed inset-0 z-20 overflow-hidden" aria-hidden="true">
      <For each={enabled() ? pets : []}>
        {(pet, index) => (
          <button
            type="button"
            tabindex="-1"
            class="pointer-events-auto absolute left-0 top-0 cursor-pointer border-0 bg-transparent p-0 select-none"
            style={{
              transform: `translate3d(${pet.x}px, ${pet.y}px, 0)`,
              "line-height": "1",
              "font-size": `${SPRITE}px`,
              filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.35))",
            }}
            onClick={() => hop(index())}
          >
            <span style={{ display: "inline-block", transform: `scaleX(${pet.facing})` }}>
              <span
                data-pet-sprite
                style={{ display: "inline-block" }}
                classList={{ "pet-walk": pet.walking, "pet-hop": pet.hopping }}
              >
                {pet.emoji}
              </span>
            </span>
          </button>
        )}
      </For>
    </div>
  )
}

export default Pets
