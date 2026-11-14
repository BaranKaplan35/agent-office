/**
 * Find one cycle in a dependency graph (node → the nodes it depends on).
 * Returns the cycle as [a, b, …] meaning a → b → … → a, or null when acyclic.
 * Dependencies that are not keys of the graph are treated as leaves.
 */
export function findCycle(graph: ReadonlyMap<string, readonly string[]>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    const current = state.get(node);
    if (current === 'done') return null;
    if (current === 'visiting') return stack.slice(stack.indexOf(node));

    state.set(node, 'visiting');
    stack.push(node);
    for (const dep of graph.get(node) ?? []) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, 'done');
    return null;
  };

  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}
