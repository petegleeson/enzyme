/* eslint global-require: 0 */
const Adapter = require('./adapter/ReactTestRendererAdapter');
const MountWrapper = require('./wrapper/ReactMountWrapper');

module.exports = Adapter;
module.exports.wrapper = MountWrapper;
