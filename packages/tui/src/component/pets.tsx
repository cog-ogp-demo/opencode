import { For, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import { useTerminalDimensions } from "@opentui/solid"
import type { MouseEvent } from "@opentui/core"
import { useTheme } from "../context/theme"

// A playful overlay of little ASCII-art pets that wander the terminal, inspired
// by the Codex pets easter egg. Each pet is drawn over a few rows, walks toward
// a random spot with an alternating-leg gait, idles for a beat, then moves on.
// Click a pet to make it hop. Disable with OPENCODE_DISABLE_PETS.

const TICK = 140
const HOP_TICKS = 5

const SPECIES = [
  {
    // cat
    color: "accent",
    walk: [
      [" /\\_/\\", "( o.o )", "  u u"],
      [" /\\_/\\", "( o.o )", " u   u"],
    ],
    hop: [" /\\_/\\", "(\\^o^/)", "  U U"],
  },
  {
    // dog
    color: "primary",
    walk: [
      [" /^ ^\\", "( o.o )", "  U U"],
      [" /^ ^\\", "( o.o )", " U   U"],
    ],
    hop: [" /^ ^\\", "(\\^o^/)", "  U U"],
  },
  {
    // dragon
    color: "success",
    walk: [
      [" //^\\\\", "( o.o )", " /| |\\"],
      [" //^\\\\", "( o.o )", " \\| |/"],
    ],
    hop: [" \\\\^//", "(\\o o/)", "  ^ ^"],
  },
  {
    // bunny
    color: "warning",
    walk: [
      [" (\\_/)", "( o.o )", "  u u"],
      [" (\\_/)", "( o.o )", " u   u"],
    ],
    hop: [" (\\_/)", "(\\^-^/)", "  u u"],
  },
] as const

const SPRITE_W = 7
const SPRITE_H = 3

interface Pet {
  species: number
  x: number
  y: number
  targetX: number
  targetY: number
  step: number
  idle: number
  hop: number
}

function sign(value: number) {
  return value > 0 ? 1 : value < 0 ? -1 : 0
}

function leading(line: string) {
  return line.length - line.trimStart().length
}

export function Pets() {
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  const bounds = () => ({
    minX: 1,
    maxX: Math.max(2, dimensions().width - SPRITE_W - 1),
    minY: 1,
    maxY: Math.max(2, dimensions().height - SPRITE_H - 1),
  })

  function randomTarget() {
    const b = bounds()
    return {
      x: Math.floor(Math.random() * (b.maxX - b.minX)) + b.minX,
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
        step: 0,
        idle: Math.floor(Math.random() * 10),
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
        setPets(i, { targetX: next.x, targetY: next.y, idle: Math.floor(Math.random() * 12) + 4 })
        continue
      }

      setPets(i, {
        x: pet.x + sign(pet.targetX - pet.x),
        y: pet.y + sign(pet.targetY - pet.y),
        step: pet.step ^ 1,
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
    setPets(index, "hop", HOP_TICKS)
  }

  return (
    <For each={pets}>
      {(pet, index) => {
        const frame = () => {
          const species = SPECIES[pet.species]
          if (pet.hop > 0) return species.hop
          return species.walk[pet.idle > 0 ? 0 : pet.step]
        }
        const color = () => theme[SPECIES[pet.species].color]
        return (
          <For each={[0, 1, 2]}>
            {(rowIndex) => {
              const line = () => frame()[rowIndex] ?? ""
              return (
                <box
                  position="absolute"
                  left={pet.x + leading(line())}
                  top={(pet.hop > 0 ? pet.y - 1 : pet.y) + rowIndex}
                  zIndex={60}
                  onMouseDown={(evt: MouseEvent) => {
                    evt.preventDefault()
                    evt.stopPropagation()
                    hop(index())
                  }}
                >
                  <text fg={color()} selectable={false}>
                    {line().trim()}
                  </text>
                </box>
              )
            }}
          </For>
        )
      }}
    </For>
  )
}
