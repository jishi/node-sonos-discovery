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
  var currentAttr = {};

  var mapping = {
    "dc:title": "title",
    "dc:creator": "artist",
    "upnp:album": "album",
    "upnp:albumArtURI": "albumArtURI",
    "res": "uri",
    "r:resMD": "metaData"
  };

  var mapping_attr = {
    "id":"id",
  }

  saxParser.on('textNode', function (str, uq) {
    nodeValue = uq(str);
  });

  saxParser.on('startNode', function(elem, attr){
    if(elem == "container"){
      var attributes = attr();
      for(var key in attributes){
        if(!mapping_attr[key])  continue;
        currentAttr[mapping_attr[key]]=attributes[key]||"";
      };
    }
  });

  saxParser.on('endNode', function (elem, unEntities, tagstart, getStringNode) {
    if (elem=="container" || elem =="item") {
      result.push(currentItem);
      currentItem = {};
      currentAttr = {};
    }

    if (!mapping[elem]) return;
    currentItem[mapping[elem]] = nodeValue||"";
    for(var key in currentAttr){
      if(currentAttr.hasOwnProperty(key)){
        currentItem["attr"] = currentAttr;
        break;
      }
    }
  });
  saxParser.parse(xml);
  return result;
}


function Sub(roomName, descriptorUrl, uuid, discovery) {
  var _this = this;
  var positionInfoTimeout;
  var sids = {};
  // for prototype access
  this.discovery = discovery;
  this.log = this.discovery.log;
  this.address = descriptorUrl.replace(/http:\/\/([\d\.]+).*/, "$1");
  this.roomName = roomName;
  this.zoneType = 0;
  this.uuid = uuid;
  this.state = {
    speakerSize: 0,
    subGain: 0,
    subCrossover: 0,
    subPolarity: 0,
    subEnabled: 0
  };
  this.avTransportUri = "";
  this.ignoreGainEvents = false;
  this.outputFixed = false;

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
    // Check if this is something we are interested in
    if (notification.type != 'LastChange') return;

    // LastChange, that is interesting!

    var saxParser = new EasySax();

    saxParser.on('error', function (e) {
      _this.log.error(e);
    });

    var event = {
      type: null,
      data: {}
    };

    saxParser.on('startNode', function (elem, attr, uq) {
      if (elem == "InstanceID") return;
      if (elem == "Event") return;
      if (elem == "TransportState") return;

      // first element is type.
      if (!event.type) {
        event.type = elem;
      }

      var attributes = attr();
      event.data[elem] = uq(attributes.val);

    });
    saxParser.parse(notification.body);

    switch (event.type) {
      // Sometimes the notifications come in as a more general Volume xml, and
      // sometimes as a more specific SpeakerSize. We'll handle both with the
      // same method, ignoreing the extra elements in the general xml
      case "Volume":
      case "SpeakerSize":
        updateSubInfo(event.data);
    }

  }

  function updateSubInfo(data) {
    _this.state.speakerSize = data.SpeakerSize*1;
    _this.state.subCrossover = data.SubCrossover*1;
    _this.state.subPolarity = data.SubPolarity*1;
    _this.state.subEnabled = data.SubEnabled*1;

    var gain = data.SubGain*1;
    if (!_this.ignoreGainEvents) {
      _this.state.subGain = gain*1;
    }

    discovery.emit('sub-info', {uuid: _this.uuid, state: _this.getState()});
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
        _this.log.error("subscribe failed", sids[path], path, res.statusCode);
        delete sids[path];
        setTimeout(function () { subscribe(path); }, 5000);
      }


    });

    client.on('error', function (e) {
      _this.log.error(e, sids[path], path);
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

    // RenderingControl
    // For Gain and the like events
    subscribe('/MediaRenderer/RenderingControl/Event');


    // Resubscribe after timeout * 0.9 seconds
    setTimeout(subscribeToEvents, subscriptionTimeout * 500);

  }
}

Sub.prototype.convertToSimple = function () {
  return {
    uuid: this.uuid,
    state: this.getState(),
    roomName: this.roomName
  };
};

