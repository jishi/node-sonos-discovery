'use strict';
const url = require('url');
const Subscriber = require('../Subscriber');
const soap = require('../helpers/soap');
const TYPE = soap.TYPE;

function Sub(data, listener) {
  let _this = this;
  _this.roomName = `${data.zonename} (SUB)`;
  _this.uuid = data.uuid;

  let uri = url.parse(data.location);
  _this.baseUrl = `${uri.protocol}//${uri.host}`;
  let renderingControlUrl = _this.baseUrl + '/MediaRenderer/RenderingControl/Event';
  let subscription = new Subscriber(renderingControlUrl, listener.endpoint());

  function notificationHandler(uuid, data) {
    if (uuid !== _this.uuid) {
      // This was not intended for us, skip it.
      return;
    }

    _this.gain = parseInt(data.subgain.val);
    _this.polarity = parseInt(data.subpolarity.val);
    _this.enabled = data.subenabled.val === '1';
    _this.crossover = parseInt(data.subcrossover.val);
  }

  listener.on('last-change', notificationHandler);

  _this.dispose = function dispose() {
    subscription.dispose();
  };
}

Sub.prototype.setGain = function setGain(value) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubGain', value: value });
};

Sub.prototype.setCrossover = function setCrossover(value) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubCrossover', value: value });
};

Sub.prototype.enable = function enable() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubEnabled', value: 1 });
};

Sub.prototype.disable = function disable() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubEnabled', value: 0 });
};

Sub.prototype.placementAdjustment = function placementAdjustment(on) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubPolarity', value: on ? 1 : 0 });
};



module.exports = Sub;
