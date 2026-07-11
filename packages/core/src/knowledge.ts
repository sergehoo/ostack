import { readFile } from "node:fs/promises";
import { relative } from "node:path";

export interface KnowledgeDocument { id: string; path: string; content: string; tags: string[]; }
export interface SearchResult { document: KnowledgeDocument; score: number; excerpts: string[]; }

const DEFAULT_FILES = /(^|\/)(AGENTS\.md|README(?:\.md)?|docs\/.*|architecture\/.*|.*\.(md|json|ya?ml))$/i;

export class LocalKnowledgeEngine {
  private documents: KnowledgeDocument[] = [];

  async index(root: string, files: string[]): Promise<number> {
    const indexed: KnowledgeDocument[] = [];
    for (const file of files.filter((path) => DEFAULT_FILES.test(relative(root, path)))) {
      const content = await readFile(file, "utf8");
      indexed.push({ id: crypto.randomUUID(), path: relative(root, file), content, tags: inferTags(file, content) });
    }
    this.documents = indexed;
    return indexed.length;
  }

  search(query: string, limit = 8): SearchResult[] {
    const terms = tokenize(query);
    return this.documents.map((document) => {
      const paragraphs = document.content.split(/\n\s*\n/);
      const ranked = paragraphs.map((text) => ({ text, score: score(text, terms) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
      return { document, score: ranked.reduce((sum, item) => sum + item.score, 0), excerpts: ranked.slice(0, 3).map((item) => item.text.slice(0, 500)) };
    }).filter((result) => result.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

function tokenize(value: string): string[] { return [...new Set(value.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((term) => term.length > 2))]; }
function score(value: string, terms: string[]): number { const lower = value.toLowerCase(); return terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0); }
function inferTags(path: string, content: string): string[] { return [...new Set([...tokenize(path), ...tokenize(content.slice(0, 300))])].slice(0, 12); }
