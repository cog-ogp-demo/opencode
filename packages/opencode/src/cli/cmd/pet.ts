// A tiny virtual pet that lives alongside your opencode install.
//
// State persists in ~/.local/state/opencode/pet.json. Hunger, happiness, and
// energy decay over real time, so the pet's mood reflects how long it's been
// since you last checked in. Care for it with `feed`, `play`, and `rest`.
import path from "path"
import { Clock, Effect, Option, Schema } from "effect"
import type { Argv } from "yargs"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"

const PET_FILE = path.join(Global.Path.state, "pet.json")

const SPECIES = ["cat", "dog", "dragon", "bunny"] as const
const Species = Schema.Literals(SPECIES)

const PetSchema = Schema.Struct({
  name: Schema.String,
  species: Species,
  born: Schema.Number,
  updated: Schema.Number,
  hunger: Schema.Number,
  happiness: Schema.Number,
  energy: Schema.Number,
})
type Pet = typeof PetSchema.Type

// Points lost per real hour. Energy recovers via `rest`, the others via care.
const DECAY = { hunger: 8, happiness: 6, energy: 5 }

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

const average = (pet: Pet) => (pet.hunger + pet.happiness + pet.energy) / 3

function applyDecay(pet: Pet, now: number): Pet {
  const hours = Math.max(0, (now - pet.updated) / 3_600_000)
  return {
    ...pet,
    hunger: clamp(pet.hunger - hours * DECAY.hunger),
    happiness: clamp(pet.happiness - hours * DECAY.happiness),
    energy: clamp(pet.energy - hours * DECAY.energy),
    updated: now,
  }
}

const load = Effect.fn("Cli.pet.load")(function* () {
  const fs = yield* FSUtil.Service
  const raw = yield* fs.readJson(PET_FILE).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
  return Option.getOrUndefined(Schema.decodeUnknownOption(PetSchema)(raw))
})

const save = Effect.fn("Cli.pet.save")(function* (pet: Pet) {
  const fs = yield* FSUtil.Service
  yield* fs.writeJson(PET_FILE, pet).pipe(Effect.orDie)
})

const requirePet = Effect.fn("Cli.pet.require")(function* () {
  const pet = yield* load()
  if (!pet) return yield* fail("You don't have a pet yet. Adopt one with `opencode pet adopt <name>`.")
  return applyDecay(pet, yield* Clock.currentTimeMillis)
})

interface Mood {
  label: string
  eyes: string
  mouth: string
  color: string
  says: string
}

function mood(pet: Pet): Mood {
  if (pet.hunger <= 0 || pet.happiness <= 0 || pet.energy <= 0)
    return { label: "miserable", eyes: "x x", mouth: "o", color: UI.Style.TEXT_DANGER, says: "...please take care of me" }
  if (pet.energy < 20)
    return { label: "sleepy", eyes: "- -", mouth: "z", color: UI.Style.TEXT_DIM, says: "*yawn* so tired..." }
  if (pet.hunger < 25)
    return { label: "hungry", eyes: "o o", mouth: "~", color: UI.Style.TEXT_WARNING, says: "got any snacks?" }
  if (pet.happiness < 25)
    return { label: "sad", eyes: "T T", mouth: "_", color: UI.Style.TEXT_INFO, says: "let's play?" }
  if (average(pet) >= 75)
    return { label: "happy", eyes: "^ ^", mouth: "w", color: UI.Style.TEXT_SUCCESS, says: "you're the best!" }
  return { label: "content", eyes: "o o", mouth: "u", color: UI.Style.TEXT_NORMAL, says: "hey there!" }
}

const ART: Record<(typeof SPECIES)[number], (eyes: string, mouth: string) => string[]> = {
  cat: (e, m) => ["  /\\_/\\", ` ( ${e} )`, `  > ${m} <`],
  dog: (e, m) => ["  /^ ^\\__", ` ( ${e}   )`, `  \\ ${m}  /`, "   |___|"],
  dragon: (e, m) => ["   <>===<>", `  / ${e}  \\~`, `  \\  ${m}  /`, "   ^^---^^"],
  bunny: (e, m) => ["  (\\_/)", ` ( ${e} )`, `  ( ${m} )`, `  (")_(")`],
}

function bar(value: number): string {
  const filled = Math.round(value / 10)
  const color =
    value >= 60 ? UI.Style.TEXT_SUCCESS : value >= 30 ? UI.Style.TEXT_WARNING : UI.Style.TEXT_DANGER
  return (
    color +
    "█".repeat(filled) +
    UI.Style.TEXT_DIM +
    "░".repeat(10 - filled) +
    UI.Style.TEXT_NORMAL +
    ` ${String(value).padStart(3)}%`
  )
}

