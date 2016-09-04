'use strict';
const requireDir = require('./helpers/require-dir');
let services = {};
const logger = require('./helpers/logger');

requireDir(__dirname + '/services', (register) => {
  register(services);
});

function getServiceId(uri) {
  const matches = /sid=(\d+)/.exec(uri);
  if (matches) {
    return matches[1];
  }
}

function tryGetHighResArt(uri) {
  if (uri.startsWith('http')) return Promise.resolve(uri);

  let serviceId = getServiceId(uri);

  if (!services[serviceId]) {
    logger.debug('No such service', uri);
    return Promise.reject('No such service');
  }

  let service = services[serviceId];

  return service.tryGetHighResArt(uri);

}

module.exports = {
  tryGetHighResArt
};
