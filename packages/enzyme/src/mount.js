import ReactWrapper from './ReactWrapper';
import configuration from './configuration';

/**
 * Mounts and renders a react component into the document and provides a testing wrapper around it.
 *
 * @param node
 * @returns {ReactWrapper}
 */
export default function mount(node, options) {
  const { mountWrapper } = configuration.get();
  // should the API for creating built-in wrapper vs a custom wrapper be standardised?
  return mountWrapper ? mountWrapper(node, options) : new ReactWrapper(node, null, options);
}
