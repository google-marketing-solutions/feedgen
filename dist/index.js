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
  Status['NON_COMPLIANT'] = 'Failed compliance checks';
})(Status || (Status = {}));
const CONFIG = {
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
      generateTitles: {
        row: 2,
        col: 5,
      },
      generateDescriptions: {
        row: 2,
        col: 6,
      },
      evaluateDescriptions: {
        row: 2,
        col: 7,
      },
    },
    vertexAi: {
      gcpProjectId: {
        row: 5,
        col: 2,
      },
      languageModelId: {
        row: 5,
        col: 3,
      },
    },
    description: {
      fullPrompt: {
        row: 10,
        col: 2,
      },
      keyword: {
        row: 30,
        col: 8,
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
    descriptionValidation: {
      fullPrompt: {
        row: 16,
        col: 2,
      },
      minScore: {
        row: 14,
        col: 7,
      },
      keyword: {
        row: 14,
        col: 6,
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
    title: {
      fullPrompt: {
        row: 22,
        col: 2,
      },
      preferGeneratedValues: {
        row: 25,
        col: 2,
      },
      allowedWords: {
        row: 26,
        col: 2,
      },
      modelParameters: {
        temperature: {
          row: 20,
          col: 2,
        },
        maxOutputTokens: {
          row: 20,
          col: 3,
        },
        topK: {
          row: 20,
          col: 4,
        },
        topP: {
          row: 20,
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
        fullApiResponse: 20,
        originalInput: 21,
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
  constructor(projectId, modelId, modelParams) {
    this.projectId = projectId;
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
        `Waiting ${
          Number(CONFIG.vertexAi.quotaLimitDelay) / 1000
        }s as API quota limit has been reached...`
      );
      Utilities.sleep(CONFIG.vertexAi.quotaLimitDelay);
      return this.fetchJson(url, params);
    }
    return JSON.parse(response.getContentText());
  }
  predict(prompt) {
    MultiLogger.getInstance().log(`Prompt: ${prompt}`);
    const predictEndpoint = `https://${CONFIG.vertexAi.location}-${CONFIG.vertexAi.endpoint}/v1/projects/${this.projectId}/locations/${CONFIG.vertexAi.location}/publishers/google/models/${this.modelId}:predict`;
    const res = this.fetchJson(
      predictEndpoint,
      this.addAuth({
        instances: [{ content: prompt }],
        parameters: this.modelParams,
      })
    );
    MultiLogger.getInstance().log(res);
    if (res.predictions) {
      if (res.predictions[0].safetyAttributes.blocked) {
        throw new Error(
          `Request was blocked as it triggered API safety filters. Prompt: ${prompt}`
        );
      } else if (!res.predictions[0].content) {
        throw new Error(`Received empty response from API. Prompt: ${prompt}`);
      } else {
        return res.predictions[0].content;
      }
    }
    throw new Error(JSON.stringify(res));
  }
  static getInstance(projectId, modelId, modelParams) {
    if (typeof this.instance === 'undefined') {
      this.instance = new VertexHelper(projectId, modelId, modelParams);
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
const WORD_MATCH_REGEX = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g;
const TITLE_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 5000;
const [vertexAiGcpProjectId, vertexAiLanguageModelId] = [
  getConfigSheetValue(CONFIG.userSettings.vertexAi.gcpProjectId),
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
function FEEDGEN_CREATE_CONTEXT_JSON(itemId) {
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
function getUnprocessedInputRows(filterProcessed = true) {
  refreshConfigSheet();
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
      row =>
        String(row[CONFIG.sheets.generated.cols.status]) === Status.SUCCESS ||
        String(row[CONFIG.sheets.generated.cols.status]) ===
          Status.NON_COMPLIANT
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
  const addedAttributes = Util.getSetDifference(genAttributes, origAttributes);
  const removedAttributes = Util.getSetDifference(
    origAttributes,
    genAttributes
  );
  const newWordsAdded = new Set();
  const genTitleWords = new Set();
  const genTitleWordsMatcher = String(genTitle)
    .replaceAll("'s", '')
    .match(WORD_MATCH_REGEX);
  if (genTitleWordsMatcher) {
    genTitleWordsMatcher.forEach(word => genTitleWords.add(word.toLowerCase()));
    genTitleWordsMatcher
      .filter(word => !inputWords.has(word.toLowerCase()))
      .forEach(word => newWordsAdded.add(word));
  }
  const wordsRemoved = new Set();
  const origTitleWordsMatcher = String(origTitle)
    .replaceAll("'s", '')
    .match(WORD_MATCH_REGEX);
  if (origTitleWordsMatcher) {
    origTitleWordsMatcher
      .filter(
        word =>
          !genTitleWords.has(word.toLowerCase()) &&
          !genTitle.replaceAll("'", '').includes(word)
      )
      .forEach(word => wordsRemoved.add(word));
  }
  const gapAttributesPresent = Object.keys(gapAttributesAndValues).filter(
    gapKey => gapKey in originalInput
  );
  const gapAttributesInvented = Object.keys(gapAttributesAndValues).filter(
    gapKey => !(gapKey in originalInput)
  );
  const filledOrInventedFeedAttributes =
    gapAttributesPresent.length > 0 || gapAttributesInvented.length > 0;
  const addedTitleAttributes = addedAttributes.filter(Boolean).length > 0;
  let score = 0;
  if (newWordsAdded.size > 0) {
    score = -1;
  } else if (wordsRemoved.size > 0) {
    score = -0.5;
  } else {
    score =
      (Number(filledOrInventedFeedAttributes) + Number(addedTitleAttributes)) /
      2;
  }
  return {
    totalScore: score.toString(),
    titleChanged: String(score !== 0),
    addedAttributes: addedAttributes
      .filter(Boolean)
      .map(attr => `<${attr}>`)
      .join(' '),
    removedAttributes: removedAttributes
      .filter(Boolean)
      .map(attr => `<${attr}>`)
      .join(' '),
    newWordsAdded: [...newWordsAdded].join(` ${SEPARATOR} `),
    wordsRemoved: [...wordsRemoved].join(` ${SEPARATOR} `),
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
  let genTitle = origTitle;
  const gapAttributesAndValues = {};
  let totalScore = '1';
  let titleChanged = 'FALSE';
  let addedAttributes = '[]';
  let removedAttributes = '[]';
  let newWordsAdded = '0';
  let wordsRemoved = '0';
  let origTemplate = '';
  let genTemplate = '';
  let genCategory = '';
  let res = 'N/A';
  if (getConfigSheetValue(CONFIG.userSettings.feed.generateTitles)) {
    res = fetchTitleGenerationData(dataObj);
    const [origTemplateRow, genCategoryRow, genTemplateRow, genAttributesRow] =
      res.split('\n');
    genCategory = genCategoryRow.replace(CATEGORY_PROMPT_PART, '').trim();
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
    const [preferGeneratedValues, allowedWords] = [
      getConfigSheetValue(CONFIG.userSettings.title.preferGeneratedValues),
      String(getConfigSheetValue(CONFIG.userSettings.title.allowedWords))
        .split(',')
        .filter(Boolean)
        .map(word => word.trim().toLowerCase()),
    ];
    const titleFeatures = [];
    const validGenAttributes = [];
    for (const [index, attribute] of genAttributes.entries()) {
      if (
        !dataObj[attribute] &&
        genAttributeValues[index] &&
        (!origAttributes.includes(attribute) ||
          Object.keys(dataObj).includes(attribute))
      ) {
        const value = removeEmptyAttributeValues(
          attribute,
          genAttributeValues[index],
          true
        ).trim();
        if (value) {
          gapAttributesAndValues[attribute] = value;
        }
      }
      let value = preferGeneratedValues
        ? genAttributeValues[index]
        : typeof dataObj[attribute] !== 'undefined' &&
          String(dataObj[attribute]).length
        ? dataObj[attribute]
        : genAttributeValues[index];
      if (typeof value !== 'undefined' && String(value).trim()) {
        value = removeEmptyAttributeValues(attribute, value).trim();
        if (value) {
          validGenAttributes.push(attribute);
          titleFeatures.push(value);
        }
      }
    }
    origTemplate = origAttributes
      .filter(Boolean)
      .map(x => `<${x}>`)
      .join(' ');
    genTemplate = validGenAttributes
      .filter(Boolean)
      .map(x => `<${x}>`)
      .join(' ');
    genTitle = titleFeatures.join(' ');
    if (genTitle.endsWith(',')) {
      genTitle = genTitle.slice(0, -1);
    }
    const inputWords = new Set();
    for (const [key, value] of Object.entries(dataObj)) {
      const keyAndValue = [
        String(key),
        String(value).replaceAll("'s", ''),
      ].join(' ');
      const match = keyAndValue.match(WORD_MATCH_REGEX);
      if (match) {
        match.forEach(word => inputWords.add(word.toLowerCase()));
      }
    }
    allowedWords.forEach(word => inputWords.add(word));
    const metrics = getGenerationMetrics(
      origTitle,
      genTitle,
      new Set(origAttributes),
      new Set(validGenAttributes),
      inputWords,
      gapAttributesAndValues,
      dataObj
    );
    totalScore = metrics.totalScore;
    titleChanged = metrics.titleChanged;
    addedAttributes = metrics.addedAttributes;
    removedAttributes = metrics.removedAttributes;
    newWordsAdded = metrics.newWordsAdded;
    wordsRemoved = metrics.wordsRemoved;
  }
  let genDescription = origDescription;
  let genDescriptionScore = -1;
  let genDescriptionEvaluation = 'No Evaluation';
  let genDescriptionApproval = true;
  if (getConfigSheetValue(CONFIG.userSettings.feed.generateDescriptions)) {
    try {
      genDescriptionApproval = false;
      genDescription = fetchDescriptionGenerationData(dataObj, genTitle);
      if (getConfigSheetValue(CONFIG.userSettings.feed.evaluateDescriptions)) {
        const minScore = parseFloat(
          getConfigSheetValue(
            CONFIG.userSettings.descriptionValidation.minScore
          )
        );
        const evaluationResponse = evaluateGeneratedDescription(
          dataObj,
          genTitle,
          genDescription
        );
        genDescriptionScore = evaluationResponse.score;
        genDescriptionEvaluation = evaluationResponse.response;
        if (genDescriptionScore >= minScore) {
          genDescriptionApproval = true;
        }
      }
    } catch (e) {
      MultiLogger.getInstance().log(String(e));
    }
  }
  const status =
    genTitle.length <= TITLE_MAX_LENGTH &&
    genTitle.length > 0 &&
    genDescription.length <= DESCRIPTION_MAX_LENGTH &&
    genDescription.length > 0
      ? Status.SUCCESS
      : Status.NON_COMPLIANT;
  const score = status === Status.NON_COMPLIANT ? String(-1) : totalScore;
  const approval = Number(score) >= 0 && genDescriptionApproval;
  return [
    approval,
    status,
    itemId,
    genTitle,
    origTitle,
    score,
    titleChanged,
    String(genTitle.length),
    newWordsAdded,
    wordsRemoved,
    origTemplate,
    genTemplate,
    addedAttributes,
    removedAttributes,
    Object.keys(gapAttributesAndValues).length > 0
      ? JSON.stringify(gapAttributesAndValues)
      : '',
    genDescription,
    origDescription,
    genDescription !== origDescription,
    String(genDescription.length),
    genDescriptionScore,
    genCategory,
    `${res}\nProduct description: ${genDescription}\nDescripion evaluation: ${genDescriptionEvaluation}`,
    JSON.stringify(dataObj),
  ];
}
function removeEmptyAttributeValues(key, value, removeTrailingComma = false) {
  const val = String(value).trim();
  if (
    String(key).toLowerCase() === val.toLowerCase() ||
    (val.endsWith(',') &&
      String(key).toLowerCase() === val.slice(0, -1).trim().toLowerCase())
  ) {
    return '';
  }
  if (val === ',') {
    return '';
  }
  return removeTrailingComma && val.endsWith(',') ? val.slice(0, -1) : val;
}
function isErroneousPrompt(prompt) {
  return prompt.startsWith(CONFIG.sheets.formulaError);
}
function refreshConfigSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    CONFIG.sheets.config.name
  );
  const prompt = getConfigSheetValue(CONFIG.userSettings.title.fullPrompt);
  if (isErroneousPrompt(prompt)) {
    MultiLogger.getInstance().log(
      'Manually refreshing Config sheet by adding and deleting a row...'
    );
    sheet?.insertRowBefore(1);
    SpreadsheetApp.flush();
    Utilities.sleep(5000);
    sheet?.deleteRow(1);
    SpreadsheetApp.flush();
    Utilities.sleep(5000);
  }
}
function fetchTitleGenerationData(data) {
  const dataContext = `Context: ${JSON.stringify(data)}\n\n`;
  const prompt =
    getConfigSheetValue(CONFIG.userSettings.title.fullPrompt) + dataContext;
  if (isErroneousPrompt(prompt)) {
    throw new Error(
      'Could not read the title prompt from the "Config" sheet. ' +
        'Please refresh the sheet by adding a new row before the ' +
        '"Title Prompt Settings" section then immediately deleting it.'
    );
  }
  const res = Util.executeWithRetry(CONFIG.vertexAi.maxRetries, () =>
    VertexHelper.getInstance(vertexAiGcpProjectId, vertexAiLanguageModelId, {
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
    }).predict(prompt)
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
  if (isErroneousPrompt(prompt)) {
    throw new Error(
      'Could not read the description prompt from the "Config" sheet. ' +
        'Please refresh the sheet by adding a new row before the ' +
        '"Description Prompt Settings" section then immediately deleting it.'
    );
  }
  let res = Util.executeWithRetry(CONFIG.vertexAi.maxRetries, () =>
    VertexHelper.getInstance(vertexAiGcpProjectId, vertexAiLanguageModelId, {
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
    }).predict(prompt)
  );
  const descriptionKeywordPrefix =
    getConfigSheetValue(CONFIG.userSettings.description.keyword) + ':';
  res = res.replace(descriptionKeywordPrefix, '').trim();
  return res;
}
function evaluateGeneratedDescription(
  data,
  generatedTitle,
  generatedDescription
) {
  const modifiedData = Object.assign(
    {
      'Generated Title': generatedTitle,
      'Generated Description': generatedDescription,
    },
    data
  );
  const dataContext = `Context: ${JSON.stringify(modifiedData)}\n\n`;
  const prompt =
    getConfigSheetValue(CONFIG.userSettings.descriptionValidation.fullPrompt) +
    dataContext;
  if (isErroneousPrompt(prompt)) {
    throw new Error(
      'Could not read the Description Evaluation prompt from the "Config" sheet. ' +
        'Please refresh the sheet by adding a new row before the ' +
        '"Description Evaluation Settings" section then immediately deleting it.'
    );
  }
  const res = Util.executeWithRetry(CONFIG.vertexAi.maxRetries, () =>
    VertexHelper.getInstance(vertexAiGcpProjectId, vertexAiLanguageModelId, {
      temperature: Number(
        getConfigSheetValue(
          CONFIG.userSettings.descriptionValidation.modelParameters.temperature
        )
      ),
      maxOutputTokens: Number(
        getConfigSheetValue(
          CONFIG.userSettings.descriptionValidation.modelParameters
            .maxOutputTokens
        )
      ),
      topK: Number(
        getConfigSheetValue(
          CONFIG.userSettings.descriptionValidation.modelParameters.topK
        )
      ),
      topP: Number(
        getConfigSheetValue(
          CONFIG.userSettings.descriptionValidation.modelParameters.topP
        )
      ),
    }).predict(prompt)
  );
  let score = res.split('\n')[0];
  const scorePrefix =
    getConfigSheetValue(CONFIG.userSettings.descriptionValidation.keyword) +
    ':';
  score = score
    .toLowerCase()
    .replace(scorePrefix.toLowerCase(), '')
    .trim()
    .replace(':', '')
    .trim();
  return { score: parseFloat(score), response: res };
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
  const rows = getGeneratedRows().filter(row => row.join('').length > 0);
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
    ...inventedAttributes.map(
      key => `${CONFIG.sheets.output.newAttributesPrefix}${key}`
    ),
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
    gapAndInventedAttributes.forEach(
      (attribute, index) =>
        (resRow[CONFIG.sheets.output.cols.gapCols.start + index] =
          gapAttributesKeys.includes(attribute)
            ? gapAttributesAndValues[attribute]
            : '')
    );
    rowsToWrite.push(resRow);
  }
  clearApprovedData();
  writeApprovedData(outputHeader, rowsToWrite);
}

app;
