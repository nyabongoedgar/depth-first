import type { Module } from '../../core/types';
import { ex, prop, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'cloud-networking',
  course: 'cloud',
  title: 'Cloud Networking: CIDR, Subnets and Reachability',
  minutes: 90,
  objectives: [
    'Read and compute CIDR blocks: network address, mask, range, size',
    'Plan non-overlapping VPC subnets',
    'Evaluate route tables with longest-prefix match',
    'Reason about security groups (stateful) versus network ACLs (stateless)',
  ],
  body: `
## IP addresses and CIDR

An IPv4 address is a 32-bit number written as four bytes: \`10.0.1.7\`. A **CIDR block** \`10.0.0.0/16\` says "the first 16 bits are fixed (the network prefix); the remaining 16 bits are free (hosts)". So \`/16\` contains $2^{32-16}=65{,}536$ addresses; \`/24\` has 256; \`/32\` is a single host; \`/0\` is everything (\`0.0.0.0/0\` = "anywhere").

The **mask** is the prefix as ones: \`/24\` = \`255.255.255.0\`. An address belongs to a block when \`(addr & mask) == network\`. Blocks are either **nested** or **disjoint** — they never partially overlap — which makes routing and firewall reasoning tractable.

In JavaScript, bitwise operators work on signed 32-bit integers, so use \`>>> 0\` to get an unsigned value.

\`\`\`js run
const ip = (s) => s.split('.').reduce((a, b) => ((a << 8) | +b) >>> 0, 0);
const mask = (len) => (len === 0 ? 0 : (~0 << (32 - len)) >>> 0);
console.log((ip('10.0.1.7') & mask(24)) === ip('10.0.1.0'));   // true
\`\`\`

## VPC design

A **VPC** is your private network in a region, given a CIDR (say \`10.0.0.0/16\`). You carve it into **subnets**, usually one public and one private per Availability Zone:

- **Public subnet** — its route table sends \`0.0.0.0/0\` to an **internet gateway**; instances can have public IPs.
- **Private subnet** — default route goes to a **NAT gateway** (outbound only), or has none.
- Providers reserve a few addresses per subnet (AWS reserves 5), so a \`/28\` gives 11 usable hosts.

Plan for growth, and **never overlap** CIDRs between networks you may later peer or connect with a VPN or transit gateway — overlap makes routing ambiguous and is painful to undo.

## Routing: longest prefix wins

A route table maps destination CIDRs to targets. For a packet, take **all matching routes and pick the most specific (longest prefix)**. \`10.0.0.0/16 → local\`, \`10.1.0.0/16 → peering\`, \`0.0.0.0/0 → igw\`: a packet to \`10.0.5.5\` goes local, to \`8.8.8.8\` goes to the internet gateway. No matching route = dropped.

## Security groups vs network ACLs

| | Security group | Network ACL |
|---|---|---|
| Applies to | instance / interface | subnet |
| State | **Stateful** — replies to allowed traffic are automatically allowed | **Stateless** — return traffic needs its own rule |
| Rules | allow only; default deny | allow and deny, evaluated by rule number |

:::warn
\`0.0.0.0/0\` on SSH (port 22) or a database port is the classic breach path. Least privilege for networks means narrow CIDRs or referencing other security groups.
:::

:::interview
"Design the network for a three-tier app across 3 AZs." — VPC /16, a /20-ish public + private + data subnet per AZ, ALB in public, app in private behind NAT, database with no internet route, security groups chaining ALB → app → DB.
:::
`,
  quiz: [
    { q: 'How many addresses are in a /22?', options: ['256', '512', '1,024', '4,096'], answer: 2, why: '2^(32−22) = 2^10 = 1,024.' },
    { q: 'A packet matches 0.0.0.0/0 and 10.0.0.0/16. Which route is used?', options: ['0.0.0.0/0', '10.0.0.0/16', 'Both', 'Neither'], answer: 1, why: 'Longest prefix wins.' },
    { q: 'Return traffic for an allowed inbound connection is automatically permitted by…', options: ['A network ACL', 'A stateful security group', 'Neither', 'A route table'], answer: 1, why: 'Security groups track connections; NACLs do not.' },
    { q: 'Two blocks 10.0.0.0/24 and 10.0.0.128/25 are…', options: ['Disjoint', 'Nested', 'Partially overlapping', 'Identical'], answer: 1, why: '/25 starting at .128 lies inside the /24.' },
  ],
  labs: [
    lab({
      id: 'c1-cidr',
      title: 'CIDR arithmetic',
      kind: 'answer',
      difficulty: 1,
      minutes: 8,
      tags: ['cidr'],
      prompt: 'Compute by hand.',
      questions: [
        { id: 'a', prompt: 'Addresses in 10.0.0.0/20.', type: 'number', answer: 4096 },
        { id: 'b', prompt: 'Usable hosts in a /28 if the provider reserves 5 addresses.', type: 'number', answer: 11 },
        { id: 'c', prompt: 'How many /24 subnets fit in a /16?', type: 'number', answer: 256 },
        { id: 'd', prompt: 'Last address of 192.168.4.0/22, as the final two octets "x.y" (e.g. 5.255).', type: 'text', answer: '7.255' },
        { id: 'e', prompt: 'Prefix length of the smallest block holding 300 addresses.', type: 'number', answer: 23 },
      ],
      hints: ['/N has 2^(32−N) addresses.', '/22 spans 4 consecutive /24s: 4,5,6,7.', '2^9 = 512 ≥ 300 > 256.'],
    }),
    lab({
      id: 'c1-cidr-lib',
      title: 'Build a CIDR library',
      kind: 'code',
      difficulty: 3,
      minutes: 30,
      tags: ['cidr', 'bitwise'],
      interview: true,
      prompt: `Implement (IPv4 only, input is always well-formed):

- \`parseIp(s)\` → unsigned 32-bit number; \`formatIp(n)\` → dotted string.
- \`parseCidr(s)\` → \`{ network, length, mask, first, last, size }\`; the network is the address with host bits **zeroed** (so \`"10.0.1.7/24"\` has network \`10.0.1.0\`). All numbers unsigned.
- \`contains(cidr, ip)\` → boolean (ip is a dotted string).
- \`overlaps(a, b)\` → true if the two CIDR strings share any address.
- \`splitCidr(cidr, newLength)\` → array of CIDR strings, in order, splitting into subnets of the longer prefix (\`[]\` if \`newLength\` ≤ current length or > 32).`,
      expose: ['parseIp', 'formatIp', 'parseCidr', 'contains', 'overlaps', 'splitCidr'],
      files: jsFile(`function parseIp(s) {\n  \n}\n\nfunction formatIp(n) {\n  \n}\n\nfunction parseCidr(s) {\n  \n}\n\nfunction contains(cidr, ip) {\n  \n}\n\nfunction overlaps(a, b) {\n  \n}\n\nfunction splitCidr(cidr, newLength) {\n  \n}\n`, `function parseIp(s) {
  return s.split('.').reduce((a, b) => ((a << 8) | Number(b)) >>> 0, 0);
}

function formatIp(n) {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function parseCidr(s) {
  const [addr, len] = s.split('/');
  const length = Number(len);
  const mask = length === 0 ? 0 : (~0 << (32 - length)) >>> 0;
  const network = (parseIp(addr) & mask) >>> 0;
  const size = 2 ** (32 - length);
  return { network, length, mask, first: network, last: network + size - 1, size };
}

function contains(cidr, ip) {
  const c = parseCidr(cidr);
  const n = parseIp(ip);
  return n >= c.first && n <= c.last;
}

function overlaps(a, b) {
  const x = parseCidr(a);
  const y = parseCidr(b);
  return x.first <= y.last && y.first <= x.last;
}

function splitCidr(cidr, newLength) {
  const c = parseCidr(cidr);
  if (newLength <= c.length || newLength > 32) return [];
  const step = 2 ** (32 - newLength);
  const out = [];
  for (let n = c.first; n <= c.last; n += step) out.push(formatIp(n) + '/' + newLength);
  return out;
}
`),
      tests: [
        ex('parse and format IPs (unsigned!)', ({ env, expect }) => {
          expect(env.parseIp('0.0.0.0')).toBe(0);
          expect(env.parseIp('10.0.1.7')).toBe(167772423);
          expect(env.parseIp('255.255.255.255')).toBe(4294967295);
          expect(env.parseIp('192.168.0.1')).toBe(3232235521);
          expect(env.formatIp(3232235521)).toBe('192.168.0.1');
          expect(env.formatIp(4294967295)).toBe('255.255.255.255');
        }),
        ex('parseCidr zeroes the host bits', ({ env, expect }) => {
          const c = env.parseCidr('10.0.1.7/24');
          expect(env.formatIp(c.network)).toBe('10.0.1.0');
          expect(c.size).toBe(256);
          expect(env.formatIp(c.last)).toBe('10.0.1.255');
          expect(c.length).toBe(24);
          expect(env.formatIp(c.mask)).toBe('255.255.255.0');
        }),
        ex('edge lengths: /0, /32 and /31', ({ env, expect }) => {
          const all = env.parseCidr('0.0.0.0/0');
          expect(all.size).toBe(4294967296);
          expect(env.formatIp(all.last)).toBe('255.255.255.255');
          const one = env.parseCidr('8.8.8.8/32');
          expect(one.size).toBe(1);
          expect(one.first).toBe(one.last);
          expect(env.parseCidr('10.0.0.3/31').size).toBe(2);
          expect(env.formatIp(env.parseCidr('10.0.0.3/31').first)).toBe('10.0.0.2');
        }),
        ex('contains', ({ env, expect }) => {
          expect(env.contains('10.0.0.0/16', '10.0.255.255')).toBe(true);
          expect(env.contains('10.0.0.0/16', '10.1.0.0')).toBe(false);
          expect(env.contains('0.0.0.0/0', '203.0.113.9')).toBe(true);
          expect(env.contains('172.16.0.0/12', '172.31.1.1')).toBe(true);
          expect(env.contains('172.16.0.0/12', '172.32.0.0')).toBe(false);
        }),
        ex('overlaps: nested, disjoint, adjacent', ({ env, expect }) => {
          expect(env.overlaps('10.0.0.0/16', '10.0.5.0/24')).toBe(true);
          expect(env.overlaps('10.0.5.0/24', '10.0.0.0/16')).toBe(true);
          expect(env.overlaps('10.0.0.0/24', '10.0.1.0/24')).toBe(false);
          expect(env.overlaps('10.0.0.0/25', '10.0.0.128/25')).toBe(false);
          expect(env.overlaps('0.0.0.0/0', '1.2.3.4/32')).toBe(true);
        }),
        ex('splitCidr', ({ env, expect }) => {
          expect(env.splitCidr('10.0.0.0/24', 26)).toEqual(['10.0.0.0/26', '10.0.0.64/26', '10.0.0.128/26', '10.0.0.192/26']);
          expect(env.splitCidr('10.0.0.0/24', 24)).toEqual([]);
          expect(env.splitCidr('10.0.0.0/24', 33)).toEqual([]);
          expect(env.splitCidr('10.0.0.0/16', 18).length).toBe(4);
          expect(env.splitCidr('10.0.0.0/30', 32)).toEqual(['10.0.0.0/32', '10.0.0.1/32', '10.0.0.2/32', '10.0.0.3/32']);
        }),
        prop('property: every address of a split subnet lies in the parent, and subnets are disjoint', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(0, 255), gen.int(0, 255), gen.int(16, 24), gen.int(1, 4)], (a: number, b: number, len: number, extra: number) => {
            const parent = `10.${a}.${b}.0/${len}`;
            const subs = env.splitCidr(parent, len + extra);
            expect(subs.length).toBe(2 ** extra);
            for (const s of subs) expect(env.overlaps(parent, s)).toBe(true);
            for (let i = 1; i < subs.length; i++) expect(env.overlaps(subs[i - 1], subs[i])).toBe(false);
            expect(env.contains(parent, env.formatIp(env.parseCidr(subs[subs.length - 1]).last))).toBe(true);
          }, { runs: 100 });
        }),
      ],
      hints: ['Build the number with `(acc << 8 | byte) >>> 0` so it stays unsigned.', 'mask = `length === 0 ? 0 : (~0 << (32 - length)) >>> 0` (shifting by 32 is a no-op in JS, hence the special case).', 'Two ranges overlap iff `a.first <= b.last && b.first <= a.last`.', 'Do not use `1 << 32` — use `2 ** n` for sizes.'],
      why: 'Every cloud outage post-mortem about "wrong CIDR" or "overlapping VPCs" starts here.',
    }),
    lab({
      id: 'c1-routing',
      title: 'Route tables and security groups',
      kind: 'code',
      difficulty: 3,
      minutes: 30,
      tags: ['routing', 'security-groups'],
      prompt: `Build on a small CIDR helper (provided inside your file's top comment — write your own \`inCidr(cidr, ip)\`).

- \`route(table, ip)\` — \`table\` is \`[{ cidr, target }]\`. Return the \`target\` of the **longest matching prefix**, or \`null\` if nothing matches. Ties on equal length: the earlier entry wins.
- \`sgAllows(rules, { ip, port, protocol })\` — \`rules\` is \`[{ cidr, protocol, from, to }]\` (inbound allow rules; \`protocol\` may be \`"tcp"\`, \`"udp"\` or \`"-1"\` meaning all). Return true if any rule matches (default deny).
- \`canReach(vpc, srcIp, dstIp, port)\` — \`vpc\` is \`{ routes: [{cidr, target}], dstRules: [...] }\`. Traffic is allowed if the route for \`dstIp\` is **not null and not \`"blackhole"\`** and \`sgAllows(dstRules, { ip: srcIp, port, protocol: "tcp" })\`.`,
      expose: ['route', 'sgAllows', 'canReach'],
      files: jsFile(`function inCidr(cidr, ip) {\n  \n}\n\nfunction route(table, ip) {\n  \n}\n\nfunction sgAllows(rules, { ip, port, protocol }) {\n  \n}\n\nfunction canReach(vpc, srcIp, dstIp, port) {\n  \n}\n`, `const toNum = (s) => s.split('.').reduce((a, b) => ((a << 8) | Number(b)) >>> 0, 0);

function inCidr(cidr, ip) {
  const [addr, len] = cidr.split('/');
  const length = Number(len);
  if (length === 0) return true;
  const mask = (~0 << (32 - length)) >>> 0;
  return ((toNum(ip) & mask) >>> 0) === ((toNum(addr) & mask) >>> 0);
}

function route(table, ip) {
  let best = null;
  let bestLen = -1;
  for (const r of table) {
    if (!inCidr(r.cidr, ip)) continue;
    const len = Number(r.cidr.split('/')[1]);
    if (len > bestLen) {
      best = r.target;
      bestLen = len;
    }
  }
  return best;
}

function sgAllows(rules, { ip, port, protocol }) {
  return rules.some((r) => (r.protocol === '-1' || r.protocol === protocol) && port >= r.from && port <= r.to && inCidr(r.cidr, ip));
}

function canReach(vpc, srcIp, dstIp, port) {
  const target = route(vpc.routes, dstIp);
  if (target === null || target === 'blackhole') return false;
  return sgAllows(vpc.dstRules, { ip: srcIp, port, protocol: 'tcp' });
}
`),
      tests: [
        ex('longest prefix wins', ({ env, expect }) => {
          const t = [{ cidr: '0.0.0.0/0', target: 'igw' }, { cidr: '10.0.0.0/16', target: 'local' }, { cidr: '10.0.5.0/24', target: 'vpn' }];
          expect(env.route(t, '8.8.8.8')).toBe('igw');
          expect(env.route(t, '10.0.1.1')).toBe('local');
          expect(env.route(t, '10.0.5.9')).toBe('vpn');
          expect(env.route([{ cidr: '10.0.0.0/8', target: 'a' }], '11.0.0.1')).toBe(null);
        }),
        ex('equal prefixes: first listed wins; order independence for different lengths', ({ env, expect }) => {
          expect(env.route([{ cidr: '10.0.0.0/16', target: 'first' }, { cidr: '10.0.0.0/16', target: 'second' }], '10.0.1.1')).toBe('first');
          expect(env.route([{ cidr: '10.0.5.0/24', target: 'b' }, { cidr: '0.0.0.0/0', target: 'a' }], '10.0.5.5')).toBe('b');
        }),
        ex('security group rules: cidr, port range, protocol', ({ env, expect }) => {
          const rules = [{ cidr: '203.0.113.0/24', protocol: 'tcp', from: 22, to: 22 }, { cidr: '0.0.0.0/0', protocol: 'tcp', from: 443, to: 443 }, { cidr: '10.0.0.0/16', protocol: '-1', from: 0, to: 65535 }];
          expect(env.sgAllows(rules, { ip: '203.0.113.5', port: 22, protocol: 'tcp' })).toBe(true);
          expect(env.sgAllows(rules, { ip: '198.51.100.5', port: 22, protocol: 'tcp' })).toBe(false);
          expect(env.sgAllows(rules, { ip: '198.51.100.5', port: 443, protocol: 'tcp' })).toBe(true);
          expect(env.sgAllows(rules, { ip: '198.51.100.5', port: 443, protocol: 'udp' })).toBe(false);
          expect(env.sgAllows(rules, { ip: '10.0.3.3', port: 5432, protocol: 'udp' })).toBe(true);
          expect(env.sgAllows([], { ip: '1.1.1.1', port: 1, protocol: 'tcp' })).toBe(false);
        }),
        ex('canReach needs BOTH a usable route and an allowing rule', ({ env, expect }) => {
          const vpc = {
            routes: [{ cidr: '10.0.0.0/16', target: 'local' }, { cidr: '10.0.9.0/24', target: 'blackhole' }],
            dstRules: [{ cidr: '10.0.1.0/24', protocol: 'tcp', from: 5432, to: 5432 }],
          };
          expect(env.canReach(vpc, '10.0.1.4', '10.0.2.2', 5432)).toBe(true);
          expect(env.canReach(vpc, '10.0.1.4', '10.0.2.2', 22)).toBe(false);
          expect(env.canReach(vpc, '10.0.7.4', '10.0.2.2', 5432)).toBe(false);
          expect(env.canReach(vpc, '10.0.1.4', '10.0.9.9', 5432)).toBe(false);
          expect(env.canReach(vpc, '10.0.1.4', '172.16.0.1', 5432)).toBe(false);
        }),
      ],
      hints: ['Compare `(ip & mask) === (network & mask)`, both unsigned.', 'Track the best prefix length seen so far; replace only on strictly longer.', '`canReach`: compute the route first; `null` or `"blackhole"` ⇒ false.'],
    }),
  ],
  references: [
    { title: 'RFC 4632 — Classless Inter-domain Routing (CIDR)', url: 'https://www.rfc-editor.org/rfc/rfc4632' },
    { title: 'RFC 1918 — Address Allocation for Private Internets', url: 'https://www.rfc-editor.org/rfc/rfc1918' },
  ],
};
export default mod;
