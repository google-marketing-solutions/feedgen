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
  sheets: {
    config: {
      name: 'Config',
      fields: {
        vertexAiProjectId: {
          row: 2,
          col: 5,
        },
        vertexAiLocation: {
          row: 3,
          col: 5,
        },
        vertexAiModelId: {
          row: 4,
          col: 5,
        },
        vertexAiModelTemperature: {
          row: 5,
          col: 5,
        },
        vertexAiModelMaxOutputTokens: {
          row: 6,
          col: 5,
        },
        vertexAiModelTopK: {
          row: 7,
          col: 5,
        },
        vertexAiModelTopP: {
          row: 8,
          col: 5,
        },
        itemIdColumnName: {
          row: 2,
          col: 2,
        },
        titleColumnName: {
          row: 3,
          col: 2,
        },
        fullPrompt: {
          row: 13,
          col: 5,
        },
      },
    },
    input: {
      name: 'Input Feed',
      startRow: 1,
    },
    generated: {
      name: 'Generated Title Validation',
      startRow: 5,
      cols: {
        approval: 0,
        status: 1,
        id: 2,
        titleOriginal: 3,
        titleGenerated: 4,
        gapAttributes: 13,
        originalInput: 15,
      },
    },
    output: {
      startRow: 1,
      name: 'Output Feed',
      cols: {
        id: 0,
        title: 1,
        modificationTimestamp: 2,
        gapCols: {
          start: 3,
        },
      },
    },
    log: {
      startRow: 0,
      name: 'Log',
    },
  },
  vertexAi: {
    endpoint: 'aiplatform.googleapis.com',
    maxRetries: 3,
    quotaLimitDelay: 30 * 1000, // 30s
  },
};
