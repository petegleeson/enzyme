const Enzyme = require('@pgleeson/enzyme');
const Adapter = require('./adapter');

Enzyme.configure({ adapter: new Adapter() });
