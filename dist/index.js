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
  sheets: {
    config: {
      name: 'Config',
      fields: {
        vertexAiProjectId: {
          row: 2,
          col: 2,
        },
        vertexAiLocation: {
          row: 3,
          col: 2,
        },
        vertexAiModelId: {
          row: 4,
          col: 2,
        },
        itemIdColumnName: {
          row: 5,
          col: 2,
        },
        titleColumnName: {
          row: 6,
          col: 2,
        },
        fullPrompt: {
          row: 11,
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
  static executeWithRetry(maxRetries, delayMillies, fn) {
    let retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        return fn();
      } catch (err) {
        const error = err;
        MultiLogger.getInstance().log(`Error: ${error.message}`);
        retryCount++;
        if (delayMillies) {
          Utilities.sleep(delayMillies);
        }
      }
    }
    throw new Error(`Exceeded maximum number of retries (${maxRetries}).`);
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
  constructor(projectId, location, modelId) {
    this.projectId = projectId;
    this.location = location;
    this.modelId = modelId;
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
        parameters: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          topK: 1,
          topP: 0.8,
        },
      })
    );
    MultiLogger.getInstance().log(res);
    if (res.predictions[0].safetyAttributes.blocked) {
      throw new Error('Blocked for safety reasons.');
    } else if (!res.predictions[0].content) {
      throw new Error('No content');
    }
    return res.predictions[0].content;
  }
  static getInstance(projectId, location, modelId) {
    if (typeof this.instance === 'undefined') {
      this.instance = new VertexHelper(projectId, location, modelId);
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
const WORD_MATCH_REGEX = /(\w|\s)*\w(?=")|\w+/g;
const vertexAiProjectId = getConfigSheetValue(
  CONFIG.sheets.config.fields.vertexAiProjectId
);
const vertexAiLocation = getConfigSheetValue(
  CONFIG.sheets.config.fields.vertexAiLocation
);
const vertexAiModelId = getConfigSheetValue(
  CONFIG.sheets.config.fields.vertexAiModelId
);
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FeedGen')
    .addItem('Launch', 'showSidebar')
    .addToUi();
}
function findRowIndex(
  sheetName,
  searchValues,
  column,
  offset = 0,
  negate = false
) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet ${sheetName} not found`);
  }
  if (sheet.getLastRow() - offset + 1 === 0) {
    return 0;
  }
  const range = sheet?.getRange(
    offset,
    column,
    sheet.getLastRow() - offset + 1,
    1
  );
  if (!range) {
    throw new Error('Invalid range');
  }
  const data = range.getValues();
  const rowIndex = data.flat().findIndex(cell => {
    if (negate) {
      return !searchValues.includes(cell);
    } else {
      return searchValues.includes(cell);
    }
  });
  return rowIndex >= 0 ? rowIndex : -1;
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
    CONFIG.sheets.config.fields.itemIdColumnName
  );
  if (!inputSheet) return;
  const [headers, ...rows] = inputSheet
    .getRange(1, 1, inputSheet.getLastRow(), inputSheet.getMaxColumns())
    .getValues();
  const itemIdIndex = headers.indexOf(itemIdColumnName);
  const selectedRow = rows.filter(row => row[itemIdIndex] === itemId)[0];
  const contextObject = Object.fromEntries(
    headers.map((key, index) => [key, selectedRow[index]])
  );
  return JSON.stringify(contextObject);
}
function getNextRowIndexToBeGenerated() {
  const index = findRowIndex(
    CONFIG.sheets.generated.name,
    [Status.SUCCESS],
    CONFIG.sheets.generated.cols.status + 1,
    CONFIG.sheets.generated.startRow + 1,
    true
  );
  if (index < 0) {
    const totalGeneratedRows = SheetsService.getInstance().getTotalRows(
      CONFIG.sheets.generated.name
    );
    if (typeof totalGeneratedRows === 'undefined') {
      throw new Error('Error reading generated rows');
    }
    return totalGeneratedRows - CONFIG.sheets.generated.startRow;
  }
  return index;
}
function generateNextRow() {
  const inputSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.input.name
  );
  const generatedSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.generated.name
  );
  if (!inputSheet || !generatedSheet) return;
  const rowIndex = getNextRowIndexToBeGenerated();
  if (rowIndex >= inputSheet.getLastRow() - CONFIG.sheets.input.startRow) {
    return -1;
  }
  MultiLogger.getInstance().log(`Generating for row ${rowIndex}`);
  const row = inputSheet
    .getRange(
      CONFIG.sheets.input.startRow + 1 + rowIndex,
      1,
      1,
      inputSheet.getLastColumn()
    )
    .getValues()[0];
  try {
    const inputHeaders = SheetsService.getInstance().getHeaders(inputSheet);
    const optimizedRow = optimizeRow(inputHeaders, row);
    SheetsService.getInstance().setValuesInDefinedRange(
      CONFIG.sheets.generated.name,
      CONFIG.sheets.generated.startRow + 1 + rowIndex,
      1,
      [optimizedRow]
    );
    MultiLogger.getInstance().log(Status.SUCCESS);
  } catch (e) {
    MultiLogger.getInstance().log(`Error: ${e}`);
    row[CONFIG.sheets.generated.cols.status] = `Error: ${e}`;
    const failedRow = [];
    failedRow[CONFIG.sheets.generated.cols.status] =
      'Failed. See log for more details.';
    generatedSheet.appendRow(failedRow);
  }
  return rowIndex;
}
function getTotalInputRows() {
  const totalRows = SheetsService.getInstance().getTotalRows(
    CONFIG.sheets.input.name
  );
  return typeof totalRows === 'undefined'
    ? 0
    : totalRows - CONFIG.sheets.input.startRow;
}
function getTotalGeneratedRows() {
  const totalRows = SheetsService.getInstance().getTotalRows(
    CONFIG.sheets.generated.name
  );
  return typeof totalRows === 'undefined'
    ? 0
    : totalRows - CONFIG.sheets.generated.startRow;
}
const getGenerationMetrics = (
  origTitle,
  genTitle,
  origAttributes,
  genAttributes,
  inputWords,
  gapAttributesAndValues,
  originalInput
) => {
  const titleChanged = origTitle !== genTitle;
  const addedAttributes = Util.getSetDifference(genAttributes, origAttributes);
  const newWordsAdded = new Set();
  const genTitleWords = genTitle.match(WORD_MATCH_REGEX);
  if (genTitleWords) {
    genTitleWords
      .filter(genTitleWord => !inputWords.has(genTitleWord))
      .forEach(newWord => newWordsAdded.add(newWord));
  }
  const gapAttributesPresent = Object.keys(gapAttributesAndValues).length > 0;
  const gapAttributesInvented = Object.keys(gapAttributesAndValues).some(
    gapKey => Object.keys(originalInput).some(origKey => origKey === gapKey)
  );
  const totalScore =
    (Number(addedAttributes.length > 0) +
      Number(titleChanged) +
      Number(newWordsAdded.size === 0) +
      Number(gapAttributesPresent) +
      Number(gapAttributesInvented)) /
    5;
  return [
    totalScore.toString(),
    titleChanged.toString(),
    addedAttributes.map(attr => `<${attr}>`).join(' '),
    [...newWordsAdded].join(` ${SEPARATOR} `),
  ];
};
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
  const itemIdColumnName = getConfigSheetValue(
    CONFIG.sheets.config.fields.itemIdColumnName
  );
  const titleColumnName = getConfigSheetValue(
    CONFIG.sheets.config.fields.titleColumnName
  );
  const itemId = dataObj[itemIdColumnName];
  const origTitle = dataObj[titleColumnName];
  const res = fetchTitleGenerationData(dataObj);
  const [origTemplateRow, genCategoryRow, genTemplateRow, genAttributesRow] =
    res.split('\n');
  const genCategory = genCategoryRow.replace(CATEGORY_PROMPT_PART, '').trim();
  const genAttributes = genTemplateRow
    .replace(TEMPLATE_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter(x => x)
    .map(x => x.trim());
  const genTemplate = genAttributes.map(x => `<${x.trim()}>`).join(' ');
  const origAttributes = origTemplateRow
    .replace(ORIGINAL_TITLE_TEMPLATE_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter(x => x)
    .map(x => x.trim());
  const origTemplate = origAttributes.map(x => `<${x.trim()}>`).join(' ');
  const genAttributeValues = genAttributesRow
    .replace(ATTRIBUTES_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter(x => x)
    .map(x => x.trim());
  const titleFeatures = [];
  const gapAttributesAndValues = {};
  genAttributes.forEach((attribute, index) => {
    if (!dataObj[attribute]) {
      gapAttributesAndValues[attribute] = genAttributeValues[index];
    }
    titleFeatures.push(dataObj[attribute] || genAttributeValues[index]);
  });
  const genTitle = titleFeatures.join(' ');
  const inputWords = new Set();
  Object.values(dataObj).forEach(value => {
    const match = new String(value).match(WORD_MATCH_REGEX);
    if (match) {
      match.forEach(word => inputWords.add(word));
    }
  });
  const generationMetrics = getGenerationMetrics(
    origTitle,
    genTitle,
    new Set(origAttributes),
    new Set(genAttributes),
    inputWords,
    gapAttributesAndValues,
    dataObj
  );
  const row = [];
  row[CONFIG.sheets.generated.cols.approval] = false;
  row[CONFIG.sheets.generated.cols.status] = 'Success';
  row[CONFIG.sheets.generated.cols.id] = itemId;
  row[CONFIG.sheets.generated.cols.titleOriginal] = origTitle;
  row[CONFIG.sheets.generated.cols.titleGenerated] = genTitle;
  return [
    ...row,
    origTemplate,
    genTemplate,
    genCategory,
    genAttributeValues.join(', '),
    ...generationMetrics,
    Object.keys(gapAttributesAndValues).length > 0
      ? JSON.stringify(gapAttributesAndValues)
      : '',
    res,
    JSON.stringify(dataObj),
  ];
}
function fetchTitleGenerationData(data) {
  const dataContext = `Context: ${JSON.stringify(data)}\n\n`;
  const prompt =
    getConfigSheetValue(CONFIG.sheets.config.fields.fullPrompt) + dataContext;
  const res = Util.executeWithRetry(CONFIG.vertexAi.maxRetries, 0, () =>
    VertexHelper.getInstance(
      vertexAiProjectId,
      vertexAiLocation,
      vertexAiModelId
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
    CONFIG.sheets.output.cols.gapCols.start + 1,
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
    CONFIG.sheets.output.cols.gapCols.start + 1
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
      index + 1 + 1
    )
      ? row[CONFIG.sheets.generated.cols.approval]
      : true;
    return row;
  });
  writeGeneratedRows(rows);
  MultiLogger.getInstance().log('Writing approved rows...');
}
function exportApproved() {
  MultiLogger.getInstance().log('Exporting approved rows...');
  const feedGenRows = getGeneratedRows().filter(row => {
    return row[CONFIG.sheets.generated.cols.approval] === true;
  });
  const filledInGapAttributes = [
    ...new Set(
      feedGenRows
        .map(row =>
          Object.keys(
            JSON.parse(row[CONFIG.sheets.generated.cols.gapAttributes])
          )
        )
        .flat(1)
    ),
  ];
  const rowsToWrite = [];
  for (const row of feedGenRows) {
    const resRow = [];
    resRow[CONFIG.sheets.output.cols.id] = row[CONFIG.sheets.generated.cols.id];
    resRow[CONFIG.sheets.output.cols.title] =
      row[CONFIG.sheets.generated.cols.approval] === true
        ? row[CONFIG.sheets.generated.cols.titleGenerated]
        : row[CONFIG.sheets.generated.cols.titleOriginal];
    resRow[CONFIG.sheets.output.cols.modificationTimestamp] =
      new Date().toISOString();
    const gapAttributesAndValues = JSON.parse(
      row[CONFIG.sheets.generated.cols.gapAttributes]
    );
    const gapAttributesKeys = Object.keys(gapAttributesAndValues);
    const originalInput = JSON.parse(
      row[CONFIG.sheets.generated.cols.originalInput]
    );
    filledInGapAttributes.forEach(
      (attribute, index) =>
        (resRow[CONFIG.sheets.output.cols.gapCols.start + index] =
          gapAttributesKeys.includes(attribute)
            ? gapAttributesAndValues[attribute]
            : originalInput[attribute])
    );
    rowsToWrite.push(resRow);
  }
  clearApprovedData();
  writeApprovedData(filledInGapAttributes, rowsToWrite);
}

app;
