// OStack Engineering Knowledge Graph (§5) — a typed, validated traceability
// graph linking needs to features, invariants, endpoints, permissions, tests,
// files, evidence and releases. Not a vector store: every edge is an explicit,
// queryable engineering relation.

export type NodeKind =
  | "need"
  | "feature"
  | "invariant"
  | "endpoint"
  | "component"
  | "data_model"
  | "permission"
  | "test"
  | "evidence"
  | "file"
  | "release"
  | "risk";

export type Relation =
  | "implements"      // feature → need
  | "declares"        // feature → invariant
  | "exposed_by"      // feature → endpoint
  | "displayed_in"    // feature → component
  | "uses"            // feature|component|endpoint → data_model|file
  | "protected_by"    // feature|endpoint → permission
  | "verified_by"     // invariant|feature|permission → test|evidence
  | "touches"         // feature → file
  | "introduced_in"   // feature → release
  | "carries";        // feature|release → risk

const RELATION_RULES: Record<Relation, { from: NodeKind[]; to: NodeKind[] }> = {
  implements: { from: ["feature"], to: ["need"] },
  declares: { from: ["feature"], to: ["invariant"] },
  exposed_by: { from: ["feature"], to: ["endpoint"] },
  displayed_in: { from: ["feature"], to: ["component"] },
  uses: { from: ["feature", "component", "endpoint"], to: ["data_model", "file"] },
  protected_by: { from: ["feature", "endpoint"], to: ["permission"] },
  verified_by: { from: ["invariant", "feature", "permission"], to: ["test", "evidence"] },
  touches: { from: ["feature"], to: ["file"] },
  introduced_in: { from: ["feature"], to: ["release"] },
  carries: { from: ["feature", "release"], to: ["risk"] }
};

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GraphEdge {
  from: string;
  relation: Relation;
  to: string;
}

export interface SerializedGraph {
  schemaVersion: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export class KnowledgeGraph {
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges = new Set<string>();
  private readonly edgeList: GraphEdge[] = [];

  upsertNode(node: GraphNode): void {
    const existing = this.nodes.get(node.id);
    if (existing && existing.kind !== node.kind) {
      throw new Error(`Node '${node.id}' already exists with kind '${existing.kind}', not '${node.kind}'`);
    }
    this.nodes.set(node.id, existing ? { ...existing, ...node, metadata: { ...existing.metadata, ...node.metadata } } : node);
  }

  link(from: string, relation: Relation, to: string): void {
    const source = this.nodes.get(from);
    const target = this.nodes.get(to);
    if (!source) throw new Error(`Unknown source node: ${from}`);
    if (!target) throw new Error(`Unknown target node: ${to}`);
    const rule = RELATION_RULES[relation];
    if (!rule.from.includes(source.kind)) throw new Error(`Relation '${relation}' cannot start from a '${source.kind}' node`);
    if (!rule.to.includes(target.kind)) throw new Error(`Relation '${relation}' cannot point to a '${target.kind}' node`);
    const key = `${from}→${relation}→${to}`;
    if (this.edges.has(key)) return;
    this.edges.add(key);
    this.edgeList.push({ from, relation, to });
  }

  node(id: string): GraphNode | undefined { return this.nodes.get(id); }
  allNodes(kind?: NodeKind): GraphNode[] {
    const list = [...this.nodes.values()];
    return kind ? list.filter((node) => node.kind === kind) : list;
  }
  allEdges(): GraphEdge[] { return [...this.edgeList]; }

  outgoing(id: string, relation?: Relation): GraphEdge[] {
    return this.edgeList.filter((edge) => edge.from === id && (!relation || edge.relation === relation));
  }
  incoming(id: string, relation?: Relation): GraphEdge[] {
    return this.edgeList.filter((edge) => edge.to === id && (!relation || edge.relation === relation));
  }

  // "Quel besoin métier justifie ce nœud ?" — walk up to the needs that justify it.
  whyExists(id: string): GraphNode[] {
    this.assertNode(id);
    const needs = new Map<string, GraphNode>();
    const visited = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      const node = this.nodes.get(current)!;
      if (node.kind === "need") { needs.set(node.id, node); continue; }
      // climb: from any node to the features that reference it, then to needs
      for (const edge of this.outgoing(current, "implements")) queue.push(edge.to);
      for (const edge of this.incoming(current)) if (edge.relation !== "implements") queue.push(edge.from);
    }
    return [...needs.values()];
  }

  // "Quels tests ou preuves couvrent ce nœud ?"
  coverage(id: string): GraphNode[] {
    this.assertNode(id);
    return this.outgoing(id, "verified_by").map((edge) => this.nodes.get(edge.to)!);
  }

  // "Quel impact aura la modification de ce nœud ?" — transitive dependents.
  impact(id: string): GraphNode[] {
    this.assertNode(id);
    const dependents = new Map<string, GraphNode>();
    const visited = new Set<string>([id]);
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of this.incoming(current)) {
        if (edge.relation === "verified_by" || edge.relation === "introduced_in") continue;
        if (visited.has(edge.from)) continue;
        visited.add(edge.from);
        dependents.set(edge.from, this.nodes.get(edge.from)!);
        queue.push(edge.from);
      }
    }
    return [...dependents.values()];
  }

  // "Quels invariants ou permissions ne possèdent aucune preuve ?" (§5)
  unverified(): GraphNode[] {
    return this.allNodes().filter(
      (node) =>
        (node.kind === "invariant" || node.kind === "permission") &&
        this.outgoing(node.id, "verified_by").length === 0
    );
  }

  toJSON(): SerializedGraph {
    return {
      schemaVersion: 1,
      nodes: [...this.nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...this.edgeList].sort((a, b) => `${a.from}${a.relation}${a.to}`.localeCompare(`${b.from}${b.relation}${b.to}`))
    };
  }

  static fromJSON(data: SerializedGraph): KnowledgeGraph {
    if (data.schemaVersion !== 1) throw new Error("Unsupported graph schema version");
    const graph = new KnowledgeGraph();
    for (const node of data.nodes) graph.upsertNode(node);
    for (const edge of data.edges) graph.link(edge.from, edge.relation, edge.to);
    return graph;
  }

  private assertNode(id: string): void {
    if (!this.nodes.has(id)) throw new Error(`Unknown node: ${id}`);
  }
}
