'use strict';
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const request = require('./helpers/request');
const logger = require('./helpers/logger');
const DEFAULT_RETRY_INTERVAL = 5000;
const DEFAULT_SUBSCRIPTION_INTERVAL = 600;
const RETRIES_BEFORE_CONSIDERED_DEAD = 5;

function Subscriber(subscribeUrl, notificationUrl, _subscriptionInterval, _retryInterval) {
  const _this = this;
  let sid;
  let timer;
  let errorCount = 0;

  // This is configurable just for testing purposes
  const subscriptionInterval = _subscriptionInterval || DEFAULT_SUBSCRIPTION_INTERVAL;
  const retryInterval = _retryInterval || DEFAULT_RETRY_INTERVAL;

  this.dispose = function dispose() {
    clearTimeout(timer);
    request({
      headers: {
        SID: sid
      },
      uri: subscribeUrl,
      method: 'UNSUBSCRIBE',
      type: 'stream'
    }).then(() => {
      logger.trace('successfully unsubscribed from', subscribeUrl);
    }).catch((e) => {
      logger.error(`unsubscribe from sid ${sid} failed`, e);
    });
  };

  function subscribe() {
    clearTimeout(timer);
    let headers = {
      TIMEOUT: `Second-${subscriptionInterval}`
    };

    if (sid) {
      headers.SID = sid;
    } else {
      headers.CALLBACK = `<${notificationUrl}>`;
      headers.NT = 'upnp:event';
    }

    request({
      headers,
      uri: subscribeUrl,
      method: 'SUBSCRIBE',
      type: 'stream'
    }).then((res) => {
      sid = res.headers.sid;
      timer = setTimeout(subscribe, subscriptionInterval * 500);
      errorCount = 0;
    }).catch((e) => {
      logger.warn(`resubscribing to sid ${sid} failed`, e);
      sid = null;
      errorCount++;
      timer = setTimeout(subscribe, retryInterval);
      if (errorCount === RETRIES_BEFORE_CONSIDERED_DEAD) {
        _this.emit('dead', `Endpoint has probably died`);
      }
    });
  }

  subscribe();
}

util.inherits(Subscriber, EventEmitter);

module.exports = Subscriber;
