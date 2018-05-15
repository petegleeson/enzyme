import { typeName } from '../common';

// TODO remove this React implementation detail
// Adding this $$typeof key/value is how the jest serializer knows
// to print this object as a React component
const reactTestJson = obj =>
  Object.defineProperty(obj, '$$typeof', {
    value: Symbol.for('react.test.json'),
  });

// strips out children from props, adds key if it exists
const getProps = (instance) => {
  const { children, ...rest } = instance.props;
  // TODO remove this React implementation detail
  const { key } = instance._fiber;
  return {
    ...rest,
    ...(key ? { key } : {}),
  };
};

// This function converts a ReactMountWrapper into an object structure
// that can be passed to jest's serializer for use in snapshot tests
export const toJSON = (instance) => {
  const { children, props } = instance;
  if (children.length === 0) {
    return reactTestJson({
      type: typeName(instance),
      props: getProps(instance),
      children: null,
    });
  }
  const jsonChildren = children.map(toJSON);
  return reactTestJson({
    type: typeName(instance),
    props: getProps(instance),
    children: jsonChildren,
  });
};
