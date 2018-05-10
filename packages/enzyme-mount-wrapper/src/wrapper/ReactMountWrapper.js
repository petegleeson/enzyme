import React from 'react';
import cheerio from 'cheerio';
import compact from 'lodash/compact';
import flatten from 'lodash/flatten';
import unique from 'lodash/uniq';
import ReactDOM from 'react-dom';
import ReactDOMServer from 'react-dom/server';
import ReactTestRenderer from 'react-test-renderer';
import { ReactTestRendererAdapter, createWrappedElement } from '../adapter/ReactTestRendererAdapter';
import ReactTestInstance from './ReactTestInstance';

import { containsChildrenSubArray, nodeEqual, treeFilter, nodeMatches } from './contains';
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

/**
 * Given a React element, return the root ReactTestInstance
 */
function elementToInstance(element) {
  const wrappedElement = createWrappedElement(element, null, {});
  return ReactTestRenderer.create(wrappedElement).root;
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
   *
   * @param {String|Function} selector
   * @returns {ReactWrapper}
   */
  closest(selector) {
    return this.is(selector) ? this : this.parents().filter(selector).first();
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
    const argInstance = elementToInstance(nodeOrNodes);
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
   * Whether or not all the given react elements exists in the current render tree.
   * It will determine if one of the wrappers element "looks like" the expected
   * element by checking if all props of the expected element are present
   * on the wrappers element and equals to each other.
   *
   * Example:
   * ```
   * const wrapper = mount(<MyComponent />);
   * expect(wrapper.containsAllMatchingElements([
   *   <div>Hello</div>,
   *   <div>Goodbye</div>,
   * ])).to.equal(true);
   * ```
   *
   * @param {Array<ReactElement>} nodes
   * @returns {Boolean}
   */
  containsAllMatchingElements(nodes) {
    if (!Array.isArray(nodes)) {
      throw new TypeError('nodes should be an Array');
    }

    return nodes.every(node => this.containsMatchingElement(node));
  }

  /**
   * Whether or not one of the given react elements exists in the current render tree.
   * It will determine if one of the wrappers element "looks like" the expected
   * element by checking if all props of the expected element are present
   * on the wrappers element and equals to each other.
   *
   * Example:
   * ```
   * const wrapper = mount(<MyComponent />);
   * expect(wrapper.containsAnyMatchingElements([
   *   <div>Hello</div>,
   *   <div>Goodbye</div>,
   * ])).to.equal(true);
   * ```
   *
   * @param {Array<ReactElement>} nodes
   * @returns {Boolean}
   */
  containsAnyMatchingElements(nodes) {
    return Array.isArray(nodes) && nodes.some(node => this.containsMatchingElement(node));
  }

  /**
   * Whether or not a given react element exists in the current render tree.
   * It will determine if one of the wrappers element "looks like" the expected
   * element by checking if all props of the expected element are present
   * on the wrappers element and equals to each other.
   *
   * Example:
   * ```
   * // MyComponent outputs <div><div class="foo">Hello</div></div>
   * const wrapper = mount(<MyComponent />);
   * expect(wrapper.containsMatchingElement(<div>Hello</div>)).to.equal(true);
   * ```
   *
   * @param {ReactElement} node
   * @returns {Boolean}
   */
  containsMatchingElement(node) {
    const argInstance = elementToInstance(node);
    const predicate = other => nodeMatches(argInstance.children[0], other, (a, b) => a <= b);
    return findWhereUnwrapped(this.instances, predicate).length > 0;
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
   * Detaches the react tree from the DOM. Runs `ReactDOM.unmountComponentAtNode()` under the hood.
   *
   * This method will most commonly be used as a "cleanup" method if you decide to use the
   * `attachTo` option in `mount(node, options)`.
   *
   * The method is intentionally not "fluent" (in that it doesn't return `this`) because you should
   * not be doing anything with this wrapper after this method is called.
   */
  detach() {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::detach() can only be called on the root');
    }
    // TODO work out how to check this
    // if (!this[OPTIONS].attachTo) {
    //   throw new Error('ReactWrapper::detach() can only be called on when the `attachTo` option was passed into `mount()`.');
    // }
    this.renderer.unmount();
  }

  /**
   * Returns whether or not all of the nodes in the wrapper match the provided selector.
   *
   * @param {Function|String} selector
   * @returns {Boolean}
   */
  every(selector) {
    const predicate = buildPredicate(selector);
    return this.instances.every(predicate);
  }

  /**
   * Returns whether or not any of the nodes in the wrapper pass the provided predicate function.
   *
   * @param {Function} predicate
   * @returns {Boolean}
   */
  everyWhere(predicate) {
    return this.instances.every((n, i) => predicate.call(this, this.wrap([n]), i));
  }

  /**
   * Returns true if the current wrapper has nodes. False otherwise.
   *
   * @returns {boolean}
   */
  exists() {
    return this.length > 0;
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
    // TODO decide whether predicates get passed ReactMountWrapper or ReactTestInstance
    return this.wrap(this.instances
      .map(instance => this.wrap([instance]))
      .filter(wrapper => predicate(wrapper))
      .reduce((existing, current) => [...existing, ...current.getNodesInternal()], []));
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
    const nodes = this.instances.map((n, i) => fn.call(this, this.wrap([n]), i));
    const flattened = flatten(nodes, true);
    const uniques = unique(flattened);
    const compacted = compact(uniques);
    return this.wrap(compacted);
  }

  /**
   * Iterates through each node of the current wrapper and executes the provided function with a
   * wrapper around the corresponding node passed in as the first argument.
   *
   * @param {Function} fn
   * @returns {ReactWrapper}
   */
  forEach(fn) {
    this.instances.forEach((n, i) => fn.call(this, this.wrap([n]), i));
    return this;
  }

  /**
   * Returns the node at a given index of the current wrapper.
   *
   * @param {Number} index
   * @returns {ReactElement}
   */
  get(index) {
    return this.getElements()[index];
  }

  /**
   * Returns the outer most DOMComponent of the current wrapper.
   *
   * NOTE: can only be called on a wrapper of a single node.
   *
   * @returns {DOMComponent}
   */
  getDOMNode() {
    return this.single('getDOMNode', (instance) => {
      const instanceWithDOM = instance.instance ||
        instance.find(result => result.instance).instance;
      return ReactDOM.findDOMNode(instanceWithDOM);
    });
  }

  /**
   * Returns the wrapped ReactElement.
   *
   * @return {ReactElement}
   */
  getElement() {
    if (this.length !== 1) {
      throw new Error('ReactWrapper::getElement() can only be called when wrapping one node');
    }
    return this.instances[0];
  }

  /**
   * Returns the wrapped ReactElements.
   *
   * @return {Array<ReactElement>}
   */
  getElements() {
    return this.instances;
  }

  /**
   * Returns the wrapped component.
   *
   * @return {ReactComponent}
   */
  getNodeInternal() {
    if (this.length !== 1) {
      throw new Error('ReactWrapper::getNode() can only be called when wrapping one node');
    }
    return this.instances[0];
  }

  /**
   * Returns the the wrapped components.
   *
   * @return {Array<ReactComponent>}
   */
  getNodesInternal() {
    return this.instances;
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
    return this.wrap(this.instances.filter(instance =>
      typeof instance.type === 'string'));
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
   * Delegates to exists()
   *
   * @returns {boolean}
   */
  isEmpty() {
    // eslint-disable-next-line no-console
    console.warn('Enzyme::Deprecated method isEmpty() called, use exists() instead.');
    return !this.exists();
  }

  /**
   * Returns true if the component rendered nothing, i.e., null or false.
   *
   * @returns {boolean}
   */
  isEmptyRender() {
    return this.html() === null;
  }

  /**
   * Returns true if this wrapper is the root wrapper
   *
   * @returns {boolean}
   */
  isRoot() {
    const [first] = this.instances;
    return first && first.parent.instance === this.rootRef;
  }

  /**
   * Returns the key assigned to the current node.
   *
   * @returns {String}
   */
  key() {
    // TODO fix reference to _fiber
    return this.single('key', instance =>
      (instance._fiber.key === undefined ? null : instance._fiber.key));
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
   * Maps the current array of nodes to another array. Each node is passed in as a `ReactWrapper`
   * to the map function.
   *
   * @param {Function} fn
   * @returns {Array}
   */
  map(fn) {
    return this.instances.map((n, i) => fn.call(this, this.wrap([n]), i));
  }

  /**
   * Whether or not a given react element matches the current render tree.
   * It will determine if the wrapper root node "looks like" the expected
   * element by checking if all props of the expected element are present
   * on the wrapper root node and equals to each other.
   *
   * Example:
   * ```
   * // MyComponent outputs <div class="foo">Hello</div>
   * const wrapper = mount(<MyComponent />);
   * expect(wrapper.matchesElement(<div>Hello</div>)).to.equal(true);
   * ```
   *
   * @param {ReactElement} node
   * @returns {Boolean}
   */
  matchesElement(node) {
    return this.single('matchesElement', (instance) => {
      const argInstance = elementToInstance(node);
      return nodeMatches(argInstance.children[0], instance, (a, b) => a <= b);
    });
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
   * Returns a new wrapper instance with only the nodes of the current wrapper that did not match
   * the provided selector. Essentially the inverse of `filter`.
   *
   * @param {String|Function} selector
   * @returns {ReactWrapper}
   */
  not(selector) {
    const predicate = buildPredicate(selector);
    return filterWhereUnwrapped(this.instances, n => !predicate(n));
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
   * Reduces the current array of nodes to another array.
   * Each node is passed in as a `ShallowWrapper` to the reducer function.
   *
   * @param {Function} fn - the reducer function
   * @param {*} initialValue - the initial value
   * @returns {*}
   */
  reduce(fn, initialValue = undefined) {
    if (arguments.length > 1) {
      return this.instances.reduce(
        (accum, n, i) => fn.call(this, accum, this.wrap([n]), i),
        initialValue,
      );
    }
    return this.instances.reduce((accum, n, i) => fn.call(
      this,
      i === 1 ? this.wrap([accum]) : accum,
      this.wrap([n]),
      i,
    ));
  }

  /**
   * Reduces the current array of nodes to another array, from right to left. Each node is passed
   * in as a `ShallowWrapper` to the reducer function.
   *
   * @param {Function} fn - the reducer function
   * @param {*} initialValue - the initial value
   * @returns {*}
   */
  reduceRight(fn, initialValue = undefined) {
    if (arguments.length > 1) {
      return this.instances.reduceRight(
        (accum, n, i) => fn.call(this, accum, this.wrap([n]), i),
        initialValue,
      );
    }
    return this.instances.reduceRight((accum, n, i) => fn.call(
      this,
      i === 1 ? this.wrap([accum]) : accum,
      this.wrap([n]),
      i,
    ));
  }

  /**
   * If the root component contained a ref, you can access it here
   * and get a wrapper around it.
   *
   * NOTE: can only be called on a wrapper instance that is also the root instance.
   *
   * @param {String} refname
   * @returns {ReactWrapper}
   */
  ref(refname) {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::ref(refname) can only be called on the root');
    }
    return this.instance().refs[refname];
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
      this.renderer.simulateEvent(instance, event, mock);
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
   * Returns a new wrapper with a subset of the nodes of the original wrapper, according to the
   * rules of `Array#slice`.
   *
   * @param {Number} begin
   * @param {Number} end
   * @returns {ShallowWrapper}
   */
  slice(begin, end) {
    return this.wrap(this.instances.slice(begin, end));
  }

  /**
   * Returns whether or not any of the nodes in the wrapper match the provided selector.
   *
   * @param {Function|String} selector
   * @returns {Boolean}
   */
  some(selector) {
    if (this.isRoot()) {
      throw new Error('ReactWrapper::some() can not be called on the root');
    }
    const predicate = buildPredicate(selector);
    return this.instances.some(predicate);
  }

  /**
   * Returns whether or not any of the nodes in the wrapper pass the provided predicate function.
   *
   * @param {Function} predicate
   * @returns {Boolean}
   */
  someWhere(predicate) {
    return this.instances.some((n, i) => predicate.call(this, this.wrap([n]), i));
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
   * Invokes intercepter and returns itself. intercepter is called with itself.
   * This is helpful when debugging nodes in method chains.
   * @param fn
   * @returns {ReactWrapper}
   */
  tap(intercepter) {
    intercepter(this);
    return this;
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
   * Forces a re-render. Useful to run before checking the render output if something external
   * may be updating the state of the component somewhere.
   *
   * NOTE: can only be called on a wrapper instance that is also the root instance.
   *
   * @returns {ReactWrapper}
   */
  update() {
    if (!this.isRoot()) {
      throw new Error('ReactWrapper::update() can only be called on the root');
    }
    return this.rootRef.forceUpdate();
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

const ITERATOR_SYMBOL = typeof Symbol === 'function' && Symbol.iterator;
if (ITERATOR_SYMBOL) {
  Object.defineProperty(ReactMountWrapper.prototype, ITERATOR_SYMBOL, {
    configurable: true,
    value: function iterator() {
      const iter = this.instances[ITERATOR_SYMBOL]();
      return {
        next() {
          const next = iter.next();
          if (next.done) {
            return { done: true };
          }
          return {
            done: false,
            value: next.value,
          };
        },
      };
    },
  });
}

const mountWrapper = (rootElement, passedOptions = {}) => {
  const adapter = new ReactTestRendererAdapter();
  const renderer = adapter.createMountRenderer(passedOptions);
  const rootRef = renderer.render(rootElement, passedOptions.context);
  const rootInstance = new ReactTestInstance(rootRef._reactInternalFiber);
  return new ReactMountWrapper(rootInstance.children, rootRef, rootElement, renderer);
};

module.exports = mountWrapper;
