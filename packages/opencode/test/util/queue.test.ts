import { describe, expect, test } from "bun:test"
import { AsyncQueue, work } from "../../src/util/queue"

describe("AsyncQueue", () => {
  test("push before next resolves immediately", async () => {
    const q = new AsyncQueue<number>()
    q.push(1)
    q.push(2)
    expect(await q.next()).toBe(1)
    expect(await q.next()).toBe(2)
  })

  test("next before push waits for value", async () => {
    const q = new AsyncQueue<string>()
    const promise = q.next()
    q.push("hello")
    expect(await promise).toBe("hello")
  })

  test("multiple waiters resolve in FIFO order", async () => {
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

  test("async iterator yields pushed values", async () => {
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

  test("async iterator with delayed pushes", async () => {
    const q = new AsyncQueue<string>()
    const collected: string[] = []

    const consumer = (async () => {
      for await (const item of q) {
        collected.push(item)
        if (collected.length === 2) break
      }
    })()

    q.push("a")
    await Promise.resolve()
    q.push("b")

    await consumer
    expect(collected).toEqual(["a", "b"])
  })
})

describe("work", () => {
  test("processes all items", async () => {
    const results: number[] = []
    await work(2, [1, 2, 3, 4, 5], async (item) => {
      results.push(item)
    })
    expect(results.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  test("respects concurrency limit", async () => {
    let active = 0
    let maxActive = 0
    await work(2, [1, 2, 3, 4, 5], async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 10))
      active--
    })
    expect(maxActive).toBeLessThanOrEqual(2)
  })

  test("handles empty items array", async () => {
    const results: number[] = []
    await work(3, [], async (item) => {
      results.push(item)
    })
    expect(results).toEqual([])
  })

  test("concurrency exceeding item count works", async () => {
    const results: number[] = []
    await work(10, [1, 2], async (item) => {
      results.push(item)
    })
    expect(results.sort((a, b) => a - b)).toEqual([1, 2])
  })

  test("propagates errors from worker function", async () => {
    const promise = work(2, [1, 2, 3], async (item) => {
      if (item === 2) throw new Error("boom")
    })
    expect(promise).rejects.toThrow("boom")
  })

  test("single concurrency processes sequentially", async () => {
    const order: number[] = []
    await work(1, [1, 2, 3], async (item) => {
      order.push(item)
    })
    // work pops from the end, so order is reversed
    expect(order).toEqual([3, 2, 1])
  })
})
