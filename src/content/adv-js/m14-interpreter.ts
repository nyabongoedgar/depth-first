import type { Module } from '../../core/types';
import { ex, hid, perf, lab, jsFile } from '../helpers';

/** Reference front-end pieces. Each lab starts from the previous lab's solution. */
const TOKENIZER_SRC = `function tokenize(src) {
  const tokens = [];
  const keywords = new Set(['let', 'if', 'else', 'while', 'fun', 'return', 'true', 'false', 'nil', 'print']);
  let i = 0;
  let line = 1;
  const push = (type, value) => tokens.push({ type, value, line });
  const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';
  const isAlpha = (c) => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_');

  while (i < src.length) {
    const c = src[i];
    if (c === '\\n') { line++; i++; continue; }
    if (c === ' ' || c === '\\t' || c === '\\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\\n') i++; continue; }
    if (isDigit(c)) {
      let j = i;
      while (isDigit(src[j])) j++;
      if (src[j] === '.' && isDigit(src[j + 1])) { j++; while (isDigit(src[j])) j++; }
      push('number', Number(src.slice(i, j)));
      i = j;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === '\\\\') { j++; const e = src[j]; s += e === 'n' ? '\\n' : e === 't' ? '\\t' : e; }
        else { if (src[j] === '\\n') line++; s += src[j]; }
        j++;
      }
      if (j >= src.length) throw new SyntaxError('Unterminated string at line ' + line);
      push('string', s);
      i = j + 1;
      continue;
    }
    if (isAlpha(c)) {
      let j = i;
      while (isAlpha(src[j]) || isDigit(src[j])) j++;
      const word = src.slice(i, j);
      push(keywords.has(word) ? 'keyword' : 'ident', word);
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') { push('op', two); i += 2; continue; }
    if ('+-*/%<>=!'.includes(c)) { push('op', c); i++; continue; }
    if ('(){},;'.includes(c)) { push('punct', c); i++; continue; }
    throw new SyntaxError("Unexpected character '" + c + "' at line " + line);
  }
  tokens.push({ type: 'eof', value: null, line });
  return tokens;
}
`;

const EXPR_PARSER_SRC = `const PRECEDENCE = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

class Parser {
  constructor(tokens) { this.tokens = tokens; this.pos = 0; }
  peek() { return this.tokens[this.pos]; }
  next() { return this.tokens[this.pos++]; }
  is(type, value) { const t = this.peek(); return t.type === type && (value === undefined || t.value === value); }
  accept(type, value) { return this.is(type, value) ? this.next() : null; }
  expect(type, value) { if (!this.is(type, value)) this.fail(this.peek(), value); return this.next(); }
  fail(t, wanted) {
    if (t.type === 'eof') throw new SyntaxError('Unexpected end of input' + (wanted ? ", expected '" + wanted + "'" : ''));
    throw new SyntaxError("Unexpected token '" + t.value + "' at line " + t.line);
  }

  expression() {
    const left = this.binary(1);
    if (this.is('op', '=')) {
      const eq = this.next();
      if (left[0] !== 'id') throw new SyntaxError('Invalid assignment target at line ' + eq.line);
      return ['assign', left[1], this.expression()];
    }
    return left;
  }

  binary(minPrec) {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      const prec = t.type === 'op' ? PRECEDENCE[t.value] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      this.next();
      const right = this.binary(prec + 1);
      left = t.value === '&&' ? ['and', left, right] : t.value === '||' ? ['or', left, right] : [t.value, left, right];
    }
  }

  unary() {
    if (this.accept('op', '-')) return ['neg', this.unary()];
    if (this.accept('op', '!')) return ['not', this.unary()];
    return this.call();
  }

  call() {
    let e = this.primary();
    while (this.accept('punct', '(')) {
      const args = [];
      if (!this.is('punct', ')')) { do { args.push(this.expression()); } while (this.accept('punct', ',')); }
      this.expect('punct', ')');
      e = ['call', e, ...args];
    }
    return e;
  }

  primary() {
    const t = this.next();
    if (t.type === 'number') return ['num', t.value];
    if (t.type === 'string') return ['str', t.value];
    if (t.type === 'ident') return ['id', t.value];
    if (t.type === 'keyword' && (t.value === 'true' || t.value === 'false')) return ['bool', t.value === 'true'];
    if (t.type === 'keyword' && t.value === 'nil') return ['nil'];
    if (t.type === 'punct' && t.value === '(') { const e = this.expression(); this.expect('punct', ')'); return e; }
    this.fail(t);
  }
}

function parseExpression(src) {
  const p = new Parser(tokenize(src));
  const e = p.expression();
  if (!p.is('eof')) p.fail(p.peek());
  return e;
}
`;

