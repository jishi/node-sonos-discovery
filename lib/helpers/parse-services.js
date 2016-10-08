'use strict';
const streamer = require('./streamer');
const flow = require('xml-flow');

function parseServices(servicesXML) {
  const services = {};

  return new Promise((resolve, reject) => {
    let stream = streamer(servicesXML.availableservicedescriptorlist);
    let sax = flow(stream, { preserveMarkup: flow.NEVER });

    sax.on('tag:service', (service) => {
      const serviceID = parseInt(service.$attrs.id);
      services[service.$attrs.name] = {
        id: serviceID,
        capabilities: parseInt(service.$attrs.capabilities),
        type: (serviceID << 8) + 7
      };
    });

    sax.on('end', () => {
      resolve(services);
    });

    sax.on('error', (error) => {
      reject(error);
    });
  });
}

module.exports = parseServices;
