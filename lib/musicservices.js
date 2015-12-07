'use strict';
const requireFu = require('require-fu');
let services = {};

requireFu(__dirname + '/services')(services);

function getServiceId(uri) {
  if (/sn=(\d+)/.test(uri)) {
    return RegExp.$1;
  }
}

function tryGetHighResArt(uri) {
  let serviceId = getServiceId(uri);

  if (!services[serviceId]) {
    return Promise.reject('No such service');
  }

  let service = services[serviceId];

  return service.tryGetHighResArt(uri);

}

module.exports = {
  tryGetHighResArt
};