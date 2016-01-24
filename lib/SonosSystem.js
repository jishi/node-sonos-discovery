'use strict';
const ssdp = require('./sonos-ssdp');
const request = require('./helpers/request');
const util = require('util');
const NotificationListener = require('./NotificationListener');

function SonosSystem(settings) {

  let _this = this;
  this.localEndpoint = '127.0.0.1';
  let listener;

  function subscribeToTopology(info) {
    let uri = util.format('http://%s:1400/ZoneGroupTopology/Event', info.ip);
    let callbackUri = util.format('<http://%s:3500/>', _this.localEndpoint);
    request({
      uri,
      method: 'SUBSCRIBE',
      headers: {
        NT: 'upnp:event',
        CALLBACK: callbackUri,
        TIMEOUT: 'Second-600'
      }
    });
  }

  function queueChange() {
    console.log('queue changed, emit something');
  }

  function favoritesChange() {
    console.log('favorites changed, emit something');
  }

  function init() {
    ssdp.start();
    ssdp.on('found', subscribeToTopology);

    listener = new NotificationListener();
    listener.on('queue-change', queueChange);
    listener.on('favorites-change', favoritesChange);
  }

  init();

}

module.exports = SonosSystem;
