import React from 'react';
import cheerio from 'cheerio';
import compact from 'lodash/compact';
import flatten from 'lodash/flatten';
import unique from 'lodash/uniq';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import ReactTestRendererAdapter from '../adapter/ReactTestRendererAdapter';
import ReactTestInstance from './ReactTestInstance';

import { containsChildrenSubArray, nodeEqual, treeFilter } from './contains';
import { debugNodes } from './debug';
import { reduceTreesBySelector, buildPredicate, hasClassName } from './selectors';

const noop = () => {};

const flatMap = (collection, fn) =>
  collection.map(fn).reduce((existing, curr) => [...existing, ...curr], []);

const instanceToElement = instance => React.createElement(instance.type, instance.props);

/**
 * Finds all nodes in the current wrapper nodes' render trees that match the provided predicate
 * function.
 *
 * @param {Array<ReactTestInstance>} instances
 * @param {Function} predicate
 * @param {Function} filter
 * @returns {Array<ReactTestInstance>}
 */
function findWhereUnwrapped(instances, predicate, filter = treeFilter) {
  return flatMap(instances, n => filter(n, predicate));
}

/**
 * instances t wrapper instance that match
 * the provided predicate function.
 *
 * @param {Array<ReactTestInstance>} instances
 * @param {Function} predicate
 * @returns {Array<ReactTestInstance>}
 */
function filterWhereUnwrapped(instances, predicate) {
  return compact(instances.filter(predicate));
}

class ReactMountWrapper {
  constructor(instances, rootRef, rootElement, renderer) {

    // private api
    this.instances = instances;
    this.rootRef = rootRef;
    this.rootElement = rootElement;
    this.renderer = renderer;
    // public api
    this.length = instances.length;
  }

  /**
   * Returns a wrapper around the node at a given index of the current wrapper.
   *
   * @param {Number} index
   * @returns {ReactWrapper}
   */
  at(index) {
    return this.wrap([this.instances[index]]);
  }

  /**
   * Returns a new wrapper with a specific child
   *
   * @param {Number} [index]
   * @returns {ReactWrapper}
   */
  childAt(index) {
    return this.single('childAt', () => this.children().at(index));
  }

  /**
   * Returns a new wrapper with all of the children of the current wrapper.
   *
   * @param {String|Function} [selector]
   * @returns {ReactWrapper}
   */
  children(selector) {
    const childWrapper = this.wrap(flatMap(this.instances, instance => instance.children));
    return selector ? childWrapper.filter(selector) : childWrapper;
  }

  /**
   * Whether or not a given react element exists in the mount render tree.
   *
   * Example:
   * ```
   * const wrapper = mount(<MyComponent />);
   * expect(wrapper.contains(<div className="foo bar" />)).to.equal(true);
   * ```
   *
   * @param {ReactElement|Array<ReactElement>} nodeOrNodes
   * @returns {Boolean}
   */
  contains(nodeOrNodes) {
    const adapter = new ReactTestRendererAdapter();
    const renderer = adapter.createMountRenderer({});
    const componentRef = renderer.render(nodeOrNodes);
    const argInstance = new ReactTestInstance(componentRef._reactInternalFiber);
    const predicate = Array.isArray(nodeOrNodes)
      ? other => containsChildrenSubArray(
        nodeEqual,
        other,
        argInstance.children,
      )
      : other => nodeEqual(argInstance.children[0], other);

    return findWhereUnwrapped(this.instances, predicate).length > 0;
  }

  /**
   * Returns an HTML-like string of the shallow render for debugging purposes.
   *
   * @param {Object} [options] - Property bag of additional options.
   * @param {boolean} [options.ignoreProps] - if true, props are omitted from the string.
   * @param {boolean} [options.verbose] - if true, arrays and objects to be verbosely printed.
   * @returns {String}
   */
  debug(options = {}) {
    return debugNodes(this.instances, options);
  }

