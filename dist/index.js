/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var Status;
(function (Status) {
  Status['SUCCESS'] = 'Success';
  Status['FAILED'] = 'Failed';
})(Status || (Status = {}));
const CONFIG = {
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
        row: 9,
        col: 5,
      },
      modelParameters: {
        temperature: {
          row: 10,
          col: 2,
        },
        maxOutputTokens: {
          row: 11,
          col: 2,
        },
        topK: {
          row: 12,
          col: 2,
        },
        topP: {
          row: 13,
          col: 2,
        },
      },
    },
    title: {
      fullPrompt: {
        row: 17,
        col: 5,
      },
      preferGeneratedAttributes: {
        row: 18,
        col: 2,
      },
      modelParameters: {
        temperature: {
          row: 19,
          col: 2,
        },
        maxOutputTokens: {
          row: 20,
          col: 2,
        },
        topK: {
          row: 21,
          col: 2,
        },
        topP: {
          row: 22,
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
    quotaLimitDelay: 30 * 1000,
  },
};

class MultiLogger {
  constructor() {
    this.sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
      CONFIG.sheets.log.name
    );
  }
  clear() {
    this.sheet?.clear();
    SpreadsheetApp.flush();
  }
  log(...messages) {
    const msg = messages
      .map(m => (typeof m === 'object' ? JSON.stringify(m) : m))
      .join(' ');
    Logger.log(msg);
    this.sheet?.appendRow([JSON.stringify(msg)]);
    SpreadsheetApp.flush();
  }
  static getInstance() {
    if (typeof this.instance === 'undefined') {
      this.instance = new MultiLogger();
    }
    return this.instance;
  }
}

class SheetsService {
  constructor(spreadsheetId) {
    let spreadsheet;
    if (spreadsheetId) {
      try {
        spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      } catch (e) {
        console.error(e);
        throw new Error(
          `Unable to identify spreadsheet with provided ID: ${spreadsheetId}!`
        );
      }
    } else {
      spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    }
    this.spreadsheet_ = spreadsheet;
  }
  getHeaders(sheet) {
    return sheet
      .getRange(1, 1, 1, sheet.getMaxColumns())
      .getValues()[0]
      .filter(cell => cell !== '');
  }
  getTotalRows(sheetName) {
    const sheet = this.spreadsheet_.getSheetByName(sheetName);
    if (!sheet) return;
    return sheet.getDataRange().getLastRow();
  }
  getTotalColumns(sheetName) {
    const sheet = this.spreadsheet_.getSheetByName(sheetName);
    if (!sheet) return;
    return sheet.getDataRange().getLastColumn();
  }
  getNonEmptyRows(sheet) {
    return sheet
      .getDataRange()
      .getValues()
      .filter(row => row.join('').length > 0);
  }
  getRangeData(sheetName, startRow, startCol, numRows = 0, numCols = 0) {
    const sheet = this.getSpreadsheet().getSheetByName(sheetName);
    if (!sheet || numRows + sheet.getLastRow() - startRow + 1 === 0) {
      return [[]];
    }
    return sheet
      .getRange(
        startRow,
        startCol,
        numRows || sheet.getLastRow() - startRow + 1,
        numCols || sheet.getLastColumn() - startCol + 1
      )
      .getValues();
  }
  setValuesInDefinedRange(sheetName, row, col, values) {
    const sheet = this.getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) return;
    if (values[0]) {
      sheet
        .getRange(row, col, values.length, values[0].length)
        .setValues(values);
    }
  }
  clearDefinedRange(sheetName, row, col, numRows = 0, numCols = 0) {
    const sheet = this.getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) return;
    sheet
      .getRange(
        row,
        col,
        numRows || sheet.getLastRow(),
        numCols || sheet.getLastColumn()
      )
      .clear();
  }
  getCellValue(sheetName, row, col) {
    const sheet = this.getSpreadsheet().getSheetByName(sheetName);
    if (!sheet) return null;
    const cell = sheet.getRange(row, col);
    return cell.getValue();
  }
  setCellValue(row, col, val, sheetName) {
    const sheet = sheetName
      ? this.getSpreadsheet().getSheetByName(sheetName)
      : this.getSpreadsheet().getActiveSheet();
    if (!sheet) return;
    sheet.getRange(row, col).setValue(val);
  }
  getSpreadsheet() {
    return this.spreadsheet_;
  }
  getSpreadsheetApp() {
    return SpreadsheetApp;
  }
  static getInstance(spreadsheetId) {
    if (typeof this.instance === 'undefined') {
      this.instance = new SheetsService(spreadsheetId);
    }
    return this.instance;
  }
}

