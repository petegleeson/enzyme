import functionName from 'function.prototype.name';
import entries from 'object.entries';
import { ForwardRef } from 'react-is';

export function propsOfNode(node) {
  return entries((node && node.props) || {})
    .filter(([, value]) => typeof value !== 'undefined')
    .reduce((acc, [key, value]) => Object.assign(acc, { [key]: value }), {});
}

// The node type can be defined in three different places.
// Where the type is depends on the node and rendering strategy.
// This function looks in the three spots and returns the type.
const getNodeType = (node) => {
  if (node.type && node.type.$$typeof) {
    return node.type.$$typeof;
  } else if (node.$$typeof) {
    return node.$$typeof;
  }
  return node.type;
};

export function typeName(node) {
  if (getNodeType(node) === ForwardRef) {
    const name = node.type.displayName || functionName(node.type.render);
    return name ? `ForwardRef(${name})` : 'ForwardRef';
  } else if (typeof node.type === 'function') {
    return node.type.displayName || functionName(node.type) || 'Component';
  }
  return node.type;
}
