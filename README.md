# Depth First

An offline-first, static, interactive engineering curriculum: lessons, auto-graded labs and a deterministic distributed-systems simulator, running entirely in your browser.

## Courses (authored / planned)

| Course | Authored |
|---|---|
| Algorithms & Interview Practice | 12 modules |
| Advanced JavaScript | 14 modules |
| Node.js & Distributed Systems | 6 modules (Raft, quorums, CRDTs, ...) |
| Cloud (simulated) | 2 modules |
| AI & ML (JavaScript labs) | 6 modules |
| Math for Software Engineers | 3 modules |

Each course lists its remaining planned modules on its roadmap page. Run `npm run verify` for exact current counts.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # typecheck + tests
npm run verify     # every reference solution passes, every starter fails
npm run build
```

## How grading works

Learner code runs in a sandboxed Web Worker, instrumented with step counters (deterministic complexity budgets, infinite-loop protection). Tests are examples, property-based (with shrinking), differential, performance (operation counts) and simulator scenarios. Graders are themselves validated by mutation tests (`tests/mutation.test.ts`).

## Honest limits

- ML labs use JavaScript, not Python.
- The distributed-systems simulator is a model, not a real network.
- Cloud labs are simulations; no cloud account is used.
