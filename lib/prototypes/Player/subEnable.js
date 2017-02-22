'use strict';
const soap = require('../../helpers/soap');
const TYPE = soap.TYPE;

function subEnable() {
  return soap.invoke(
    `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
    TYPE.SetEQ,
    { eqType: 'SubEnable', value: 1 });
};

module.exports = subEnable;
