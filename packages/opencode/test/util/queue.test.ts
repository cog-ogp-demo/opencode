import { describe, expect, test } from "bun:test"
import { AsyncQueue, work } from "../../src/util/queue"

describe("util.queue", () => {
  describe("AsyncQueue", () => {
    test("next returns items that were pushed before calling next", async () => {
      const q = new AsyncQueue<number>()
      q.push(1)
      q.push(2)

      expect(await q.next()).toBe(1)
      expect(await q.next()).toBe(2)
    })

    test("next waits for a push when queue is empty", async () => {
      const q = new AsyncQueue<string>()

      const promise = q.next()
      q.push("hello")

      expect(await promise).toBe("hello")
    })

    test("multiple waiters are resolved in FIFO order", async () => {
      const q = new AsyncQueue<number>()

      const p1 = q.next()
      const p2 = q.next()
      const p3 = q.next()

      q.push(10)
      q.push(20)
      q.push(30)

      expect(await p1).toBe(10)
      expect(await p2).toBe(20)
      expect(await p3).toBe(30)
    })

    test("interleaved push and next", async () => {
      const q = new AsyncQueue<number>()

      q.push(1)
      expect(await q.next()).toBe(1)

      const p = q.next()
      q.push(2)
      expect(await p).toBe(2)

      q.push(3)
      q.push(4)
      expect(await q.next()).toBe(3)
      expect(await q.next()).toBe(4)
    })

    test("async iterator yields pushed items", async () => {
      const q = new AsyncQueue<number>()
      const collected: number[] = []

      const consumer = (async () => {
        for await (const item of q) {
          collected.push(item)
          if (collected.length === 3) break
        }
      })()

      q.push(1)
      q.push(2)
      q.push(3)

      await consumer

      expect(collected).toEqual([1, 2, 3])
    })

    test("async iterator handles items pushed over time", async () => {
      const q = new AsyncQueue<string>()
      const collected: string[] = []

      const consumer = (async () => {
        for await (const item of q) {
          collected.push(item)
          if (collected.length === 2) break
        }
      })()

      q.push("a")
      // Let the microtask for the first item settle
      await Promise.resolve()
      q.push("b")

      await consumer

      expect(collected).toEqual(["a", "b"])
    })
  })

  describe("work", () => {
    test("processes all items", async () => {
      const processed: number[] = []
      await work(2, [1, 2, 3, 4, 5], async (item) => {
        processed.push(item)
      })

      expect(processed.sort()).toEqual([1, 2, 3, 4, 5])
    })

    test("respects concurrency limit", async () => {
      let active = 0
      let maxActive = 0

      await work(2, [1, 2, 3, 4], async () => {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 20))
        active--
      })

      expect(maxActive).toBeLessThanOrEqual(2)
    })

    test("handles empty items array", async () => {
      let called = false
      await work(3, [], async () => {
        called = true
      })

      expect(called).toBe(false)
    })

    test("handles concurrency greater than item count", async () => {
      const processed: string[] = []
      await work(10, ["a", "b"], async (item) => {
        processed.push(item)
      })

      expect(processed.sort()).toEqual(["a", "b"])
    })

    test("propagates errors from worker function", async () => {
      await expect(
        work(1, [1, 2, 3], async (item) => {
          if (item === 2) throw new Error("boom")
        }),
      ).rejects.toThrow("boom")
    })

    test("single concurrency processes items sequentially", async () => {
      const order: number[] = []
      await work(1, [1, 2, 3], async (item) => {
        order.push(item)
      })

      // work pops from end, so reverse order
      expect(order).toEqual([3, 2, 1])
    })
  })
})
