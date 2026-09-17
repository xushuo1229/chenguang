'use strict';

const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const model = require('../db/courseSpaceModel');
const syncService = require('./syncService');

const NODE_KINDS = new Set(['concept', 'definition', 'principle', 'procedure', 'formula', 'example', 'skill']);
const RELATION_TYPES = new Set(['prerequisite', 'depends_on', 'part_of', 'related_to', 'contrasts_with', 'example_of', 'applies_to']);
const STATUSES = new Set(['candidate', 'validated', 'accepted']);
const CONFIDENCE_LEVELS = new Set(['high', 'medium', 'low']);

function requireObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw ApiError.badRequest('INVALID_INPUT', '数据格式不正确');
  }
  return body;
}

function requiredText(value, field, max) {
  const text = String(value == null ? '' : value).trim();
  if (!text) throw ApiError.badRequest('INVALID_INPUT', `${field}必填`);
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
}

function optionalText(value, field, max) {
  const text = String(value == null ? '' : value).trim();
  if (text.length > max) throw ApiError.badRequest('INVALID_INPUT', `${field}长度不能超过${max}`);
  return text;
}

function optionalUrl(value) {
  const text = optionalText(value, 'sourceUrl', 2048);
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    return url.toString();
  } catch (_) {
    throw ApiError.badRequest('INVALID_INPUT', 'sourceUrl必须是http或https链接');
  }
}

function boundedVersion(value) {
  if (value == null || value === '') return 1;
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1 || version > 100000) {
    throw ApiError.badRequest('INVALID_INPUT', 'version必须是1到100000的整数');
  }
  return version;
}

function enumValue(value, allowed, field, fallback) {
  if (value == null || value === '') return fallback;
  const text = String(value).trim();
  if (!allowed.has(text)) throw ApiError.badRequest('INVALID_INPUT', `${field}不支持`);
  return text;
}

function boundedConfidenceNumber(value, fallback = 0.5) {
  if (value == null || value === '') return fallback;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
    throw ApiError.badRequest('INVALID_INPUT', 'confidence必须是0到1之间的数值');
  }
  return numberValue;
}

async function assertOwnedCourse(userId, courseId) {
  const text = requiredText(courseId, 'courseId', 200);
  const envelope = await syncService.getData(userId);
  const courses = envelope && envelope.data && Array.isArray(envelope.data.courses) ? envelope.data.courses : [];
  if (!courses.some((course) => course && String(course.id) === text)) {
    throw ApiError.badRequest('INVALID_COURSE', '课程不存在或不属于当前用户');
  }
  return text;
}

function toDocument(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    content: row.content,
    sourceUrl: row.source_url,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toNode(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    kind: row.kind,
    definition: row.definition,
    status: row.status,
    confidence: row.confidence,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRelation(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    relationType: row.relation_type,
    version: row.version,
    createdAt: row.created_at,
  };
}

function toEvidence(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    documentId: row.document_id,
    nodeId: row.node_id,
    quote: row.quote,
    locator: row.locator,
    version: row.version,
    createdAt: row.created_at,
  };
}

async function createDocument({ userId, body }) {
  const input = requireObject(body);
  const courseId = await assertOwnedCourse(userId, input.courseId);
  const id = crypto.randomUUID();
  const row = {
    id,
    course_id: courseId,
    title: requiredText(input.title, 'title', 200),
    content: optionalText(input.content, 'content', 100000),
    source_url: optionalUrl(input.sourceUrl),
    version: boundedVersion(input.version),
  };
  await model.createDocument({ id, userId, courseId, title: row.title, content: row.content, sourceUrl: row.source_url, version: row.version });
  return toDocument(row);
}

async function createNode({ userId, body }) {
  const input = requireObject(body);
  const courseId = await assertOwnedCourse(userId, input.courseId);
  const id = crypto.randomUUID();
  const confidence = enumValue(input.confidence, CONFIDENCE_LEVELS, 'confidence', 'medium');
  const row = {
    id,
    course_id: courseId,
    title: requiredText(input.title, 'title', 200),
    kind: enumValue(input.kind, NODE_KINDS, 'kind', 'concept'),
    definition: optionalText(input.definition, 'definition', 5000),
    status: enumValue(input.status, STATUSES, 'status', 'validated'),
    confidence,
    version: boundedVersion(input.version),
  };
  await model.createNode({ id, userId, courseId, title: row.title, kind: row.kind, definition: row.definition, status: row.status, confidence: row.confidence, version: row.version });
  return toNode(row);
}

