'use strict';
var dgram = require('dgram');
var os = require('os');
var url = require('url');
var http = require('http');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var EasySax = require('easysax');
var async = require('async');
var Player = require('./player.js');
var Sub = require('./sub.js');

var logger = require('./logger');

String.prototype.startsWith = function (str) {
  return this.indexOf(str) === 0;
};

// Handles parsing of time represented in the format "HH:mm:ss"
String.prototype.parseTime = function () {
  var chunks = this.split(':').reverse();
  var timeInSeconds = 0;

  for (var i = 0; i < chunks.length; i++) {
    timeInSeconds += parseInt(chunks[i], 10) * Math.pow(60, i);
  }

  return isNaN(timeInSeconds) ? 0 : timeInSeconds;
};

Number.prototype.zpad = function (width) {
  var str = this + '';
  if (str.length >= width) return str;
  var padding = new Array(width - str.length + 1).join('0');
  return padding + str;
};

Number.prototype.formatTime = function (alwaysHours) {
  var _this = this;
  var chunks = [];
  var modulus = [60 ^ 2, 60];
  var remainingTime = _this;

  // hours
  var hours = Math.floor(remainingTime / 3600);

  if (hours > 0 || alwaysHours) {
    chunks.push(hours.zpad(2));
    remainingTime -= hours * 3600;
  }

  // minutes
  var minutes = Math.floor(remainingTime / 60);
  chunks.push(minutes.zpad(2));
  remainingTime -= minutes * 60;

  // seconds
  chunks.push(remainingTime.zpad(2));

  return chunks.join(':');
};

String.prototype.format = function (replaceTable) {
  return this.replace(/{([a-z]+)}/gi, function (match) {
    return (replaceTable.hasOwnProperty(RegExp.$1)) ? replaceTable[RegExp.$1] : match;
  });
};

