export function treeForEach(tree, fn) {
  if (tree !== null && tree !== false && typeof tree !== 'undefined') {
    fn(tree);
  }
  tree.children.forEach(node => treeForEach(node, fn));
}

export function treeFilter(tree, fn) {
  const results = [];
  treeForEach(tree, (node) => {
    if (fn(node)) {
      results.push(node);
    }
  });
  return results;
}
