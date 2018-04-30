import without from 'lodash/without';
import escape from 'lodash/escape';
import compact from 'lodash/compact';
import functionName from 'function.prototype.name';
import isString from 'is-string';
import isNumber from 'is-number-object';
import isCallable from 'is-callable';
import isBoolean from 'is-boolean-object';
import inspect from 'object-inspect';
import {
  AsyncMode,
  ContextProvider,
  ContextConsumer,
  Element,
  ForwardRef,
  Fragment,
  Portal,
  StrictMode,
} from 'react-is';

import {
  propsOfNode,
  childrenOfNode,
} from './RSTTraversal';

const booleanValue = Function.bind.call(Function.call, Boolean.prototype.valueOf);

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
  const { type } = node;
  switch (getNodeType(node)) {
    case AsyncMode: return 'AsyncMode';
    case ContextProvider: return 'ContextProvider';
    case ContextConsumer: return 'ContextConsumer';
    case Portal: return 'Portal';
    case StrictMode: return 'StrictMode';
    case ForwardRef: {
      const name = type.displayName || functionName(type.render);
      return name ? `ForwardRef(${name})` : 'ForwardRef';
    }
    case Fragment:
      return 'Fragment';
    case Element:
    default:
      return typeof node.type === 'function'
        ? (type.displayName || functionName(type) || 'Component')
        : type || 'unknown';
  }
}

export function spaces(n) {
  return Array(n + 1).join(' ');
}

export function indent(depth, string) {
  return string.split('\n').map(x => `${spaces(depth)}${x}`).join('\n');
}

function propString(prop, options) {
  if (isString(prop)) {
    return inspect(String(prop), { quoteStyle: 'double' });
  }
  if (isNumber(prop)) {
    return `{${inspect(Number(prop))}}`;
  }
  if (isBoolean(prop)) {
    return `{${inspect(booleanValue(prop))}}`;
  }
  if (isCallable(prop)) {
    return `{${inspect(prop)}}`;
  }
  if (typeof prop === 'object') {
    if (options.verbose) {
      return `{${inspect(prop)}}`;
    }

    return '{{...}}';
  }
  return `{[${typeof prop}]}`;
}

function propsString(node, options) {
  const props = propsOfNode(node);
  const keys = without(Object.keys(props), 'children');
  return keys.map(key => `${key}=${propString(props[key], options)}`).join(' ');
}

function indentChildren(childrenStrs, indentLength) {
  return childrenStrs.length
    ? `\n${childrenStrs.map(x => indent(indentLength, x)).join('\n')}\n`
    : '';
}

export function debugNode(node, indentLength = 2, options = {}) {
  if (typeof node === 'string' || typeof node === 'number') return escape(node);
  if (typeof node === 'function') return '[function child]';
  if (!node) return '';

  const childrenStrs = compact(childrenOfNode(node).map(n => debugNode(n, indentLength, options)));
  const type = typeName(node);

  const props = options.ignoreProps ? '' : propsString(node, options);
  const beforeProps = props ? ' ' : '';
  const afterProps = childrenStrs.length
    ? '>'
    : ' ';
  const childrenIndented = indentChildren(childrenStrs, indentLength);
  const nodeClose = childrenStrs.length ? `</${type}>` : '/>';
  return `<${type}${beforeProps}${props}${afterProps}${childrenIndented}${nodeClose}`;
}

export function debugNodes(nodes, options = {}) {
  return nodes.map(node => debugNode(node, undefined, options)).join('\n\n\n');
}
