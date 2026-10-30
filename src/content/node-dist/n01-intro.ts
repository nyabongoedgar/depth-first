import type { Module } from '../../core/types';
import { ex, sim as simTest, hid, lab, jsFile } from '../helpers';
import { Sim, NodeFactory } from '../../sim/dsim';

const NODES = ['n1', 'n2', 'n3', 'n4', 'n5'];
function cluster(env: Record<string, any>, seed: number, opts: { drop?: number } = {}) {
  if (typeof env.createNode !== 'function') throw new Error('Define `createNode(id, peers)`.');
  const sim = new Sim({ seed, nodes: NODES, factory: env.createNode as NodeFactory, drop: opts.drop });
  sim.start();
  return sim;
}
const suspects = (sim: Sim, id: string): string[] => {
  const s = sim.node(id)?.status?.();
  if (!s || !Array.isArray(s.suspects)) throw new Error('status() must return { suspects: [...] } (an array of node ids).');
  return [...s.suspects].sort();
};

const FD_SOLUTION = `function createNode(id, peers) {
  const HEARTBEAT = 100; // how often we say "I'm alive"
  const TIMEOUT = 350;   // silence longer than this ⇒ suspect (> 3 heartbeats + worst-case latency)
  const lastSeen = {};
  let now = 0;

  return {
    onStart(ctx) {
      now = ctx.now();
      for (const p of peers) lastSeen[p] = now; // give everyone a fresh start after (re)boot
      ctx.broadcast({ type: 'heartbeat' });
      ctx.setTimer('tick', HEARTBEAT);
    },
    onTimer(ctx) {
      now = ctx.now();
      ctx.broadcast({ type: 'heartbeat' });
      ctx.setTimer('tick', HEARTBEAT);
    },
    onMessage(ctx, from) {
      now = ctx.now();
      lastSeen[from] = now; // any message proves the sender was alive a moment ago
    },
    // The tests read the detector's opinion through status().
    status() {
      return { suspects: peers.filter((p) => now - lastSeen[p] > TIMEOUT) };
    },
  };
}
`;

