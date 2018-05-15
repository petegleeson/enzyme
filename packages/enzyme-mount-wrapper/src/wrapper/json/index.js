import { typeName } from '../common';

// TODO remove this React implementation detail
// Adding this $$typeof key/value is how the jest serializer knows
// to print this object as a React component
const reactTestJson = obj =>
  Object.defineProperty(obj, '$$typeof', {
    value: Symbol.for('react.test.json'),
  });

// This function converts a ReactMountWrapper into an object structure
// that can be passed to jest's serializer for use in snapshot tests
export const toJSON = (instance) => {
  const { children, props } = instance;
  if (children.length === 0) {
    return reactTestJson({
      type: typeName(instance),
      props,
      children: null,
    });
  }
  const jsonChildren = children.map(toJSON);
  return reactTestJson({
    type: typeName(instance),
    props,
    children: jsonChildren,
  });
};
