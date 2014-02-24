/*jslint indent: 2, maxlen: 80, continue: true, node: true, regexp: true*/
"use strict";

var http = require('http'),
  fs = require('fs'),
  util = require('util'),
  EasySax = require('easysax'),
  async = require("async"),
  XmlEntities = require("html-entities").XmlEntities;

function parseMetaDataXML(xml) {
  var result = [];
  var saxParser = new EasySax();
  var nodeValue;
  var currentItem = {};

  var mapping = {
    "dc:title": "title",
    "dc:creator": "artist",
    "upnp:album": "album",
    "upnp:albumArtURI": "albumArtURI",
    "res": "uri",
    "r:resMD": "metaData"
  };

  saxParser.on('textNode', function (str, uq) {
    nodeValue = uq(str);
  });

  saxParser.on('endNode', function (elem) {
    if (elem == "item") {
      result.push(currentItem);
      currentItem = {};
    }
    if (!mapping[elem]) return;

    currentItem[mapping[elem]] = nodeValue||"";

  });
  saxParser.parse(xml);
  return result;
}

function Player(roomName, descriptorUrl, uuid, discovery) {
  var _this = this;
  var positionInfoTimeout;
  var sids = {};
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
      duration: 0,
      uri: ""
    },
    nextTrack: {
      artist: "",
      title: "",
      album: "",
      albumArtURI: "",
      duration: 0,
      uri: ""
    },
    relTime: 0,
    stateTime: 0,
    volume: 0,
    mute: false,
    trackNo: 0,
    currentState: "STOPPED"
  };
  this.avTransportUri = "";
  this.coordinator = null;
  this.currentPlayMode = {shuffle: false, repeat: false, crossfade: false};
  this.ignoreVolumeEvents = false;
  this.outputFixed = false;

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
    if (!notification.sid || !notification.sid.startsWith('uuid:' + _this.uuid)) return;

    if (notification.type == 'GroupMute') {
      _this.groupState.mute = notification.body == "1" ? true : false;
      discovery.emit('group-mute', {uuid: _this.uuid, state: _this.groupState});
      return;
    }

    // Check if this is something we are interested in
    if (notification.type != 'LastChange') return;

    // LastChange, that is interesting!

    var saxParser = new EasySax();

    saxParser.on('error', function (e) {
      console.error(e);
    });

    var event = {
      type: null,
      data: {}
    };

    saxParser.on('startNode', function (elem, attr, uq) {
      if (elem == "InstanceID") return;
      if (elem == "Event") return;

      // first element is type.
      if (!event.type) {
        event.type = elem;
      }

      var attributes = attr();
      if (elem == "Volume" || elem == "Mute" || elem == "Loudness") {
        if (attributes.channel == "Master")
          event.data[elem] = uq(attributes.val);
      } else {
        event.data[elem] = uq(attributes.val);
      }

    });
    saxParser.parse(notification.body);

    switch (event.type) {
      case "TransportState":
        updateTransportState(event.data);
        break;
      case "Volume":
        updateVolume(event.data);
        break;
      case "Mute":
        updateMute(event.data);

    }

  }

  function updateTransportState(data) {
    _this.currentPlayMode.crossfade = data.CurrentCrossfadeMode;
    _this.currentPlayMode.repeat = !!(playModesToFlags[data.CurrentPlayMode] & 1);
    _this.currentPlayMode.shuffle = !!(playModesToFlags[data.CurrentPlayMode] & 2);
    _this.state.currentState = data.TransportState;
    _this.state.trackNo = data.CurrentTrack*1;
    _this.state.currentTrack.duration = data.CurrentTrackDuration.parseTime();
    _this.state.currentTrack.uri = data.CurrentTrackURI;

    if (data.AVTransportURI)
      _this.avTransportUri = data.AVTransportURI;

    if (data.CurrentTrackMetaData) {
      var saxParser = new EasySax();
      saxParser.on('error', function (e) {
        console.error(e);
      });

      var nodeValue = "";

      saxParser.on('textNode', function (str, uq) {
        nodeValue = uq(str);
      });

      var mapping = {
        "dc:title": "title",
        "dc:creator": "artist",
        "upnp:album": "album",
        "upnp:albumArtURI": "albumArtURI"
      };

      saxParser.on('endNode', function (elem) {
        if (mapping[elem]) {
          _this.state.currentTrack[mapping[elem]] = nodeValue;
        }

      });

      saxParser.parse(data.CurrentTrackMetaData);
    }

    if (data['r:NextTrackMetaData']) {
      var saxParser = new EasySax();
      saxParser.on('error', function (e) {
        console.error(e);
      });

      var nodeValue = "";

      saxParser.on('startNode', function (elem, attr, uq) {
        if (elem != "res") return;

        var duration = attr().duration;
        _this.state.nextTrack.duration = duration ? duration.parseTime() : "0";

      });

      saxParser.on('textNode', function (str, uq) {
        nodeValue = uq(str);
      });

      var mapping = {
        "dc:title": "title",
        "dc:creator": "artist",
        "upnp:album": "album",
        "upnp:albumArtURI": "albumArtURI"

      };

      saxParser.on('endNode', function (elem) {
        if (mapping[elem]) {
          _this.state.nextTrack[mapping[elem]] = nodeValue;
        }

      });

      saxParser.parse(data['r:NextTrackMetaData']);
      _this.state.nextTrack.uri = data['r:NextTrackURI'];
    }

    getPositionInfo();
  }

  function updateVolume(data) {

    // We fix mute first, this should be done anyway.
    _this.state.mute = data.Mute == "1";
    _this.outputFixed = data.OutputFixed == "1";

    // if fixed output, we don't care
    if (!_this.outputFixed) {
      var volume = data.Volume;
      if (!_this.ignoreVolumeEvents) {
        _this.state.volume = volume*1;
      }
      _this.coordinator.calculateGroupVolume();
    }

    discovery.emit('volume', {uuid: _this.uuid, state: _this.getState()});
  }

  function updateMute(data) {
    _this.state.mute = data.Mute == "1";
    discovery.emit('mute', {uuid: _this.uuid, state: _this.getState()});
  }

  function getPositionInfo() {
    var req = http.request({
      localAddress: discovery.localEndpoint,
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

      var buffer = [];
      res.setEncoding("utf-8");

      res.on('error', function (e) {
        console.error(e);
      });

      res.on('data', function (chunk) {
        buffer.push(chunk);
      });

      res.on('end', function () {
        var saxParser = new EasySax();
        var nodeValue;
        saxParser.on('textNode', function (str, uq) {
          nodeValue = uq(str);
        });

        saxParser.on('endNode', function (elem) {
          if (elem == "RelTime") {
            _this.state.relTime = nodeValue.parseTime();
            _this.state.stateTime = Date.now();
          } else if (elem == "Track") {
            _this.state.trackNo = nodeValue*1;
          }
        });
        saxParser.parse(buffer.join(""));
        discovery.emit('transport-state', _this.convertToSimple());
      });
    });
    req.on("error", function (e) {
      console.error(e);
    });
    req.write(SOAP.PositionInfo);
    req.end();
  }

  function subscribe(path) {

    var headers = {
      'TIMEOUT': 'Second-' + subscriptionTimeout
    };

    if (sids[path]) {
      headers['SID'] = sids[path];
    } else {
      headers['CALLBACK'] = '<http://'+ discovery.localEndpoint +':' + discovery.notificationPort + '/>';
      headers['NT'] = 'upnp:event';
    }
    var client = http.request({
      localAddress: discovery.localEndpoint,
      host: _this.address,
      port: 1400,
      path: path,
      method: 'SUBSCRIBE',
      headers: headers
    }, function (res) {

      if (res.statusCode == 200) {
        sids[path] = res.headers.sid;
      } else {
        // Some error occured, try to resubscribe
        console.error("subscribe failed", sids[path], path, res.statusCode);
        delete sids[path];
        setTimeout(function () { subscribe(path); }, 5000);
      }


    });

    client.on('error', function (e) {
      console.error(e, sids[path], path);
      // Keep trying...
      delete sids[path];
      setTimeout(function () { subscribe(path); }, 10000);
    });

    client.end();
  }

  function subscribeToEvents() {
    if (_this.zoneType == 4) {
      // If this is a bridge, we don't care
      return;
    }

    // AVTransport
    // For track change and stuff like that
    subscribe('/MediaRenderer/AVTransport/Event');


    // RenderingControl
    // For Volume and Mute events
    subscribe('/MediaRenderer/RenderingControl/Event');

    // GroupRenderingControl
    // For GroupVolume and GroupMute events
    subscribe('/MediaRenderer/GroupRenderingControl/Event');

    // ContentDirectory
    // For queue and favorite events
    subscribe('/MediaServer/ContentDirectory/Event');

    // Resubscribe after timeout * 0.9 seconds
    setTimeout(subscribeToEvents, subscriptionTimeout * 500);

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
      localAddress: _this.discovery.localEndpoint,
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
    console.error("error occured on soap request", e.message);
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
  if (/^[+\-]/.test(volumeLevel)) {
    volumeLevel = this.state.volume + volumeLevel*1;
  }

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

  });
}

