'use strict';
const ssdp = require('./sonos-ssdp');
const request = require('./helpers/request');
const NotificationListener = require('./NotificationListener');
const Player = require('./models/Player');
const Sub = require('./models/Sub');
const Subscriber = require('./Subscriber');
const EventEmitter = require('events').EventEmitter;
const util = require('util');
const path = require('path');
const requireDir = require('./helpers/require-dir');
const soap = require('./helpers/soap');
const parseServices = require('./helpers/parse-services');
const UnknownServiceError = require('./errors/unknown-service');

function isVisible(member) {
  // If a member has the attribute invisible == 1, it is either a
  // BRIDGE, BOOST, SUB or a right channel stereo pair
  if (Array.isArray(member)) {
    return member.some(x => x.invisible !== '1');
  }

  return member.invisible !== '1';
}

function SonosSystem() {

  let _this = this;
  _this.localEndpoint = '0.0.0.0';
  _this.players = [];
  _this.zones = [];
  _this.availableServices = {};
  let listener;
  let playerCache = {};
  let subCache = {};

  function queueChange(uuid) {
    let player = _this.getPlayerByUUID(uuid);
    if (player && player.uuid) {
      _this.emit('queue-change', player);
    }
  }

  function listChange(type) {
    _this.emit('list-change', type);
  }

  function tryGet(cache, Type, member) {
    if (cache[member.uuid]) {
      return cache[member.uuid];
    }

    cache[member.uuid] = new Type(member, listener, _this);
    return cache[member.uuid];
  }

  function getPlayers(members) {
    if (members instanceof Array === false) {
      // single item
      return [tryGet(playerCache, Player, members)];
    }

    // Find normal players
    let players = members
      .filter((member) => {
        return isVisible(member);
      })
      .map((member) => {
        return tryGet(playerCache, Player, member);
      });

    // fix sub and pairs
    members
      .filter((member) => {
        return !isVisible(member);
      })
      .forEach((member) => {
        const channelMap = /^(\w+):([\w,]{5});(\w+):([\w,]{5})$/.exec(member.channelmapset);
        if (!channelMap) {
          return;
        }

        let primaryUuid = channelMap[1];
        let isSub = channelMap[4] === 'SW,SW';

        if (isSub) {
          playerCache[primaryUuid].sub = tryGet(subCache, Sub, member);
        }
      });

    return players;
  }

  function topologyChange(uuid, topology) {
    let players = [];

    let zones = topology
      .filter((zone) => {
        return isVisible(zone.zonegroupmember);
      })
      .map((zone) => {
        let members = getPlayers(zone.zonegroupmember);
        Array.prototype.push.apply(players, members);

        // fix coordinator for members
        let coordinator = playerCache[zone.$attrs.coordinator];
        members.forEach((member) => {
          member.coordinator = coordinator;
        });

        return {
          coordinator,
          members,
          uuid: zone.$attrs.coordinator,
          id: zone.$attrs.id
        };
      });

    _this.zones = zones;
    _this.players = players;

    _this.emit('topology-change', zones);

    // Update available services
    const anyPlayer = _this.getAnyPlayer();
    soap.invoke(`${anyPlayer.baseUrl}/MusicServices/Control`, soap.TYPE.ListAvailableServices)
        .then(soap.parse)
        .then(parseServices)
        .then((availableServices) => {
          if (!Object.keys(_this.availableServices).length) {
            setImmediate(() => _this.emit('initialized'));
          }

          _this.availableServices = availableServices;
        });
  }

  function init(info) {
    ssdp.stop();

    request({
      uri: info.location,
      method: 'GET',
      stream: true
    })
      .then((res) => {
        _this.localEndpoint = res.socket.address().address;
        listener = new NotificationListener(_this.localEndpoint);
        listener.on('queue-change', queueChange);
        listener.on('list-change', listChange);
        listener.on('topology', topologyChange);
        listener.on('listening', (port) => {
          _this.subscriber = new Subscriber(`http://${info.ip}:1400/ZoneGroupTopology/Event`, listener.endpoint());
        });
      })
      .catch((e) => {
        console.error(e);
      });
  }

  ssdp.start();
  ssdp.on('found', init);
}

// This needs to be before all prototype methods!
util.inherits(SonosSystem, EventEmitter);

SonosSystem.prototype.getPlayer = function getPlayer(name) {
  return this.players.find((player) => player.roomName.toLowerCase() === name.toLowerCase());
};

SonosSystem.prototype.getPlayerByUUID = function getPlayerByUUID(uuid) {
  return this.players.find((player) => player.uuid === uuid);
};

let playerIndex = 0;

SonosSystem.prototype.getAnyPlayer = function getAnyPlayer() {
  return this.players[playerIndex++ % this.players.length];
};

SonosSystem.prototype.dispose = function dispose() {
  if (this.subscriber && this.subscriber.dispose) this.subscriber.dispose();
  this.players.forEach(player => {
    if (player.sub && player.sub.dispose) player.sub.dispose();
    if (player.dispose) player.dispose();
  });
};

SonosSystem.prototype.getServiceId = function getServiceId(serviceName) {
  if (!this.availableServices[serviceName]) {
    throw new UnknownServiceError(serviceName);
  }

  return this.availableServices[serviceName].id;
};

SonosSystem.prototype.getServiceType = function getServiceType(serviceName) {
  if (!this.availableServices[serviceName]) {
    throw new UnknownServiceError(serviceName);
  }

  return this.availableServices[serviceName].type;
};

requireDir(path.join(__dirname, '/prototypes/SonosSystem'), (proto) => {
  SonosSystem.prototype[proto.name] = proto;
});

module.exports = SonosSystem;