const STATEMENT_PARSER_SRC = `class StatementParser extends Parser {
  program() {
    const out = [];
    while (!this.is('eof')) out.push(this.declaration());
    return out;
  }

  declaration() {
    if (this.accept('keyword', 'let')) {
      const name = this.expect('ident').value;
      const init = this.accept('op', '=') ? this.expression() : ['nil'];
      this.expect('punct', ';');
      return ['let', name, init];
    }
    if (this.accept('keyword', 'fun')) {
      const name = this.expect('ident').value;
      this.expect('punct', '(');
      const params = [];
      if (!this.is('punct', ')')) { do { params.push(this.expect('ident').value); } while (this.accept('punct', ',')); }
      this.expect('punct', ')');
      this.expect('punct', '{');
      return ['fun', name, params, this.blockBody()];
    }
    return this.statement();
  }

  blockBody() {
    const out = [];
    while (!this.is('punct', '}')) {
      if (this.is('eof')) this.fail(this.peek(), '}');
      out.push(this.declaration());
    }
    this.expect('punct', '}');
    return out;
  }

  statement() {
    if (this.accept('keyword', 'print')) { const e = this.expression(); this.expect('punct', ';'); return ['print', e]; }
    if (this.accept('keyword', 'return')) { const e = this.is('punct', ';') ? null : this.expression(); this.expect('punct', ';'); return ['return', e]; }
    if (this.accept('keyword', 'if')) {
      this.expect('punct', '(');
      const cond = this.expression();
      this.expect('punct', ')');
      const then = this.statement();
      const otherwise = this.accept('keyword', 'else') ? this.statement() : null;
      return ['if', cond, then, otherwise];
    }
    if (this.accept('keyword', 'while')) {
      this.expect('punct', '(');
      const cond = this.expression();
      this.expect('punct', ')');
      return ['while', cond, this.statement()];
    }
    if (this.accept('punct', '{')) return ['block', this.blockBody()];
    const e = this.expression();
    this.expect('punct', ';');
    return ['expr', e];
  }
}

function parseProgram(src) {
  return new StatementParser(tokenize(src)).program();
}
`;

const INTERPRET_SRC = `class Environment {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
  }
  define(name, value) {
    this.vars.set(name, value);
  }
  lookup(name) {
    for (let e = this; e; e = e.parent) if (e.vars.has(name)) return e.vars.get(name);
    throw new Error("Undefined variable '" + name + "'");
  }
  assign(name, value) {
    for (let e = this; e; e = e.parent) {
      if (e.vars.has(name)) {
        e.vars.set(name, value);
        return value;
      }
    }
    throw new Error("Undefined variable '" + name + "'");
  }
}

class ReturnSignal {
  constructor(value) {
    this.value = value;
  }
}

function interpret(program) {
  const out = [];
  const truthy = (v) => v !== null && v !== false;
  const isFn = (v) => v !== null && typeof v === 'object' && v.isFunction === true;
  const show = (v) => (v === null ? 'nil' : isFn(v) ? '<fn ' + v.name + '>' : String(v));
  const needNumbers = (a, b) => {
    if (typeof a !== 'number' || typeof b !== 'number') throw new Error('Operands must be numbers');
  };

  function evaluate(e, env) {
    switch (e[0]) {
      case 'num': case 'str': case 'bool': return e[1];
      case 'nil': return null;
      case 'id': return env.lookup(e[1]);
      case 'assign': return env.assign(e[1], evaluate(e[2], env));
      case 'neg': {
        const v = evaluate(e[1], env);
        if (typeof v !== 'number') throw new Error('Operand must be a number');
        return -v;
      }
      case 'not': return !truthy(evaluate(e[1], env));
      case 'and': { const l = evaluate(e[1], env); return truthy(l) ? evaluate(e[2], env) : l; }
      case 'or': { const l = evaluate(e[1], env); return truthy(l) ? l : evaluate(e[2], env); }
      case 'call': {
        const f = evaluate(e[1], env);
        if (!isFn(f)) throw new Error('Can only call functions');
        const args = e.slice(2).map((a) => evaluate(a, env));
        if (args.length !== f.params.length) throw new Error('Expected ' + f.params.length + ' arguments but got ' + args.length);
        const local = new Environment(f.closure);
        f.params.forEach((p, i) => local.define(p, args[i]));
        try {
          execBlock(f.body, local);
        } catch (err) {
          if (err instanceof ReturnSignal) return err.value;
          throw err;
        }
        return null;
      }
      default: {
        const a = evaluate(e[1], env);
        const b = evaluate(e[2], env);
        switch (e[0]) {
          case '+':
            if ((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string')) return a + b;
            throw new Error('Operands must be two numbers or two strings');
          case '-': needNumbers(a, b); return a - b;
          case '*': needNumbers(a, b); return a * b;
          case '/': needNumbers(a, b); return a / b;
          case '%': needNumbers(a, b); return a % b;
          case '<': needNumbers(a, b); return a < b;
          case '<=': needNumbers(a, b); return a <= b;
          case '>': needNumbers(a, b); return a > b;
          case '>=': needNumbers(a, b); return a >= b;
          case '==': return a === b;
          case '!=': return a !== b;
        }
        throw new Error('Unknown operator ' + e[0]);
      }
    }
  }

  function exec(s, env) {
    switch (s[0]) {
      case 'let': env.define(s[1], evaluate(s[2], env)); break;
      case 'print': out.push(show(evaluate(s[1], env))); break;
      case 'expr': evaluate(s[1], env); break;
      case 'block': execBlock(s[1], new Environment(env)); break;
      case 'if':
        if (truthy(evaluate(s[1], env))) exec(s[2], env);
        else if (s[3]) exec(s[3], env);
        break;
      case 'while':
        while (truthy(evaluate(s[1], env))) exec(s[2], env);
        break;
      case 'fun': env.define(s[1], { isFunction: true, name: s[1], params: s[2], body: s[3], closure: env }); break;
      case 'return': throw new ReturnSignal(s[1] ? evaluate(s[1], env) : null);
    }
  }

  function execBlock(statements, env) {
    for (const s of statements) exec(s, env);
  }

  execBlock(program, new Environment());
  return out;
}

function run(src) {
  return interpret(parseProgram(src));
}
`;