function ageLabel(born: number, now: number): string {
  const ms = Math.max(0, now - born)
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function render(pet: Pet, now: number) {
  const state = mood(pet)
  UI.empty()
  for (const line of ART[pet.species](state.eyes, state.mouth))
    UI.println(state.color + line + UI.Style.TEXT_NORMAL)
  UI.empty()
  UI.println(UI.Style.TEXT_NORMAL_BOLD + pet.name + UI.Style.TEXT_NORMAL + UI.Style.TEXT_DIM + ` the ${pet.species}` + UI.Style.TEXT_NORMAL)
  UI.println(state.color + `"${state.says}"` + UI.Style.TEXT_NORMAL)
  UI.empty()
  UI.println(`  Mood    ${state.color}${state.label}${UI.Style.TEXT_NORMAL}`)
  UI.println(`  Age     ${ageLabel(pet.born, now)}`)
  UI.println(`  Hunger  ${bar(pet.hunger)}`)
  UI.println(`  Happy   ${bar(pet.happiness)}`)
  UI.println(`  Energy  ${bar(pet.energy)}`)
  UI.empty()
}

export const PetCommand = effectCmd({
  command: "pet",
  describe: "check on your virtual pet",
  instance: false,
  builder: (yargs: Argv) =>
    yargs
      .command(PetAdoptCommand)
      .command(PetFeedCommand)
      .command(PetPlayCommand)
      .command(PetRestCommand)
      .command(PetReleaseCommand),
  handler: Effect.fn("Cli.pet")(function* () {
    const now = yield* Clock.currentTimeMillis
    const existing = yield* load()
    if (!existing) {
      UI.empty()
      UI.println("You don't have a pet yet.")
      UI.println("Adopt one with " + UI.Style.TEXT_HIGHLIGHT + "opencode pet adopt <name>" + UI.Style.TEXT_NORMAL)
      UI.println(UI.Style.TEXT_DIM + `Species: ${SPECIES.join(", ")}` + UI.Style.TEXT_NORMAL)
      UI.empty()
      return
    }
    const pet = applyDecay(existing, now)
    yield* save(pet)
    render(pet, now)
  }),
})

export const PetAdoptCommand = effectCmd({
  command: "adopt <name>",
  describe: "adopt a new pet",
  instance: false,
  builder: (yargs) =>
    yargs
      .positional("name", { describe: "name for your pet", type: "string", demandOption: true })
      .option("species", {
        describe: "kind of pet",
        type: "string",
        choices: SPECIES as unknown as string[],
        default: "cat",
      }),
  handler: Effect.fn("Cli.pet.adopt")(function* (args) {
    const now = yield* Clock.currentTimeMillis
    const previous = yield* load()
    const pet: Pet = {
      name: args.name,
      species: args.species as Pet["species"],
      born: now,
      updated: now,
      hunger: 80,
      happiness: 80,
      energy: 80,
    }
    yield* save(pet)
    UI.empty()
    if (previous) UI.println(UI.Style.TEXT_DIM + `You said goodbye to ${previous.name}.` + UI.Style.TEXT_NORMAL)
    UI.println(UI.Style.TEXT_SUCCESS_BOLD + `You adopted ${pet.name} the ${pet.species}!` + UI.Style.TEXT_NORMAL)
    render(pet, now)
  }),
})

export const PetFeedCommand = effectCmd({
  command: "feed",
  describe: "feed your pet",
  instance: false,
  handler: Effect.fn("Cli.pet.feed")(function* () {
    const now = yield* Clock.currentTimeMillis
    const pet = yield* requirePet()
    const message =
      pet.hunger >= 95
        ? `${pet.name} is too full to eat any more.`
        : `${pet.name} happily munches the food.`
    const next: Pet = { ...pet, hunger: clamp(pet.hunger + 35), happiness: clamp(pet.happiness + 5) }
    yield* save(next)
    UI.empty()
    UI.println(UI.Style.TEXT_SUCCESS + message + UI.Style.TEXT_NORMAL)
    render(next, now)
  }),
})

export const PetPlayCommand = effectCmd({
  command: "play",
  describe: "play with your pet",
  instance: false,
  handler: Effect.fn("Cli.pet.play")(function* () {
    const now = yield* Clock.currentTimeMillis
    const pet = yield* requirePet()
    if (pet.energy < 15) {
      UI.empty()
      UI.println(UI.Style.TEXT_WARNING + `${pet.name} is too tired to play. Try \`opencode pet rest\`.` + UI.Style.TEXT_NORMAL)
      yield* save(pet)
      render(pet, now)
      return
    }
    const next: Pet = {
      ...pet,
      happiness: clamp(pet.happiness + 30),
      energy: clamp(pet.energy - 20),
      hunger: clamp(pet.hunger - 10),
    }
    yield* save(next)
    UI.empty()
    UI.println(UI.Style.TEXT_SUCCESS + `${pet.name} had a great time playing!` + UI.Style.TEXT_NORMAL)
    render(next, now)
  }),
})

export const PetRestCommand = effectCmd({
  command: "rest",
  describe: "let your pet rest",
  instance: false,
  handler: Effect.fn("Cli.pet.rest")(function* () {
    const now = yield* Clock.currentTimeMillis
    const pet = yield* requirePet()
    const next: Pet = { ...pet, energy: clamp(pet.energy + 45), hunger: clamp(pet.hunger - 5) }
    yield* save(next)
    UI.empty()
    UI.println(UI.Style.TEXT_INFO + `${pet.name} takes a cozy nap.` + UI.Style.TEXT_NORMAL)
    render(next, now)
  }),
})

export const PetReleaseCommand = effectCmd({
  command: "release",
  describe: "say goodbye to your pet",
  instance: false,
  handler: Effect.fn("Cli.pet.release")(function* () {
    const fs = yield* FSUtil.Service
    const pet = yield* load()
    if (!pet) return yield* fail("You don't have a pet to release.")
    yield* fs.remove(PET_FILE).pipe(Effect.ignore)
    UI.empty()
    UI.println(UI.Style.TEXT_DIM + `${pet.name} the ${pet.species} scampers off into the sunset. Farewell!` + UI.Style.TEXT_NORMAL)
    UI.empty()
  }),
})
