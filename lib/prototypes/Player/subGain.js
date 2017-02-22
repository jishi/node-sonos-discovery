'use strict';
const soap = require('../../helpers/soap');
const TYPE = soap.TYPE;

function subGain(value) {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubGain', value: value });
}

module.exports = subGain;
