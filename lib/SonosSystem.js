'use strict';
const ssdp = require('./sonos-ssdp');
const request = require('request-promise');

function SonosSystem(settings) {

  function init() {
    ssdp.start();
    ssdp.on('found', subscribeToTopology);
  }

  function subscribeToTopology(info) {
    request({

    })
  }

  init();

}

module.exports = SonosSystem;
