'use strict';

const request = require('./request');

// disable long line check
/* jshint -W101 */
const TYPE = Object.freeze({
  SetEQ: 'urn:schemas-upnp-org:service:RenderingControl:1#SetEQ',
  Play: 'urn:schemas-upnp-org:service:AVTransport:1#Play',
  Pause: 'urn:schemas-upnp-org:service:AVTransport:1#Pause',
  Next: 'urn:schemas-upnp-org:service:AVTransport:1#Next',
  Previous: 'urn:schemas-upnp-org:service:AVTransport:1#Previous'
});

const TEMPLATES = Object.freeze({
  [TYPE.SetEQ]: '<u:SetEQ xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1"><InstanceID>0</InstanceID><EQType>{eqType}</EQType><DesiredValue>{value}</DesiredValue></u:SetEQ>',
  [TYPE.Play]: '<u:Play xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID><Speed>1</Speed></u:Play>',
  [TYPE.Pause]: '<u:Pause xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Pause>',
  [TYPE.Next]: '<u:Next xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Next>',
  [TYPE.Previous]: '<u:Previous xmlns:u="urn:schemas-upnp-org:service:AVTransport:1"><InstanceID>0</InstanceID></u:Previous>'
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
    body: soapBody
  });
}

module.exports = {
  invoke,
  TYPE,
  TEMPLATES
};
