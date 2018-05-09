const Enzyme = require('enzyme');
const Adapter = require('./adapter');
const mountWrapper = require('enzyme-adapter-react-renderer');

Enzyme.configure({ adapter: new Adapter(), mountWrapper });
