import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { KeyEvent, RGBA } from "@opentui/core"
import { useTheme } from "../context/theme"

// A small playable Pac-Man for the opencode TUI, launched from the command
// palette (`/pacman`). Arrow keys or WASD move; eat every pellet to win, avoid
// the ghosts (or chase them while a power pellet is active). Esc quits.

const MAZE = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.###.#.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#..#.....G.....#..#",
  "#.##.#######.#.##.#",
  "#.......GGG.......#",
  "#.##.###.#.###.##.#",
  "#..#.....P.....#..#",
  "#.##.####.##.#.##.#",
  "#o......#.#......o#",
  "##.####.#.#.####.##",
  "#........#........#",
  "#.######.#.######.#",
  "#.................#",
  "###################",
] as const

const TICK = 170
const FRIGHT = 36
const GRACE = 18
const WALL = "█"
const PELLET = "·"
const POWER = "●"
const PLAYER_OPEN = "ᗧ"
const PLAYER_SHUT = "●"
const GHOST = "ᗣ"

type Cell = "wall" | "pellet" | "power" | "empty"
type Vec = { x: number; y: number }

const DIRS: Record<string, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

interface Ghost {
  x: number
  y: number
  home: Vec
  dir: keyof typeof DIRS
}

interface Game {
  width: number
  height: number
  cells: Cell[][]
  start: Vec
  player: Vec
  dir: keyof typeof DIRS
  next: keyof typeof DIRS
  ghosts: Ghost[]
  score: number
  lives: number
  fright: number
  pellets: number
  mouth: boolean
  grace: number
  frame: number
  status: "play" | "win" | "over"
}

function build(): Game {
  const height = MAZE.length
  const width = MAZE[0].length
  const cells: Cell[][] = []
  let start: Vec = { x: 1, y: 1 }
  const homes: Vec[] = []
  let pellets = 0

  for (let y = 0; y < height; y++) {
    const row: Cell[] = []
    for (let x = 0; x < width; x++) {
      const char = MAZE[y][x]
      if (char === "#") row.push("wall")
      else if (char === ".") {
        row.push("pellet")
        pellets++
      } else if (char === "o") {
        row.push("power")
        pellets++
      } else {
        row.push("empty")
        if (char === "P") start = { x, y }
        if (char === "G") homes.push({ x, y })
      }
    }
    cells.push(row)
  }

  return {
    width,
    height,
    cells,
    start,
    player: { ...start },
    dir: "left",
    next: "left",
    ghosts: homes.slice(0, 4).map((home) => ({ x: home.x, y: home.y, home, dir: "up" })),
    score: 0,
    lives: 3,
    fright: 0,
    pellets,
    mouth: true,
    grace: GRACE,
    frame: 0,
    status: "play",
  }
}

