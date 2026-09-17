'use strict';

require('./setup');

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const app = require('../src/app');
const authService = require('../src/services/authService');
const syncService = require('../src/services/syncService');

function request(port, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: Object.assign({ 'content-type': 'application/json' }, headers),
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (_) { parsed = null; }
        resolve({ status: response.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.end(payload);
    else req.end();
  });
}

async function listen(appInstance) {
  const server = http.createServer(appInstance);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function registerUser(email) {
  const result = await authService.register({ email, password: 'Password123' });
  return result.token;
}

describe('course space foundation API', () => {
  test('requires authentication', async () => {
    const { server, port } = await listen(app);
    try {
      const response = await request(port, '/api/course-space', 'GET', {});
      assert.equal(response.status, 401);
    } finally {
      server.close();
    }
  });

  test('creates, lists and retrieves course knowledge within owner boundaries', async () => {
    const { server, port } = await listen(app);
    const token = await registerUser('course-space@example.com');
    const headers = { authorization: `Bearer ${token}`, 'x-requested-with': 'XMLHttpRequest' };
    await syncService.saveData(1, { courses: [{ id: 'course-1', name: '数据结构与算法' }] });

    try {
      const documentResponse = await request(port, '/api/course-space/documents', 'POST', headers, {
        courseId: 'course-1',
        title: 'Lecture 01',
        content: 'A closure keeps access to its outer scope.',
        sourceUrl: 'https://example.com/lecture-1',
        version: 1,
      });
      assert.equal(documentResponse.status, 201);
      const document = documentResponse.body.data;
      assert.equal(document.courseId, 'course-1');

      const nodeResponse = await request(port, '/api/course-space/nodes', 'POST', headers, {
        courseId: 'course-1',
        title: 'Closure',
        kind: 'concept',
        definition: 'A function bundled with references to its surrounding scope.',
        confidence: 'high',
      });
      assert.equal(nodeResponse.status, 201);
      const node = nodeResponse.body.data;

      const targetNodeResponse = await request(port, '/api/course-space/nodes', 'POST', headers, {
        courseId: 'course-1',
        title: 'Function Scope',
        kind: 'concept',
      });
      const targetNode = targetNodeResponse.body.data;

      const relationResponse = await request(port, '/api/course-space/relations', 'POST', headers, {
        courseId: 'course-1',
        sourceNodeId: node.id,
        targetNodeId: targetNode.id,
        relationType: 'depends_on',
      });
      assert.equal(relationResponse.status, 201);

      const evidenceResponse = await request(port, '/api/course-space/evidence', 'POST', headers, {
        courseId: 'course-1',
        documentId: document.id,
        nodeId: node.id,
        quote: 'A closure keeps access to its outer scope.',
        locator: 'section 1.2',
      });
      assert.equal(evidenceResponse.status, 201);

      const snapshot = await request(port, '/api/course-space', 'GET', headers);
      assert.equal(snapshot.status, 200);
      assert.equal(snapshot.body.data.courses.length, 1);
      assert.equal(snapshot.body.data.documents.length, 1);
      assert.equal(snapshot.body.data.nodes.length, 2);
      assert.equal(snapshot.body.data.relations.length, 1);
      assert.equal(snapshot.body.data.evidence.length, 1);
      assert.equal(snapshot.body.data.documents[0].userId, undefined);

      const search = await request(port, '/api/course-space/search?q=closure&limit=1', 'GET', headers);
      assert.equal(search.status, 200);
      assert.equal(search.body.data.nodes.length, 1);
      assert.equal(search.body.data.nodes[0].title, 'Closure');
      assert.equal(search.body.data.evidence.length, 1);

      const invalidRelation = await request(port, '/api/course-space/relations', 'POST', headers, {
        courseId: 'course-1',
        sourceNodeId: node.id,
        targetNodeId: targetNode.id,
        relationType: 'made_up',
      });
      assert.equal(invalidRelation.status, 400);

      const foreignCourse = await request(port, '/api/course-space/nodes', 'POST', headers, {
        courseId: 'not-owned',
        title: 'Forbidden',
        kind: 'concept',
      });
      assert.equal(foreignCourse.status, 400);
    } finally {
      server.close();
    }
  });

  test('does not expose another user course space or allow foreign references', async () => {
    const { server, port } = await listen(app);
    await authService.register({ email: 'owner@example.com', password: 'Password123' });
    await syncService.saveData(1, { courses: [{ id: 'owner-course', name: 'Owner Course' }] });
    const ownerToken = await authService.login({ email: 'owner@example.com', password: 'Password123' }).then((r) => r.token);
    const ownerHeaders = { authorization: `Bearer ${ownerToken}`, 'x-requested-with': 'XMLHttpRequest' };
    await request(port, '/api/course-space/documents', 'POST', ownerHeaders, {
      courseId: 'owner-course',
      title: 'Owner Document',
      content: 'owner evidence',
    });

    const otherToken = await registerUser('other@example.com');
    const otherHeaders = { authorization: `Bearer ${otherToken}`, 'x-requested-with': 'XMLHttpRequest' };

    try {
      const snapshot = await request(port, '/api/course-space', 'GET', otherHeaders);
      assert.equal(snapshot.body.data.documents.length, 0);

      const foreignDocument = await request(port, '/api/course-space/evidence', 'POST', otherHeaders, {
        courseId: 'owner-course',
        documentId: 'not-owned',
        nodeId: 'not-owned',
        quote: 'steal',
      });
      assert.equal(foreignDocument.status, 400);
    } finally {
      server.close();
    }
  });
});
