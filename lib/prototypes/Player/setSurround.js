'use strict';
const soap = require('../../helpers/soap');
const SURROUNDMODE = require('../../types/surround-mode');
const TYPE = soap.TYPE;

function setSurround(action, value) {

  switch (action) {

    case 'on':
      return soap.invoke(
        `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
        TYPE.SetEQ,
        { eqType: 'SurroundEnable', value: 1 });

    case 'off':
      return soap.invoke(
        `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
        TYPE.SetEQ,
        { eqType: 'SurroundEnable', value: 0 });

    case 'mode':
      value = (value == 'full' || value == 1) ? SURROUNDMODE.FULL : SURROUNDMODE.AMBIENT;
      return soap.invoke(
        `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
        TYPE.SetEQ,
        { eqType: 'SurroundMode', value });

    case 'level':
      if (value < -15) {
        value = -15;
      } else if (value > 15) {
        value = 15;
      }

      return soap.invoke(
      `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
      TYPE.SetEQ,
      { eqType: 'SurroundLevel', value });

    case 'musiclevel':
      if (value < -15) {
        value = -15;
      } else if (value > 15) {
        value = 15;
      }

      return soap.invoke(
      `${this.baseUrl}/MediaRenderer/RenderingControl/Control`,
      TYPE.SetEQ,
      { eqType: 'MusicSurroundLevel', value });

  }
}

module.exports = setSurround;
