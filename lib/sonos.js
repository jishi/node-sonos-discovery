var dgram = require('dgram'),
  os = require('os'),
  fs = require('fs'),
  http = require('http'),
  util = require('util'),
  EventEmitter = require('events').EventEmitter,
  sax = require("sax"),
  xml2js = require("xml2js"),
  async = require("async");

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

String.prototype.format = function (replaceTable) {
  console.log("replacing with", replaceTable)
  return this.replace(/{([a-z]+)}/gi, function (match) { 
    return (replaceTable.hasOwnProperty(RegExp.$1)) ? replaceTable[RegExp.$1] : match;
  });    
}

function Discovery() {

  var _this = this;
  var timeout;
  var subscribedTo;
  var subscriptionTimeout = 300;

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

  socket.bind(1905);
  socket.on('error', function (e) {
    console.error(e);
  });
  //socket.setBroadcast(true);

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

      console.log("type", notifyState.type);
      // Zone group topology, we handle
      if (notifyState.type == "ZoneGroupState") {
        // This is a topologychange
        updateZoneState( notifyState.body );

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
        zone = {
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

      console.log(_this.localEndpoint)

      // We don't need anything more, subscribe
      subscribeToZoneTopology();
    });


  }

  function subscribeToZoneTopology(callback) {
    console.log('requesting')
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
      console.log("subscribed to topology", subscribedTo, res.statusCode);
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
      '&amp;': '&',
      '&gt;': '>'
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
  // trigger directly.
  timeout = setTimeout(scanDevices, 500);

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
};

Discovery.prototype.getPlayerByUUID = function (uuid) {
  for (var i in this.players) {
    var player = this.players[i];
    if (player.uuid == uuid) {
      return player;
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

Discovery.prototype.applyPreset = function (preset) {
  console.log("applying preset", preset);
  // cache this reference for closure access
  var _this = this;
  var playerInfo = preset.players[0];
  var coordinator = this.getPlayer(playerInfo.roomName);
  coordinator.setVolume(playerInfo.volume);
  var callbacks = [];

  var afterCoordinatorBreakout = function () {
    // This callback will be invoked if the request is successful.
    for (var i = 1; i < preset.players.length; i++) {
      var playerInfo = preset.players[i];
      var player = _this.getPlayer(playerInfo.roomName);
      var streamUrl = "x-rincon:" + coordinator.uuid;      

      callbacks.push(function (player, streamUrl, volume) {
        return function (callback) {
          console.log("adding player to coordinator", coordinator.roomName, "with streamurl", streamUrl);
          player.setVolume(volume, false, function (success) {
            console.log("volume success?", success);
            player.setAVTransportURI(streamUrl, null, function (success) {
              console.log("AVTURI success?", success);
              callback(success ? null : "error", success);
            });
          });
        }
      }(player, streamUrl, playerInfo.volume));
    }
     // We need to start playing this

    async.series(callbacks, function (err, result) {
      console.log(err, result);
      if (preset.state != "stopped")
        coordinator.play();
      });
  };

  // If coordinator already is coordinator, skip becomeCoordinatorOfStandaloneGroup
  if (coordinator.coordinator.uuid == coordinator.uuid) {
    console.log("skipping creakout because already coordinator");
    afterCoordinatorBreakout();
  } else {
    console.log("ungrouping", coordinator.roomName, "to prepare for grouping");
    coordinator.becomeCoordinatorOfStandaloneGroup(afterCoordinatorBreakout);
  }

  
   
    
  

};

function Player(roomName, descriptorUrl, uuid, discovery) {
  var _this = this;
  this.address = descriptorUrl.replace(/http:\/\/([\d\.]+).*/, "$1");
  this.roomName = roomName;
  this.zoneType = 0;
  this.uuid = uuid;
  this.state = {
    currentTrack: {
      artist: "",
      title: "",
      album: "",
      duration: 0
    },
    relTime: 0,
    stateTime: new Date(0),
    volume: 0

  };
  this.coordinator = null;

  var subscriptionTimeout = 600;

  discovery.on('notify', handleNotification);

  // subscribe to events
  subscribeToEvents();

  this.getStatus = function () {

  }

  // http.get(descriptorUrl, function (res) {

  //   // We want to know our endpoint IP to expose the correct event url
  //   // In case of multiple interfaces!
  //   _this.localEndpoint = res.socket.address().address;

  //   // Res is actually a stream, pipe it directly to the SAX-parser
  //   var saxStream = sax.createStream(true);

  //   var nodeValue;

  //   saxStream.on("error", function (e) {
  //     // unhandled errors will throw, since this is a proper node
  //     // event emitter.
  //     console.error("error!", e)
  //   });
  //   saxStream.on("closetag", function (node) {
  //     // use the functionality that you want
  //     switch (node) {
  //       case "roomName":
  //         _this.roomName = nodeValue;
  //       case "zoneType":
  //         _this.zoneType = nodeValue;
  //       case "UDN":
  //         if (!_this.uuid)
  //           _this.uuid = nodeValue;
  //     }
  //   });

  //   saxStream.on('text', function (text) {
  //     nodeValue = text;
  //   })
  //   res.pipe(saxStream);

  //   res.on('end', subscribeToEvents);
  // });

  function handleNotification(notification) {

    // If this wasn't aimed at me, disregard.
    if (!notification.sid.startsWith('uuid:' + _this.uuid)) return;

    // Check if this is something we are interested in
    if (notification.type != 'LastChange') return;

    fs.appendFile('notification.log', notification.body + '\n');

    // LastChange, that is interesting!
    xml2js.parseString(notification.body, function (err, result) {
      console.log(Object.keys(result.Event.InstanceID[0])[1]);

      var eventType = Object.keys(result.Event.InstanceID[0])[1];

            switch(eventType){
                case 'TransportState':
                    _this.state.currentState = result.Event.InstanceID[0].TransportState[0].$.val;
                    _this.state.currentTrack.duration = (result.Event.InstanceID[0].CurrentTrackDuration[0].$.val).parseTime();
                    var currentMetaData = result.Event.InstanceID[0].CurrentTrackMetaData[0].$.val;
                    if (currentMetaData) {
                        xml2js.parseString(result.Event.InstanceID[0].CurrentTrackMetaData[0].$.val, function (err, result) {
                            _this.state.currentTrack.title = result['DIDL-Lite'].item[0]['dc:title'][0];
                            _this.state.currentTrack.artist = (result['DIDL-Lite'].item[0]['dc:creator']||[""])[0];
                            _this.state.currentTrack.album = (result['DIDL-Lite'].item[0]['upnp:album']||[""])[0];
                        });
                    }
                    discovery.emit('transport-state', {uuid: _this.uuid, state: _this.state});
                break;
                case 'Volume':
                    var volume = result.Event.InstanceID[0].Volume[0].$.val;
                    _this.state.volume = volume*1;
                    discovery.emit('volume', {uuid: _this.uuid, state: _this.state});
                    break;
                case 'Mute':
                    var muteStates = [];
                    result.Event.InstanceID[0].Mute.forEach(function (muteState) {
                        mute = {
                            channel: muteState.$.channel,
                            isMute: muteState.$.val == "1"
                        };
                        muteStates.push(mute);
                    });
                    discovery.emit('mute', {uuid: _this.uuid, state: muteStates});
                    break;
      }
    });

    // We need to get positionInfo too
    getPositionInfo();

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
          _this.state.stateTime = Date.now()
        }
      });
      res.pipe(saxStream);
      var fsStream = fs.createWriteStream('positioninfo.log');
      res.pipe(fsStream);

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
    console.log(callback);

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
    });

    client.end();

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

    // Resubscribe after timeout * 0.9 seconds
    setTimeout(subscribeToEvents, subscriptionTimeout * 900);

  }
}

