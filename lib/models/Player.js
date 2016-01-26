'use strict';
const url = require('url');
const util = require('util');
const Subscriber = require('../Subscriber');

function Player(data, listener) {
  let _this = this;
  this.roomName = data.zonename;
  this.uuid = data.uuid;

  let uri = url.parse(data.location);
  this.baseUrl = util.format('%s//%s', uri.protocol, uri.host);

  let subscribeEndpoints = [
    '/MediaRenderer/AVTransport/Event',
    '/MediaRenderer/RenderingControl/Event',
    '/MediaRenderer/GroupRenderingControl/Event'
  ];

  let subscriptions = subscribeEndpoints.map((path) => {
    return new Subscriber(_this.baseUrl + path, listener.endpoint());
  });

  this.dispose = function dispose() {
    subscriptions.forEach((subscriber) => {
      subscriber.dispose();
    });
  }
}

module.exports = Player;
