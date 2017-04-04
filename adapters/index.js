'use strict';
const path = require('path');
const mongo = require(path.join(__dirname, './mongo'));
const sql = require(path.join(__dirname, './sql'));
const loki = require(path.join(__dirname, './loki'));

module.exports = { mongo, sql, loki };