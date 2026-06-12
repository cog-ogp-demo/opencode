import { describe, expect, test } from "bun:test"
import { AsyncQueue, work } from "../../src/util/queue"

describe("util.AsyncQueue", () => {
  test("next() resolves immediately when items are already queued", async () => {
    const q = new AsyncQueue<number>()
    q.push(1)
    q.push(2)
    expect(await q.next()).toBe(1)
    expect(await q.next()).toBe(2)
  })

  test("next() waits until an item is pushed", async () => {
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

  test("push delivers to waiting resolver instead of buffering", async () => {
    const q = new AsyncQueue<number>()
    const p = q.next()
    q.push(42)
    // Push another item — this one should be buffered since no one is waiting
    q.push(99)
    expect(await p).toBe(42)
    expect(await q.next()).toBe(99)
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

  test("async iterator handles interleaved push and consume", async () => {
    const q = new AsyncQueue<string>()
    const collected: string[] = []

    const consumer = (async () => {
      for await (const item of q) {
        collected.push(item)
        if (collected.length === 3) break
      }
    })()

    q.push("a")
    // Let the microtask queue flush so the iterator processes "a"
    await Promise.resolve()
    q.push("b")
    await Promise.resolve()
    q.push("c")

    await consumer
    expect(collected).toEqual(["a", "b", "c"])
  })

  test("works with different value types", async () => {
    const q = new AsyncQueue<{ id: number; name: string }>()
    q.push({ id: 1, name: "first" })
    const item = await q.next()
    expect(item).toEqual({ id: 1, name: "first" })
  })
})

describe("util.work", () => {
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
    await work(2, [1, 2, 3, 4, 5, 6], async () => {
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

  test("handles concurrency greater than items count", async () => {
    const results: number[] = []
    await work(10, [1, 2], async (item) => {
      results.push(item)
    })
    expect(results.sort((a, b) => a - b)).toEqual([1, 2])
  })

  test("concurrency of 1 processes items sequentially", async () => {
    const order: number[] = []
    // work pops from the end, so items process in reverse
    await work(1, [1, 2, 3], async (item) => {
      order.push(item)
    })
    expect(order).toEqual([3, 2, 1])
  })

  test("propagates errors from worker function", async () => {
    const error = new Error("worker failed")
    await expect(
      work(2, [1, 2, 3], async (item) => {
        if (item === 2) throw error
      }),
    ).rejects.toThrow("worker failed")
  })
})