Player.prototype.convertToSimple = function () {
  return {
    uuid: this.uuid,
    state: this.state,
    roomName: this.roomName
  };
};

Player.prototype.soapAction = function (path, action, soap, callback) {
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
        console.log('STATUS: ' + res.statusCode);
        if (!callback) return;
        if (res.statusCode == 200) callback(true, this);
        else callback(false, this);
      }); 

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

Player.prototype.setVolume = function (volumeLevel, forGroup, callback) {

  // If prefixed with + or -
  console.log('current volume', this.state.volume);
  if (/^[+\-]/.test(volumeLevel)) {
    volumeLevel = this.state.volume + volumeLevel*1;
  }

  console.log('setting volume', volumeLevel);

  volumeLevel = volumeLevel*1;

  if (volumeLevel < 0) volumeLevel = 0;

  this.state.volume = volumeLevel;

  var volumeSoap = SOAP.Volume.format({volume: volumeLevel});
  var reqPath = '/MediaRenderer/RenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:RenderingControl:1#SetVolume"';

  if (forGroup) {
    console.log('for Group', forGroup);
      volumeSoap = SOAP.GroupVolume.format({volume: volumeLevel});
      reqPath = '/MediaRenderer/GroupRenderingControl/Control';
      soapAction = '"urn:schemas-upnp-org:service:GroupRenderingControl:1#SetGroupVolume"';
  }

  this.soapAction(reqPath, soapAction, volumeSoap, callback); 
}

Player.prototype.mute = function (isMute, forGroup, callback) {
    console.log('player set mute', isMute);
    var muteSoap = SOAP.Mute.format({mute: isMute});
    var reqPath = '/MediaRenderer/RenderingControl/Control';
    var soapAction = '"urn:schemas-upnp-org:service:RenderingControl:1#SetMute"';

    if (forGroup) {
        muteSoap = SOAP.GroupMute.format({mute: isMute});
        reqPath = '/MediaRenderer/GroupRenderingControl/Control';
        soapAction = '"urn:schemas-upnp-org:service:GroupRenderingControl:1#SetGroupMute"';
    }

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

Player.prototype.setAVTransportURI = function (URI, metaData, callback) {
  var body = SOAP.SetAVTransportURI.format({ URI: URI || '', MetaData: metaData || ''});
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI"', body, callback); 
}

Player.prototype.becomeCoordinatorOfStandaloneGroup = function (callback) {
  this.soapAction('/MediaRenderer/AVTransport/Control', '"urn:schemas-upnp-org:service:AVTransport:1#BecomeCoordinatorOfStandaloneGroup"', SOAP.BecomeCoordinatorOfStandaloneGroup, callback); 
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
  SetAVTransportURI: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CurrentURI>{URI}</CurrentURI><CurrentURIMetaData>{MetaData}</CurrentURIMetaData></u:SetAVTransportURI></s:Body></s:Envelope>'
};



module.exports = Discovery;