function Discovery(settings) {

  var _this = this;
  var timeout;
  var subscriptionTimeout = 600;
  var groupVolumeTimer;
  this.toggleLED = false;
  this.ignoreFavoritesEvents = false;

  settings = settings || {
    household: null
  };
  this.log = settings.log || logger.initialize();

  // create a notify server, this will handle all events.
  var eventServer = http.createServer(handleEventNotification);

  var sids = {};

  // This just keeps a list of IPs that responded to our search
  this.knownPlayers = [];

  // instance properties
  this.players = {};

  // sub instance properties
  this.subs = {};

  this.zones = [];

  this.subscribedTo = undefined;

  this.notificationPort = 3500;

  var SONOS_PLAYER_UPNP_URN = 'urn:schemas-upnp-org:device:ZonePlayer:1';
  var PLAYER_SEARCH = new Buffer(['M-SEARCH * HTTP/1.1',
    'HOST: 239.255.255.250:reservedSSDPport',
    'MAN: ssdp:discover',
    'MX: 1',
    'ST: ' + SONOS_PLAYER_UPNP_URN].join('\r\n'));

  var port = 1905;
  this.log.info('binding SSDP to port', port);

  var interfaces = os.networkInterfaces();

  // find all ip addresses
  // We use a dummy for a special case where node can't list network interfaces (freeBSD)
  var sockets = { dummy: null };

  if (settings.disableIpDiscovery) {
    this.log.info('listen on 0.0.0.0');
  } else {
    for (var name in interfaces) {
      _this.log.info('discovering all IPs from', name);
      interfaces[name].forEach(function (ipInfo) {
        if (ipInfo.internal == false && ipInfo.family == 'IPv4') {
          // this one is interesting, use it
          delete sockets.dummy;
          sockets[ipInfo.address] = null;
        }
      });
    }

    this.log.info('relevant IPs', sockets);
  }

  // Now, create a socket for each ip

  for (var ip in sockets) {
    var socket = dgram.createSocket('udp4', function(buffer, rinfo) {

      var response = buffer.toString('ascii');
      if (response.indexOf(SONOS_PLAYER_UPNP_URN) === -1) {
        // Ignore false positive from badly-behaved non-Sonos device.
        return;
      }

      var headerCollection = response.split('\r\n');
      var headers = {};

      if (_this.knownPlayers.indexOf(rinfo.address) > -1) {
        _this.knownPlayers.push(rinfo.address);
      }

      for (var i = 0; i < headerCollection.length; i++) {
        var headerRow = headerCollection[i];

        if (/^([^:]+): (.+)/i.test(headerRow)) {
          headers[RegExp.$1] = RegExp.$2;
        }
      }

      if (!headers.LOCATION) return;

      if (settings.household && settings.household != headers['X-RINCON-HOUSEHOLD']) return;

      // We found a player, reset the scan timeout
      clearTimeout(timeout);

      // We try to subscribe to the first unit we find
      trySubscribe(headers.LOCATION, rinfo.address);

      // OK, now close all sockets
      for (var ip in sockets) {
        sockets[ip].close();
      }
    });

    socket.on('error', function (e) {
      _this.log.error(e);
    });

    socket.on('listening', (function (socket) {
      return function () {
        socket.setMulticastTTL(2);
        clearTimeout(timeout);

        // Use a short timeout here, reset if we found players.
        timeout = setTimeout(scanDevices, 200);
      };
    })(socket));

    if (ip == 'dummy')
      socket.bind(port);
    else
      socket.bind(port, ip);

    sockets[ip] = socket;
  }

  // search periodcally

  function scanDevices() {
    for (var ip in sockets) {
      _this.log.info('scanning for players in ip', ip);
      var socket = sockets[ip];
      socket.send(PLAYER_SEARCH, 0, PLAYER_SEARCH.length, 1900, '239.255.255.250');
      clearTimeout(timeout);

      // Use a short timeout here, reset if we found players.
      timeout = setTimeout(scanDevices, 2000);
    }
  }

  function handleEventNotification(req, res) {
    res.statusCode = 200;
    var buffer = [];
    req.setEncoding('utf-8');
    req.on('data', function (chunk) {
      buffer.push(chunk);
    });

    req.on('end', function () {
      res.end();
      var saxParser = new EasySax();
      var notifyState = {
        sid: req.headers.sid,
        nts: req.headers.nts
      };

      saxParser.on('error', function (e) {
        _this.log.error(e, buffer.join(''));
      });

      var nodeContent;

      saxParser.on('endNode', function (elem, attr, uq, tagend, getStrNode) {
        // ignored nodes
        if (elem == 'e:property' || elem == 'e:propertyset') return;

        //if (notifyState.type) return;
        notifyState.type = elem;

        if (elem == 'ZoneGroupState') {
          updateZoneState(notifyState.body);
        } else if (elem == 'ContainerUpdateIDs') {
          if (notifyState.body.indexOf('Q:0') == -1) return;
          if (/uuid:(.+)_sub/.test(notifyState.sid))
            _this.emit('queue-changed', { uuid: RegExp.$1 });
        } else if (elem == 'FavoritesUpdateID') {
          if (!_this.ignoreFavoritesEvents) {
            _this.ignoreFavoritesEvents = true;
            clearTimeout(_this.ignoreFavoritesEventsTimeout);
            _this.ignoreFavoritesEventsTimeout = setTimeout(function () { _this.ignoreFavoritesEvents = false; }, 500);

            var player;
            for (var i in _this.players) {
              player = _this.players[i];
              break;
            }

            if (!player) return;

            player.getFavorites(function (success, favorites) {
              if (!success) return;
              _this.emit('favorites', favorites);
            });
          }
        } else {
          _this.emit('notify', notifyState);
        }
      });

      saxParser.on('textNode', function (s, uq) {
        notifyState.body = uq(s);
      });

      saxParser.parse(buffer.join(''));

    });
  }

  function updateZoneState(xml)  {
    var saxParser = new EasySax();

    var zones = [];
    var zone;

    saxParser.on('startNode', function (elem, attr) {
      if (elem == 'ZoneGroup') {
        var attributes = attr();
        zone = {
          uuid: attributes.Coordinator,
          id: attributes.ID,
          members: []
        };

      } else if (elem == 'ZoneGroupMember') {
        var attributes = attr();

        // This is a bridge or a stereo-paired player
        // This stereo pair check (the SW, SW part) is a bit of a hack,
        // but I can't find a better way to identify a paired speaker
        if (attributes.IsZoneBridge || attributes.Invisible && attributes.ChannelMapSet && attributes.ChannelMapSet.indexOf('SW,SW') == -1) return;

        if (!attributes.Invisible && !_this.players.hasOwnProperty(attributes.UUID)) {
          // This player doesn't exists, create it.
          var player = new Player(attributes.ZoneName, attributes.Location, attributes.UUID, _this);
          _this.players[attributes.UUID] = player;
        } else if (!attributes.Invisible) {
          var player = _this.players[attributes.UUID];
        }

        // This is a sub
        else if (attributes.Invisible && !_this.subs.hasOwnProperty(attributes.UUID)) {
          var sub = new Sub(attributes.ZoneName, attributes.Location, attributes.UUID, _this);
          _this.subs[attributes.UUID] = sub;
        } else if (attributes.Invisible) {
          var sub = _this.subs[attributes.UUID];
        }

        if (player) {
          zone.members.push(player);

          // Also, add coordinator
          if (zone.uuid == player.uuid) {
            zone.coordinator = player;
          }

          for (var i in _this.subs) {
            var sub = _this.subs[i];
            if (sub.roomName.toLowerCase() == player.roomName.toLowerCase()) {
              player.sub = sub;
            }
          }
        }

        if (sub) {
          for (var i in _this.players) {
            var player = _this.players[i];
            if (sub.roomName.toLowerCase() == player.roomName.toLowerCase()) {
              player.sub = sub;
            }
          }
        }
      }
    });

    saxParser.on('endNode', function (elem) {
      if (elem == 'ZoneGroup' && zone.members.length > 0) {
        // We ignore empty zones
        zones.push(zone);
      }
    });

    saxParser.parse(xml);

    // update coordinator for each player
    zones.forEach(function (zone) {
      var coordinator = _this.players[zone.uuid];
      zone.members.forEach(function (player) {
        player.coordinator = coordinator;
      });
    });

    _this.zones = zones;

    // Emit a zone change event
    _this.emit('topology-change', _this.getZones());
  }

  function trySubscribe(deviceDescription, address) {
    if (_this.subscribedTo !== undefined) {
      return;
    }

    _this.log.info('subscribing to topology', address);

    _this.subscribedTo = address;

    var urlInfo = url.parse(deviceDescription);

    var options = {
      localAddress: _this.localEndpoint,
      hostname: urlInfo.hostname,
      path: urlInfo.path,
      port: urlInfo.port

    };

    // Find local endpoint
    http.get(options, function (res) {

      // We want to know our endpoint IP to expose the correct event url
      // In case of multiple interfaces!
      _this.localEndpoint = res.socket.address().address;

      _this.log.info('using local endpoint', _this.localEndpoint);

      // We don't need anything more, subscribe
      subscribe('/ZoneGroupTopology/Event');
    });

  }

  function subscribe(path) {
    var headers = {
      TIMEOUT: 'Second-' + subscriptionTimeout
    };

    if (sids[path]) {
      headers.SID = sids[path];

    } else {
      headers.CALLBACK = '<http://' + _this.localEndpoint + ':' + _this.notificationPort + '/>';
      headers.NT = 'upnp:event';
    }

    var client = http.request({
      host: _this.subscribedTo,
      port: 1400,
      path: path,
      method: 'SUBSCRIBE',
      headers: headers
    }, function (res) {
      // Store sid for renewal
      sids[path] = res.headers.sid;
      if (res.statusCode == 200) {

        setTimeout(function () { subscribe(path); }, subscriptionTimeout * 500);
      } else {
        _this.log.error('subscribe failed!', sids[path], res.statusCode);

        // we lost the subscription, clear sid
        delete sids[path];

        // try again in 30 seconds
        setTimeout(function () { subscribe(path); }, 30000);
      }
    });

    client.on('error', function (e) {
      // If this fails, this player has fallen of the grid
      _this.log.error(e);
    });

    client.end();
  }

  function decodeXML(str) {

    var replaceTable = {
      '&gt;': '>',
      '&lt;': '<',
      '&quot;': '"',
      '&amp;': '&'
    };

    return str.replace(/&[^;];/, function (match) {return replaceTable[match] || match;});
  }

  this.getZones = function () {
    var response = [];
    _this.zones.forEach(function (zone) {
      var simpleZone = {
        uuid: zone.uuid,
        coordinator: zone.coordinator.convertToSimple(),
        members: []
      };

      zone.members.forEach(function (player) {
        var simplePlayer = player.convertToSimple();

        simpleZone.members.push(simplePlayer);
      });

      response.push(simpleZone);
    });

    return response;
  };

  this.aggregateGroupVolume = function (volumeData) {
    clearTimeout(groupVolumeTimer);
    groupVolumeTimer = setTimeout(function () {
      _this.log.debug('emitting group-volume');
      _this.emit('group-volume', volumeData);
    }, 100);
  };

  eventServer.on('error', function (e) {
    if (e.code == 'EADDRINUSE') {
      _this.log.error('port in use', _this.notificationPort, 'trying new one');
      startServerOnPort(++_this.notificationPort);
    }
  });

  eventServer.on('listening', function () {
    _this.log.info('notification server listening on port', _this.notificationPort);
  });

  // Start the event server.
  function startServerOnPort(port) {
    eventServer.listen(port);
  }

  // trying to start on default port. on error, we will try and increment this.
  startServerOnPort(this.notificationPort);

}

