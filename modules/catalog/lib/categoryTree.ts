/** Shared tree utilities for product_categories and material_categories. */

export interface CategoryTreeNode<T extends { id?: string; name: string; parentId?: string | null }> {
  category: T;
  children: CategoryTreeNode<T>[];
}

export const normalizeCategoryName = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

export function buildCategoryPath<T extends { id?: string; parentId?: string | null }>(
  categories: T[],
  categoryId: string | null | undefined,
): { path: string[]; level: number } {
  if (!categoryId) return { path: [], level: 0 };
  const byId = new Map(categories.filter((c) => c.id).map((c) => [c.id!, c]));
  const ancestors: string[] = [];
  let current: string | null | undefined = categoryId;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current)) break;
    visited.add(current);
    const node = byId.get(current);
    if (!node) break;
    const parent = node.parentId ?? null;
    if (!parent || parent === current) break;
    ancestors.push(parent);
    current = parent;
  }

  const path = ancestors.reverse();
  return { path, level: path.length };
}

export function buildCategoryTree<T extends { id?: string; parentId?: string | null; sortOrder?: number; name: string }>(
  flat: T[],
): CategoryTreeNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  for (const row of flat) {
    const parentKey = row.parentId ?? null;
    const list = byParent.get(parentKey) ?? [];
    list.push(row);
    byParent.set(parentKey, list);
  }

  const sortSiblings = (rows: T[]) =>
    [...rows].sort((a, b) => {
      const ao = a.sortOrder ?? 0;
      const bo = b.sortOrder ?? 0;
      if (ao !== bo) return ao - bo;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ar');
    });

  const build = (parentId: string | null): CategoryTreeNode<T>[] => {
    const siblings = sortSiblings(byParent.get(parentId) ?? []);
    return siblings.map((category) => ({
      category,
      children: category.id ? build(category.id) : [],
    }));
  };

  return build(null);
}

export function getDescendantIds<T extends { id?: string; parentId?: string | null }>(
  flat: T[],
  categoryId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const row of flat) {
    if (!row.id) continue;
    const parent = row.parentId ?? null;
    if (!parent) continue;
    const list = childrenByParent.get(parent) ?? [];
    list.push(row.id);
    childrenByParent.set(parent, list);
  }

  const out = new Set<string>();
  const stack = [...(childrenByParent.get(categoryId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  return out;
}

export function wouldCreateCycle<T extends { id?: string; parentId?: string | null }>(
  flat: T[],
  categoryId: string,
  newParentId: string | null | undefined,
): boolean {
  if (!newParentId) return false;
  if (categoryId === newParentId) return true;
  const descendants = getDescendantIds(flat, categoryId);
  return descendants.has(newParentId);
}

export function formatCategoryBreadcrumb<T extends { id?: string; name: string; parentId?: string | null }>(
  flat: T[],
  categoryId: string | null | undefined,
): string {
  if (!categoryId) return '';
  const { path } = buildCategoryPath(flat, categoryId);
  const byId = new Map(flat.filter((c) => c.id).map((c) => [c.id!, c]));
  const labels = path
    .map((id) => String(byId.get(id)?.name ?? '').trim())
    .filter(Boolean);
  const leaf = String(byId.get(categoryId)?.name ?? '').trim();
  if (leaf && labels[labels.length - 1] !== leaf) labels.push(leaf);
  return labels.join(' > ');
}

export function flattenCategoryTree<T extends { id?: string; parentId?: string | null; name: string }>(
  nodes: CategoryTreeNode<T>[],
  depth = 0,
): Array<{ category: T; depth: number }> {
  const out: Array<{ category: T; depth: number }> = [];
  for (const node of nodes) {
    out.push({ category: node.category, depth });
    out.push(...flattenCategoryTree(node.children, depth + 1));
  }
  return out;
}
