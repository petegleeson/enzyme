import entries from 'object.entries';
import is from 'object-is';
import isEqual from 'lodash/isEqual';
import { propsOfNode } from '../common';

export { treeFilter } from './RSTTraversal';

function arraysEqual(match, left, right) {
  return left.length === right.length && left.every((el, i) => match(el, right[i]));
}

export function nodeEqual(a, b, lenComp = is) {
  return internalNodeCompare(a, b, lenComp, false);
}

export function nodeMatches(a, b, lenComp = is) {
  return internalNodeCompare(a, b, lenComp, true);
}

function internalChildrenCompare(a, b, lenComp, isLoose) {
  const nodeCompare = isLoose ? nodeMatches : nodeEqual;

  if (a === b) return true;
  if (!Array.isArray(a) && !Array.isArray(b)) {
    return nodeCompare(a, b, lenComp);
  }
  if (!a && !b) return true;
  if (a.length !== b.length) return false;
  if (a.length === 0 && b.length === 0) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (!nodeCompare(a[i], b[i], lenComp)) return false;
  }
  return true;
}

function childrenMatch(a, b, lenComp) {
  return internalChildrenCompare(a, b, lenComp, true);
}

function childrenEqual(a, b, lenComp) {
  return internalChildrenCompare(a, b, lenComp, false);
}

function childrenToArray(children) {
  const result = [];

  const push = (el) => {
    if (el === null || el === false || typeof el === 'undefined') return;
    result.push(el);
  };

  if (Array.isArray(children)) {
    children.forEach(push);
  } else {
    push(children);
  }
  return result;
}

function isTextualNode(node) {
  return typeof node === 'string' || typeof node === 'number';
}

export function childrenToSimplifiedArray(nodeChildren) {
  const childrenArray = childrenToArray(nodeChildren);
  const simplifiedArray = [];

  for (let i = 0; i < childrenArray.length; i += 1) {
    const child = childrenArray[i];
    const previousChild = simplifiedArray.pop();

    if (typeof previousChild === 'undefined') {
      simplifiedArray.push(child);
    } else if (isTextualNode(child) && isTextualNode(previousChild)) {
      simplifiedArray.push(previousChild + child);
    } else {
      simplifiedArray.push(previousChild);
      simplifiedArray.push(child);
    }
  }

  return simplifiedArray;
}

export function containsChildrenSubArray(match, node, subArray) {
  const children = node.children;
  const checker = (_, i) => arraysEqual(match, children.slice(i, i + subArray.length), subArray);
  return children.some(checker);
}


function removeNullaryReducer(acc, [key, value]) {
  const addition = value == null ? {} : { [key]: value };
  return { ...acc, ...addition };
}

function internalNodeCompare(a, b, lenComp, isLoose) {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;

  let left = propsOfNode(a);
  let right = propsOfNode(b);
  if (isLoose) {
    left = entries(left).reduce(removeNullaryReducer, {});
    right = entries(right).reduce(removeNullaryReducer, {});
  }

  const leftKeys = Object.keys(left);
  for (let i = 0; i < leftKeys.length; i += 1) {
    const prop = leftKeys[i];
    // we will check children later
    if (prop === 'children') {
      // continue;
    } else if (!(prop in right)) {
      return false;
    } else if (right[prop] === left[prop]) {
      // continue;
    } else if (typeof right[prop] === typeof left[prop] && typeof left[prop] === 'object') {
      if (!isEqual(left[prop], right[prop])) return false;
    } else {
      return false;
    }
  }

  const leftHasChildren = 'children' in left;
  const rightHasChildren = 'children' in right;
  const childCompare = isLoose ? childrenMatch : childrenEqual;
  if (leftHasChildren || rightHasChildren) {
    if (!childCompare(
      childrenToSimplifiedArray(left.children),
      childrenToSimplifiedArray(right.children),
      lenComp,
    )) {
      return false;
    }
  }

  if (!isTextualNode(a)) {
    const rightKeys = Object.keys(right);
    return lenComp(leftKeys.length - leftHasChildren, rightKeys.length - rightHasChildren);
  }

  return false;
}