Sub.prototype.soapAction = function (path, action, soap, callback) {
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
        _this.log.info(_this.roomName, action, 'STATUS: ' + res.statusCode);
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
    _this.log.error("error occured on soap request", e.message);
    if (!callback) return;
    callback(false, this);
  });
  req.write(soap);
  req.end();
}

Sub.prototype.setGain = function (gainLevel, callback) {
  // store ref for timeout function
  var _this = this;
  // If prefixed with + or -
  if (/^[+\-]/.test(gainLevel)) {
    gainLevel = this.state.subgain + gainLevel*1;
  }

  gainLevel = gainLevel*1;

  if (gainLevel < -15) gainLevel = -15;
  if (gainLevel > 15) gainLevel = 15;

  this.state.subGain = gainLevel;

  // ignore gain events for a certain time
  this.ignoreGainEvents = true;
  clearTimeout(this.ignoreGainEventsTimeout);
  this.ignoreGainEventsTimeout = setTimeout(function () { _this.ignoreGainEvents = false; }, 500);

  var gainSoap = SOAP.Gain.format({gain: gainLevel});
  var reqPath = '/MediaRenderer/RenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:RenderingControl:1#SetEQ"';
  this.soapAction(reqPath, soapAction, gainSoap, callback);
}

Sub.prototype.setCrossover = function (crossover, callback) {
  // store ref for timeout function
  var _this = this;

  crossover = crossover*1;

  if (crossover < 50) crossover = 50;
  if (crossover > 110) crossover = 110;

  this.state.subCrossover = crossover;


  var crossoverSoap = SOAP.Crossover.format({crossover: crossover});
  var reqPath = '/MediaRenderer/RenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:RenderingControl:1#SetEQ"';
  this.soapAction(reqPath, soapAction, crossoverSoap, callback);
}

Sub.prototype.setEnabled = function (enabled, callback) {
  // store ref for timeout function
  var _this = this;

  enabled = enabled*1;

  enabled==0?0:1;


  this.state.subEnabled = enabled;


  var enabledSoap = SOAP.Enabled.format({enabled: enabled});
  var reqPath = '/MediaRenderer/RenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:RenderingControl:1#SetEQ"';
  this.soapAction(reqPath, soapAction, enabledSoap, callback);
}

Sub.prototype.setPolarity = function (polarity, callback) {
  // store ref for timeout function
  var _this = this;

  polarity = polarity*1;

  polarity==1?1:0;


  this.state.subPolarity = polarity;


  var polaritySoap = SOAP.Polarity.format({polarity: polarity});
  var reqPath = '/MediaRenderer/RenderingControl/Control';
  var soapAction = '"urn:schemas-upnp-org:service:RenderingControl:1#SetEQ"';
  this.soapAction(reqPath, soapAction, polaritySoap, callback);
}


Sub.prototype.toggleLED = function (enabled, callback) {
  var soap = SOAP.SetLEDState.format({state: enabled ? "On" : "Off"});
  this.soapAction('/DeviceProperties/Control', '"urn:schemas-upnp-org:service:DeviceProperties:1#SetLEDState"', soap, callback);
}

Sub.prototype.getState = function () {

  return {
    speakerSize: this.state.speakerSize,
    subGain: this.state.subGain,
    subCrossover: this.state.subCrossover,
    subPolarity: this.state.subPolarity,
    subEnabled: this.state.subEnabled
  };
}

var SOAP = {
  Gain: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetEQ xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><EQType>SubGain</EQType><DesiredValue>{gain}</DesiredValue></u:SetEQ></s:Body></s:Envelope>',
  Crossover: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetEQ xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><EQType>SubCrossover</EQType><DesiredValue>{crossover}</DesiredValue></u:SetEQ></s:Body></s:Envelope>',
  Enabled: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetEQ xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><EQType>SubEnabled</EQType><DesiredValue>{enabled}</DesiredValue></u:SetEQ></s:Body></s:Envelope>',
  Polarity: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetEQ xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><EQType>SubPolarity</EQType><DesiredValue>{polarity}</DesiredValue></u:SetEQ></s:Body></s:Envelope>',
  SetLEDState: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:SetLEDState xmlns:u="urn:schemas-upnp-org:service:DeviceProperties:1"><DesiredLEDState>{state}</DesiredLEDState></u:SetLEDState></s:Body></s:Envelope>'
};

module.exports = Sub;
