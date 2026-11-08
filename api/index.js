// Vercel serverless function: every /api/* request is routed here by vercel.json.
'use strict';
const { handler } = require('../server');

module.exports = handler;