Player.prototype.calculateGroupVolume = function() {
  var total = 0;
  var count = 0;
  var playerVolumes = {};
  for (var uuid in this.discovery.players) {
    var player = this.discovery.players[uuid];
    if (player.coordinator.uuid != this.uuid) continue;
    if (player.outputFixed) continue;
    total += player.state.volume;
    count++;
    playerVolumes[player.uuid] = player.state.volume;
  }

  this.groupState.volume = Math.round(total / count);
  var response = {
    uuid: this.uuid,
    groupState: this.groupState,
    playerVolumes: playerVolumes
   };
  this.discovery.aggregateGroupVolume(response);
}

Player.prototype.mute = function (isMute, callback) {
  var muteSoap = SOAP.Mute.format({mute: isMute});
  var reqPath = '/MediaRenderer/RenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:RenderingControl:1#SetMute"';

   this.soapAction(reqPath, soapAction, muteSoap, callback);
};

Player.prototype.groupMute = function (isMute, callback) {
  var muteSoap = SOAP.GroupMute.format({mute: isMute});
  var reqPath = '/MediaRenderer/GroupRenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:GroupRenderingControl:1#SetGroupMute"';
  this.soapAction(reqPath, soapAction, muteSoap, callback);
};

Player.prototype.seek = function (trackIndex, callback) {
  var seekSoap = SOAP.Seek.format({unit: "TRACK_NR", value: trackIndex});
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#Seek"', seekSoap, callback);
};