const mod: Module = {
  id: 'interpreter',
  course: 'adv-js',
  title: 'Build a Language: Tokenizer, Parser & Interpreter',
  minutes: 90,
  objectives: [
    'Describe the compiler pipeline: source → tokens → AST → evaluation',
    'Write a tokenizer and a precedence-climbing (Pratt) expression parser',
    'Implement environments, closures and recursion in a tree-walking interpreter',
    'Connect it to how real JS engines (parsing, bytecode, JIT) work',
  ],
  body: `
## Why build an interpreter?

You use a language every day without seeing how it runs. Building even a tiny one explains *scope, closures, call stacks, precedence and errors* better than any lecture — and it's the standard capstone of language courses. In this module you will build a small language, **Lox-lite**, in about 250 lines of JavaScript.

## The pipeline

\`\`\`
source text ──► tokenizer ──► tokens ──► parser ──► AST ──► interpreter ──► result
"1 + 2 * 3"     (lexing)     [1,+,2,*,3]           ['+',1,['*',2,3]]          7
\`\`\`

1. **Lexing**: turn characters into **tokens** (numbers, identifiers, operators, strings), discarding whitespace and comments.
2. **Parsing**: turn the flat token list into a **tree** (the abstract syntax tree) that captures structure and **precedence**.
3. **Evaluating**: walk the tree and perform the operations. This is a **tree-walking interpreter**. Faster engines compile the AST to **bytecode** and run it on a virtual machine, and hot code is further compiled to **machine code** (JIT).

\`\`\`js run
// A taste: evaluate a tiny arithmetic AST
const evaluate = (n) => (typeof n === "number" ? n : { "+": (a, b) => a + b, "*": (a, b) => a * b }[n[0]](evaluate(n[1]), evaluate(n[2])));
console.log(evaluate(["+", 1, ["*", 2, 3]]));
\`\`\`

## Precedence by recursion (Pratt parsing)

\`1 + 2 * 3\` must group as \`1 + (2 * 3)\`. A **Pratt** (precedence-climbing) parser does this with one loop:

\`\`\`
binary(minPrec):
  left = unary()
  while next operator has precedence >= minPrec:
      op = consume
      right = binary(precedence(op) + 1)     // +1 makes the operator LEFT-associative
      left = [op, left, right]
  return left
\`\`\`

- Higher-precedence operators (\`*\`) bind tighter because their recursive call consumes them before returning to the lower one.
- \`+ 1\` on the recursive call gives **left associativity**: \`a - b - c\` is \`(a - b) - c\`. Right-associative operators (assignment, \`**\`) recurse with the *same* precedence.
- **Unary** operators and **calls** bind tightest; **parentheses** restart at the lowest precedence.

## Environments and closures

Variables live in **environments**: a map plus a link to the enclosing environment (the same scope chain from Module 1!). A **function value** is created with the environment where it was *declared* — its **closure**. Calling it creates a *new* environment whose parent is that closure, binds the parameters, and runs the body. That one idea is all there is to lexical scoping and closures.

\`\`\`js run
class Env {
  constructor(parent = null) { this.vars = new Map(); this.parent = parent; }
  get(name) { for (let e = this; e; e = e.parent) if (e.vars.has(name)) return e.vars.get(name); throw new Error("undefined " + name); }
}
const global = new Env(); global.vars.set("x", 1);
const inner = new Env(global); inner.vars.set("y", 2);
console.log(inner.get("x"), inner.get("y"));
\`\`\`

## Control flow tricks

- \`return\` unwinds several statements at once — simplest in a tree-walker is to **throw** a special \`ReturnSignal\` object that the function call catches.
- **Short-circuit** \`&&\`/\`||\` must not evaluate the right side unless needed (and return the *operand*, not a boolean).
- **Truthiness** is a language decision: in Lox only \`nil\` and \`false\` are falsey, so \`0\` and \`""\` are truthy.

## Errors

Report **where** things went wrong (line numbers) and distinguish **syntax errors** (found while parsing, before anything runs) from **runtime errors** (found while evaluating).

:::deep
**How real engines differ.** V8 parses lazily (pre-parses inner functions), compiles to **Ignition bytecode**, then **Sparkplug** → **Maglev** → **TurboFan** optimise hot functions using type feedback — and **deoptimise** if assumptions break. A tree-walker like yours is 10–100× slower than that, but it is exactly the model the spec describes.
:::

:::interview
"Evaluate an arithmetic expression string" (e.g. LeetCode 224/227) is this module in miniature: tokenize, handle precedence/parentheses, evaluate. Knowing the **shunting-yard** or **recursive-descent** approach shows up regularly.
:::
`,
  quiz: [
    { q: 'Which stage turns `"12 + x"` into `[number 12, op +, ident x]`?', options: ['Parser', 'Tokenizer (lexer)', 'Interpreter', 'Linker'], answer: 1, why: 'Lexing groups characters into tokens.' },
    { q: 'In a Pratt parser, why recurse with `prec + 1` for a left-associative operator?', options: ['To save memory', 'So an operator of the same precedence on the right is NOT absorbed — `a-b-c` becomes `(a-b)-c`', 'To handle unary minus', 'To parse strings'], answer: 1, why: 'The recursive call only accepts strictly higher precedence, leaving equal-precedence operators to the outer loop.' },
    { q: 'What is a closure in your interpreter?', options: ['A thrown error', 'A function value paired with the environment where it was declared', 'A compiled bytecode block', 'A syntax tree node'], answer: 1, why: 'Calls create a new environment whose parent is the closure environment.' },
    { q: 'Why is `print false && boom();` safe even if `boom()` has side effects?', options: ['Functions are lazy', '&& short-circuits: the right operand is only evaluated when the left is truthy', 'boom is never defined', 'The parser removes it'], answer: 1, why: 'Logical operators evaluate the right side conditionally.' },
  ],
  labs: [
    lab({
      id: 'adv14-tokenizer',
      title: 'Step 1 — the tokenizer',
      kind: 'code',
      difficulty: 3,
      minutes: 25,
      tags: ['parsing'],
      prompt: `Write \`tokenize(src)\` returning an array of tokens \`{ type, value, line }\` for **Lox-lite**:

| Type | Examples | \`value\` |
|---|---|---|
| \`number\` | \`12\`, \`3.14\` | the JS number |
| \`string\` | \`"hi\\n"\` | the contents, with \`\\n \\t \\" \\\\\` escapes processed |
| \`ident\` | \`foo\`, \`_x1\` | the name |
| \`keyword\` | \`let if else while fun return true false nil print\` | the word |
| \`op\` | \`+ - * / % == != < <= > >= = ! && ||\` | the operator (two-character ones first!) |
| \`punct\` | \`( ) { } , ;\` | the character |

- Skip spaces, tabs, newlines and \`// comments\` to end of line. \`line\` starts at 1 and counts newlines.
- The list ends with \`{ type: 'eof', value: null }\`.
- Throw a \`SyntaxError\` for an unexpected character (message containing \`Unexpected character\`) or an unterminated string (\`Unterminated string\`), mentioning the line number.`,
      expose: ['tokenize'],
      files: jsFile(
        `function tokenize(src) {
  const tokens = [];
  
  tokens.push({ type: 'eof', value: null, line: 1 });
  return tokens;
}
`,
        TOKENIZER_SRC
      ),
      tests: [
        ex('numbers, operators and eof', ({ env, expect }) => {
          const t = env.tokenize('1 + 23.5').map((x: any) => [x.type, x.value]);
          expect(t).toEqual([['number', 1], ['op', '+'], ['number', 23.5], ['eof', null]]);
        }),
        ex('identifiers vs keywords', ({ env, expect }) => {
          const t = env.tokenize('let foo_1 = nil;').map((x: any) => [x.type, x.value]);
          expect(t).toEqual([['keyword', 'let'], ['ident', 'foo_1'], ['op', '='], ['keyword', 'nil'], ['punct', ';'], ['eof', null]]);
        }),
        ex('two-character operators are not split', ({ env, expect }) => {
          const t = env.tokenize('a <= b != c && d || !e == f').map((x: any) => x.value);
          expect(t).toEqual(['a', '<=', 'b', '!=', 'c', '&&', 'd', '||', '!', 'e', '==', 'f', null]);
        }),
        ex('strings with escapes', ({ env, expect }) => {
          const t = env.tokenize('"a\\nb" "q\\"uote"').map((x: any) => x.value);
          expect(t).toEqual(['a\nb', 'q"uote', null]);
        }),
        ex('comments and whitespace are skipped; line numbers count', ({ env, expect }) => {
          const t = env.tokenize('a // ignore me\n  b\n\n c');
          expect(t.map((x: any) => [x.value, x.line])).toEqual([['a', 1], ['b', 2], ['c', 4], [null, 4]]);
        }),
        ex('punctuation', ({ env, expect }) => {
          expect(env.tokenize('f(a, b){}').map((x: any) => x.value)).toEqual(['f', '(', 'a', ',', 'b', ')', '{', '}', null]);
        }),
        ex('unexpected characters throw a SyntaxError with the line', ({ env, expect }) => {
          expect(() => env.tokenize('a\n@')).toThrow('Unexpected character');
          expect(() => env.tokenize('a\n@')).toThrow('line 2');
        }),
        ex('unterminated strings throw', ({ env, expect }) => expect(() => env.tokenize('"oops')).toThrow('Unterminated string')),
        hid('a dot not followed by a digit is not part of the number', ({ env, expect }) => {
          expect(() => env.tokenize('12.')).toThrow('Unexpected character');
        }),
      ],
      hints: ['A `while (i < src.length)` loop with `const c = src[i]`; handle each class of character, advancing `i`.', 'Numbers: consume digits, then if the next char is `.` **and** the one after is a digit, consume the fraction.', 'Check the two-character operators (`==`, `!=`, `<=`, `>=`, `&&`, `||`) before the one-character ones.'],
      why: 'Every linter, formatter, syntax highlighter and compiler starts with a lexer.',
    }),

    lab({
      id: 'adv14-parser',
      title: 'Step 2 — a Pratt expression parser',
      kind: 'code',
      difficulty: 4,
      minutes: 35,
      tags: ['parsing'],
      interview: true,
      prompt: `\`tokenize\` is given (your solution from step 1). Implement the **parser**: \`parseExpression(src)\` returns a tree as nested arrays:

| Source | AST |
|---|---|
| \`12\` / \`"hi"\` / \`true\` / \`nil\` / \`x\` | \`['num', 12]\` / \`['str', 'hi']\` / \`['bool', true]\` / \`['nil']\` / \`['id', 'x']\` |
| \`a + b\` (also \`- * / % < <= > >= == !=\`) | \`['+', A, B]\` |
| \`a && b\`, \`a \\|\\| b\` | \`['and', A, B]\`, \`['or', A, B]\` |
| \`-a\`, \`!a\` | \`['neg', A]\`, \`['not', A]\` |
| \`f(a, b)\` | \`['call', F, A, B]\` (calls chain: \`f(1)(2)\`) |
| \`x = e\` | \`['assign', 'x', E]\` — right-associative, target must be an identifier |

**Precedence** (loosest → tightest): \`||\`, \`&&\`, \`== !=\`, \`< <= > >=\`, \`+ -\`, \`* / %\`, unary, call. Binary operators are **left-associative**. Parentheses group.

Throw a \`SyntaxError\` for incomplete input (\`1 +\`), a missing \`)\`, trailing tokens (\`1 2\`) or an invalid assignment target (\`1 = 2\`).`,
      expose: ['parseExpression'],
      files: jsFile(
        TOKENIZER_SRC +
          `
function parseExpression(src) {
  const tokens = tokenize(src);
  
}
`,
        TOKENIZER_SRC + '\n' + EXPR_PARSER_SRC
      ),
      tests: [
        ex('literals and identifiers', ({ env, expect }) => {
          expect(env.parseExpression('12')).toEqual(['num', 12]);
          expect(env.parseExpression('"hi"')).toEqual(['str', 'hi']);
          expect(env.parseExpression('true')).toEqual(['bool', true]);
          expect(env.parseExpression('nil')).toEqual(['nil']);
          expect(env.parseExpression('x')).toEqual(['id', 'x']);
        }),
        ex('multiplication binds tighter than addition', ({ env, expect }) => {
          expect(env.parseExpression('1 + 2 * 3')).toEqual(['+', ['num', 1], ['*', ['num', 2], ['num', 3]]]);
          expect(env.parseExpression('1 * 2 + 3')).toEqual(['+', ['*', ['num', 1], ['num', 2]], ['num', 3]]);
        }),
        ex('binary operators are left-associative', ({ env, expect }) => {
          expect(env.parseExpression('8 - 3 - 2')).toEqual(['-', ['-', ['num', 8], ['num', 3]], ['num', 2]]);
          expect(env.parseExpression('8 / 4 / 2')).toEqual(['/', ['/', ['num', 8], ['num', 4]], ['num', 2]]);
        }),
        ex('parentheses override precedence', ({ env, expect }) => {
          expect(env.parseExpression('(1 + 2) * 3')).toEqual(['*', ['+', ['num', 1], ['num', 2]], ['num', 3]]);
        }),
        ex('comparison / equality / logic precedence', ({ env, expect }) => {
          expect(env.parseExpression('a < b == c')).toEqual(['==', ['<', ['id', 'a'], ['id', 'b']], ['id', 'c']]);
          expect(env.parseExpression('a || b && c')).toEqual(['or', ['id', 'a'], ['and', ['id', 'b'], ['id', 'c']]]);
          expect(env.parseExpression('1 + 2 < 4')).toEqual(['<', ['+', ['num', 1], ['num', 2]], ['num', 4]]);
        }),
        ex('unary operators', ({ env, expect }) => {
          expect(env.parseExpression('-a * b')).toEqual(['*', ['neg', ['id', 'a']], ['id', 'b']]);
          expect(env.parseExpression('!!x')).toEqual(['not', ['not', ['id', 'x']]]);
          expect(env.parseExpression('1 - -2')).toEqual(['-', ['num', 1], ['neg', ['num', 2]]]);
        }),
        ex('calls, including chained calls and arguments', ({ env, expect }) => {
          expect(env.parseExpression('f(1, 2 + 3)')).toEqual(['call', ['id', 'f'], ['num', 1], ['+', ['num', 2], ['num', 3]]]);
          expect(env.parseExpression('f(1)(2)')).toEqual(['call', ['call', ['id', 'f'], ['num', 1]], ['num', 2]]);
          expect(env.parseExpression('f()')).toEqual(['call', ['id', 'f']]);
        }),
        ex('assignment is right-associative and has the lowest precedence', ({ env, expect }) => {
          expect(env.parseExpression('a = b = 1 + 2')).toEqual(['assign', 'a', ['assign', 'b', ['+', ['num', 1], ['num', 2]]]]);
        }),
        ex('syntax errors', ({ env, expect }) => {
          expect(() => env.parseExpression('1 +')).toThrow('Unexpected end of input');
          expect(() => env.parseExpression('(1 + 2')).toThrow('expected');
          expect(() => env.parseExpression('1 2')).toThrow('Unexpected token');
          expect(() => env.parseExpression('1 = 2')).toThrow('Invalid assignment target');
          expect(() => env.parseExpression('')).toThrow('Unexpected end of input');
        }),
        hid('deeply nested parentheses', ({ env, expect }) => {
          const src = '('.repeat(150) + '1' + ')'.repeat(150);
          expect(env.parseExpression(src)).toEqual(['num', 1]);
        }),
        hid('long left-associative chains are balanced to the left', ({ env, expect }) => {
          const ast = env.parseExpression('1' + ' + 1'.repeat(200));
          let depth = 0;
          let n = ast;
          while (Array.isArray(n) && n[0] === '+') { n = n[1]; depth++; }
          expect(depth).toBe(200);
        }),
      ],
      hints: [
        'Write `expression()` → `binary(1)`; if the next token is `=` and the left side was `[\'id\', name]`, build `[\'assign\', name, this.expression()]`.',
        '`binary(minPrec)`: parse `unary()`, then loop while the next token is an operator whose precedence is `>= minPrec`: consume it, `right = binary(prec + 1)`, `left = [op, left, right]`.',
        '`&&` and `||` produce `\'and\'` / `\'or\'` nodes. `unary()` handles `-` and `!`, then falls through to `call()`; `call()` loops while it sees `(`.',
        'After parsing, the next token must be `eof` — otherwise it is a trailing-token error.',
      ],
      why: 'Pratt parsing is what many production parsers (TypeScript\'s binary expression parser, Crockford\'s JSLint, V8\'s expression parsing) use.',
    }),

    lab({
      id: 'adv14-interpreter',
      title: 'Step 3 — the interpreter (closures, scope, recursion)',
      kind: 'code',
      difficulty: 5,
      minutes: 45,
      tags: ['interpreters', 'closures'],
      interview: true,
      prompt: `The complete front-end (\`tokenize\`, \`parseProgram\`) is given. \`parseProgram(src)\` returns an array of statements:

\`['let', name, expr]\` · \`['print', expr]\` · \`['expr', expr]\` · \`['block', [stmts]]\` · \`['if', cond, then, else|null]\` · \`['while', cond, body]\` · \`['fun', name, [params], [stmts]]\` · \`['return', expr|null]\`

Expression nodes are as in step 2. Implement \`interpret(program)\`, which executes the statements and **returns the array of printed lines** (strings). \`run(src)\` is provided (\`interpret(parseProgram(src))\`).

**Semantics**
- Numbers, strings, booleans, \`nil\` (represent as \`null\`). Printing: \`nil\` → \`nil\`, numbers/booleans/strings as usual, functions as \`<fn name>\`.
- **Truthiness:** only \`nil\` and \`false\` are falsey (\`0\` and \`""\` are truthy). \`and\`/\`or\` short-circuit and return an **operand**.
- \`+\` adds two numbers or concatenates two strings; otherwise \`Error('Operands must be two numbers or two strings')\`. \`- * / % < <= > >=\` need numbers (\`Error('Operands must be numbers')\`); unary \`-\` needs a number (\`Error('Operand must be a number')\`). \`==\`/\`!=\` use strict equality (no coercion).
- **Scope:** blocks create a new scope; \`let\` defines in the current scope (may shadow); assignment updates the nearest existing variable. An unknown variable → \`Error("Undefined variable 'x'")\`.
- **Functions** are first-class **closures**: a call runs in a fresh scope whose parent is the scope where the function was *declared*. Wrong argument count → \`Error('Expected 2 arguments but got 1')\`; calling a non-function → \`Error('Can only call functions')\`. Falling off the end (or \`return;\`) gives \`nil\`.`,
      expose: ['run'],
      files: jsFile(
        TOKENIZER_SRC +
          '\n' +
          EXPR_PARSER_SRC +
          '\n' +
          STATEMENT_PARSER_SRC +
          `
function interpret(program) {
  const out = [];
  // TODO: execute the statements and push printed lines to out
  return out;
}

function run(src) {
  return interpret(parseProgram(src));
}
`,
        TOKENIZER_SRC + '\n' + EXPR_PARSER_SRC + '\n' + STATEMENT_PARSER_SRC + '\n' + INTERPRET_SRC
      ),
      tests: [
        ex('arithmetic and precedence', ({ env, expect }) => expect(env.run('print 1 + 2 * 3; print (1 + 2) * 3; print 10 % 4; print 10 / 4;')).toEqual(['7', '9', '2', '2.5'])),
        ex('strings, booleans and nil print naturally', ({ env, expect }) => expect(env.run('print "a" + "b"; print true; print nil; print 1 < 2;')).toEqual(['ab', 'true', 'nil', 'true'])),
        ex('variables, assignment and block scope', ({ env, expect }) => {
          expect(env.run('let a = 1; { let a = 2; print a; } print a; a = a + 1; print a;')).toEqual(['2', '1', '2']);
        }),
        ex('assignment reaches enclosing scopes', ({ env, expect }) => {
          expect(env.run('let x = 1; { { x = 5; } } print x;')).toEqual(['5']);
        }),
        ex('if / else and while', ({ env, expect }) => {
          expect(env.run('let i = 0; let s = 0; while (i < 5) { s = s + i; i = i + 1; } print s; if (s > 5) print "big"; else print "small";')).toEqual(['10', 'big']);
        }),
        ex('functions and recursion', ({ env, expect }) => {
          expect(env.run('fun fib(n) { if (n < 2) return n; return fib(n - 1) + fib(n - 2); } print fib(15);')).toEqual(['610']);
        }),
        ex('closures capture their defining environment', ({ env, expect }) => {
          const src = 'fun makeCounter() { let c = 0; fun inc() { c = c + 1; return c; } return inc; } let a = makeCounter(); let b = makeCounter(); print a(); print a(); print b();';
          expect(env.run(src)).toEqual(['1', '2', '1']);
        }),
        ex('closures use lexical (not dynamic) scope', ({ env, expect }) => {
          const src = 'let x = "global"; fun show() { print x; } fun test() { let x = "local"; show(); } test();';
          expect(env.run(src)).toEqual(['global']);
        }),
        ex('higher-order functions', ({ env, expect }) => {
          const src = 'fun twice(f, x) { return f(f(x)); } fun add3(n) { return n + 3; } print twice(add3, 10); fun adder(n) { fun add(x) { return x + n; } return add; } print adder(5)(6);';
          expect(env.run(src)).toEqual(['16', '11']);
        }),
        ex('and / or short-circuit and return operands', ({ env, expect }) => {
          const src = 'fun boom() { print "boom"; return true; } print false && boom(); print true || boom(); print nil || "x"; print 1 && 2;';
          expect(env.run(src)).toEqual(['false', 'true', 'x', '2']);
        }),
        ex('only nil and false are falsey', ({ env, expect }) => {
          expect(env.run('if (0) print "zero"; if (nil) print "no"; if ("") print "empty"; if (!nil) print "not nil";')).toEqual(['zero', 'empty', 'not nil']);
        }),
        ex('equality is strict', ({ env, expect }) => {
          expect(env.run('print 1 == 1; print "a" == "a"; print nil == nil; print 1 == "1"; print nil == false; print 1 != 2;')).toEqual(['true', 'true', 'true', 'false', 'false', 'true']);
        }),
        ex('return without a value and falling off the end give nil; functions print as <fn name>', ({ env, expect }) => {
          expect(env.run('fun f() { return; } fun g() {} print f(); print g(); print f;')).toEqual(['nil', 'nil', '<fn f>']);
        }),
        ex('return stops the function immediately (even from inside loops)', ({ env, expect }) => {
          expect(env.run('fun first(n) { let i = 0; while (true) { if (i == n) return i; i = i + 1; } } print first(7);')).toEqual(['7']);
        }),
        ex('runtime errors', ({ env, expect }) => {
          expect(() => env.run('print x;')).toThrow("Undefined variable 'x'");
          expect(() => env.run('x = 1;')).toThrow("Undefined variable 'x'");
          expect(() => env.run('fun f(a, b) {} f(1);')).toThrow('Expected 2 arguments but got 1');
          expect(() => env.run('let n = 1; n();')).toThrow('Can only call functions');
          expect(() => env.run('print 1 + "a";')).toThrow('two numbers or two strings');
          expect(() => env.run('print "a" * 2;')).toThrow('Operands must be numbers');
          expect(() => env.run('print -"a";')).toThrow('Operand must be a number');
        }),
        ex('syntax errors surface from run()', ({ env, expect }) => {
          expect(() => env.run('print 1')).toThrow('Unexpected end of input');
          expect(() => env.run('let = 1;')).toThrow('Unexpected token');
        }),
        hid('output before a runtime error is not lost to later programs (each run is independent)', ({ env, expect }) => {
          try { env.run('let leaked = 1; print leaked; print boom;'); } catch { /* expected */ }
          expect(() => env.run('print leaked;')).toThrow("Undefined variable 'leaked'");
        }),
        hid('recursion depth of 200', ({ env, expect }) => {
          expect(env.run('fun d(n) { if (n == 0) return 0; return 1 + d(n - 1); } print d(200);')).toEqual(['200']);
        }),
        hid('a loop with 5,000 iterations', ({ env, expect }) => {
          expect(env.run('let i = 0; let s = 0; while (i < 5000) { s = s + i; i = i + 1; } print s;')).toEqual(['12497500']);
        }),
      ],
      hints: [
        'Make an `Environment` class: a `Map` plus a `parent`. `lookup` and `assign` walk up the chain; `define` sets in the current map.',
        'Write two recursive functions, `evaluate(expr, env)` and `exec(stmt, env)`, each a `switch` on the node kind (`node[0]`).',
        'A function value: `{ isFunction: true, name, params, body, closure: env }` created by the `fun` statement. A call makes `new Environment(f.closure)`, defines the params, runs the body.',
        '`return` can `throw new ReturnSignal(value)`; the call catches it. Re-throw anything that is not a `ReturnSignal`.',
        '`and`/`or`: evaluate the left side first, and only evaluate the right if needed — return the operand value itself.',
      ],
      why: 'This is the capstone: your own working language with closures. Nothing in a real engine is conceptually harder.',
    }),
  ],
  references: [
    { title: 'Crafting Interpreters — Robert Nystrom (free online)', url: 'https://craftinginterpreters.com/' },
    { title: 'Pratt Parsers: Expression Parsing Made Easy (Bob Nystrom)', url: 'https://journal.stuffwithstuff.com/2011/03/19/pratt-parsers-expression-parsing-made-easy/' },
    { title: 'V8 blog — Ignition and TurboFan', url: 'https://v8.dev/blog/launching-ignition-and-turbofan' },
  ],
};
export default mod;
