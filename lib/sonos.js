"use strict";
var dgram = require('dgram'),
  http = require('http'),
  util = require('util'),
  EventEmitter = require('events').EventEmitter,
  sax = require("sax"),
  xml2js = require("xml2js"),
  async = require("async"),
  Player = require('./player.js');

String.prototype.startsWith = function (str) {
  return this.indexOf(str) === 0;
}

// Handles parsing of time represented in the format "HH:mm:ss"
String.prototype.parseTime = function () {
  var chunks = this.split(':').reverse();
  var timeInSeconds = 0;

  for (var i = 0; i < chunks.length; i++) {
    timeInSeconds += parseInt(chunks[i], 10) * Math.pow(60, i);
  }
  return isNaN(timeInSeconds) ? 0 : timeInSeconds;
}

Number.prototype.zpad = function (width) {
  var str = this + "";
  if (str.length >= width) return str;
  var padding = new Array(width - str.length + 1).join('0');
  return padding + str;
}

Number.prototype.formatTime = function () {
  var chunks = [];
  var modulus = [60^2, 60];
  var remainingTime = this;
  // hours
  var hours = Math.floor(remainingTime/3600);

  if (hours > 0) {
    chunks.push(hours.zpad(2));
    remainingTime -= hours * 3600;
  }

  // minutes
  var minutes = Math.floor(remainingTime/60);
  chunks.push(minutes.zpad(2));
  remainingTime -= minutes * 60;
  // seconds
  chunks.push(remainingTime.zpad(2))

  return chunks.join(':');
}

String.prototype.format = function (replaceTable) {
  return this.replace(/{([a-z]+)}/gi, function (match) {
    return (replaceTable.hasOwnProperty(RegExp.$1)) ? replaceTable[RegExp.$1] : match;
  });
}

