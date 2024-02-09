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
      pageLinkColumnName: {
        row: 2,
        col: 5,
      },
      imageColumnName: {
        row: 2,
        col: 6,
      },
      generateTitles: {
        row: 2,
        col: 7,
      },
      generateDescriptions: {
        row: 2,
        col: 8,
      },
      imageUnderstanding: {
        row: 2,
        col: 9,
        notation: 'I2',
      },
    },
    vertexAi: {
      gcpProjectId: {
        row: 5,
        col: 2,
      },
      languageModelFamily: {
        row: 5,
        col: 3,
        notation: 'C5',
      },
      languageModelId: {
        row: 5,
        col: 4,
        notation: 'D5',
      },
    },
    bigQuery: {
      useBigQuery: {
        row: 7,
        col: 2,
        notation: 'B7',
      },
      datsetName: {
        row: 7,
        col: 3,
        notation: 'C7',
      },
      modelPath: {
        row: 7,
        col: 4,
        notation: 'D7',
      },
      inputTableName: {
        row: 7,
        col: 5,
        notation: 'E7',
      },
      titlesPromptsTable: {
        row: 7,
        col: 6,
        notation: 'F7',
      },
      descriptionsPromptsTable: {
        row: 7,
        col: 7,
        notation: 'G7',
      },
      titlesResponsesTable: {
        row: 7,
        col: 8,
        notation: 'H7',
      },
      descriptionsResponsesTable: {
        row: 7,
        col: 9,
        notation: 'I7',
      },
      batchSize: {
        row: 9,
        col: 2,
        notation: 'B9',
      },
      batchPointer: {
        row: 9,
        col: 3,
        notation: 'C9',
      },
      outputTable: {
        row: 9,
        col: 4,
        notation: 'D9',
      },
      titlesOutputTable: {
        row: 9,
        col: 6,
        notation: 'F9',
      },
      descriptionsOutputTable: {
        row: 9,
        col: 7,
        notation: 'G9',
      },
    },
    description: {
      fullPrompt: {
        row: 14,
        col: 2,
      },
      minApprovalScore: {
        row: 12,
        col: 6,
      },
      usePageLinkData: {
        row: 12,
        col: 8,
      },
      modelParameters: {
        temperature: {
          row: 12,
          col: 2,
        },
        maxOutputTokens: {
          row: 12,
          col: 3,
        },
        topK: {
          row: 12,
          col: 4,
        },
        topP: {
          row: 12,
          col: 5,
        },
      },
    },
    title: {
      fullPrompt: {
        row: 20,
        col: 2,
      },
      minApprovalScore: {
        row: 18,
        col: 6,
      },
      usePageLinkData: {
        row: 18,
        col: 8,
      },
      preferGeneratedValues: {
        row: 23,
        col: 2,
      },
      useLlmTitles: {
        row: 24,
        col: 2,
      },
      allowedWords: {
        row: 25,
        col: 2,
      },
      modelParameters: {
        temperature: {
          row: 18,
          col: 2,
        },
        maxOutputTokens: {
          row: 18,
          col: 3,
        },
        topK: {
          row: 18,
          col: 4,
        },
        topP: {
          row: 18,
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
        fullApiResponse: 21,
        originalInput: 22,
      },
    },
    output: {
      name: 'Output Feed',
      newAttributesPrefix: 'feedgen-',
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
    formulaError: '#ERROR!',
  },
  vertexAi: {
    endpoint: 'aiplatform.googleapis.com',
    location: 'us-central1',
    maxRetries: 3,
    quotaLimitDelay: 30 * 1000, // 30s
  },
  caching: {
    keyPrefix: 'PAGEINFO_',
    defaultExpiration: 60, // in seconds
  },
};
