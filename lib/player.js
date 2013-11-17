"use strict";

var http = require('http'),
  fs = require('fs'),
  util = require('util'),
  sax = require("sax"),
  xml2js = require("xml2js"),
  async = require("async"),
  XmlEntities = require("html-entities").XmlEntities;



function Player(roomName, descriptorUrl, uuid, discovery) {
  var _this = this;
  var positionInfoTimeout;
  // for prototype access
  this.discovery = discovery;
  this.address = descriptorUrl.replace(/http:\/\/([\d\.]+).*/, "$1");
  this.roomName = roomName;
  this.zoneType = 0;
  this.uuid = uuid;
  this.state = {
    currentTrack: {
      artist: "",
      title: "",
      album: "",
      albumArtURI: "",
      duration: 0
    },
    nextTrack: {
      artist: "",
      title: "",
      album: "",
      duration: 0
    },
    relTime: 0,
    stateTime: new Date(0),
    volume: 0,
    trackNo: 0,
    currentState: "STOPPED"
  };
  this.currentTrackUri = "";
  this.coordinator = null;
  this.currentPlayMode = 0; // 0 = NORMAL
  this.ignoreVolumeEvents = false;

  // These will be set if coordinator
  this.groupState = {
    volume: 0,
    mute: false
  }

  this.playModeStrings = ["NORMAL", "REPEAT_ALL", "SHUFFLE_NOREPEAT", "SHUFFLE"];
  var playModesToFlags = {};
  for (var i = 0; i < this.playModeStrings.length; i++) {
    playModesToFlags[this.playModeStrings[i]] = i;
  }

  var subscriptionTimeout = 600;

  discovery.on('notify', handleNotification);

  // subscribe to events
  subscribeToEvents();

  function handleNotification(notification) {

    // If this wasn't aimed at me, disregard.
    if (!notification.sid.startsWith('uuid:' + _this.uuid)) return;

    if (notification.type == 'GroupMute') {
      _this.groupState.mute = notification.body == "1" ? true : false;
      discovery.emit('group-mute', {uuid: _this.uuid, state: _this.groupState});
      return;
    }

    // Check if this is something we are interested in
    if (notification.type != 'LastChange') return;

    fs.appendFile('notification.log', notification.body + '\n');

    // LastChange, that is interesting!
    xml2js.parseString(notification.body, function (err, result) {
      var eventType = Object.keys(result.Event.InstanceID[0])[1];

      switch(eventType) {
        case 'TransportState':
          _this.crossfadeMode = result.Event.InstanceID[0].CurrentCrossfadeMode[0].$.val;
          _this.currentPlayMode = playModesToFlags[result.Event.InstanceID[0].CurrentPlayMode[0].$.val];
          _this.currentTrackUri = result.Event.InstanceID[0].CurrentTrackURI[0].$.val;
          _this.state.currentState = result.Event.InstanceID[0].TransportState[0].$.val;
          _this.state.trackNo = result.Event.InstanceID[0].CurrentTrack[0].$.val*1;
          _this.state.currentTrack.duration = (result.Event.InstanceID[0].CurrentTrackDuration[0].$.val).parseTime();
          var currentMetaData = result.Event.InstanceID[0].CurrentTrackMetaData[0].$.val;
          if (currentMetaData) {
              xml2js.parseString(result.Event.InstanceID[0].CurrentTrackMetaData[0].$.val, function (err, result) {
                  _this.state.currentTrack.title = result['DIDL-Lite'].item[0]['dc:title'][0];
                  _this.state.currentTrack.artist = (result['DIDL-Lite'].item[0]['dc:creator']||[""])[0];
                  _this.state.currentTrack.album = (result['DIDL-Lite'].item[0]['upnp:album']||[""])[0];
                  _this.state.currentTrack.albumArtURI = (result['DIDL-Lite'].item[0]['upnp:albumArtURI']||[""])[0];
              });
          }
          _this.nextTrackUri = result.Event.InstanceID[0]['r:NextTrackURI'][0].$.val;
          var nextMetaData = result.Event.InstanceID[0]['r:NextTrackMetaData'][0].$.val;
          if (nextMetaData) {
              xml2js.parseString(result.Event.InstanceID[0]['r:NextTrackMetaData'][0].$.val, function (err, result) {
                  _this.state.nextTrack.title = result['DIDL-Lite'].item[0]['dc:title'][0];
                  _this.state.nextTrack.artist = (result['DIDL-Lite'].item[0]['dc:creator']||[""])[0];
                  _this.state.nextTrack.album = (result['DIDL-Lite'].item[0]['upnp:album']||[""])[0];
                  _this.state.nextTrack.duration = (result['DIDL-Lite'].item[0].res[0].$.duration||"0").parseTime();
              });
          }
          // We need to get positionInfo too

          clearTimeout(positionInfoTimeout);
          positionInfoTimeout = setTimeout(getPositionInfo, 200);

          break;
        case 'Volume':
          var volume = result.Event.InstanceID[0].Volume[0].$.val;
          if (!_this.ignoreVolumeEvents) {
            console.log("triggering state volume", _this.roomName, volume)
            _this.state.volume = volume*1;
          }
          _this.coordinator.calculateGroupVolume();
          discovery.emit('volume', {uuid: _this.uuid, state: _this.getState()});
          break;
        case 'Mute':
          var muteStates = [];
          result.Event.InstanceID[0].Mute.forEach(function (muteState) {
              var mute = {
                  channel: muteState.$.channel,
                  isMute: muteState.$.val == "1"
              };
              muteStates.push(mute);
          });

          discovery.emit('mute', {uuid: _this.uuid, state: muteStates});

          break;
      }
    });
  }

  function getPositionInfo() {


    var req = http.request({
      host: _this.address,
      port: 1400,
      path: '/MediaRenderer/AVTransport/Control',
      method: 'POST',
      headers: {
        'CONTENT-TYPE': 'text/xml; charset="utf-8"',
        'SOAPACTION': '"urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo"',
        'CONTENT-LENGTH': SOAP.PositionInfo.length
      }
    }, function (res) {

      var saxStream = sax.createStream(true);

      var nodeValue = 0;

      saxStream.on("error", function (e) {
        // unhandled errors will throw, since this is a proper node
        // event emitter.
        console.error("error!", e)
      });
      saxStream.on("opentag", function (node) {
      });

      saxStream.on('text', function (text) {
        nodeValue = text;
      });

      saxStream.on("closetag", function (nodeName) {
        if (nodeName == "RelTime") {
          _this.state.relTime = nodeValue.parseTime();
          _this.state.stateTime = Date.now();
        } else if (nodeName == "Track") {
          _this.state.trackNo = nodeValue*1;
        }



      });
      res.pipe(saxStream);
      var fsStream = fs.createWriteStream('positioninfo.log');
      res.pipe(fsStream);

      res.on("end", function () {
        discovery.emit('transport-state', _this.convertToSimple());
      });

    });
    req.on("error", function (e) {
      console.log(e);
    });
    req.write(SOAP.PositionInfo);
    req.end();
  }

  function subscribeToEvents() {
    if (_this.zoneType == 4) {
      // If this is a bridge, we don't care
      return;
    }

    console.log("subscribing to events", _this.address, _this.roomName, _this.uuid, subscriptionTimeout);

    var callback = '<http://'+ discovery.localEndpoint +':3500/>';

    // AVTransport
    // For track change and stuff like that

    var client = http.request({
      host: _this.address,
      port: 1400,
      path: '/MediaRenderer/AVTransport/Event',
      method: 'SUBSCRIBE',
      headers: {
        'CALLBACK': callback,
        'NT': 'upnp:event',
        'TIMEOUT': 'Second-' + subscriptionTimeout
      }
    }, function (res) {

      // Store some relevant headers?


    });

    client.on('error', function (e) {
      console.error(e);
      // Keep trying...
      setTimeout(subscribeToEvents, 2000);
    });

    client.end();

    // RenderingControl
    // For Volume and Mute events

    var client = http.request({
      host: _this.address,
      port: 1400,
      path: '/MediaRenderer/RenderingControl/Event',
      method: 'SUBSCRIBE',
      headers: {
        'CALLBACK': callback,
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

    // GroupRenderingControl
    // For GroupVolume and GroupMute events

     var client = http.request({
      host: _this.address,
      port: 1400,
      path: '/MediaRenderer/GroupRenderingControl/Event',
      method: 'SUBSCRIBE',
      headers: {
        'CALLBACK': callback,
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

    // Resubscribe after timeout * 0.9 seconds
    setTimeout(subscribeToEvents, subscriptionTimeout * 900);

  }
}

Player.prototype.convertToSimple = function () {
  return {
    uuid: this.uuid,
    state: this.getState(),
    playMode: this.currentPlayMode,
    crossfade: this.crossfadeMode,
    roomName: this.roomName,
    coordinator: this.coordinator.uuid,
    groupState: this.groupState
  };
};

Player.prototype.soapAction = function (path, action, soap, callback) {
  var _this = this;
  var req = http.request({
      host: this.address,
      port: 1400,
      path: path,
      method: 'POST',
      headers: {
        'CONTENT-TYPE': 'text/xml; charset="utf-8"',
        'SOAPACTION': action,
        'CONTENT-LENGTH': soap.length
      }},
      function (res) {
        var body = [];
        console.log(_this.roomName, action, 'STATUS: ' + res.statusCode);
        if (!callback) return;
        if (res.statusCode != 200) {
          callback(false);
          return;
        }
        callback(true, res);
      });

  // This doesn't seem to make any difference...
  // But leaving it there for now. Might need an external timer and abort instead.
  req.setTimeout(1000);

  req.on('error', function(e) {
    console.log("error occured on soap request", e.message);
    if (!callback) return;
    callback(false, this);
  });
  req.write(soap);
  req.end();
}

Player.prototype.play = function (callback) {
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#Play"', SOAP.Play, callback);
};

Player.prototype.pause = function (callback) {
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#Pause"', SOAP.Pause, callback);
};

Player.prototype.setVolume = function (volumeLevel, callback) {
  // store ref for timeout function
  var _this = this;
  // If prefixed with + or -
  console.log('current volume', this.state.volume);
  if (/^[+\-]/.test(volumeLevel)) {
    volumeLevel = this.state.volume + volumeLevel*1;
  }

  console.log('setting volume', volumeLevel);

  volumeLevel = volumeLevel*1;

  if (volumeLevel < 0) volumeLevel = 0;

  this.state.volume = volumeLevel;

  // ignore volume events for a certain time
  this.ignoreVolumeEvents = true;
  clearTimeout(this.ignoreVolumeEventsTimeout);
  this.ignoreVolumeEventsTimeout = setTimeout(function () { _this.ignoreVolumeEvents = false; }, 500);

  var volumeSoap = SOAP.Volume.format({volume: volumeLevel});
  var reqPath = '/MediaRenderer/RenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:RenderingControl:1#SetVolume"';
  this.soapAction(reqPath, soapAction, volumeSoap, callback);
}

Player.prototype.groupSetVolume = function (volumeLevel, callback) {
  var actions = [];
  var count = 0;
  var groupVolume = this.groupState.volume;
  var deltaVolume = volumeLevel - groupVolume;

  for (var uuid in this.discovery.players) {
    var player = this.discovery.players[uuid];
    if (player.coordinator.uuid != this.uuid) continue;
    // part of this group
    console.log("player", player.roomName, "volume", player.state.volume);

    actions.push(function (player) {
      return function (callback) {

        // if we increase volume, we just apply it
        if (deltaVolume > 0) {
          player.setVolume(player.state.volume + deltaVolume, function (success) {
            callback(success ? null : "error", memberVolume);
          });
          return;
        }

        // This is a decrease, to the choka choka
        var memberVolume;
        if (volumeLevel < 1) {
          memberVolume = 0;
        } else {
          var factor = player.state.volume / groupVolume;
          var memberVolume = Math.ceil(factor * volumeLevel);
        }
        player.setVolume(memberVolume, function (success) {
          callback(success ? null : "error", memberVolume);
        });
      }
    }(player));

  }

  // If prefixed with + or -
  if (/^[+\-]/.test(volumeLevel)) {
    volumeLevel = groupVolume + volumeLevel*1;
  }

  volumeLevel = volumeLevel*1;

  if (volumeLevel < 0) volumeLevel = 0;

  async.parallel(actions, function(status) {
    console.log("done", status);
  })
}

Player.prototype.calculateGroupVolume = function() {
  console.log("calculating group volume", this.roomName)
  var total = 0;
  var count = 0;
  for (var uuid in this.discovery.players) {
    var player = this.discovery.players[uuid];
    if (player.coordinator.uuid != this.uuid) continue;
    total += player.state.volume;
    count++;
  }

  this.groupState.volume = Math.round(total / count);
  this.discovery.emit('group-volume', { uuid: this.uuid, state: this.groupState });
}

Player.prototype.mute = function (isMute, callback) {
  console.log('player set mute', isMute);
  var muteSoap = SOAP.Mute.format({mute: isMute});
  var reqPath = '/MediaRenderer/RenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:RenderingControl:1#SetMute"';

   this.soapAction(reqPath, soapAction, muteSoap, callback);
};

Player.prototype.groupMute = function (isMute, callback) {
  console.log('player', this.roomName, 'set groupMute', isMute);

  var muteSoap = SOAP.GroupMute.format({mute: isMute});
  var reqPath = '/MediaRenderer/GroupRenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:GroupRenderingControl:1#SetGroupMute"';
  this.soapAction(reqPath, soapAction, muteSoap, callback);
};

Player.prototype.seek = function (trackIndex, callback) {
  var seekSoap = SOAP.Seek.format({trackIndex: trackIndex});

  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#Seek"', seekSoap, callback);

};

Player.prototype.nextTrack = function (callback) {
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#Next"', SOAP.Next, callback);
};

Player.prototype.previousTrack = function (callback) {
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#Previous"', SOAP.Previous, callback);
};

Player.prototype.setAVTransportURI = function (uri, metaData, callback) {
  var xmlEntities = new XmlEntities();
  uri = uri != null ? xmlEntities.encode(uri) : "";
  metaData = metaData != null ? xmlEntities.encode(metaData) : "";
  var body = SOAP.SetAVTransportURI.format({ URI: uri, MetaData: metaData});
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"', body, callback);
}

Player.prototype.becomeCoordinatorOfStandaloneGroup = function (callback) {
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#BecomeCoordinatorOfStandaloneGroup"', SOAP.BecomeCoordinatorOfStandaloneGroup, callback);
}

Player.prototype.removeAllTracksFromQueue = function (callback) {
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#RemoveAllTracksFromQueue"', SOAP.RemoveAllTracksFromQueue, callback);
}

Player.prototype.addURIToQueue = function (uri, metaData, callback) {
  var xmlEntities = new XmlEntities();
  uri = uri != null ? xmlEntities.encode(uri) : "";
  metaData = metaData != null ? xmlEntities.encode(metaData) : "";
  var body = SOAP.AddURIToQueue.format({ URI: uri, MetaData: metaData});
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#AddURIToQueue"', body, callback);
}



Player.prototype.getFavorites = function (callback) {
  this.soapAction('/MediaServer/ContentDirectory/Control', '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"', SOAP.GetFavorites, function (success, res) {
    if (!success) {
      callback(false);
      return;
    }
    var saxStream = sax.createStream(true);
    saxStream.on("error", function (e) {
      // unhandled errors will throw, since this is a proper node
      // event emitter.
      console.error("error!", e)
    });
    saxStream.on('text', function (text) {
      if (this._parser.tag.name != "Result") return;

      var responseXML = text;

      var favoritesList = [];
      xml2js.parseString(responseXML, function (err, result) {
        result["DIDL-Lite"].item.forEach(function (i) {
          favoritesList.push({
            title: i["dc:title"][0],
            type: i["r:type"][0],
            uri: i.res[0]["_"],
            description: i["r:description"][0],
            metaData: i["r:resMD"][0],
            albumArtURI: i["upnp:albumArtURI"][0]
          });
        });
        callback(true, favoritesList);
      });

    });
    res.pipe(saxStream);
  });
}

Player.prototype.getQueue = function (startIndex, requestedCount, callback) {
  var soap = SOAP.GetQueue.format({startIndex: startIndex||"", requestedCount: requestedCount||""});
  this.soapAction('/MediaServer/ContentDirectory/Control', '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"', soap, function (success, res) {
    if (!success) {
      callback(false);
      return;
    }

    var response = {
      startIndex: startIndex
    };

    var saxStream = sax.createStream(true);
    saxStream.on("error", function (e) {
      // unhandled errors will throw, since this is a proper node
      // event emitter.
      console.error("error!", e)
    });
    saxStream.on('text', function (text) {
      if (this._parser.tag.name == "NumberReturned") {
        response.numberReturned = text*1;
        return;
      }

      if (this._parser.tag.name == "TotalMatches") {
        response.totalMatches = text*1;
        return;
      }

      if (this._parser.tag == null || this._parser.tag.name != "Result") return;

      var responseXML = text;
      var queue = [];
      xml2js.parseString(responseXML, function (err, result) {
        if (!result["DIDL-Lite"].item) return false;
        result["DIDL-Lite"].item.forEach(function (i) {
          queue.push({
            title: i["dc:title"][0],
            uri: i.res[0],
            album: i["upnp:album"][0],
            artist: i["dc:creator"][0],
            albumArtURI: i["upnp:albumArtURI"][0]
          });
        });
        response.items = queue;
      });
    });

    saxStream.on('end', function () {
      callback(true, response);
    });

    res.pipe(saxStream);
  });
}

Player.prototype.replaceWithFavorite = function (favorite, callback) {
  var player = this;
  if (!callback)
    callback = function () {};

  player.getFavorites(function (success, favorites) {
    favorites.forEach(function (item) {
      if (item.title.toLowerCase() == decodeURIComponent(favorite).toLowerCase()) {
        console.log("found it", item)

        if (item.uri.startsWith("x-sonosapi-stream")) {
          // This is a radio station, use setAVTransportURI instead.
          player.setAVTransportURI(item.uri, item.metaData, function (success) {
            callback(success);
          });
          return;
        }

        player.removeAllTracksFromQueue(function (success) {
          if (!success) {
            console.log("error when removing tracks");
            callback(false);
            return;
          }

          player.addURIToQueue(item.uri, item.metaData, function (success) {
            if (!success) {
              console.log("problem adding URI to queue");
              callback(false);
              return;
            }
            var queueURI = "x-rincon-queue:" + player.uuid + "#0";
            player.setAVTransportURI(queueURI, "", function (success) {
              callback(success);
            });
          });
        });
      }
    });
  });
}

Player.prototype.repeat = function (enabled) {
  if (enabled) {
    this.playMode |= 1;
  } else {
    this.playMode &= ~1;
  }

  this.setPlayMode(this.playModeStrings[this.playMode]);
}

Player.prototype.shuffle = function (enabled) {
  if (enabled) {
    this.playMode |= 2;
  } else {
    this.playMode &= ~2;
  }

  this.setPlayMode(this.playModeStrings[this.playMode]);
}

Player.prototype.setPlayMode = function (playMode, callback) {
  var soap = SOAP.SetPlayMode.format({playMode: playMode});
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#SetPlayMode"', soap, callback);
}

Player.prototype.getState = function  () {
  // Calculate the snapshot time considering state time (when we last checked)
  // Only do this if we are playing
  var diff = 0;
  if (this.coordinator.state.currentState == "PLAYING")
    diff = new Date().valueOf() - this.coordinator.state.stateTime;

  var elapsedTime = this.coordinator.state.relTime + Math.floor(diff/1000);

  return {
    currentTrack: this.coordinator.state.currentTrack,
    nextTrack: this.coordinator.state.nextTrack,
    volume: this.state.volume,
    trackNo: this.coordinator.state.trackNo,
    elapsedTime: elapsedTime,
    elapsedTimeFormatted: elapsedTime.formatTime(),
    zoneState: this.coordinator.state.currentState,
    playerState: this.state.currentState
  };

  // {
  //   currentTrack: {
  //     artist: "",
  //     title: "",
  //     album: "",
  //     duration: 0
  //   },
  //   nextTrack: {
  //     artist: "",
  //     title: "",
  //     album: ""
  //   },
  //   relTime: 0,
  //   stateTime: new Date(0),
  //   volume: 0,
  //   trackNo: 0
  // }
}

var SOAP = {
  PositionInfo: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:GetPositionInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:GetPositionInfo></s:Body></s:Envelope>',
  Play: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Speed>1</Speed></u:Play></s:Body></s:Envelope>',
  Pause: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Pause xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Pause></s:Body></s:Envelope>',
  Volume: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>{volume}</DesiredVolume></u:SetVolume></s:Body></s:Envelope>',
  GroupVolume: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetGroupVolume xmlns:u="urn:schemas-upnp-org:service:GroupRenderingControl:1"><InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>{volume}</DesiredVolume></u:SetGroupVolume></s:Body></s:Envelope>',
  Mute: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetMute xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><Channel>Master</Channel><DesiredMute>{mute}</DesiredMute></u:SetMute></s:Body></s:Envelope>',
  GroupMute: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetGroupMute xmlns:u="urn:schemas-upnp-org:service:GroupRenderingControl:1"><InstanceID>0</InstanceID><Channel>Master</Channel><DesiredMute>{mute}</DesiredMute></u:SetGroupMute></s:Body></s:Envelope>',
  Seek: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Seek xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Unit>TRACK_NR</Unit><Target>{trackIndex}</Target></u:Seek></s:Body></s:Envelope>',
  Next: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Next xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Next></s:Body></s:Envelope>',
  Previous: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Previous xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Previous></s:Body></s:Envelope>',
  BecomeCoordinatorOfStandaloneGroup: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:BecomeCoordinatorOfStandaloneGroup xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:BecomeCoordinatorOfStandaloneGroup></s:Body></s:Envelope>',
  SetAVTransportURI: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CurrentURI>{URI}</CurrentURI><CurrentURIMetaData>{MetaData}</CurrentURIMetaData></u:SetAVTransportURI></s:Body></s:Envelope>',
  RemoveAllTracksFromQueue: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:RemoveAllTracksFromQueue xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:RemoveAllTracksFromQueue></s:Body></s:Envelope>',
  AddURIToQueue: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:AddURIToQueue xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><EnqueuedURI>{URI}</EnqueuedURI><EnqueuedURIMetaData>{MetaData}</EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>0</EnqueueAsNext></u:AddURIToQueue></s:Body></s:Envelope>',
  GetFavorites: '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>FV:2</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter /><StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount><SortCriteria /></u:Browse></s:Body></s:Envelope>',
  SetPlayMode: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetPlayMode xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><NewPlayMode>{playMode}</NewPlayMode></u:SetPlayMode></s:Body></s:Envelope>',
  GetQueue: '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter /><StartingIndex>{startIndex}</StartingIndex><RequestedCount>{requestedCount}</RequestedCount><SortCriteria /></u:Browse></s:Body></s:Envelope>',
};

module.exports = Player;