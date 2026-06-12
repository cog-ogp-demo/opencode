import { TextAttributes } from "@opentui/core"
import { Show, createMemo } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useSync } from "../context/sync"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

export type DialogCostProps = {
  sessionID: string
}

export function DialogCost(props: DialogCostProps) {
  const sync = useSync()
  const { theme } = useTheme()
  const dialog = useDialog()

  const usage = createMemo(() => {
    const session = sync.session.get(props.sessionID)
    const tokens = session?.tokens
    const total = tokens
      ? tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
      : 0
    return {
      tokens,
      total,
      cost: session?.cost ?? 0,
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Cost
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={usage().tokens} fallback={<text fg={theme.text}>No usage yet</text>}>
        {(tokens) => (
          <box>
            <text fg={theme.text}>Tokens</text>
            <text fg={theme.textMuted}>Input {tokens().input.toLocaleString("en-US")}</text>
            <text fg={theme.textMuted}>Output {tokens().output.toLocaleString("en-US")}</text>
            <text fg={theme.textMuted}>Reasoning {tokens().reasoning.toLocaleString("en-US")}</text>
            <text fg={theme.textMuted}>Cache read {tokens().cache.read.toLocaleString("en-US")}</text>
            <text fg={theme.textMuted}>Cache write {tokens().cache.write.toLocaleString("en-US")}</text>
            <text fg={theme.text}>Total {usage().total.toLocaleString("en-US")}</text>
          </box>
        )}
      </Show>
      <box>
        <text fg={theme.text}>Cost</text>
        <text fg={theme.textMuted}>{money.format(usage().cost)} spent</text>
      </box>
    </box>
  )
}
