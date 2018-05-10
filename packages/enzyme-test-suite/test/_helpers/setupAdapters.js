const Enzyme = require('enzyme');
const Adapter = require('./adapter');
const mountWrapper = require('enzyme-mount-wrapper');

Enzyme.configure({ adapter: new Adapter(), mountWrapper });
