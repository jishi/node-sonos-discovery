'use strict';
const http = require('http');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const flow = require('xml-flow');
const XmlEntities = require('html-entities').XmlEntities;
const Readable = require('stream').Readable;

function createStream(str) {
  let stream = new Readable();
  stream._read = function noop() {
  };

  stream.push(str);
  stream.push(null);
  return stream;
}

function parseTopology(text) {
  return new Promise((resolve, reject) => {

    // unescape xml
    let entities = new XmlEntities();
    let xml = entities.decode(text);

    let sax = flow(createStream(xml));

    let zoneGroups = [];

    sax.on('tag:zonegroup', (group) => {
      zoneGroups.push(group);
    });

    sax.on('end', () => {
      resolve(zoneGroups);
    });

    sax.on('error', (e) => {
      reject(e);
    });
  });
}

function parseLastChange(text) {
  return new Promise((resolve, reject) => {

    // unescape xml
    let entities = new XmlEntities();
    let xml = entities.decode(text);
    let sax = flow(createStream(xml));

    sax.on('tag:instanceid', (lastChange) => {
      resolve(lastChange);
    });

    sax.on('error', (e) => {
      reject(e);
    });
  });
}

function NotificationListener(localEndpoint) {
  let _this = this;
  let server;
  let listeningPort = 3500;

  this.endpoint = () => {
    util.format('http://%s:%s/', localEndpoint, listeningPort);
  };

  function init() {
    server = http.createServer(notificationHandler);
    server.listen(listeningPort);

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        server.listen(++listeningPort);
      }
    });
  }

  function notificationHandler(req) {

    if (req.method !== 'NOTIFY' || !req.headers || !req.headers.sid) {
      return;
    }

    if (/uuid:(.+)_sub/.test(req.headers.sid) === false) {
      return;
    }

    let uuid = RegExp.$1;

    let sax = flow(req);

    sax.on('tag:zonegroupstate', (property) => {
      parseTopology(property.$text)
        .then((topology) => {
          console.log(JSON.stringify(topology, 2))
          _this.emit('topology', uuid, topology);
        });
    });

    sax.on('tag:lastchange', (property) => {
      parseLastChange(property.$text)
      .then((lastChange) => {
        _this.emit('last-change', uuid, lastChange);
      });
    });

    sax.on('tag:containerupdateids', (property) => {
      if (property.$text.indexOf('Q:0') !== -1) {
        _this.emit('queue-change', uuid);
      }

      if (property.$text.indexOf('FV:2') !== -1) {
        _this.emit('favorites-change', uuid);
      }
    });
  }

  init();
}

util.inherits(NotificationListener, EventEmitter);

module.exports = NotificationListener;