util.inherits(Discovery, EventEmitter);

Discovery.prototype.getPlayer = function (roomName) {
  for (var i in this.players) {
    var player = this.players[i];
    if (player.roomName.toLowerCase() == roomName.toLowerCase()) {
      return player;
    }
  }
};

Discovery.prototype.getPlayerByUUID = function (uuid) {
  for (var i in this.players) {
    var player = this.players[i];
    if (player.uuid == uuid) {
      return player;
    }
  }
};

Discovery.prototype.getSub = function (roomName) {

  for (var i in this.subs) {
    var sub = this.subs[i];
    if (sub.roomName.toLowerCase() == roomName.toLowerCase()) {
      return sub;
    }
  }
};

Discovery.prototype.getSubByUUID = function (uuid) {
  for (var i in this.subs) {
    var sub = this.subs[i];
    if (sub.uuid == uuid) {
      return sub;
    }
  }
};

//  preset format, will be extended in the future.
//  The first player will become coordinator. It will automatically start playing
//  Will add support for random playback, gapless and all that later.
//  Will implement the possibility to add a Favorite as queue as well.
//  {
//    "players": [
//      { "roomName": "room1", "volume": 15},
//      {"roomName": "room2", "volume": 25}
//    ]
//  }

Discovery.prototype.applyPreset = function (preset, callback) {
  this.log.info('applying preset', preset);

  // cache this reference for closure access
  var _this = this;
  if (!preset.players || preset.players.length == 0) {
    var msg = 'preset does not contain any players.';
    this.log.error(msg);
    callback(msg, null);
    return;
  }

  var playerInfo = preset.players[0];
  var coordinator = this.getPlayer(playerInfo.roomName);
  var coordinatorVolume = playerInfo.volume;

  var asyncSeries = [];

  // If pauseothers, first thing, pause all zones
  if (preset.pauseOthers) {
    // We wanted to pause all others
    this.zones.forEach(function (i) {
      asyncSeries.push(function (callback) {
        i.coordinator.pause(function (error) {
          if (callback) {
            callback(error, 'pausing ' + i.coordinator.roomName);
          }
        });
      });
    });
  }

  // If coordinator already is coordinator, skip becomeCoordinatorOfStandaloneGroup
  // If only one player in preset, it should breakout never the less.
  if (coordinator.coordinator.uuid == coordinator.uuid && preset.players.length > 1) {
    this.log.info('skipping breakout because already coordinator');

    // Instead we need to detach the players that don't belong.
    // Find the zone
    var zone;

    this.zones.forEach(function (i) {
      if (i.uuid == coordinator.uuid) {
        zone = i;
      }
    });

    // okay found zone. Now, find out which doesn't belong.
    var playerNames = [];

    preset.players.forEach(function (playerInfo) {
      playerNames.push(playerInfo.roomName);
    });

    zone.members.forEach(function (player) {
      if (playerNames.indexOf(player.roomName) == -1) {
        // not part of group, should be detached
        this.log.debug('removing', coordinator.roomName, 'should be removed from group');
        asyncSeries.push(function (callback) {
          player.becomeCoordinatorOfStandaloneGroup(function (error) {
            if (callback) {
              callback(error, 'breakout');
            }
          });
        });
      }
    });

  } else {
    // This one is not coordinator, just detach it and leave it be.
    this.log.debug('ungrouping', coordinator.roomName, 'to prepare for grouping');
    asyncSeries.push(function (callback) {
      coordinator.becomeCoordinatorOfStandaloneGroup(function (error) {
        if (callback) {
          callback(error, 'ungrouping');
        }
      });
    });
  }

  // Only set volume if defined
  if (coordinatorVolume !== undefined) {
    // Create a callback chain based on the preset
    asyncSeries.push(function (callback) {
      coordinator.setVolume(coordinatorVolume, function (error) {
        if (callback) {
          callback(error, 'set volume, coordinator');
        }
      });
    });
  }

  if (preset.favorite) {
    asyncSeries.push(function (callback) {
      coordinator.replaceWithFavorite(preset.favorite, function (error) {
        if (callback) {
          callback(error, 'applying favorite');
        }
      });
    });
  } else if (preset.uri) {
    asyncSeries.push(function (callback) {
      coordinator.setAVTransportURI(preset.uri, null, function (error) {
        if (callback) {
          callback(error, 'setting uri');
        }
      });
    });
  }

  if (preset.playMode) {
    asyncSeries.push(function (callback) {
      coordinator.setPlayMode(preset.playMode, function (error) {
        if (callback) {
          callback(error, 'set playmode');
        }
      });
    });
  }

  for (var i = 1; i < preset.players.length; i++) {
    var playerInfo = preset.players[i];
    var player = _this.getPlayer(playerInfo.roomName);
    if (!player) {
      _this.log.error('invalid playerName', playerInfo.roomName);
      continue;
    }

    var streamUrl = 'x-rincon:' + coordinator.uuid;

    _this.log.debug('checking if', playerInfo.roomName, 'needs to be grouped');
    _this.log.debug(coordinator.uuid, player.uuid, player.avTransportUri, streamUrl);
    if (player.uuid != coordinator.uuid && player.avTransportUri != streamUrl) {
      _this.log.debug('adding to group');
      asyncSeries.push(function (player, streamUrl) {
        return function (callback) {
          player.setAVTransportURI(streamUrl, null, function (error) {
            if (callback) {
              var err;
              if (error) {
                err = 'error in setAVTransportURI';
              }
              callback(err, 'AVTransportURI');
            }
          });
        };
      }(player, streamUrl));
    }

    if (playerInfo.volume !== undefined) {
      asyncSeries.push(function (player, volume) {
        return function (callback) {
          player.setVolume(volume, function (error) {
            if (callback) {
              callback(error, 'volume for ' + player.roomName);
            }
          });
        };
      }(player, playerInfo.volume));
    }
  }

  if (preset.trackNo) {
    asyncSeries.push(function (callback) {
      coordinator.seek(preset.trackNo, function (error) {
        // we don't care if this breaks or not.
        if (callback) {
          callback(error, 'seek');
        }
      });
    });
  }

  if (preset.elapsedTime) {
    asyncSeries.push(function (callback) {
      coordinator.trackSeek(preset.elapsedTime, function (error) {
        // we don't care if this breaks or not.
        if (callback) {
          callback(error, 'trackSeek');
        }
      });
    });
  }

  if (preset.sleep !== undefined) {
    asyncSeries.push(function (callback) {
      coordinator.sleep(preset.sleep, function (error) {
        // we don't care if this breaks or not.
        if (callback) {
          callback(error, 'sleep');
        }
      });
    });
  }

  async.series(asyncSeries, function (err, result) {
    if (!preset.state || preset.state.toLowerCase() == 'playing')
      coordinator.play(function (error) {
        if (callback instanceof Function) {
          var err;
          if (error) {
            err = 'error on play';
          }
          callback(err, result);
        }
      });

    else if (callback instanceof Function)
      callback(err, result);
  });
};

Discovery.prototype.setToggleLED = function (enabled) {
  this.toggleLED = enabled;
  this.log.info('update players with setToggleLED');

  this.on('transport-state', function (player) {
    // get zone
    var zone;
    for (var i in this.zones) {
      if (this.zones[i].uuid == player.uuid) {
        zone = this.zones[i];
        break;
      }
    }

    if (!zone) return;

    zone.members.forEach(function (member) {
      member.toggleLED(player.state.zoneState == 'PLAYING');
    });

  });
};

Discovery.prototype.getAnyPlayer = function () {
  // returns the player to which we subscribed for topology changes on. Can be anyone, doesn't matter
  for (var i in this.players) {
    return this.players[i];
  }

  return null;
};

module.exports = Discovery;
