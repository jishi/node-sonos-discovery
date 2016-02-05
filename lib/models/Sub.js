'use strict';
const url = require('url');
const Subscriber = require('../Subscriber');

function Sub(data, listener) {
  let _this = this;
  _this.roomName = `${data.zonename} (SUB)`;
  _this.uuid = data.uuid;

  let uri = url.parse(data.location);
  _this.baseUrl = `${uri.protocol}//${uri.host}`;
  let renderingControlUrl = _this.baseUrl + '/MediaRenderer/RenderingControl/Event';
  let subscription = new Subscriber(renderingControlUrl, listener.endpoint());

  _this.dispose = function dispose() {
    subscription.dispose();
  };
}

module.exports = Sub;
