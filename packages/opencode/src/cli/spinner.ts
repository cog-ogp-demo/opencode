import { spinner as clackSpinner, log } from "@clack/prompts"

export function spinner() {
  if (process.stderr.isTTY) return clackSpinner()
  let current = ""
  return {
    start(msg?: string) {
      current = msg ?? ""
    },
    stop(msg?: string, code?: number) {
      const text = msg ?? current
      if (!text) return
      if (code) log.error(text)
      else log.step(text)
    },
    message(msg?: string) {
      current = msg ?? current
    },
    get isCancelled() {
      return false
    },
  }
}
