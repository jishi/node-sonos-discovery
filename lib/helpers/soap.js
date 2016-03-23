'use strict';

const request = require('./request');

// disable long line check
/* jshint -W101 */
const TYPE = Object.freeze({
  SetEQ: 'urn:schemas-upnp-org:service:RenderingControl:1#SetEQ',
  Play: 'urn:schemas-upnp-org:service:AVTransport:1#Play',
  Pause: 'urn:schemas-upnp-org:service:AVTransport:1#Pause',
  Next: 'urn:schemas-upnp-org:service:AVTransport:1#Next',
  Previous: 'urn:schemas-upnp-org:service:AVTransport:1#Previous',
  Mute: 'urn:schemas-upnp-org:service:RenderingControl:1#SetMute',
  Volume: 'urn:schemas-upnp-org:service:RenderingControl:1#SetVolume',
  Seek: 'urn:schemas-upnp-org:service:AVTransport:1#Seek',
  RemoveAllTracksFromQueue: 'urn:schemas-upnp-org:service:AVTransport:1#RemoveAllTracksFromQueue',
  RemoveTrackFromQueue: 'urn:schemas-upnp-org:service:AVTransport:1#RemoveTrackFromQueue',
  SetPlayMode: 'urn:schemas-upnp-org:service:AVTransport:1#SetPlayMode',
  SetCrossfadeMode: 'urn:schemas-upnp-org:service:AVTransport:1#SetCrossfadeMode',
  GetPositionInfo: 'urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo',
  ConfigureSleepTimer: 'urn:schemas-upnp-org:service:AVTransport:1#ConfigureSleepTimer',
  SetAVTransportURI: 'urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI',
  Browse: 'urn:schemas-upnp-org:service:ContentDirectory:1#Browse',
  BecomeCoordinatorOfStandaloneGroup: 'urn:schemas-upnp-org:service:AVTransport:1#BecomeCoordinatorOfStandaloneGroup'
});

const TEMPLATES = Object.freeze({
  [TYPE.SetEQ]: '<u:SetEQ xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><EQType>{eqType}</EQType><DesiredValue>{value}</DesiredValue></u:SetEQ>',
  [TYPE.Play]: '<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Speed>1</Speed></u:Play>',
  [TYPE.Pause]: '<u:Pause xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Pause>',
  [TYPE.Next]: '<u:Next xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Next>',
  [TYPE.Previous]: '<u:Previous xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Previous>',
  [TYPE.Mute]: '<u:SetMute xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><Channel>Master</Channel><DesiredMute>{mute}</DesiredMute></u:SetMute>',
  [TYPE.Volume]: '<u:SetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>{volume}</DesiredVolume></u:SetVolume>',
  [TYPE.Seek]: '<u:Seek xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Unit>{unit}</Unit><Target>{value}</Target></u:Seek>',
  [TYPE.RemoveAllTracksFromQueue]: '<u:RemoveAllTracksFromQueue xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:RemoveAllTracksFromQueue>',
  [TYPE.RemoveTrackFromQueue]: '<u:RemoveTrackFromQueue xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><ObjectID>Q:0/{track}</ObjectID></u:RemoveTrackFromQueue>',
  [TYPE.SetPlayMode]: '<u:SetPlayMode xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><NewPlayMode>{playMode}</NewPlayMode></u:SetPlayMode>',
  [TYPE.SetCrossfadeMode]: '<u:SetCrossfadeMode xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CrossfadeMode>{crossfadeMode}</CrossfadeMode></u:SetCrossfadeMode>',
  [TYPE.GetPositionInfo]: '<u:GetPositionInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:GetPositionInfo>',
  [TYPE.ConfigureSleepTimer]: '<u:ConfigureSleepTimer xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><NewSleepTimerDuration>{time}</NewSleepTimerDuration></u:ConfigureSleepTimer>',
  [TYPE.SetAVTransportURI]: '<u:SetAVTransportURI xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><CurrentURI>{URI}</CurrentURI><CurrentURIMetaData>{MetaData}</CurrentURIMetaData></u:SetAVTransportURI>',
  [TYPE.Browse]: '<u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>{objectId}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter /><StartingIndex>{startIndex}</StartingIndex><RequestedCount>{limit}</RequestedCount><SortCriteria /></u:Browse>',
  [TYPE.BecomeCoordinatorOfStandaloneGroup]: '<u:BecomeCoordinatorOfStandaloneGroup xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:BecomeCoordinatorOfStandaloneGroup>'
});

function substitute(soapAction, substitutions) {
  let template = TEMPLATES[soapAction];
  let body = template;
  if (substitutions) {
    body = template.replace(/{([a-z]+)}/gi, function (match) {
      return (substitutions.hasOwnProperty(RegExp.$1)) ? substitutions[RegExp.$1] : match;
    });
  }

  return `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>${body}</s:Body></s:Envelope>`;
}
/* jshint +W101 */

function invoke(url, action, values) {
  let soapBody;
  try {
    soapBody = substitute(action, values);
  } catch (e) {
    return Promise.reject(e);
  }

  return request({
    uri: url,
    method: 'POST',
    headers: {
      'CONTENT-TYPE': 'text/xml; charset="utf-8"',
      SOAPACTION: `"${action}"`,
      'CONTENT-LENGTH': soapBody.length
    },
    body: soapBody,
    stream: true
  });
}

module.exports = {
  invoke,
  TYPE,
  TEMPLATES
};
