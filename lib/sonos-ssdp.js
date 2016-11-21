'use strict';
const dgram = require('dgram');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const os = require('os');
const logger = require('./helpers/logger');

function findLocalEndpoints() {
  const interfaces = os.networkInterfaces();
  const endpoints = ['0.0.0.0'];
  for (var name in interfaces) {
    interfaces[name]
      .filter((ipInfo) => ipInfo.internal == false && ipInfo.family == 'IPv4')
      .forEach((ipInfo) => endpoints.push(ipInfo.address));
  }

  return endpoints;
}

function SSDP() {
  const SONOS_PLAYER_UPNP_URN = 'urn:schemas-upnp-org:device:ZonePlayer:1';
  const PLAYER_SEARCH = new Buffer(['M-SEARCH * HTTP/1.1',
    'HOST: 239.255.255.250:reservedSSDPport',
    'MAN: ssdp:discover',
    'MX: 1',
    'ST: ' + SONOS_PLAYER_UPNP_URN].join('\r\n'));

  let socket;
  let _this = this;
  let scanTimeout;
  let socketCycleInterval;

  const localEndpoints = findLocalEndpoints();
  const remoteEndpoints = ['239.255.255.250', '255.255.255.255'];
  let remoteEndpointIndex = 0;
  let localEndpointIndex = 0;

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

      const headerParts = /^([^:]+): (.+)/i.exec(headerRow);

      if (headerParts) {
        headers[headerParts[1]] = headerParts[2];
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
    logger.trace('sending M-SEARCH...');

    // Alternate between 239.255.255.250 and 255.255.255.255 to increase discoverability in complex environment
    const remoteEndpoint = remoteEndpoints[remoteEndpointIndex++ % remoteEndpoints.length];
    socket.send(PLAYER_SEARCH, 0, PLAYER_SEARCH.length, 1900, remoteEndpoint);
    scanTimeout = setTimeout(sendScan, 1000);
  }

  function start() {
    createSocket(() => {
      sendScan();
    });

    socketCycleInterval = setInterval(() => {
      createSocket();
    }, 5000);
  }

  function createSocket(callback) {
    if (socket) {
      socket.close();
    }

    socket = dgram.createSocket({ type: 'udp4', reuseAddr: true }, receiveHandler);
    const endpoint = localEndpoints[localEndpointIndex++ % localEndpoints.length];
    socket.bind(1905, endpoint, () => {
      // This allows discovery through one router hop in a vlan environment
      socket.setMulticastTTL(2);

      // We set this in order to send 255.255.255.255 discovery requests. Doesn't matter for SSDP endpoint
      socket.setBroadcast(true);
      if (callback instanceof Function) {
        callback();
      }
    });
  }

  function stop() {
    if (!socket) return;
    socket.close();
    socket = null;
    clearInterval(socketCycleInterval);
    clearTimeout(scanTimeout);
  }

  this.start = start;
  this.stop = stop;
}

util.inherits(SSDP, EventEmitter);

module.exports = new SSDP();
