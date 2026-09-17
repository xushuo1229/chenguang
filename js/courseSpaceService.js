'use strict';

import CGAPI from './apiClient.js';

function createCourseSpaceService(options) {
  const client = (options && options.client) || CGAPI;
  return {
    snapshot(courseId) {
      return client.courseSpace.snapshot(courseId);
    },
    search(payload) {
      return client.courseSpace.search(payload);
    }
  };
}

export default createCourseSpaceService;
export { createCourseSpaceService };
