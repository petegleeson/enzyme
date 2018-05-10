import { EnzymeAdapter } from 'enzyme';
import { createMountWrapper, mapNativeEventNames } from 'enzyme-adapter-utils';
import React from 'react';
import ReactDOM from 'react-dom';
import TestUtils from 'react-dom/test-utils';

export function createWrappedElement(el, context, options) {
  const ReactWrapperComponent = createMountWrapper(el, options);
  return React.createElement(ReactWrapperComponent, {
    Component: el.type,
    props: el.props,
    context,
  });
}

export class ReactTestRendererAdapter extends EnzymeAdapter {
  constructor() {
    super();
  }
  createMountRenderer(options) {
    const domNode = options.attachTo || global.document.createElement('div');
    let instance = null;
    return {
      render(el, context, callback) {
        if (instance === null) {
          const wrappedEl = createWrappedElement(el, context, options);
          instance = ReactDOM.render(wrappedEl, domNode);
          if (typeof callback === 'function') {
            callback();
          }
        } else {
          instance.setChildProps(el.props, context, callback);
        }
        return instance;
      },
      simulateEvent(node, event, mock) {
        const mappedEvent = mapNativeEventNames(event);
        const eventFn = TestUtils.Simulate[mappedEvent];
        if (!eventFn) {
          throw new TypeError(`ReactWrapper::simulate() event '${event}' does not exist`);
        }
        const instanceWithDOM = node.instance || node.find(inst => inst.instance).instance;
        eventFn(ReactDOM.findDOMNode(instanceWithDOM), mock);
      },
      unmount() {
        ReactDOM.unmountComponentAtNode(domNode);
        instance = null;
      },
    };
  }
  createRenderer(options) {
    switch (options.mode) {
      case EnzymeAdapter.MODES.MOUNT:
        return this.createMountRenderer(options);
      default:
        throw new Error(`Enzyme Internal Error: Unrecognized mode: ${options.mode}`);
    }
  }
}
