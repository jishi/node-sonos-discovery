'use strict';
const soap = require('../../helpers/soap');
const TYPE = soap.TYPE;

function subGain(value) {
  if (value < -15 || value > 15) {
    return Promise.reject(new Error('Valid range is between -15 and 15'));
  }

  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubGain', value: value });
}

module.exports = subGain;
