'use strict';
const ssdp = require('./sonos-ssdp');
const request = require('./helpers/request');
const NotificationListener = require('./NotificationListener');
const Player = require('./models/Player');

function isVisible(member) {
  // If a member has the attribute invisible == 1, it is either a
  // BRIDGE, BOOST, SUB or a right channel stereo pair
  return member.invisible !== '1';
}

function SonosSystem() {

  let _this = this;
  this.localEndpoint = '0.0.0.0';
  let listener;

  function subscribeToTopology(info) {
    let uri = `http://${info.ip}:1400/ZoneGroupTopology/Event`;
    let callbackUri = listener.endpoint();
    return request({
      uri,
      method: 'SUBSCRIBE',
      headers: {
        NT: 'upnp:event',
        CALLBACK: `<${callbackUri}>`,
        TIMEOUT: 'Second-600'
      }
    });
  }

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
        console.log(member);
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

  }

  function init(info) {
    request({
      uri: info.location,
      method: 'HEAD',
      stream: true
    }).then((res) => {
      _this.localEndpoint = res.socket.address().address;
      listener = new NotificationListener(_this.localEndpoint);
      listener.on('queue-change', queueChange);
      listener.on('favorites-change', favoritesChange);
      listener.on('topology', topologyChange);
      return subscribeToTopology(info);
    }).catch((e) => {
      console.error(e);
    });
  }

  ssdp.start();
  ssdp.on('found', init);

}

module.exports = SonosSystem;
