import functionName from 'function.prototype.name';
import entries from 'object.entries';

export function propsOfNode(node) {
  return entries((node && node.props) || {})
    .filter(([, value]) => typeof value !== 'undefined')
    .reduce((acc, [key, value]) => Object.assign(acc, { [key]: value }), {});
}

export function typeName(node) {
  return typeof node.type === 'function'
    ? node.type.displayName || functionName(node.type) || 'Component'
    : node.type;
}
