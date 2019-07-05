'use strict';
const http = require('http');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const flow = require('xml-flow');
const Readable = require('stream').Readable;
const logger = require('./helpers/logger');

const LIST_TYPE = require('./types/list-type');
let lastUpdate = {};

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

    let sax = flow(createStream(text), {
      preserveMarkup: flow.NEVER,
      useArrays: flow.SOMETIMES
    }
    );

    let zoneGroups = [];

    sax.on('tag:zonegroup', (group) => {
      if (Array.isArray(group.zonegroupmember)) {
        group.zonegroupmember = group.zonegroupmember.map(member => (member.$attrs || member));
      } else if (group.zonegroupmember.$attrs) {
        group.zonegroupmember = group.zonegroupmember.$attrs;
      }

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

    let sax = flow(createStream(text));

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
    return `http://${localEndpoint}:${listeningPort}/`;
  };

  function init() {
    server = http.createServer(notificationHandler);
    server.listen(listeningPort);

    server.on('listening', () => {
      _this.emit('listening', listeningPort);
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        server.listen(++listeningPort);
      }
    });
  }

  function notificationHandler(req, res) {
    req.on('end', () => {
      res.writeHead(200, 'OK');
      res.end();
    });

    if (req.method !== 'NOTIFY' || !req.headers || !req.headers.sid) {
      res.end();
      return;
    }

    const matches = req.headers.sid.match(/uuid:(.+)_sub/);

    if (!matches) {
      return;
    }

    let uuid = matches[1];

    let sax = flow(req, { useArrays: flow.NEVER });

    sax.on('tag:zonegroupstate', (property) => {
      logger.trace(property.$text);
      parseTopology(property.$text)
        .then((topology) => {
          _this.emit('topology', uuid, topology);
        });
    });

    sax.on('tag:lastchange', (property) => {
      logger.trace(property.$text);
      parseLastChange(property.$text)
        .then((lastChange) => {
          _this.emit('last-change', uuid, lastChange);
        });
    });

    sax.on('tag:groupmute', (property) => {
      logger.trace(property.$text);
      _this.emit('group-mute', uuid, property.$text);
    });

    sax.on('tag:savedqueuesupdateid', (property) => {
      logger.trace('tag:savedqueuesupdateid', property.$text);
      if (lastUpdate[LIST_TYPE.SAVED_QUEUES] !== property.$text) {
        lastUpdate[LIST_TYPE.SAVED_QUEUES] = property.$text;
        _this.emit('list-change', LIST_TYPE.SAVED_QUEUES);
      }
    });

    sax.on('tag:favoritesupdateid', (property) => {
      logger.trace('tag:favoritesupdateid', property.$text);
      if (lastUpdate[LIST_TYPE.FAVORITES] !== property.$text) {
        lastUpdate[LIST_TYPE.FAVORITES] = property.$text;
        _this.emit('list-change', LIST_TYPE.FAVORITES);
      }
    });

    sax.on('tag:containerupdateids', (property) => {
      logger.trace('tag:containerupdateids', property.$text);
      if (property.$text && property.$text.indexOf('Q:0') !== -1) {
        _this.emit('queue-change', uuid);
      }

      if (property.$text && property.$text.indexOf('AI:') !== -1) {
        _this.emit('list-change', LIST_TYPE.INPUTS);
      }
    });
  }

  init();
}

util.inherits(NotificationListener, EventEmitter);

module.exports = NotificationListener;
