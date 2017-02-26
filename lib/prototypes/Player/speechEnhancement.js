'use strict';
const soap = require('../../helpers/soap');
const TYPE = soap.TYPE;

function speechEnhancement(enable) {
  const value = enable ? '1' : '0';
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'DialogLevel', value });
};

module.exports = speechEnhancement;