const mod: Module = {
  id: 'distributed-intro',
  course: 'node-dist',
  title: 'Distributed Systems Foundations: Failures, Time & Failure Detectors',
  minutes: 70,
  objectives: [
    'List the fallacies of distributed computing and explain why each one bites in production',
    'Classify failures (crash, omission, timing, Byzantine) and the system models they imply',
    'Explain why "slow" and "dead" are indistinguishable and what that means for timeouts',
    'Build a heartbeat failure detector and reason about completeness vs accuracy',
  ],
  body: `
## What makes distributed systems hard

A program on one machine either works or crashes. A program on *several* machines can be **partly working** — one node dead, one slow, the network dropping a third of the packets — and it cannot tell which. Leslie Lamport's definition is the truest:

> "A distributed system is one in which the failure of a computer you didn't even know existed can render your own computer unusable."

### The 8 fallacies of distributed computing

Peter Deutsch and colleagues at Sun listed assumptions every newcomer makes — all **false**:

1. The network is reliable.
2. Latency is zero.
3. Bandwidth is infinite.
4. The network is secure.
5. Topology doesn't change.
6. There is one administrator.
7. Transport cost is zero.
8. The network is homogeneous.

Design as if each is false: **time-out** every call, **retry** carefully (idempotently), **bound** queues, **authenticate** everything, discover peers dynamically.

## Failure models

How can a node misbehave? From mildest to nastiest:

| Model | Behaviour | Example |
|---|---|---|
| **Crash-stop** | stops forever | a process killed, never restarted |
| **Crash-recovery** | crashes, later restarts (keeps *stable storage*, loses memory) | a server rebooting; **what Raft assumes** |
| **Omission** | some messages (sent or received) are lost | overloaded NIC, full queue |
| **Timing** | responds, but too slowly (or too fast clocks) | GC pause, VM stolen by neighbour, swapped-out process |
| **Byzantine** | arbitrary / malicious behaviour | bugs, bit flips, attackers (blockchains assume this) |

Most practical systems assume **crash-recovery** with an unreliable network (messages may be **lost, duplicated, delayed and reordered**) and tolerate Byzantine faults only at special cost (3f+1 nodes instead of 2f+1).

**Network partitions:** the network splits into groups that can't reach each other, though every node is alive. They happen (misconfigurations, switch failures, cloud zone issues), and they are *indistinguishable from crashes* to the nodes on each side.

## Slow vs dead — the central difficulty

If node A sends B a request and hears nothing, A cannot know whether (1) the request was lost, (2) B crashed, (3) B is slow, (4) B processed it and the *reply* was lost. A **timeout** is a guess. Consequences:

- A **false positive** (declaring a live node dead) can cause two nodes to act as leader, or duplicate work.
- A **false negative** (failing to notice a crash) delays recovery.
- Operations may have executed even though you saw an error → **make them idempotent** (retry-safe).

The **synchrony models** formalise what you may assume: **synchronous** (known bounds on delay and clock drift — unrealistic), **asynchronous** (no bounds — FLP says consensus is then impossible with even one crash), and **partially synchronous** (bounds exist but are unknown, or hold *eventually*) — the realistic model all practical consensus systems use.

## Failure detectors

A **failure detector** is a component that outputs a list of nodes it **suspects** to have crashed. The classic properties (Chandra & Toueg):

- **Completeness** — every crashed node is *eventually* suspected by every correct node.
- **Accuracy** — correct nodes are *not* suspected (**strong**: never; **eventual**: after some time).

Perfect detection is impossible in an asynchronous network; practical detectors aim for **eventually perfect (◇P)**: after the network stabilises, exactly the crashed nodes are suspected.

**Heartbeats.** Each node periodically sends "I'm alive". A peer not heard from within a **timeout** is suspected; hearing from it again **un-suspects** it. The timeout trades **detection time** against **false suspicions**: set it to several heartbeat periods plus the worst-case network latency. Better detectors adapt: the **φ-accrual** detector (used by Cassandra and Akka) outputs a continuous *suspicion level* from the statistical distribution of past inter-arrival times, and **SWIM** (used by Consul/Serf) pings random peers and asks others to **indirectly probe** before declaring a node dead — fewer false positives, O(1) load per node.

\`\`\`js run
// Heartbeat arrival times from a peer: the gaps tell you what is "normal"
const arrivals = [0, 100, 205, 298, 402, 510, 601];
const gaps = arrivals.slice(1).map((t, i) => t - arrivals[i]);
const mean = gaps.reduce((a, b) => a + b) / gaps.length;
const sd = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length);
console.log("gaps:", gaps, "mean", Math.round(mean), "sd", sd.toFixed(1));
console.log("suspect after silence of ~", Math.round(mean + 4 * sd), "ms");   // an adaptive timeout
\`\`\`

## Working in the simulator

The Raft course module uses a **deterministic simulator** (virtual time + seeded randomness). This module's lab is the warm-up: write your first node. Everything the simulator offers is on the \`ctx\` object (\`send\`, \`broadcast\`, \`setTimer\`, \`now\`, \`rand\`, \`storage\`). A crash erases your variables; a **restart** calls \`onStart\` again.

:::tip
**Why simulate?** Real networks are non-deterministic: you can run a distributed test 1000 times and never see the bug, then see it once in production. A seeded simulator reproduces a failure *exactly* — the same technique FoundationDB, TigerBeetle and AWS use to test their databases.
:::

:::interview
"A request times out. What do you do?" — Don't say "retry" immediately. Say: the request may or may not have executed; I need **idempotency keys** to retry safely, **exponential backoff with jitter** to avoid retry storms, a **deadline** propagated through the call chain, and a **circuit breaker** so I stop hammering a sick dependency.
:::
`,
  quiz: [
    { q: 'A service sends a request and gets no response. What can it conclude?', options: ['The server is down', 'The request was lost', 'Nothing for sure — the request, the server or the reply may have failed or be slow', 'The network is partitioned'], answer: 2, why: 'Timeouts are guesses; all of those cases look identical to the caller.' },
    { q: 'Which failure model does Raft assume for nodes?', options: ['Byzantine', 'Crash-recovery with stable storage', 'Crash-stop only', 'No failures'], answer: 1, why: 'Nodes may crash and restart, keeping only what they persisted.' },
    { q: 'What does "completeness" mean for a failure detector?', options: ['It never makes mistakes', 'Every crashed node is eventually suspected by every correct node', 'It sends many messages', 'It knows the whole cluster'], answer: 1, why: 'Completeness is about *not missing* real failures; accuracy is about not accusing live nodes.' },
    { q: 'You shorten the heartbeat timeout from 2 s to 100 ms. What is the most likely effect?', options: ['Faster detection with more false suspicions during GC pauses or network jitter', 'No effect', 'Fewer messages', 'Perfect accuracy'], answer: 0, why: 'A tight timeout detects crashes quickly but wrongly accuses slow nodes.' },
    { q: 'In the partially synchronous model…', options: ['Delays are always bounded and known', 'There are bounds on delay, but they are unknown or only hold eventually', 'There is no bound at all', 'Nodes cannot crash'], answer: 1, why: 'It is the realistic middle ground that makes practical consensus possible.' },
  ],
  labs: [
    lab({
      id: 'nd1-failure-modes',
      title: 'Name that failure',
      kind: 'answer',
      difficulty: 1,
      minutes: 8,
      tags: ['failure-models'],
      prompt: 'Pick the failure model that best describes each situation.',
      questions: [
        { id: 'a', prompt: 'A process is killed by the OOM killer and the orchestrator restarts it a minute later. It forgot everything in memory but kept its disk.', type: 'choice', options: ['Crash-stop', 'Crash-recovery', 'Byzantine', 'Omission'], answer: 1 },
        { id: 'b', prompt: 'A node stops for 8 seconds in a stop-the-world GC pause, then carries on as if nothing happened.', type: 'choice', options: ['Crash-stop', 'Timing failure', 'Byzantine', 'Omission only'], answer: 1 },
        { id: 'c', prompt: 'A router silently discards 5% of packets.', type: 'choice', options: ['Omission failure (message loss)', 'Crash-stop', 'Byzantine', 'Timing only'], answer: 0 },
        { id: 'd', prompt: 'A compromised server sends different, contradictory answers to different peers.', type: 'choice', options: ['Crash-recovery', 'Omission', 'Byzantine', 'Timing'], answer: 2 },
        { id: 'e', prompt: 'Two datacentres are both healthy, but the link between them is cut.', type: 'choice', options: ['A node crash', 'A network partition', 'A Byzantine fault', 'A clock fault'], answer: 1 },
        { id: 'f', prompt: 'With 2f+1 nodes crash-fault-tolerant consensus survives f failures. How many nodes does a Byzantine-fault-tolerant protocol need to survive f=1 Byzantine node?', type: 'number', answer: 4, explain: 'BFT needs 3f+1 nodes.' },
      ],
      hints: ['Ask: does the node lose its memory? Does it lie? Is the problem the node or the network?', 'Byzantine = arbitrary behaviour, including lying.'],
    }),

    lab({
      id: 'nd1-failure-detector',
      title: 'A heartbeat failure detector',
      kind: 'sim',
      difficulty: 3,
      minutes: 30,
      tags: ['failure-detector', 'simulation'],
      viz: 'spacetime',
      stepBudget: 60_000_000,
      prompt: `Write \`createNode(id, peers)\` — a node that runs a **heartbeat failure detector** in a 5-node cluster (\`n1…n5\`). Message latency is 5–25 ms.

- Every node periodically **broadcasts** a heartbeat and records when it last heard from each peer.
- \`status()\` must return \`{ suspects: [...] }\`: the peers it currently believes have failed — those it has not heard from for longer than your **timeout**.
- A peer heard from again must be **un-suspected** (so a restarted node, or a healed partition, is trusted again).

Choose the heartbeat interval and timeout yourself. The tests require:
- **no false suspicions** when everything is healthy;
- a crashed node is suspected by **every** live node **within 700 ms**;
- suspicions caused by a **partition** disappear after it **heals**, and a **restarted** node is trusted again.`,
      expose: ['createNode'],
      files: jsFile(`function createNode(id, peers) {
  // lastSeen[peer] = virtual time we last heard from that peer
  const lastSeen = {};

  return {
    onStart(ctx) {
      // start sending heartbeats, e.g. ctx.setTimer('tick', 100)
    },

    onTimer(ctx, name) {
      // send a heartbeat to everyone, then re-arm the timer
    },

    onMessage(ctx, from, msg) {
      // record that "from" is alive
    },

    status() {
      return { suspects: [] };
    },
  };
}
`, FD_SOLUTION),
      tests: [
        simTest('no false suspicions in a healthy cluster', ({ env, expect }) => {
          for (let seed = 1; seed <= 6; seed++) {
            const sim = cluster(env, seed);
            for (let t = 500; t <= 4000; t += 250) {
              sim.run(t);
              for (const id of NODES) if (suspects(sim, id).length) throw new Error(`seed ${seed}, t=${t}ms: ${id} wrongly suspects ${suspects(sim, id).join(', ')} although nobody has failed — is your timeout longer than the heartbeat interval plus worst-case latency (25 ms)?`);
            }
          }
        }),
        simTest('a crashed node is suspected by every live node within 700 ms', ({ env, expect, attachTrace }) => {
          const sim = cluster(env, 3);
          sim.crash('n3', 1200);
          sim.run(1200 + 700);
          for (const id of NODES.filter((n) => n !== 'n3')) expect(suspects(sim, id)).toEqual(['n3']);
          attachTrace(sim.exportTrace());
        }),
        simTest('a node that never crashed is never suspected, even while another one is down', ({ env, expect }) => {
          const sim = cluster(env, 4);
          sim.crash('n1', 800);
          sim.crash('n5', 1500);
          sim.run(3000);
          for (const id of ['n2', 'n3', 'n4']) expect(suspects(sim, id)).toEqual(['n1', 'n5']);
        }),
        simTest('a restarted node is trusted again', ({ env, expect }) => {
          const sim = cluster(env, 5);
          sim.crash('n2', 600);
          sim.restart('n2', 1600);
          sim.run(1500);
          expect(suspects(sim, 'n1')).toEqual(['n2']);
          sim.run(2600);
          for (const id of NODES) expect(suspects(sim, id)).toEqual([]);
        }),
        simTest('partition: each side suspects the other; after healing, nobody is suspected', ({ env, expect }) => {
          const sim = cluster(env, 6);
          sim.partition([['n1', 'n2'], ['n3', 'n4', 'n5']], 1000);
          sim.heal(2400);
          sim.run(2300);
          expect(suspects(sim, 'n1')).toEqual(['n3', 'n4', 'n5']);
          expect(suspects(sim, 'n4')).toEqual(['n1', 'n2']);
          sim.run(3300);
          for (const id of NODES) expect(suspects(sim, id)).toEqual([]);
        }),
        hid('with 10% message loss there are still no lasting false suspicions', ({ env, expect }) => {
          for (let seed = 1; seed <= 4; seed++) {
            const sim = cluster(env, seed, { drop: 0.1 });
            sim.run(5000);
            for (const id of NODES) if (suspects(sim, id).length) throw new Error(`seed ${seed}: ${id} suspects ${suspects(sim, id)} under 10% loss. Use a timeout of several heartbeat periods so a single lost heartbeat is not fatal.`);
          }
        }),
      ],
      hints: [
        'State: `lastSeen[peer]` and the current time `now` (set `now = ctx.now()` in each callback — `status()` has no `ctx`).',
        'Heartbeat: `ctx.broadcast({ type: "heartbeat" })` every ~100 ms using `ctx.setTimer("tick", 100)` and re-arming it in `onTimer`.',
        '`onMessage`: `lastSeen[from] = ctx.now()`. Any message counts as proof of life.',
        '`status()`: a peer is suspected when `now - lastSeen[peer] > TIMEOUT`. A timeout of ≈ 3–4 heartbeat periods (≈ 350 ms) tolerates a lost heartbeat and 25 ms latency yet detects crashes well inside 700 ms.',
        'In `onStart` initialise `lastSeen` for every peer to the current time — after a restart your old values are gone.',
      ],
      why: 'Cassandra, Consul, Kubernetes and etcd all run some form of this loop; getting the timeout wrong is a classic cause of outages.',
    }),
  ],
  references: [
    { title: 'Fallacies of Distributed Computing Explained — Arnon Rotem-Gal-Oz' },
    { title: 'Unreliable Failure Detectors for Reliable Distributed Systems — Chandra & Toueg, 1996' },
    { title: 'The Φ Accrual Failure Detector — Hayashibara et al., 2004' },
    { title: 'SWIM: Scalable Weakly-consistent Infection-style Process Group Membership Protocol — Das et al., 2002' },
  ],
};
export default mod;
