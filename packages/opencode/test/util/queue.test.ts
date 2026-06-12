import { describe, expect, test } from "bun:test"
import { AsyncQueue, work } from "../../src/util/queue"

describe("util.AsyncQueue", () => {
  test("next returns already-pushed items immediately", async () => {
    const q = new AsyncQueue<number>()
    q.push(1)
    q.push(2)
    expect(await q.next()).toBe(1)
    expect(await q.next()).toBe(2)
  })

  test("next waits for a future push", async () => {
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

  test("async iterator yields items pushed after iteration starts", async () => {
    const q = new AsyncQueue<string>()
    const collected: string[] = []

    const consumer = (async () => {
      for await (const item of q) {
        collected.push(item)
        if (collected.length === 2) break
      }
    })()

    // Push after consumer is already waiting
    setTimeout(() => q.push("a"), 5)
    setTimeout(() => q.push("b"), 10)

    await consumer
    expect(collected).toEqual(["a", "b"])
  })

  test("works with non-primitive types", async () => {
    const q = new AsyncQueue<{ id: number }>()
    const obj = { id: 42 }
    q.push(obj)
    const result = await q.next()
    expect(result).toBe(obj)
  })
})

describe("util.work", () => {
  test("processes all items", async () => {
    const processed: number[] = []
    await work(2, [1, 2, 3, 4, 5], async (item) => {
      processed.push(item)
    })
    expect(processed.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5])
  })

  test("respects concurrency limit", async () => {
    let running = 0
    let maxRunning = 0

    await work(2, [1, 2, 3, 4, 5, 6], async () => {
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise((r) => setTimeout(r, 10))
      running--
    })

    expect(maxRunning).toBeLessThanOrEqual(2)
    expect(maxRunning).toBeGreaterThan(0)
  })

  test("concurrency of 1 processes items sequentially", async () => {
    const order: number[] = []
    await work(1, [1, 2, 3], async (item) => {
      order.push(item)
    })
    // items are popped from the end so processed in reverse
    expect(order).toEqual([3, 2, 1])
  })

  test("handles empty items array", async () => {
    let called = false
    await work(3, [], async () => {
      called = true
    })
    expect(called).toBe(false)
  })

  test("concurrency greater than item count still processes all", async () => {
    const processed: number[] = []
    await work(10, [1, 2], async (item) => {
      processed.push(item)
    })
    expect(processed.sort((a, b) => a - b)).toEqual([1, 2])
  })

  test("propagates errors from worker function", async () => {
    const error = new Error("worker failed")
    expect(
      work(2, [1, 2, 3], async (item) => {
        if (item === 2) throw error
      }),
    ).rejects.toThrow("worker failed")
  })
})
