import type { Module } from '../../core/types';
import { ex, prop, lab, jsFile } from '../helpers';

const mod: Module = {
  id: 'iam-reliability',
  course: 'cloud',
  title: 'IAM Policy Evaluation and SLOs / Error Budgets',
  minutes: 90,
  objectives: [
    'Evaluate allow/deny policies with wildcards: explicit deny wins, default is deny',
    'Apply least privilege',
    'Convert an SLO into an error budget and compute burn rates',
    'Explain multi-window burn-rate alerting',
  ],
  body: `
## Identity and access management

Every cloud request asks: **may this principal perform this action on this resource?** Policies are JSON statements:

\`\`\`json
{ "Effect": "Allow", "Action": ["s3:GetObject"], "Resource": "arn:aws:s3:::reports/*" }
\`\`\`

Evaluation (AWS-style, simplified):

1. Start with **implicit deny**.
2. If any matching statement has \`Effect: Deny\` → **denied** (explicit deny always wins).
3. Else if any matching statement has \`Effect: Allow\` → **allowed**.
4. Else denied.

**Wildcards:** \`*\` matches any run of characters, \`?\` exactly one. \`s3:Get*\` matches \`s3:GetObject\`. Real systems add conditions (source IP, MFA, tags), permission boundaries, service control policies and resource policies — all of which can only **narrow** what identity policies grant (except resource policies that grant cross-account access).

**Least privilege:** grant only the actions on only the resources needed. Prefer roles with short-lived credentials over long-lived keys; never put secrets in code or images.

:::warn
\`"Action": "*", "Resource": "*"\` is an administrator. Confused-deputy and over-broad wildcard bugs are the most common cloud-security findings.
:::

## SLOs and error budgets

An **SLI** is a measured ratio (good events / valid events). An **SLO** is the target: "99.9% of requests succeed over 30 days". The **error budget** is what's left: $1-\\text{SLO}$. For 99.9% over 30 days that is 0.1% of requests, or $0.001\\times 30\\times 24\\times 60=43.2$ minutes of full downtime.

**Burn rate** = (observed error rate) / (budget rate). Burn rate 1 spends exactly the budget over the window; 14.4 would exhaust a 30-day budget in about 2 days (30/14.4 ≈ 2.08 days). Google's SRE workbook alerts on **multiple windows**: page when a short *and* a long window both exceed a high burn rate (fast, real, still happening), ticket for slow burns. When the budget is spent, feature releases pause in favour of reliability work.

:::interview
"Your service has a 99.95% SLO. How many minutes of downtime per month is that, and what do you do when you've burned 80% by day 10?" — 21.6 minutes; freeze risky changes, investigate the burn, prioritise reliability.
:::
`,
  quiz: [
    { q: 'A policy has Allow s3:* on a bucket and a Deny s3:DeleteObject on the same bucket. Can the user delete an object?', options: ['Yes, Allow is broader', 'No, explicit deny wins', 'Only with MFA', 'Depends on order'], answer: 1, why: 'Explicit deny always overrides allow.' },
    { q: 'With no matching statement, the result is…', options: ['Allow', 'Deny', 'Error', 'Prompt'], answer: 1, why: 'Default (implicit) deny.' },
    { q: 'Error budget for a 99.9% monthly SLO (30 days), in minutes of total outage?', options: ['4.32', '43.2', '432', '7.2'], answer: 1, why: '0.1% × 43,200 minutes = 43.2.' },
    { q: 'A burn rate of 2 sustained for the whole window means…', options: ['You meet the SLO exactly', 'You use twice the budget, so the SLO is missed', 'You use half the budget', 'The SLI is 2%'], answer: 1, why: 'Burn rate 1 = on budget; 2 = double.' },
  ],
  labs: [
    lab({
      id: 'c2-iam',
      title: 'An IAM policy evaluator',
      kind: 'code',
      difficulty: 3,
      minutes: 30,
      tags: ['iam', 'security'],
      interview: true,
      prompt: `Implement:

- \`wildcardMatch(pattern, text)\` — \`*\` matches any (possibly empty) sequence, \`?\` exactly one character, everything else literal. Case-sensitive, the whole string must match. **Do not use RegExp built from untrusted text without escaping**; a hand-rolled matcher is fine.
- \`isAllowed(policies, { action, resource })\` — \`policies\` is an array of statements \`{ effect: "Allow" | "Deny", actions: string[], resources: string[] }\`. A statement **matches** if some action pattern matches \`action\` and some resource pattern matches \`resource\`. Any matching Deny → false; else any matching Allow → true; else false.`,
      expose: ['wildcardMatch', 'isAllowed'],
      files: jsFile(`function wildcardMatch(pattern, text) {\n  \n}\n\nfunction isAllowed(policies, { action, resource }) {\n  \n}\n`, `function wildcardMatch(pattern, text) {
  let p = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (p < pattern.length && (pattern[p] === '?' || pattern[p] === text[t])) {
      p++;
      t++;
    } else if (p < pattern.length && pattern[p] === '*') {
      star = p++;
      mark = t;
    } else if (star !== -1) {
      p = star + 1;
      t = ++mark;
    } else return false;
  }
  while (p < pattern.length && pattern[p] === '*') p++;
  return p === pattern.length;
}

function isAllowed(policies, { action, resource }) {
  let allowed = false;
  for (const s of policies) {
    const hit = s.actions.some((a) => wildcardMatch(a, action)) && s.resources.some((r) => wildcardMatch(r, resource));
    if (!hit) continue;
    if (s.effect === 'Deny') return false;
    if (s.effect === 'Allow') allowed = true;
  }
  return allowed;
}
`),
      tests: [
        ex('wildcards', ({ env, expect }) => {
          const m = env.wildcardMatch;
          expect([m('s3:Get*', 's3:GetObject'), m('s3:Get*', 's3:PutObject'), m('*', ''), m('a?c', 'abc'), m('a?c', 'ac'), m('*:*', 'ec2:RunInstances')]).toEqual([true, false, true, true, false, true]);
          expect([m('a*b*c', 'aXXbYYc'), m('a*b*c', 'aXXbYY'), m('abc', 'ABC'), m('a.c', 'abc'), m('a*', 'a')]).toEqual([true, false, false, false, true]);
        }),
        ex('wildcards handle backtracking and stay fast on adversarial input', ({ env, expect }) => {
          expect(env.wildcardMatch('*a*a*a*a*b', 'a'.repeat(40))).toBe(false);
          expect(env.wildcardMatch('*a*a*a*a*b', 'a'.repeat(40) + 'b')).toBe(true);
          expect(env.wildcardMatch('a*aab', 'aaab')).toBe(true);
        }),
        ex('default deny, allow, explicit deny wins', ({ env, expect }) => {
          const pol = [
            { effect: 'Allow', actions: ['s3:*'], resources: ['arn:aws:s3:::reports/*'] },
            { effect: 'Deny', actions: ['s3:Delete*'], resources: ['*'] },
          ];
          const q = (action: string, resource: string) => env.isAllowed(pol, { action, resource });
          expect(q('s3:GetObject', 'arn:aws:s3:::reports/q1.pdf')).toBe(true);
          expect(q('s3:DeleteObject', 'arn:aws:s3:::reports/q1.pdf')).toBe(false);
          expect(q('s3:GetObject', 'arn:aws:s3:::other/x')).toBe(false);
          expect(q('ec2:StartInstances', 'arn:aws:s3:::reports/x')).toBe(false);
          expect(env.isAllowed([], { action: 'x', resource: 'y' })).toBe(false);
        }),
        ex('deny wins regardless of statement order', ({ env, expect }) => {
          const a = { effect: 'Allow', actions: ['*'], resources: ['*'] };
          const d = { effect: 'Deny', actions: ['iam:*'], resources: ['*'] };
          expect(env.isAllowed([a, d], { action: 'iam:CreateUser', resource: 'u' })).toBe(false);
          expect(env.isAllowed([d, a], { action: 'iam:CreateUser', resource: 'u' })).toBe(false);
          expect(env.isAllowed([d, a], { action: 's3:Get', resource: 'u' })).toBe(true);
        }),
        prop('property: adding an Allow can only grant, adding a Deny can only revoke', async ({ env, forAll, gen, expect }) => {
          await forAll([gen.int(0, 3), gen.int(0, 3), gen.int(0, 3)], (i: number, j: number, k: number) => {
            const acts = ['s3:Get', 's3:Put', 'ec2:Run', 'iam:Make'], res = ['a/1', 'a/2', 'b/1', 'c'];
            const base = [{ effect: 'Allow', actions: [acts[i]], resources: [res[j]] }];
            const q = { action: acts[k], resource: res[k] };
            const before = env.isAllowed(base, q);
            const withAllow = env.isAllowed([...base, { effect: 'Allow', actions: ['*'], resources: [res[k]] }], q);
            const withDeny = env.isAllowed([...base, { effect: 'Deny', actions: ['*'], resources: ['*'] }], q);
            if (before) expect(withAllow).toBe(true);
            expect(withDeny).toBe(false);
          }, { runs: 80 });
        }),
      ],
      hints: ['Wildcard matching with `*` is a classic: walk both strings; on `*` remember its position and the text index; on mismatch backtrack to the star and advance the text by one.', 'Scan all statements: return false immediately on a matching Deny, otherwise remember if any Allow matched.'],
    }),
    lab({
      id: 'c2-slo',
      title: 'Error budgets and burn-rate alerts',
      kind: 'code',
      difficulty: 2,
      minutes: 20,
      tags: ['sre', 'slo'],
      prompt: `Implement:

- \`errorBudgetMinutes(slo, days)\` — minutes of full downtime allowed (\`slo\` as a fraction like \`0.999\`).
- \`burnRate(errors, total, slo)\` — observed error rate divided by \`(1 − slo)\`. If \`total\` is 0 return 0.
- \`timeToExhaust(burn, days)\` — days until a \`days\`-long budget is spent at a constant burn rate (\`Infinity\` if burn ≤ 0).
- \`shouldPage(shortWin, longWin, threshold)\` — each window is \`{ errors, total, slo }\`; page only if **both** burn rates are ≥ \`threshold\`.`,
      expose: ['errorBudgetMinutes', 'burnRate', 'timeToExhaust', 'shouldPage'],
      files: jsFile(`function errorBudgetMinutes(slo, days) {\n  \n}\n\nfunction burnRate(errors, total, slo) {\n  \n}\n\nfunction timeToExhaust(burn, days) {\n  \n}\n\nfunction shouldPage(shortWin, longWin, threshold) {\n  \n}\n`, `function errorBudgetMinutes(slo, days) {
  return (1 - slo) * days * 24 * 60;
}

function burnRate(errors, total, slo) {
  if (total === 0) return 0;
  return errors / total / (1 - slo);
}

function timeToExhaust(burn, days) {
  return burn <= 0 ? Infinity : days / burn;
}

function shouldPage(shortWin, longWin, threshold) {
  const b = (w) => burnRate(w.errors, w.total, w.slo);
  return b(shortWin) >= threshold && b(longWin) >= threshold;
}
`),
      tests: [
        ex('error budget', ({ env, expect }) => {
          expect(env.errorBudgetMinutes(0.999, 30)).toBeNear(43.2, { abs: 1e-9 });
          expect(env.errorBudgetMinutes(0.9995, 30)).toBeNear(21.6, { abs: 1e-9 });
          expect(env.errorBudgetMinutes(0.99, 7)).toBeNear(100.8, { abs: 1e-9 });
          expect(env.errorBudgetMinutes(1, 30)).toBe(0);
        }),
        ex('burn rate', ({ env, expect }) => {
          expect(env.burnRate(1, 1000, 0.999)).toBeNear(1, { abs: 1e-9 });
          expect(env.burnRate(144, 10000, 0.999)).toBeNear(14.4, { abs: 1e-9 });
          expect(env.burnRate(0, 100, 0.99)).toBe(0);
          expect(env.burnRate(0, 0, 0.99)).toBe(0);
        }),
        ex('time to exhaust', ({ env, expect }) => {
          expect(env.timeToExhaust(1, 30)).toBe(30);
          expect(env.timeToExhaust(14.4, 30)).toBeNear(30 / 14.4, { abs: 1e-9 });
          expect(env.timeToExhaust(0, 30)).toBe(Infinity);
        }),
        ex('multi-window paging needs both windows burning', ({ env, expect }) => {
          const hot = { errors: 20, total: 1000, slo: 0.999 };
          const cold = { errors: 0, total: 1000, slo: 0.999 };
          expect(env.shouldPage(hot, hot, 14.4)).toBe(true);
          expect(env.shouldPage(hot, cold, 14.4)).toBe(false);
          expect(env.shouldPage(cold, hot, 14.4)).toBe(false);
        }),
      ],
      hints: ['Budget minutes = `(1 − slo) × days × 24 × 60`.', 'Burn rate = `(errors/total) / (1 − slo)`.', 'Time to exhaust = `days / burn`.'],
    }),
  ],
  references: [
    { title: 'Google SRE Workbook — Alerting on SLOs', url: 'https://sre.google/workbook/alerting-on-slos/' },
    { title: 'AWS IAM — Policy evaluation logic', url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html' },
  ],
};
export default mod;
