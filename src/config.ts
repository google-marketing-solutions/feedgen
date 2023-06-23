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

export enum Status {
  SUCCESS = 'Success',
  FAILED = 'Failed',
}

export const CONFIG = {
  userSettings: {
    feed: {
      itemIdColumnName: {
        row: 2,
        col: 2,
      },
      titleColumnName: {
        row: 3,
        col: 2,
      },
      descriptionColumnName: {
        row: 4,
        col: 2,
      },
      autoApproveThreshold: {
        row: 6,
        col: 2,
      },
    },
    vertexAi: {
      gcpProjectId: {
        row: 2,
        col: 5,
      },
      gcpProjectLocation: {
        row: 3,
        col: 5,
      },
      languageModelId: {
        row: 4,
        col: 5,
      },
    },
    description: {
      fullPrompt: {
        row: 10,
        col: 5,
      },
      modelParameters: {
        temperature: {
          row: 11,
          col: 2,
        },
        maxOutputTokens: {
          row: 12,
          col: 2,
        },
        topK: {
          row: 13,
          col: 2,
        },
        topP: {
          row: 14,
          col: 2,
        },
      },
    },
    title: {
      fullPrompt: {
        row: 18,
        col: 5,
      },
      preferGeneratedAttributes: {
        row: 19,
        col: 2,
      },
      modelParameters: {
        temperature: {
          row: 20,
          col: 2,
        },
        maxOutputTokens: {
          row: 21,
          col: 2,
        },
        topK: {
          row: 22,
          col: 2,
        },
        topP: {
          row: 23,
          col: 2,
        },
      },
    },
  },
  sheets: {
    config: {
      name: 'Config',
    },
    input: {
      name: 'Input Feed',
      startRow: 1,
    },
    generated: {
      name: 'Generated Content Validation',
      startRow: 5,
      cols: {
        approval: 0,
        status: 1,
        id: 2,
        titleGenerated: 3,
        descriptionGenerated: 4,
        gapAttributes: 12,
        originalInput: 13,
        fullApiResponse: 16,
      },
    },
    output: {
      name: 'Output Feed',
      startRow: 1,
      cols: {
        modificationTimestamp: 0,
        id: {
          idx: 1,
          name: 'Item ID',
        },
        title: {
          idx: 2,
          name: 'Title',
        },
        description: {
          idx: 3,
          name: 'Description',
        },
        gapCols: {
          start: 4,
        },
      },
    },
    log: {
      name: 'Log',
      startRow: 0,
    },
  },
  vertexAi: {
    endpoint: 'aiplatform.googleapis.com',
    maxRetries: 3,
    quotaLimitDelay: 30 * 1000, // 30s
  },
};
