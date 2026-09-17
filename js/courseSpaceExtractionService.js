'use strict';

import CGAPI from './apiClient.js';

function createCourseSpaceExtractionService(options) {
  const client = (options && options.client) || CGAPI;
  return {
    load({ courseId } = {}) {
      return Promise.all([
        client.courseSpace.snapshot(courseId || ''),
        client.courseSpace.listExtractionJobs({ courseId: courseId || '', limit: 20 }),
        client.courseSpace.listCandidates({ courseId: courseId || '', status: 'pending', limit: 20 })
      ]).then(([snapshot, jobs, candidates]) => ({
        snapshot: snapshot && snapshot.data,
        jobs: jobs && jobs.data ? jobs.data.jobs : [],
        candidates: candidates && candidates.data ? candidates.data.candidates : []
      }));
    },
    createJob(payload) {
      return client.courseSpace.createExtractionJob(payload);
    },
    reviewCandidate(candidateId, payload) {
      return client.courseSpace.reviewCandidate(candidateId, payload);
    }
  };
}

export default createCourseSpaceExtractionService;
export { createCourseSpaceExtractionService };
