'use strict';
const soap = require('../../helpers/soap');
const TYPE = soap.TYPE;

function subDisable() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubEnable', value: 0 });
}

module.exports = subDisable;
