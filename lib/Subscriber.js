'use strict';
const request = require('./helpers/request');
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
  };

  function subscribe() {
    clearTimeout(timer);
    let headers = {
      CALLBACK: `<${notificationUrl}>`,
      NT: 'upnp:event',
      TIMEOUT: `Second-${subscriptionInterval}`
    };

    if (sid) {
      headers.SID = sid;
    }

    request({
      headers,
      uri: subscribeUrl,
      method: 'SUBSCRIBE'
    }).then((headers) => {
      sid = headers.SID;
      timer = setTimeout(subscribe, subscriptionInterval * 850);
    }).catch((e) => {
      console.error(e);
      timer = setTimeout(subscribe, retryInterval);
    });
  }

  subscribe();
}

module.exports = Subscriber;
