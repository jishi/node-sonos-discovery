'use strict';
const request = require('./helpers/request');
const util = require('util');

function Subscriber(subscribeUrl, notificationUrl, timeout) {
  let sid;
  let timer;

  this.dispose = function dispose() {
    clearTimeout(timer);
  };

  function subscribe() {
    clearTimeout(timer);
    let headers = {
      CALLBACK: util.format('<%s>', notificationUrl),
      NT: 'upnp:event',
      TIMEOUT: util.format('Second-%s', timeout)
    };

    if (sid) {
      headers.SID = sid;
    }

    request({
      headers,
      url: subscribeUrl,
      method: 'SUBSCRIBE'
    }).then((headers) => {
      sid = headers.SID;
      timer = setTimeout(subscribe, timeout * 850);
    }).catch((e) => {
      timer = setTimeout(subscribe, 5000);
    });
  }

  subscribe();
}

module.exports = Subscriber;