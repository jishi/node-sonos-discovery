'use strict';
const dgram = require('dgram');
const EventEmitter = require('events').EventEmitter;
const util = require('util');

function SSDP() {
  const SONOS_PLAYER_UPNP_URN = 'urn:schemas-upnp-org:device:ZonePlayer:1';
  const PLAYER_SEARCH = new Buffer(['M-SEARCH * HTTP/1.1',
    'HOST: 239.255.255.250:reservedSSDPport',
    'MAN: ssdp:discover',
    'MX: 1',
    'ST: ' + SONOS_PLAYER_UPNP_URN].join('\r\n'));

  let socket;
  let closed;
  let _this = this;
  let scanTimeout;

  function receiveHandler(buffer, rinfo) {

    var response = buffer.toString('ascii');
    if (response.indexOf(SONOS_PLAYER_UPNP_URN) === -1) {
      // Ignore false positive from badly-behaved non-Sonos device.
      return;
    }

    var headerCollection = response.split('\r\n');
    var headers = {};

    for (var i = 0; i < headerCollection.length; i++) {
      var headerRow = headerCollection[i];

      if (/^([^:]+): (.+)/i.test(headerRow)) {
        headers[RegExp.$1] = RegExp.$2;
      }
    }

    if (!headers.LOCATION) return;

    _this.emit('found', {
      household: headers['X-RINCON-HOUSEHOLD'],
      location: headers.LOCATION,
      ip: rinfo.address
    });
  }

  function sendScan() {
    socket.send(PLAYER_SEARCH, 0, PLAYER_SEARCH.length, 1900, '239.255.255.250');
    scanTimeout = setTimeout(sendScan, 1000);
  }

  function start() {
    socket = dgram.createSocket('udp4', receiveHandler);
    socket.bind(1905, () => {
      socket.setMulticastTTL(2);
      sendScan();
    });

    socket.on('close', () => {
      closed = true;
    });

  }

  function stop() {
    if (!socket) return;
    if (closed) return;
    socket.close();
    clearTimeout(scanTimeout);
  }

  this.start = start;
  this.stop = stop;
}

util.inherits(SSDP, EventEmitter);

module.exports = new SSDP();