class Util {
  static executeWithRetry(maxRetries, fn, delayMillies = 0) {
    let retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        return fn();
      } catch (err) {
        if (delayMillies) {
          Utilities.sleep(delayMillies);
        }
        retryCount++;
        if (retryCount === maxRetries) {
          throw err;
        }
      }
    }
  }
  static splitWords(text) {
    return new Set(text.match(/\w+/g));
  }
  static getSetIntersection(set1, set2) {
    return [...[...set1].filter(element => set2.has(element))];
  }
  static getSetDifference(set1, set2) {
    return [...[...set1].filter(element => !set2.has(element))];
  }
}

class VertexHelper {
  constructor(projectId, location, modelId, modelParams) {
    this.projectId = projectId;
    this.location = location;
    this.modelId = modelId;
    this.modelParams = modelParams;
  }
  addAuth(params) {
    const baseParams = {
      method: 'POST',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${ScriptApp.getOAuthToken()}`,
      },
    };
    return Object.assign({ payload: JSON.stringify(params) }, baseParams);
  }
  fetchJson(url, params) {
    const response = UrlFetchApp.fetch(url, params);
    if (response.getResponseCode() === 429) {
      MultiLogger.getInstance().log(
        `Waiting ${CONFIG.vertexAi.quotaLimitDelay}s as API quota limit has been reached...`
      );
      Utilities.sleep(CONFIG.vertexAi.quotaLimitDelay);
      return this.fetchJson(url, params);
    }
    return JSON.parse(response.getContentText());
  }
  predict(prompt) {
    MultiLogger.getInstance().log(`Prompt: ${prompt}`);
    const predictEndpoint = `https://${this.location}-${CONFIG.vertexAi.endpoint}/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.modelId}:predict`;
    const res = this.fetchJson(
      predictEndpoint,
      this.addAuth({
        instances: [{ content: prompt }],
        parameters: this.modelParams,
      })
    );
    MultiLogger.getInstance().log(res);
    if (res.predictions[0].safetyAttributes.blocked) {
      throw new Error(
        `Request was blocked as it triggered API safety filters. Prompt: ${prompt}`
      );
    } else if (!res.predictions[0].content) {
      throw new Error(`Received empty response from API. Prompt: ${prompt}`);
    }
    return res.predictions[0].content;
  }
  static getInstance(projectId, location, modelId, modelParams) {
    if (typeof this.instance === 'undefined') {
      this.instance = new VertexHelper(
        projectId,
        location,
        modelId,
        modelParams
      );
    }
    return this.instance;
  }
}

const app = null;
const ORIGINAL_TITLE_TEMPLATE_PROMPT_PART =
  'product attribute keys in original title:';
const CATEGORY_PROMPT_PART = 'product category:';
const TEMPLATE_PROMPT_PART = 'product attribute keys:';
const ATTRIBUTES_PROMPT_PART = 'product attribute values:';
const SEPARATOR = '|';
const WORD_MATCH_REGEX =
  /([A-Za-zÀ-ÖØ-öø-ÿ0-9]|\s)*\[A-Za-zÀ-ÖØ-öø-ÿ0-9](?=")|\[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g;
const [
  vertexAiGcpProjectId,
  vertexAiGcpProjectLocation,
  vertexAiLanguageModelId,
] = [
  getConfigSheetValue(CONFIG.userSettings.vertexAi.gcpProjectId),
  getConfigSheetValue(CONFIG.userSettings.vertexAi.gcpProjectLocation),
  getConfigSheetValue(CONFIG.userSettings.vertexAi.languageModelId),
];
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FeedGen')
    .addItem('Launch', 'showSidebar')
    .addToUi();
}
function init() {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CONFIG.sheets.config.name)
    ?.getDataRange();
}
function showSidebar() {
  const html = HtmlService.createTemplateFromFile('static/index').evaluate();
  html.setTitle('FeedGen');
  SpreadsheetApp.getUi().showSidebar(html);
}
function FEEDGEN_CREATE_JSON_CONTEXT_FOR_ITEM(itemId) {
  const inputSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.input.name
  );
  const itemIdColumnName = getConfigSheetValue(
    CONFIG.userSettings.feed.itemIdColumnName
  );
  if (!inputSheet) return;
  const [headers, ...rows] = inputSheet
    .getRange(1, 1, inputSheet.getLastRow(), inputSheet.getMaxColumns())
    .getValues();
  const itemIdIndex = headers.indexOf(itemIdColumnName);
  const selectedRow = rows.filter(row => row[itemIdIndex] === itemId)[0];
  const contextObject = Object.fromEntries(
    headers.filter(key => key).map((key, index) => [key, selectedRow[index]])
  );
  return JSON.stringify(contextObject);
}
function getUnprocessedInputRows(filterProcessed) {
  const inputSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.input.name
  );
  const generatedSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.generated.name
  );
  let inputRows = SheetsService.getInstance().getNonEmptyRows(inputSheet);
  inputRows.forEach((row, index) => {
    if (index > 0) {
      row.push(CONFIG.sheets.generated.startRow + index);
    }
  });
  const generatedRowIds = SheetsService.getInstance()
    .getNonEmptyRows(generatedSheet)
    .filter(
      row => String(row[CONFIG.sheets.generated.cols.status]) === Status.SUCCESS
    )
    .map(row => String(row[CONFIG.sheets.generated.cols.id]));
  if (filterProcessed && generatedRowIds.length) {
    const itemIdIndex = inputRows[0].indexOf(
      String(getConfigSheetValue(CONFIG.userSettings.feed.itemIdColumnName))
    );
    inputRows = inputRows.filter(
      row => !generatedRowIds.includes(String(row[itemIdIndex]))
    );
  }
  return JSON.stringify(inputRows);
}
function generateRow(headers, row) {
  const rowIndex = Number(row.pop());
  let outputRow = [];
  try {
    outputRow = optimizeRow(headers, row);
  } catch (e) {
    const itemIdIndex = headers.indexOf(
      String(getConfigSheetValue(CONFIG.userSettings.feed.itemIdColumnName))
    );
    outputRow[
      CONFIG.sheets.generated.cols.status
    ] = `${Status.FAILED}. Check the 'Full API Response' column for details.`;
    outputRow[CONFIG.sheets.generated.cols.id] = String(row[itemIdIndex]);
    outputRow[CONFIG.sheets.generated.cols.fullApiResponse] = String(e);
  }
  SheetsService.getInstance().setValuesInDefinedRange(
    CONFIG.sheets.generated.name,
    rowIndex,
    1,
    [outputRow]
  );
}
function getGenerationMetrics(
  origTitle,
  genTitle,
  origAttributes,
  genAttributes,
  inputWords,
  gapAttributesAndValues,
  originalInput
) {
  const titleChanged = origTitle !== genTitle;
  const addedAttributes = Util.getSetDifference(genAttributes, origAttributes);
  const newWordsAdded = new Set();
  const genTitleWords = genTitle.match(WORD_MATCH_REGEX);
  if (genTitleWords) {
    genTitleWords
      .filter(genTitleWord => !inputWords.has(genTitleWord.toLowerCase()))
      .forEach(newWord => newWordsAdded.add(newWord));
  }
  const gapAttributesPresent = Object.keys(gapAttributesAndValues).filter(
    gapKey => gapKey in originalInput
  );
  const gapAttributesInvented = Object.keys(gapAttributesAndValues).filter(
    gapKey => !(gapKey in originalInput)
  );
  const totalScore =
    (Number(addedAttributes.length > 0) +
      Number(titleChanged) +
      Number(newWordsAdded.size === 0) +
      Number(gapAttributesPresent.length > 0) +
      Number(gapAttributesInvented.length > 0)) /
    5;
  return {
    totalScore: totalScore.toString(),
    titleChanged: titleChanged.toString(),
    addedAttributes: addedAttributes.map(attr => `<${attr}>`).join(' '),
    newWordsAdded: [...newWordsAdded].join(` ${SEPARATOR} `),
  };
}
function getConfigSheetValue(field) {
  return SheetsService.getInstance().getCellValue(
    CONFIG.sheets.config.name,
    field.row,
    field.col
  );
}
function optimizeRow(headers, data) {
  const dataObj = Object.fromEntries(
    data.map((item, index) => [headers[index], item])
  );
  const itemId =
    dataObj[getConfigSheetValue(CONFIG.userSettings.feed.itemIdColumnName)];
  const origTitle =
    dataObj[getConfigSheetValue(CONFIG.userSettings.feed.titleColumnName)];
  const origDescription =
    dataObj[
      getConfigSheetValue(CONFIG.userSettings.feed.descriptionColumnName)
    ];
  const res = fetchTitleGenerationData(dataObj);
  const [origTemplateRow, genCategoryRow, genTemplateRow, genAttributesRow] =
    res.split('\n');
  const genCategory = genCategoryRow.replace(CATEGORY_PROMPT_PART, '').trim();
  const genAttributes = genTemplateRow
    .replace(TEMPLATE_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter(Boolean)
    .map(x => x.trim());
  const origAttributes = origTemplateRow
    .replace(ORIGINAL_TITLE_TEMPLATE_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter(Boolean)
    .map(x => x.trim());
  const genAttributeValues = genAttributesRow
    .replace(ATTRIBUTES_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter(Boolean)
    .map(x => x.trim());
  const preferGeneratedAttributes = getConfigSheetValue(
    CONFIG.userSettings.title.preferGeneratedAttributes
  );
  const titleFeatures = [];
  const gapAttributesAndValues = {};
  const validGenAttributes = [];
  genAttributes.forEach((attribute, index) => {
    if (
      !dataObj[attribute] &&
      genAttributeValues[index] &&
      (!origAttributes.includes(attribute) ||
        Object.keys(dataObj).includes(attribute))
    ) {
      gapAttributesAndValues[attribute] = genAttributeValues[index];
    }
    const value = preferGeneratedAttributes
      ? genAttributeValues[index]
      : dataObj[attribute] || genAttributeValues[index];
    if (value && String(value).trim()) {
      validGenAttributes.push(attribute);
      titleFeatures.push(String(value).trim());
    }
  });
  const origTemplate = origAttributes.map(x => `<${x}>`).join(' ');
  const genTemplate = validGenAttributes.map(x => `<${x}>`).join(' ');
  const genTitle = titleFeatures.join(' ');
  const genDescription = fetchDescriptionGenerationData(dataObj, genTitle);
  const inputWords = new Set();
  Object.values(dataObj).forEach(value => {
    const match = new String(value).match(WORD_MATCH_REGEX);
    if (match) {
      match.forEach(word => inputWords.add(word.toLowerCase()));
    }
  });
  const { totalScore, titleChanged, addedAttributes, newWordsAdded } =
    getGenerationMetrics(
      origTitle,
      genTitle,
      new Set(origAttributes),
      new Set(validGenAttributes),
      inputWords,
      gapAttributesAndValues,
      dataObj
    );
  return [
    false,
    'Success',
    itemId,
    genTitle,
    genDescription,
    genCategory,
    totalScore,
    titleChanged,
    origTemplate,
    genTemplate,
    addedAttributes,
    newWordsAdded,
    Object.keys(gapAttributesAndValues).length > 0
      ? JSON.stringify(gapAttributesAndValues)
      : '',
    JSON.stringify(dataObj),
    origTitle,
    origDescription,
    `${res}\nproduct description: ${genDescription}`,
  ];
}
function fetchTitleGenerationData(data) {
  const dataContext = `Context: ${JSON.stringify(data)}\n\n`;
  const prompt =
    getConfigSheetValue(CONFIG.userSettings.title.fullPrompt) + dataContext;
  const res = Util.executeWithRetry(CONFIG.vertexAi.maxRetries, () =>
    VertexHelper.getInstance(
      vertexAiGcpProjectId,
      vertexAiGcpProjectLocation,
      vertexAiLanguageModelId,
      {
        temperature: Number(
          getConfigSheetValue(
            CONFIG.userSettings.title.modelParameters.temperature
          )
        ),
        maxOutputTokens: Number(
          getConfigSheetValue(
            CONFIG.userSettings.title.modelParameters.maxOutputTokens
          )
        ),
        topK: Number(
          getConfigSheetValue(CONFIG.userSettings.title.modelParameters.topK)
        ),
        topP: Number(
          getConfigSheetValue(CONFIG.userSettings.title.modelParameters.topP)
        ),
      }
    ).predict(prompt)
  );
  return res;
}
function fetchDescriptionGenerationData(data, generatedTitle) {
  const modifiedData = Object.assign(
    {
      'Generated Title': generatedTitle,
    },
    data
  );
  const dataContext = `Context: ${JSON.stringify(modifiedData)}\n\n`;
  const prompt =
    getConfigSheetValue(CONFIG.userSettings.description.fullPrompt) +
    dataContext;
  const res = Util.executeWithRetry(CONFIG.vertexAi.maxRetries, () =>
    VertexHelper.getInstance(
      vertexAiGcpProjectId,
      vertexAiGcpProjectLocation,
      vertexAiLanguageModelId,
      {
        temperature: Number(
          getConfigSheetValue(
            CONFIG.userSettings.description.modelParameters.temperature
          )
        ),
        maxOutputTokens: Number(
          getConfigSheetValue(
            CONFIG.userSettings.description.modelParameters.maxOutputTokens
          )
        ),
        topK: Number(
          getConfigSheetValue(
            CONFIG.userSettings.description.modelParameters.topK
          )
        ),
        topP: Number(
          getConfigSheetValue(
            CONFIG.userSettings.description.modelParameters.topP
          )
        ),
      }
    ).predict(prompt)
  );
  return res;
}
function getGeneratedRows() {
  return SheetsService.getInstance().getRangeData(
    CONFIG.sheets.generated.name,
    CONFIG.sheets.generated.startRow + 1,
    1
  );
}
function writeGeneratedRows(rows, withHeader = false) {
  const offset = withHeader ? 0 : 1;
  SheetsService.getInstance().setValuesInDefinedRange(
    CONFIG.sheets.generated.name,
    CONFIG.sheets.generated.startRow + offset,
    1,
    rows
  );
}
function writeApprovedData(header, rows) {
  MultiLogger.getInstance().log('Writing approved data...');
  SheetsService.getInstance().setValuesInDefinedRange(
    CONFIG.sheets.output.name,
    CONFIG.sheets.output.startRow,
    CONFIG.sheets.output.cols.id.idx + 1,
    [header]
  );
  SheetsService.getInstance().setValuesInDefinedRange(
    CONFIG.sheets.output.name,
    CONFIG.sheets.output.startRow + 1,
    1,
    rows
  );
}
function clearApprovedData() {
  MultiLogger.getInstance().log('Clearing approved data...');
  SheetsService.getInstance().clearDefinedRange(
    CONFIG.sheets.output.name,
    CONFIG.sheets.output.startRow,
    CONFIG.sheets.output.cols.id.idx + 1
  );
  SheetsService.getInstance().clearDefinedRange(
    CONFIG.sheets.output.name,
    CONFIG.sheets.output.startRow + 1,
    1
  );
}
function clearGeneratedRows() {
  MultiLogger.getInstance().log('Clearing generated rows...');
  MultiLogger.getInstance().clear();
  SheetsService.getInstance().clearDefinedRange(
    CONFIG.sheets.generated.name,
    CONFIG.sheets.generated.startRow + 1,
    1
  );
}
function approveFiltered() {
  MultiLogger.getInstance().log('Approving filtered rows...');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    CONFIG.sheets.generated.name
  );
  const rows = getGeneratedRows();
  if (!sheet || !rows) return;
  rows.map((row, index) => {
    row[CONFIG.sheets.generated.cols.approval] = sheet.isRowHiddenByFilter(
      index + CONFIG.sheets.generated.startRow + 1
    )
      ? row[CONFIG.sheets.generated.cols.approval]
      : true;
    return row;
  });
  writeGeneratedRows(rows);
  MultiLogger.getInstance().log('Writing approved rows...');
}
function getGapAndInventedAttributes(rows) {
  const filledInGapAttributes = [
    ...new Set(
      rows
        .filter(row => row[CONFIG.sheets.generated.cols.gapAttributes])
        .map(row =>
          Object.keys(
            JSON.parse(row[CONFIG.sheets.generated.cols.gapAttributes])
          )
        )
        .flat(1)
    ),
  ];
  const allInputAttributes = [
    ...new Set(
      rows
        .filter(row => row[CONFIG.sheets.generated.cols.originalInput])
        .map(row =>
          Object.keys(
            JSON.parse(row[CONFIG.sheets.generated.cols.originalInput])
          )
        )
        .flat(1)
    ),
  ];
  const inventedAttributes = filledInGapAttributes.filter(
    gapKey => !allInputAttributes.includes(gapKey)
  );
  const gapAttributes = filledInGapAttributes.filter(
    gapKey => !inventedAttributes.includes(gapKey)
  );
  return [inventedAttributes, gapAttributes];
}
function exportApproved() {
  MultiLogger.getInstance().log('Exporting approved rows...');
  const feedGenRows = getGeneratedRows().filter(
    row => row[CONFIG.sheets.generated.cols.approval] === true
  );
  if (feedGenRows.length === 0) return;
  const [inventedAttributes, gapAttributes] =
    getGapAndInventedAttributes(feedGenRows);
  const gapAndInventedAttributes = [...gapAttributes, ...inventedAttributes];
  const outputHeader = [
    CONFIG.sheets.output.cols.id.name,
    CONFIG.sheets.output.cols.title.name,
    CONFIG.sheets.output.cols.description.name,
    ...gapAttributes,
    ...inventedAttributes.map(key => `new_${key}`),
  ];
  const rowsToWrite = [];
  for (const row of feedGenRows) {
    const resRow = [];
    resRow[CONFIG.sheets.output.cols.modificationTimestamp] =
      new Date().toISOString();
    resRow[CONFIG.sheets.output.cols.id.idx] =
      row[CONFIG.sheets.generated.cols.id];
    resRow[CONFIG.sheets.output.cols.title.idx] =
      row[CONFIG.sheets.generated.cols.titleGenerated];
    resRow[CONFIG.sheets.output.cols.description.idx] =
      row[CONFIG.sheets.generated.cols.descriptionGenerated];
    const gapAttributesAndValues = row[
      CONFIG.sheets.generated.cols.gapAttributes
    ]
      ? JSON.parse(row[CONFIG.sheets.generated.cols.gapAttributes])
      : {};
    const gapAttributesKeys = Object.keys(gapAttributesAndValues);
    const originalInput = row[CONFIG.sheets.generated.cols.originalInput]
      ? JSON.parse(row[CONFIG.sheets.generated.cols.originalInput])
      : {};
    gapAndInventedAttributes.forEach(
      (attribute, index) =>
        (resRow[CONFIG.sheets.output.cols.gapCols.start + index] =
          gapAttributesKeys.includes(attribute)
            ? gapAttributesAndValues[attribute]
            : originalInput[attribute])
    );
    rowsToWrite.push(resRow);
  }
  clearApprovedData();
  writeApprovedData(outputHeader, rowsToWrite);
}

app;
