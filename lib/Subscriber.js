'use strict';
const request = require('./helpers/request');
const logger = require('./helpers/logger');
const DEFAULT_RETRY_INTERVAL = 5000;
const DEFAULT_SUBSCRIPTION_INTERVAL = 600;

function Subscriber(subscribeUrl, notificationUrl, _subscriptionInterval, _retryInterval) {
  let sid;
  let timer;

  // This is configurable just for testing purposes
  let subscriptionInterval = _subscriptionInterval || DEFAULT_SUBSCRIPTION_INTERVAL;
  let retryInterval = _retryInterval || DEFAULT_RETRY_INTERVAL;

  this.dispose = function dispose() {
    clearTimeout(timer);
    request({
      headers: {
        SID: sid
      },
      uri: subscribeUrl,
      method: 'UNSUBSCRIBE',
      stream: true
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
      stream: true
    }).then((res) => {
      sid = res.headers.sid;
      timer = setTimeout(subscribe, subscriptionInterval * 500);
    }).catch((e) => {
      console.error(`resubscribing to sid ${sid} failed`, e);
      sid = null;
      timer = setTimeout(subscribe, retryInterval);
    });
  }

  subscribe();
}

module.exports = Subscriber;