async function createRelation({ userId, body }) {
  const input = requireObject(body);
  const courseId = await assertOwnedCourse(userId, input.courseId);
  const sourceNodeId = requiredText(input.sourceNodeId, 'sourceNodeId', 100);
  const targetNodeId = requiredText(input.targetNodeId, 'targetNodeId', 100);
  const source = await model.findNode({ userId, nodeId: sourceNodeId });
  const target = await model.findNode({ userId, nodeId: targetNodeId });
  if (!source || source.course_id !== courseId) {
    throw ApiError.badRequest('INVALID_REFERENCE', '起点知识节点不存在');
  }
  if (!target || target.course_id !== courseId) {
    throw ApiError.badRequest('INVALID_REFERENCE', '终点知识节点不存在');
  }
  const relationType = enumValue(input.relationType, RELATION_TYPES, 'relationType');
  const id = crypto.randomUUID();
  const row = {
    id,
    course_id: courseId,
    source_node_id: sourceNodeId,
    target_node_id: targetNodeId,
    relation_type: relationType,
    version: boundedVersion(input.version),
  };
  await model.createRelation({ id, userId, courseId, sourceNodeId: row.source_node_id, targetNodeId: row.target_node_id, relationType: row.relation_type, version: row.version });
  return toRelation(row);
}

async function createEvidence({ userId, body }) {
  const input = requireObject(body);
  const courseId = await assertOwnedCourse(userId, input.courseId);
  const documentId = requiredText(input.documentId, 'documentId', 100);
  const nodeId = requiredText(input.nodeId, 'nodeId', 100);
  const document = await model.findDocument({ userId, documentId });
  const node = await model.findNode({ userId, nodeId });
  if (!document || document.course_id !== courseId) {
    throw ApiError.badRequest('INVALID_REFERENCE', '引用文档不存在');
  }
  if (!node || node.course_id !== courseId) {
    throw ApiError.badRequest('INVALID_REFERENCE', '引用知识节点不存在');
  }
  const id = crypto.randomUUID();
  const row = {
    id,
    course_id: courseId,
    document_id: documentId,
    node_id: nodeId,
    quote: requiredText(input.quote, 'quote', 2000),
    locator: optionalText(input.locator, 'locator', 500),
    version: boundedVersion(input.version),
  };
  await model.createEvidence({ id, userId, courseId, documentId: row.document_id, nodeId: row.node_id, quote: row.quote, locator: row.locator, version: row.version });
  return toEvidence(row);
}

async function getCourseSpace({ userId, courseId }) {
  const filterCourseId = courseId ? String(courseId).trim() : null;
  const envelope = await syncService.getData(userId);
  const allCourses = envelope && envelope.data && Array.isArray(envelope.data.courses) ? envelope.data.courses : [];
  const courses = filterCourseId
    ? allCourses.filter((course) => course && String(course.id) === filterCourseId)
    : allCourses;
  const [documents, nodes, relations, evidence] = await Promise.all([
    model.listDocuments(userId, filterCourseId),
    model.listNodes(userId, filterCourseId),
    model.listRelations(userId, filterCourseId),
    model.listEvidence(userId, filterCourseId),
  ]);
  return {
    courses,
    documents: documents.map(toDocument),
    nodes: nodes.map(toNode),
    relations: relations.map(toRelation),
    evidence: evidence.map(toEvidence),
  };
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function search({ userId, query, courseId, limit }) {
  const normalizedQuery = String(query == null ? '' : query).trim();
  if (!normalizedQuery) {
    throw ApiError.badRequest('INVALID_QUERY', '搜索词必填');
  }
  if (normalizedQuery.length > 200) {
    throw ApiError.badRequest('INVALID_QUERY', '搜索词长度不能超过200');
  }
  const normalizedCourseId = courseId ? String(courseId).trim() : null;
  const normalizedLimit = limit == null || limit === '' ? 10 : Number(limit);
  if (!Number.isInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 50) {
    throw ApiError.badRequest('INVALID_LIMIT', 'limit必须是1到50的整数');
  }
  const pattern = `%${escapeLike(normalizedQuery)}%`;
  const [nodes, documents, evidence] = await Promise.all([
    model.searchNodes({ userId, courseId: normalizedCourseId, pattern, limit: normalizedLimit }),
    model.searchDocuments({ userId, courseId: normalizedCourseId, pattern, limit: normalizedLimit }),
    model.searchEvidence({ userId, courseId: normalizedCourseId, pattern, limit: normalizedLimit }),
  ]);
  return {
    query: normalizedQuery,
    courseId: normalizedCourseId,
    nodes: nodes.map(toNode),
    documents: documents.map(toDocument),
    evidence: evidence.map(toEvidence),
  };
}

module.exports = {
  createDocument,
  createEvidence,
  createNode,
  createRelation,
  getCourseSpace,
  search,
};
