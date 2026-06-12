import { For, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useTerminalDimensions } from "@opentui/solid"
import type { MouseEvent } from "@opentui/core"
import { useTheme } from "../context/theme"

// A playful overlay of little ASCII pets that wander the terminal, inspired by
// the Codex pets easter egg. Each pet walks toward a random spot, idles for a
// beat, then moves on. Click a pet to make it hop. Disable with
// OPENCODE_DISABLE_PETS.

const WIDTH = 7
const TICK = 130
const HOP = "\\(^o^)/"

const SPECIES = [
  { right: "(>^.^)>", left: "<(^.^<)", color: "accent" },
  { right: "(>owo)>", left: "<(owo<)", color: "primary" },
  { right: "(>~o~)>", left: "<(~o~<)", color: "success" },
  { right: "(>'x')>", left: "<('x'<)", color: "warning" },
] as const

interface Pet {
  species: number
  x: number
  y: number
  targetX: number
  targetY: number
  facing: number
  idle: number
  hop: number
}

function sign(value: number) {
  return value > 0 ? 1 : value < 0 ? -1 : 0
}

export function Pets() {
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  const bounds = () => ({
    maxX: Math.max(1, dimensions().width - WIDTH - 1),
    minY: 1,
    maxY: Math.max(2, dimensions().height - 2),
  })

  function randomTarget() {
    const b = bounds()
    return {
      x: Math.floor(Math.random() * b.maxX) + 1,
      y: Math.floor(Math.random() * (b.maxY - b.minY)) + b.minY,
    }
  }

  const [pets, setPets] = createStore<Pet[]>(
    SPECIES.map((_, species) => {
      const start = randomTarget()
      const target = randomTarget()
      return {
        species,
        x: start.x,
        y: start.y,
        targetX: target.x,
        targetY: target.y,
        facing: target.x >= start.x ? 1 : -1,
        idle: Math.floor(Math.random() * 8),
        hop: 0,
      }
    }),
  )

  const tick = () => {
    for (let i = 0; i < pets.length; i++) {
      const pet = pets[i]

      if (pet.hop > 0) {
        setPets(i, "hop", pet.hop - 1)
        continue
      }

      if (pet.idle > 0) {
        setPets(i, "idle", pet.idle - 1)
        continue
      }

      if (pet.x === pet.targetX && pet.y === pet.targetY) {
        const next = randomTarget()
        setPets(i, { targetX: next.x, targetY: next.y, idle: Math.floor(Math.random() * 10) + 3 })
        continue
      }

      const dx = sign(pet.targetX - pet.x)
      const dy = sign(pet.targetY - pet.y)
      setPets(i, {
        x: pet.x + dx,
        y: pet.y + dy,
        facing: dx !== 0 ? dx : pet.facing,
      })
    }
  }

  onMount(() => {
    const handle = setInterval(tick, TICK)
    handle.unref?.()
    onCleanup(() => clearInterval(handle))
  })

  const hop = (index: number) => {
    if (pets[index].hop > 0) return
    setPets(index, "hop", 4)
  }

  return (
    <For each={pets}>
      {(pet, index) => {
        const sprite = () => SPECIES[pet.species]
        const glyph = () => (pet.hop > 0 ? HOP : pet.facing >= 0 ? sprite().right : sprite().left)
        const color = () => theme[sprite().color]
        const row = () => Math.max(0, pet.hop > 0 ? pet.y - 1 : pet.y)
        return (
          <box
            position="absolute"
            left={pet.x}
            top={row()}
            width={WIDTH}
            height={1}
            zIndex={60}
            onMouseDown={(evt: MouseEvent) => {
              evt.preventDefault()
              evt.stopPropagation()
              hop(index())
            }}
          >
            <text fg={color()} selectable={false}>
              {glyph()}
            </text>
          </box>
        )
      }}
    </For>
  )
}
