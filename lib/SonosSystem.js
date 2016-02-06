'use strict';
const ssdp = require('./sonos-ssdp');
const request = require('./helpers/request');
const NotificationListener = require('./NotificationListener');
const Player = require('./models/Player');
const Subscriber = require('./Subscriber');
const EventEmitter = require('events').EventEmitter;
const util = require('util');

function isVisible(member) {
  // If a member has the attribute invisible == 1, it is either a
  // BRIDGE, BOOST, SUB or a right channel stereo pair
  return member.invisible !== '1';
}

function SonosSystem() {

  let _this = this;
  this.localEndpoint = '0.0.0.0';
  let listener;

  let subscriber;

  function queueChange() {
    console.log('queue changed, emit something');
  }

  function favoritesChange() {
    console.log('favorites changed, emit something');
  }

  function createPlayers(members) {
    if (members instanceof Array === false) {
      // single item
      return [{ roomName: members.zonename }];
    }

    let playersByUuid = {};

    // Find normal players
    let players = members
      .filter((member) => {
        return isVisible(member);
      })
      .map((member) => {
        playersByUuid[member.uuid] = new Player(member, listener);
        return playersByUuid[member.uuid];
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

        playersByUuid[primaryUuid].sub = {
          roomName: `${member.zonename} (SUB)`
        };
      });

    return players;
  }

  function topologyChange(uuid, topology) {
    let zones = topology
      .filter((zone) => {
        return isVisible(zone.zonegroupmember);
      })
      .map((zone) => {
        return {
          uuid: zone.$attrs.coordinator,
          id: zone.$attrs.id,
          members: createPlayers(zone.zonegroupmember)
        };
      });

    _this.zones = zones;

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

util.inherits(SonosSystem, EventEmitter);

module.exports = SonosSystem;