function Discovery() {

  var _this = this;
  var timeout;
  var subscribedTo;
  var subscriptionTimeout = 300;
  var groupVolumeTimer;

  // create a notify server, this will handle all events.
  var eventServer = http.createServer(handleEventNotification);

  // This just keeps a list of IPs that responded to our search
  this.knownPlayers = [];

  // instance properties
  this.players = {};

  this.zones = [];

  var PLAYER_SEARCH = new Buffer(["M-SEARCH * HTTP/1.1",
    "HOST: 239.255.255.250:reservedSSDPport",
    "MAN: ssdp:discover",
    "MX: 1",
    "ST: urn:schemas-upnp-org:device:ZonePlayer:1"].join("\r\n"));

  var socket = dgram.createSocket('udp4', function(buffer, rinfo) {

    // We found a player, reset the scan timeout
    clearTimeout(timeout);
    // timeout = setTimeout(scanDevices, 120000);

    var response = buffer.toString('ascii');
    var headers = response.split('\r\n');

    if (_this.knownPlayers.indexOf(rinfo.address) > -1) {
      _this.knownPlayers.push(rinfo.address);
    }

    if (!_this.players.hasOwnProperty(rinfo.address)) {
      var location;
      for (var i = 0; i < headers.length; i++) {
        var header = headers[i];

        if (/^location: (.+)/i.test(header)) {
          location = RegExp.$1;
          break;
        }


      }
      // var player = new Player(rinfo.address, location, _this);
      // _this.players[rinfo.address] = player;
      // _this.emit('DeviceAvailable', player);
      // We try to subscribe to the first unit we find
      trySubscribe( location, rinfo.address );
    }
  });



  socket.on('listening', function () {
    socket.setMulticastTTL(2);
    scanDevices();
  });
  socket.bind(1905);

  socket.on('error', function (e) {
    console.error(e);
  });

  // search periodcally

  function scanDevices() {
    console.log("scanning for players...");
    socket.send(PLAYER_SEARCH, 0, PLAYER_SEARCH.length, 1900, '239.255.255.250');
    clearTimeout(timeout);
    // Use a short timeout here, reset if we found players.
    timeout = setTimeout(scanDevices, 2000);
  }

  function handleEventNotification(req, res) {
    res.statusCode = 200;

    var saxStream = sax.createStream(true);
      var notifyState = {
        sid: req.headers.sid,
        nts: req.headers.nts
      };

    saxStream.on('text', function (text) {
      if (text.length == 0) return;
      notifyState.body = decodeXML(text);
    });
    saxStream.on('opentag', function (node) {
      if (node.name === 'e:property') {
        notifyState.type = "";
        notifyState.body = "";
      } else if (!node.name.startsWith('e:')) {
        notifyState.type = node.name;
      }

    });
    saxStream.on('closetag', function (nodeName) {
      if (nodeName !== "e:property") {
        return;
      }

      // Zone group topology, we handle
      if (notifyState.type == "ZoneGroupState") {
        // This is a topologychange
        updateZoneState( notifyState.body );

      } else if(notifyState.type == "FavoritesUpdateID") {
        // We got an update to favorites, reload and emit!
        // get a player
        var player;
        for (var i in _this.players) {
          player = _this.players[i];
          break;
        }
        if (player) {
          player.getFavorites(function (success, favorites) {
            if (!success) return;
            _this.emit('favorites', favorites);
          });
        }

      } else {
        _this.emit('notify', notifyState);
      }

    });

    saxStream.on('end', function () {

      res.end();
    });

    req.pipe(saxStream);
  }

  function updateZoneState( xml )  {
    // Discovering players
    xml2js.parseString(xml, function (err, result) {

      var zones = [];

      result.ZoneGroups.ZoneGroup.forEach(function (zoneGroup) {
        var zone = {
          uuid: zoneGroup.$.Coordinator,
          id: zoneGroup.$.ID,
          members: []
        };

        zoneGroup.ZoneGroupMember.forEach(function (member) {
          // { '$':
          //    { UUID: 'RINCON_000E5853172801400',
          //      Location: 'http://192.168.1.153:1400/xml/device_description.xml',
          //      ZoneName: 'Bedroom',
          //      Icon: 'x-rincon-roomicon:bedroom',
          //      Configuration: '1',
          //      SoftwareVersion: '21.4-61160c',
          //      MinCompatibleVersion: '21.1-00000',
          //      BootSeq: '37' } }

          // Ignore invisible players! This includes bridges and paired devices
          // Like stereo pairs, SUBs etc
          if (member.$.Invisible) return;

          if (!_this.players.hasOwnProperty(member.$.UUID)) {
            // This player doesn't exists, create it.
            var player = new Player(member.$.ZoneName, member.$.Location, member.$.UUID, _this);
            _this.players[member.$.UUID] = player;
          } else {
            var player = _this.players[member.$.UUID];
          }
          zone.members.push(player);
          // Also, add coordinator
          if (zone.uuid == player.uuid) {
            zone.coordinator = player;
          }
        });

        // We ignore empty zones
        if (zone.members.length > 0)
          zones.push(zone);
      });

      // update coordinator for each player
      zones.forEach(function (zone) {
        var coordinator = _this.players[zone.uuid];
        zone.members.forEach(function (player) {
          player.coordinator = coordinator;
        })
      });

      _this.zones = zones;
    });

    // Emit a zone change event
    console.log("topology change emit")
    _this.emit('topology-change', _this.getZones() );

  }

  function trySubscribe( deviceDescription, address ) {
    console.log("trying to subscribe to topology", address);

    if (subscribedTo !== undefined) {
      return;
    }

    subscribedTo = address;

    // Find local endpoint
    http.get(deviceDescription, function (res) {

      // We want to know our endpoint IP to expose the correct event url
      // In case of multiple interfaces!
      _this.localEndpoint = res.socket.address().address;

      // We don't need anything more, subscribe
      subscribeToZoneTopology();
      subscribeToContentDirectory();

    });


  }

  function subscribeToContentDirectory(callback) {
    // TEST
    // ContentDirectory

    var client = http.request({
      host: subscribedTo,
      port: 1400,
      path: '/MediaServer/ContentDirectory/Event',
      method: 'SUBSCRIBE',
      headers: {
        'CALLBACK': '<http://'+ _this.localEndpoint +':3500/>',
        'NT': 'upnp:event',
        'TIMEOUT': 'Second-' + subscriptionTimeout
      }
    }, function (res) {

      // Store some relevant headers?


    });

    client.on('error', function (e) {
      console.error(e);
    });

    client.end();
  }

  function subscribeToZoneTopology(callback) {
    var client = http.request({
      host: subscribedTo,
      port: 1400,
      path: '/ZoneGroupTopology/Event',
      method: 'SUBSCRIBE',
      headers: {
        'CALLBACK': '<http://'+ _this.localEndpoint +':3500/>',
        'NT': 'upnp:event',
        'TIMEOUT': 'Second-' + subscriptionTimeout
      }
    }, function (res) {

      // Store some relevant headers?
      if (!callback) {
        return;
      }
      if (res.statusCode == 200) {
        callback(true);
      } else {
        callback(false);
      }

    });

    client.on('error', function (e) {
      // If this fails, this player has fallen of the grid
      console.log(e);
      callback && callback(false);
    });

    client.end();

    setTimeout(subscribeToZoneTopology, subscriptionTimeout * 900);


  }

  function decodeXML(str) {

    var replaceTable = {
      '&gt;': '>',
      '&lt;': '<',
      '&quot;': '"',
      '&amp;': '&'
    };

    return str.replace(/&[^;];/, function (match) {return replaceTable[match] || match});
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
  }

  this.aggregateGroupVolume = function (volumeData) {
    clearTimeout(groupVolumeTimer);
    groupVolumeTimer = setTimeout(function () {
      console.log('emitting group-volume');
      _this.emit('group-volume', volumeData);
    }, 100);
  }

  // Start the event server.
  eventServer.listen(3500);

}



