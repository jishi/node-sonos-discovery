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

function isVisible(member) {
  // If a member has the attribute invisible == 1, it is either a
  // BRIDGE, BOOST, SUB or a right channel stereo pair
  return member.invisible !== '1';
}

function SonosSystem() {

  let _this = this;
  _this.localEndpoint = '0.0.0.0';
  _this.players = [];
  _this.zones = [];
  let listener;
  let subscriber;
  let playerCache = {};
  let subCache = {};

  function queueChange() {
    console.log('queue changed, emit something');
  }

  function favoritesChange() {
    console.log('favorites changed, emit something');
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

    let playersByUuid = {};

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
        if (!/^(\w+):([\w,]{5});(\w+):([\w,]{5})$/.test(member.channelmapset)) {
          return;
        }

        let primaryUuid = RegExp.$1;
        let isSub = RegExp.$4 === 'SW,SW';

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

  }

  function init(info) {
    request({
      uri: info.location,
      method: 'GET',
      stream: true
    }).then((res) => {
      _this.localEndpoint = res.socket.address().address;
      listener = new NotificationListener(_this.localEndpoint);
      listener.on('queue-change', queueChange);
      listener.on('favorites-change', favoritesChange);
      listener.on('topology', topologyChange);
      let subscribeUrl = `http://${info.ip}:1400/ZoneGroupTopology/Event`;
      subscriber = new Subscriber(subscribeUrl, listener.endpoint());
    }).catch((e) => {
      console.error(e);
    });

    ssdp.stop();
  }

  ssdp.start();
  ssdp.on('found', init);
}

// This needs to be before all prototype methods!
util.inherits(SonosSystem, EventEmitter);

SonosSystem.prototype.getPlayer = function getPlayer(name) {
  return this.players.find((player) => player.roomName === name);
};

let playerIndex = 0;

SonosSystem.prototype.getAnyPlayer = function getAnyPlayer() {
  return this.players[playerIndex++%this.players.length];
};

requireDir(path.join(__dirname, '/prototypes/SonosSystem'), (proto) => {
  SonosSystem.prototype[proto.name] = proto;
});

module.exports = SonosSystem;