export function Pacman(props: { onExit: () => void }) {
  const { theme } = useTheme()
  let game = build()
  const [frame, setFrame] = createSignal(0)
  const render = () => setFrame((value) => value + 1)

  const wrap = (value: number, max: number) => (value < 0 ? max - 1 : value >= max ? 0 : value)
  const free = (x: number, y: number) => game.cells[y]?.[x] !== undefined && game.cells[y][x] !== "wall"

  const moveFrom = (x: number, y: number, dir: keyof typeof DIRS) => {
    const nx = wrap(x + DIRS[dir].x, game.width)
    const ny = wrap(y + DIRS[dir].y, game.height)
    return free(nx, ny) ? { x: nx, y: ny } : undefined
  }

  const reset = () => {
    game.player = { ...game.start }
    game.dir = "left"
    game.next = "left"
    game.fright = 0
    game.grace = GRACE
    for (const ghost of game.ghosts) {
      ghost.x = ghost.home.x
      ghost.y = ghost.home.y
      ghost.dir = "up"
    }
  }

  const collide = () => {
    for (const ghost of game.ghosts) {
      if (ghost.x !== game.player.x || ghost.y !== game.player.y) continue
      if (game.fright > 0) {
        game.score += 200
        ghost.x = ghost.home.x
        ghost.y = ghost.home.y
        ghost.dir = "up"
        continue
      }
      game.lives -= 1
      if (game.lives <= 0) {
        game.status = "over"
        return
      }
      reset()
      return
    }
  }

  const stepGhost = (ghost: Ghost) => {
    const opposite: Record<keyof typeof DIRS, keyof typeof DIRS> = {
      up: "down",
      down: "up",
      left: "right",
      right: "left",
    }
    const options = Object.keys(DIRS).filter(
      (dir) => dir !== opposite[ghost.dir] && moveFrom(ghost.x, ghost.y, dir),
    )
    const choices = options.length > 0 ? options : Object.keys(DIRS).filter((dir) => moveFrom(ghost.x, ghost.y, dir))
    if (choices.length === 0) return

    const pick =
      game.fright > 0 || game.grace > 0
        ? choices[Math.floor(Math.random() * choices.length)]
        : choices.reduce((best, dir) => {
            const move = moveFrom(ghost.x, ghost.y, dir)!
            const bestMove = moveFrom(ghost.x, ghost.y, best)!
            const dist = Math.abs(move.x - game.player.x) + Math.abs(move.y - game.player.y)
            const bestDist = Math.abs(bestMove.x - game.player.x) + Math.abs(bestMove.y - game.player.y)
            return dist < bestDist ? dir : best
          }, choices[0])

    const moved = moveFrom(ghost.x, ghost.y, pick)!
    ghost.x = moved.x
    ghost.y = moved.y
    ghost.dir = pick
  }

  const tick = () => {
    if (game.status !== "play") return

    const turned = moveFrom(game.player.x, game.player.y, game.next)
    if (turned) game.dir = game.next
    const moved = turned ?? moveFrom(game.player.x, game.player.y, game.dir)
    if (moved) {
      game.player = moved
      game.mouth = !game.mouth
    }

    const cell = game.cells[game.player.y][game.player.x]
    if (cell === "pellet") {
      game.cells[game.player.y][game.player.x] = "empty"
      game.score += 10
      game.pellets -= 1
    } else if (cell === "power") {
      game.cells[game.player.y][game.player.x] = "empty"
      game.score += 50
      game.pellets -= 1
      game.fright = FRIGHT
    }

    if (game.pellets <= 0) {
      game.status = "win"
      render()
      return
    }

    game.frame += 1
    collide()
    // Ghosts move slightly slower than the player (3 of every 4 ticks) and
    // wander harmlessly during the opening grace period.
    if (game.status === "play" && game.frame % 4 !== 0) {
      for (const ghost of game.ghosts) stepGhost(ghost)
      collide()
    }
    if (game.grace > 0) game.grace -= 1
    if (game.fright > 0) game.fright -= 1
    render()
  }

  onMount(() => {
    const handle = setInterval(tick, TICK)
    handle.unref?.()
    onCleanup(() => clearInterval(handle))
  })

  useKeyboard((evt: KeyEvent) => {
    const name = evt.name
    if (name === "up" || name === "w") game.next = "up"
    else if (name === "down" || name === "s") game.next = "down"
    else if (name === "left" || name === "a") game.next = "left"
    else if (name === "right" || name === "d") game.next = "right"
    else if (name === "r") {
      game = build()
      render()
    } else if (name === "q") props.onExit()
  })

  const ghostColors = (): RGBA[] => [theme.error, theme.accent, theme.success, theme.primary]

  const view = createMemo(() => {
    frame()
    const grid: { char: string; color: RGBA }[][] = game.cells.map((row) =>
      row.map((cell) => {
        if (cell === "wall") return { char: WALL, color: theme.info }
        if (cell === "pellet") return { char: PELLET, color: theme.textMuted }
        if (cell === "power") return { char: POWER, color: theme.warning }
        return { char: " ", color: theme.textMuted }
      }),
    )

    game.ghosts.forEach((ghost, index) => {
      grid[ghost.y][ghost.x] = {
        char: GHOST,
        color: game.fright > 0 ? theme.info : ghostColors()[index % 4],
      }
    })

    grid[game.player.y][game.player.x] = {
      char: game.mouth ? PLAYER_OPEN : PLAYER_SHUT,
      color: theme.warning,
    }

    const rows = grid.map((row) => {
      const runs: { text: string; color: RGBA }[] = []
      for (const cell of row) {
        const last = runs.at(-1)
        if (last && last.color === cell.color) last.text += cell.char
        else runs.push({ text: cell.char, color: cell.color })
      }
      return runs
    })

    return { rows, score: game.score, lives: game.lives, status: game.status }
  })

  return (
    <box flexDirection="column" alignItems="center" paddingLeft={2} paddingRight={2} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between" width={game.width}>
        <text fg={theme.text}>SCORE {String(view().score).padStart(4, "0")}</text>
        <text fg={theme.warning}>{PLAYER_OPEN.repeat(Math.max(0, view().lives))}</text>
      </box>
      <For each={view().rows}>
        {(runs) => (
          <box flexDirection="row">
            <For each={runs}>{(run) => <text fg={run.color} selectable={false}>{run.text}</text>}</For>
          </box>
        )}
      </For>
      <Show when={view().status !== "play"}>
        <text fg={view().status === "win" ? theme.success : theme.error}>
          {view().status === "win" ? "YOU WIN!  press r to play again" : "GAME OVER  press r to play again"}
        </text>
      </Show>
      <text fg={theme.textMuted}>arrows / wasd move · r restart · esc quit</text>
    </box>
  )
}
