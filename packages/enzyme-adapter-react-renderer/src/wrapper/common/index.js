export function propsOfNode(node) {
  return node ? node.props : {};
  // return entries((node && node.props) || {})
  //   .filter(([, value]) => typeof value !== 'undefined')
  //   .reduce((acc, [key, value]) => Object.assign(acc, { [key]: value }), {});
}
