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
  NON_COMPLIANT = 'Failed compliance checks',
}

export const CONFIG = {
  userSettings: {
    feed: {
      itemIdColumnName: {
        row: 2,
        col: 2,
      },
      titleColumnName: {
        row: 2,
        col: 3,
      },
      descriptionColumnName: {
        row: 2,
        col: 4,
      },
    },
    vertexAi: {
      gcpProjectId: {
        row: 5,
        col: 2,
      },
      gcpProjectLocation: {
        row: 5,
        col: 3,
      },
      languageModelId: {
        row: 5,
        col: 4,
      },
    },
    description: {
      fullPrompt: {
        row: 10,
        col: 2,
      },
      modelParameters: {
        temperature: {
          row: 8,
          col: 2,
        },
        maxOutputTokens: {
          row: 8,
          col: 3,
        },
        topK: {
          row: 8,
          col: 4,
        },
        topP: {
          row: 8,
          col: 5,
        },
      },
    },
    title: {
      fullPrompt: {
        row: 16,
        col: 2,
      },
      preferGeneratedAttributes: {
        row: 18,
        col: 2,
      },
      modelParameters: {
        temperature: {
          row: 14,
          col: 2,
        },
        maxOutputTokens: {
          row: 14,
          col: 3,
        },
        topK: {
          row: 14,
          col: 4,
        },
        topP: {
          row: 14,
          col: 5,
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
      startRow: 3,
      cols: {
        approval: 0,
        status: 1,
        id: 2,
        titleGenerated: 3,
        gapAttributes: 14,
        descriptionGenerated: 15,
        fullApiResponse: 19,
        originalInput: 20,
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