Player.prototype.trackSeek = function (elapsedSeconds, callback) {
  var formattedTime = elapsedSeconds.formatTime(true);
  var seekSoap = SOAP.Seek.format({unit: "REL_TIME", value: formattedTime});
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

Player.prototype.browse = function (objectID, startIndex, requestedCount, callback) {
  var soap = SOAP.Browse.format({objectID: objectID||"", startIndex: startIndex||"", requestedCount: requestedCount||""});
  this.soapAction('/MediaServer/ContentDirectory/Control', '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"', soap, function (success, res) {

    if (!success) {
      callback(false);
      return;
    }

    var response = {
      startIndex: startIndex,
      numberReturned: 0,
      totalMatches: 0,
      items: []
    };

    var buffer = [];
    var metaDataXML;
    res.setEncoding("utf-8");

    res.on('error', function (e) {
      callback(false);
    })

    res.on('data', function (chunk) {
      buffer.push(chunk);
    });

    res.on('end', function () {
      var saxParser = new EasySax();
      var nodeValue;
      saxParser.on('textNode', function (str, uq) {
        nodeValue = uq(str);
      });

      saxParser.on('endNode', function (elem) {
        if (elem == "Result") {
          metaDataXML = nodeValue;
        } else if (elem == "NumberReturned") {
          response.numberReturned = nodeValue*1;
        } else if (elem == "TotalMatches") {
          response.totalMatches = nodeValue*1;
        }
      });
      saxParser.parse(buffer.join(""));

      // Okay, parse XML again, sigh...
      response.items = parseMetaDataXML(metaDataXML);
      callback(true, response);
    });
  });
}

Player.prototype.getFavorites = function (callback) {
  this.browse("FV:2", null, null, function (success, result) {
    if (!success) {
      callback(false);
      return;
    }
    callback(true, result.items);
  });
}

Player.prototype.getQueue = function (startIndex, requestedCount, callback) {
  this.browse("Q:0", startIndex, requestedCount, callback);
}

Player.prototype.replaceWithFavorite = function (favorite, callback) {
  var player = this;
  if (!callback)
    callback = function () {};

  player.getFavorites(function (success, favorites) {
    favorites.forEach(function (item) {
      if (item.title.toLowerCase() == decodeURIComponent(favorite).toLowerCase()) {
        console.log("found it", item)

        if (item.uri.startsWith("x-sonosapi-stream:") || item.uri.startsWith("x-sonosapi-radio:") || item.uri.startsWith("pndrradio:")) {
          // This is a radio station, use setAVTransportURI instead.
          player.setAVTransportURI(item.uri, item.metaData, function (success) {
            callback(success);
          });
          return;
        }

        player.removeAllTracksFromQueue(function (success) {
          if (!success) {
            console.error("error when removing tracks");
            callback(false);
            return;
          }

          player.addURIToQueue(item.uri, item.metaData, function (success) {
            if (!success) {
              console.error("problem adding URI to queue");
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

Player.prototype.crossfade = function (enabled, callback) {
  this.crossfadeMode = enabled;

  var soap = SOAP.SetCrossfadeMode.format({crossfadeMode: enabled ? "1" : "0"});
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#SetCrossfadeMode"', soap, callback);
}

Player.prototype.setPlayMode = function (playMode, callback) {
  var soap = SOAP.SetPlayMode.format({playMode: playMode});
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#SetPlayMode"', soap, callback);
}

Player.prototype.toggleLED = function (enabled, callback) {
  var soap = SOAP.SetLEDState.format({state: enabled ? "On" : "Off"});
  this.soapAction('/DeviceProperties/Control', '"urn:schemas-upnp-org:service:DeviceProperties:1#SetLEDState"', soap, callback);
}

Player.prototype.getState = function () {
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
    mute: this.state.mute,
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
  Seek: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Seek xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Unit>{unit}</Unit><Target>{value}</Target></u:Seek></s:Body></s:Envelope>',
  Next: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Next xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Next></s:Body></s:Envelope>',
  Previous: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Previous xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Previous></s:Body></s:Envelope>',
  BecomeCoordinatorOfStandaloneGroup: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:BecomeCoordinatorOfStandaloneGroup xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:BecomeCoordinatorOfStandaloneGroup></s:Body></s:Envelope>',
  SetAVTransportURI: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CurrentURI>{URI}</CurrentURI><CurrentURIMetaData>{MetaData}</CurrentURIMetaData></u:SetAVTransportURI></s:Body></s:Envelope>',
  RemoveAllTracksFromQueue: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:RemoveAllTracksFromQueue xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:RemoveAllTracksFromQueue></s:Body></s:Envelope>',
  AddURIToQueue: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:AddURIToQueue xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><EnqueuedURI>{URI}</EnqueuedURI><EnqueuedURIMetaData>{MetaData}</EnqueuedURIMetaData><DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued><EnqueueAsNext>0</EnqueueAsNext></u:AddURIToQueue></s:Body></s:Envelope>',
  //GetFavorites: '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>FV:2</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter /><StartingIndex>0</StartingIndex><RequestedCount>0</RequestedCount><SortCriteria /></u:Browse></s:Body></s:Envelope>',
  SetPlayMode: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetPlayMode xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><NewPlayMode>{playMode}</NewPlayMode></u:SetPlayMode></s:Body></s:Envelope>',
  SetLEDState: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetLEDState xmlns:u="urn:schemas-upnp-org:service:DeviceProperties:1"><DesiredLEDState>{state}</DesiredLEDState></u:SetLEDState></s:Body></s:Envelope>',
  SetCrossfadeMode: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetCrossfadeMode xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CrossfadeMode>{crossfadeMode}</CrossfadeMode></u:SetCrossfadeMode></s:Body></s:Envelope>',
  //GetQueue: '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>Q:0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter /><StartingIndex>{startIndex}</StartingIndex><RequestedCount>{requestedCount}</RequestedCount><SortCriteria /></u:Browse></s:Body></s:Envelope>',
  Browse: '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/" xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>{objectID}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter /><StartingIndex>{startIndex}</StartingIndex><RequestedCount>{requestedCount}</RequestedCount><SortCriteria /></u:Browse></s:Body></s:Envelope>',
};

module.exports = Player;
