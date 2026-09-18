'use strict';

const syncService = require('../syncService');
const { createAdapter } = require('./adapterContract');

async function buildSyncSnapshot({ userId }) {
  const owner = Number(userId);
  if (!Number.isInteger(owner) || owner <= 0) {
    const error = new Error('UNAUTHORIZED');
    error.code = 'UNAUTHORIZED';
    error.statusCode = 401;
    throw error;
  }

  const envelope = await syncService.getData(owner);
  const data = envelope && envelope.data && typeof envelope.data === 'object'
    ? envelope.data
    : {};

  return createAdapter({
    adapter: 'sync_data',
    source: 'sync_service',
    authority: 'source',
    type: 'user_data_snapshot',
    data,
  });
}

module.exports = {
  buildSyncSnapshot,
};
