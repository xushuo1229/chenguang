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
      ]).then(async ([snapshot, jobs, candidates]) => {
        const candidateItems = candidates && candidates.data ? candidates.data.candidates : [];
        const evidence = await Promise.all(candidateItems.map((candidate) =>
          client.courseSpace.listCandidateEvidence(candidate.id)
            .then((response) => (response && response.data ? response.data.evidence : []))
            .catch(() => [])
        ));
        return {
          snapshot: snapshot && snapshot.data,
          jobs: jobs && jobs.data ? jobs.data.jobs : [],
          candidates: candidateItems,
          evidenceById: candidateItems.reduce((result, candidate, index) => {
            result[candidate.id] = evidence[index];
            return result;
          }, {})
        };
      });
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