  /**
   * Returns the context hash for the root node of the wrapper.
   * Optionally pass in a prop name and it will return just that value.
   *
   * NOTE: can only be called on a wrapper of a single node.
   *
   * @param {String} name (optional)
   * @returns {*}
   */
  context(name) {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::context() can only be called on the root');
    }
    const rootInstance = this.single('context', instance => instance.instance);
    if (rootInstance === null) {
      throw new Error('ReactWrapper::context() can only be called on components with instances');
    }
    const _context = rootInstance.context;
    if (typeof name !== 'undefined') {
      return _context[name];
    }
    return _context;
  }

  /**
   * Returns a new wrapper instance with only the nodes of the current wrapper instance that match
   * the provided selector.
   *
   * @param {String|Function} selector
   * @returns {ReactWrapper}
   */
  filter(selector) {
    const predicate = buildPredicate(selector);
    return this.wrap(filterWhereUnwrapped(this.instances, predicate));
  }

  /**
   * Returns a new wrapper instance with only the nodes of the current wrapper instance that match
   * the provided predicate function.
   *
   * @param {Function} predicate
   * @returns {ReactWrapper}
   */
  filterWhere(predicate) {
    return this.wrap(filterWhereUnwrapped(this.instances, predicate));
  }

  /**
   * Finds every node in the render tree of the current wrapper that matches the provided selector.
   *
   * @param {String|Function} selector
   * @returns {ReactWrapper}
   */
  find(selector) {
    return this.wrap(reduceTreesBySelector(selector, this.instances));
  }

  /**
   * Finds all nodes in the current wrapper nodes' render trees that match the provided predicate
   * function.
   *
   * @param {Function} predicate
   * @returns {ReactWrapper}
   */
  findWhere(predicate) {
    return this.wrap(flatMap(this.instances, instance =>
      instance.findAll(testInstance =>
        predicate(this.wrap([testInstance])))));
  }

  /**
   * Returns a wrapper around the first node of the current wrapper.
   *
   * @returns {ReactWrapper}
   */
  first() {
    return this.at(0);
  }

  /**
   * Utility method used to create new wrappers with a mapping function that returns an array of
   * nodes in response to a single node wrapper. The returned wrapper is a single wrapper around
   * all of the mapped nodes flattened (and de-duplicated).
   *
   * @param {Function} fn
   * @returns {ReactWrapper}
   */
  flatMap(fn) {
    const nodes = this.instances.map((n, i) => fn.call(this, this.wrap(n), i));
    const flattened = flatten(nodes, true);
    const uniques = unique(flattened);
    const compacted = compact(uniques);
    return this.wrap(compacted);
  }

  /**
   * Returns whether or not the current root node has the given class name or not.
   *
   * NOTE: can only be called on a wrapper of a single node.
   *
   * @param {String} className
   * @returns {Boolean}
   */
  hasClass(className) {
    if (className && className.indexOf('.') !== -1) {
      // eslint-disable-next-line no-console
      console.warn('It looks like you\'re calling `ReactWrapper::hasClass()` with a CSS selector. hasClass() expects a class name, not a CSS selector.');
    }
    return this.single('hasClass', n => hasClassName(n, className));
  }

  /**
   * Strips out all the not host-nodes from the list of nodes
   *
   * This method is useful if you want to check for the presence of host nodes
   * (actually rendered HTML elements) ignoring the React nodes.
   */
  hostNodes() {
    return this.filterWhere(n => typeof n.type === 'string');
  }

  /**
   * Returns the HTML of the node.
   *
   * @returns {String}
   */
  html() {
    const markup = ReactDOMServer.renderToStaticMarkup(this.instances.map(instanceToElement));
    return markup.length > 0 ? markup : null;
  }

  /**
   * Gets the instance of the component being rendered as the root node passed into `mount()`.
   *
   * NOTE: can only be called on a wrapper instance that is also the root instance.
   *
   * Example:
   * ```
   * const wrapper = mount(<MyComponent />);
   * const inst = wrapper.instance();
   * expect(inst).to.be.instanceOf(MyComponent);
   * ```
   * @returns {ReactComponent}
   */
  instance() {
    return this.single('instance', instance => instance.instance);
  }

  /**
   * Returns whether or not current node matches a provided selector.
   *
   * NOTE: can only be called on a wrapper of a single node.
   *
   * @param {String|Function} selector
   * @returns {boolean}
   */
  is(selector) {
    const predicate = buildPredicate(selector);
    return this.single('is', n => predicate(n));
  }

  /**
   * Returns true if the component rendered nothing, i.e., null or false.
   *
   * @returns {boolean}
   */
  isEmptyRender() {
    return this.html() === null;
  }

  isRoot() {
    const [first] = this.instances;
    return first && first.parent.instance === this.rootRef;
  }

  /**
   * Returns a wrapper around the last node of the current wrapper.
   *
   * @returns {ReactWrapper}
   */
  last() {
    return this.at(this.length - 1);
  }

  /**
   * A method that re-mounts the component, if it is not currently mounted.
   * This can be used to simulate a component going through
   * an unmount/mount lifecycle.
   *
   * @returns {ReactWrapper}
   */
  mount() {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::mount() can only be called on the root');
    }
    this.renderer.render(this.rootElement, {});
    return this;
  }

  /**
   * Returns the name of the root node of this wrapper.
   *
   * In order of precedence => type.displayName -> type.name -> type.
   *
   * @returns {String}
   */
  name() {
    return this.single('name', (instance) => {
      const { type } = instance;
      return type.displayName || type.name || type;
    });
  }

  /**
   * Returns a wrapper around all of the parents/ancestors of the wrapper. Does not include the node
   * in the current wrapper.
   *
   * NOTE: can only be called on a wrapper of a single node.
   *
   * @param {String|Function} [selector]
   * @returns {ReactWrapper}
   */
  parents(selector) {
    const parentsOfInstance = (instance, parents = []) => {
      const { parent } = instance;
      if (parent && parent.instance === this.rootRef) {
        return parents;
      }
      return parentsOfInstance(parent, [...parents, parent]);
    };
    const allParents = this.wrap(this.single('parents', instance => parentsOfInstance(instance)));
    return selector ? allParents.filter(selector) : allParents;
  }

  /**
   * Returns a wrapper around the immediate parent of the current node.
   *
   * @returns {ReactWrapper}
   */
  parent() {
    return this.wrap(this.instances.map(instance => instance.parent));
  }

  /**
   * Returns the value of  prop with the given name of the root node.
   *
   * @param {String} propName
   * @returns {*}
   */
  prop(propName) {
    return this.props()[propName];
  }

  /**
   * Returns the props hash for the root node of the wrapper.
   *
   * NOTE: can only be called on a wrapper of a single node.
   *
   * @returns {Object}
   */
  props() {
    return this.single('props', instance => instance.props);
  }

  /**
   * Returns the current node rendered to HTML and wrapped in a CheerioWrapper.
   *
   * NOTE: can only be called on a wrapper of a single node.
   *
   * @returns {CheerioWrapper}
   */
  render() {
    const html = this.html();
    return html === null ? cheerio() : cheerio.load('')(html);
  }

  /**
   * A method that sets the context of the root component, and re-renders. Useful for when you are
   * wanting to test how the component behaves over time with changing contexts.
   *
   * NOTE: can only be called on a wrapper instance that is also the root instance.
   *
   * @param {Object} context object
   * @returns {ReactWrapper}
   */
  setContext(context) {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::setContext() can only be called on the root');
    }
    if (!this.instances[0].parent.props.context) {
      throw new Error('ShallowWrapper::setContext() can only be called on a wrapper that was originally passed a context option');
    }
    this.rootRef.setChildProps({}, context);
    return this;
  }

  /**
   * A method that sets the props of the root component, and re-renders. Useful for when you are
   * wanting to test how the component behaves over time with changing props. Calling this, for
   * instance, will call the `componentWillReceiveProps` lifecycle method.
   *
   * Similar to `setState`, this method accepts a props object and will merge it in with the already
   * existing props.
   *
   * NOTE: can only be called on a wrapper instance that is also the root instance.
   *
   * @param {Object} props object
   * @param {Function} cb - callback function
   * @returns {ReactWrapper}
   */
  setProps(props, callback = noop) {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::setProps() can only be called on the root');
    }
    if (typeof callback !== 'function') {
      throw new TypeError('ReactWrapper::setProps() expects a function as its second argument');
    }
    this.rootRef.setChildProps(props, {}, callback);
    return this;
  }

  /**
   * A method to invoke `setState` on the root component instance similar to how you might in the
   * definition of the component, and re-renders.  This method is useful for testing your component
   * in hard to achieve states, however should be used sparingly. If possible, you should utilize
   * your component's external API in order to get it into whatever state you want to test, in order
   * to be as accurate of a test as possible. This is not always practical, however.
   *
   * NOTE: can only be called on a wrapper instance that is also the root instance.
   *
   * @param {Object} state to merge
   * @param {Function} cb - callback function
   * @returns {ReactWrapper}
   */
  setState(state, callback = noop) {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::setState() can only be called on the root');
    }
    if (typeof callback !== 'function') {
      throw new TypeError('ReactWrapper::setState() expects a function as its second argument');
    }
    this.instance().setState(state, () => {
      callback();
    });
    return this;
  }

  /**
   * Used to simulate events. Pass an eventname and (optionally) event arguments. This method of
   * testing events should be met with some skepticism.
   *
   * @param {String} event
   * @param {Object} mock (optional)
   * @returns {ReactWrapper}
   */
  simulate(event, mock = {}) {
    this.single('simulate', (instance) => {
      this.renderer.simulateEvent(instance.instance, event, mock);
    });
    return this;
  }

  /**
   * Utility method that throws an error if the current instance has a length other than one.
   * This is primarily used to enforce that certain methods are only run on a wrapper when it is
   * wrapping a single node.
   *
   * @param {Function} fn
   * @returns {*}
   */
  single(name, fn) {
    const fnName = typeof name === 'string' ? name : 'unknown';
    const callback = typeof fn === 'function' ? fn : name;
    if (this.length !== 1) {
      throw new Error(`Method “${fnName}” is only meant to be run on a single node. ${
        this.length
      } found instead.`);
    }
    return callback.call(this, this.instances[0]);
  }

  /**
   * Returns the state hash for the root node of the wrapper. Optionally pass in a prop name and it
   * will return just that value.
   *
   * NOTE: can only be called on a wrapper of a single node.
   *
   * @param {String} name (optional)
   * @returns {*}
   */
  state(name) {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::state() can only be called on the root');
    }
    const _state = this.single('state', instance => instance.instance.state);
    if (typeof name !== 'undefined') {
      return _state[name];
    }
    return _state;
  }

  /**
   * Returns a string of the rendered text of the current render tree.  This function should be
   * looked at with skepticism if being used to test what the actual HTML output of the component
   * will be. If that is what you would like to test, use enzyme's `render` function instead.
   *
   * NOTE: can only be called on a wrapper of a single node.
   *
   * @returns {String}
   */
  text() {
    return this.single(
      'text',
      (instance) => {
        const findAllFirst = (current, filterFn) => {
          if (filterFn(current)) {
            return [current];
          } else if (!current.children || current.children.length === 0) {
            return [];
          }
          return flatMap(current.children, child => findAllFirst(child, filterFn));
        };
        return findAllFirst(instance, inst => !!inst.instance || typeof inst === 'string')
          .map(result => (result.instance ?
            ReactDOM.findDOMNode(result.instance).textContent : result))
          .join('');
      },
    );
  }

  /**
   * Returns the type of the root node of this wrapper. If it's a composite component, this will be
   * the component constructor. If it's native DOM node, it will be a string.
   *
   * @returns {String|Function}
   */
  type() {
    return this.single('type', instance => instance.type);
  }

  /**
   * A method that unmounts the component. This can be used to simulate a component going through
   * and unmount/mount lifecycle.
   *
   * @returns {ReactWrapper}
   */
  unmount() {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::unmount() can only be called on the root');
    }
    this.single('unmount', () => {
      this.renderer.unmount();
    });
    return this;
  }

  /**
   * Helpful utility method to create a new wrapper with the same root as the current wrapper, with
   * any nodes passed in as the first parameter automatically wrapped.
   *
   * @param {Array<ReactTestInstance>} instances
   * @returns {ReactWrapper}
   */
  wrap(instances) {
    return new ReactMountWrapper(instances, this.rootRef, this.rootNode, this.renderer);
  }
}

const createWrapper = (rootElement, passedOptions = {}) => {
  const adapter = new ReactTestRendererAdapter();
  const renderer = adapter.createMountRenderer(passedOptions);
  const rootRef = renderer.render(rootElement, passedOptions.context);
  const rootInstance = new ReactTestInstance(rootRef._reactInternalFiber);
  return new ReactMountWrapper(rootInstance.children, rootRef, rootElement, renderer);
};

module.exports = createWrapper;