util.inherits(Discovery, EventEmitter);

Discovery.prototype.getPlayer = function (roomName) {
  for (var i in this.players) {
    var player = this.players[i];
    if (player.roomName.toLowerCase() == roomName.toLowerCase()) {
      return player;
    }
  }
}

Discovery.prototype.getPlayerByUUID = function (uuid) {
  for (var i in this.players) {
    var player = this.players[i];
    if (player.uuid == uuid) {
      return player;
    }
  }
}

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

Discovery.prototype.applyPreset = function (preset) {
  console.log("applying preset", preset);
  // cache this reference for closure access
  var _this = this;
  var playerInfo = preset.players[0];
  var coordinator = this.getPlayer(playerInfo.roomName);
  var coordinatorVolume = playerInfo.volume;

  var asyncSeries = [];


  // If coordinator already is coordinator, skip becomeCoordinatorOfStandaloneGroup
  // If only one player in preset, it should breakout never the less.
  if (coordinator.coordinator.uuid == coordinator.uuid && preset.players.length > 1) {
    console.log("skipping breakout because already coordinator");
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
        asyncSeries.push(function (callback) {
          player.becomeCoordinatorOfStandaloneGroup(function (success) {
            callback(null, success);
          });
        });
      }
    });

  } else {
    // This one is not coordinator, just detach it and leave it be.
    console.log("ungrouping", coordinator.roomName, "to prepare for grouping");
    asyncSeries.push(function (callback) {
      coordinator.becomeCoordinatorOfStandaloneGroup(function (success) {
        callback(null, success);
      });
    });
  }

  // Create a callback chain based on the preset
  asyncSeries.push(function (callback) {
    coordinator.setVolume(coordinatorVolume, function (success) {
      callback(null, success);
    });
  });

  if (preset.favorite) {
    asyncSeries.push(function (callback) {
      coordinator.replaceWithFavorite(preset.favorite, function (success) {
        callback(null, success);
      });
    });
  } else if (preset.uri) {
    asyncSeries.push(function (callback) {
      coordinator.setAVTransportURI(preset.uri, null, function (success) {
        callback(null, success);
      });
    });
  }

  if (preset.playMode) {
    asyncSeries.push(function (callback) {
      coordinator.setPlayMode(preset.playMode, function (success) {
        callback(null, success);
      });
    });
  }

  for (var i = 1; i < preset.players.length; i++) {
    var playerInfo = preset.players[i];
    var player = _this.getPlayer(playerInfo.roomName);
    var streamUrl = "x-rincon:" + coordinator.uuid;
    if (player.currentTrackUri != streamUrl) {
      asyncSeries.push(function (player, streamUrl) {
        return function (callback) {
          player.setAVTransportURI(streamUrl, null, function (success) {
            callback(success ? null : "error", success);
          });
        }
      }(player, streamUrl));
    }

    asyncSeries.push(function (volume) {
      return function (callback) {
        player.setVolume(volume, function (success) {
          callback(null, success);
        });
      }
    }(playerInfo.volume));
  }

  async.series(asyncSeries, function (err, result) {
    if (preset.state != "stopped")
      coordinator.play();
  });
}

module.exports = Discovery;