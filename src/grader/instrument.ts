/**
 * Step instrumentation. We parse the learner's code with acorn and insert a counter call
 * (`__t()`) at the start of every loop body and function body. That gives us:
 *   • a deterministic "steps" metric (complexity tests don't depend on how fast the machine is);
 *   • a guaranteed way to stop infinite loops, even synchronous ones;
 *   • unchanged line numbers (everything is inserted on the same line).
 * Native built-ins (e.g. Array.prototype.sort) are not counted — tests that care combine
 * step budgets with `forbid` rules (see `usesMember`).
 */
import * as acorn from 'acorn';

type Node = acorn.Node & Record<string, any>;

function walk(node: Node, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null) {
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'type') continue;
    const v = (node as any)[key];
    if (Array.isArray(v)) {
      for (const c of v) if (c && typeof c.type === 'string') walk(c, visit, node);
    } else if (v && typeof v.type === 'string') {
      walk(v, visit, node);
    }
  }
}

export function parse(code: string): Node {
  try {
    return acorn.parse(code, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
    }) as Node;
  } catch (e: any) {
    const err = new SyntaxError(String(e.message || e));
    throw err;
  }
}

export function instrument(code: string): string {
  const ast = parse(code);
  const inserts: { pos: number; text: string; order: number }[] = [];
  let order = 0;
  const add = (pos: number, text: string) => inserts.push({ pos, text, order: order++ });

  walk(ast, (n) => {
    switch (n.type) {
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
      case 'WhileStatement':
      case 'DoWhileStatement': {
        const b = n.body as Node;
        if (b.type === 'BlockStatement') add(b.start + 1, '__t();');
        else {
          add(b.start, '{__t();');
          add(b.end, '}');
        }
        break;
      }
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const b = n.body as Node;
        if (b.type === 'BlockStatement') add(b.start + 1, '__t();');
        else {
          add(b.start, '(__t(),');
          add(b.end, ')');
        }
        break;
      }
      case 'StaticBlock':
        break;
    }
  });

  // apply from the end so earlier offsets stay valid; for equal positions keep insertion order
  inserts.sort((a, b) => b.pos - a.pos || b.order - a.order);
  let out = code;
  for (const i of inserts) out = out.slice(0, i.pos) + i.text + out.slice(i.pos);
  return out;
}

/** Structural helper for tests: does the code reference this identifier or member name (e.g. `sort`, `indexOf`)? */
export function usesMember(code: string, name: string): boolean {
  const ast = parse(code);
  let found = false;
  walk(ast, (n) => {
    if (n.type === 'MemberExpression' && !n.computed && n.property.name === name) found = true;
    if (n.type === 'Identifier' && n.name === name) found = true;
  });
  return found;
}

/** Does the code contain a function (declaration or expression) calling itself by name? */
export function isRecursive(code: string, fnName: string): boolean {
  const ast = parse(code);
  let rec = false;
  walk(ast, (n) => {
    if (n.type === 'FunctionDeclaration' && n.id?.name === fnName) {
      walk(n.body, (m) => {
        if (m.type === 'CallExpression' && m.callee.type === 'Identifier' && m.callee.name === fnName) rec = true;
      });
    }
  });
  return rec;
}
