/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const CONFIG = {
  sheets: {
    config: {
      name: 'Config',
      fields: {
        projectId: {
          row: 1,
          col: 2,
        },
      },
    },
    input: {
      name: 'Input Feed',
      startRow: 1,
    },
    generated: {
      name: 'Generated Title Validation',
      startRow: 1,
      cols: {
        titleStatus: 0,
        id: 1,
        titleOriginal: 2,
        titleGenerated: 3,
      },
      headers: [
        'Approval',
        'Item ID',
        'Title',
        'Generated Title',
        'Generated Title Template',
        'Original Title Template',
        'Generated Category',
        'Generated Attributes',
        'Introduced Words',
        'Imagined Missing Attributes',
        'Hallucination Score',
        'Original Title Characters',
        'Generated Title Characters',
        'Original Title Words',
        'Generated Title Words',
        'Original Title Attributes (inferred)',
        'Generated Title Attributes',
        'Title Delta Score',
        'Title Changed',
        'Full Response (debug)',
        'original input data',
      ],
    },
    output: {
      startRow: 1,
      name: 'Output Feed',
      cols: {
        id: 0,
        title: 1,
      },
    },
  },
  vertexAi: {
    endpoint: 'us-central1-autopush-aiplatform.sandbox.googleapis.com',
    modelId: 'text-bison@001',
  },
};
