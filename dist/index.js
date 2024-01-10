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
    description: {
      fullPrompt: {
        row: 10,
        col: 2,
      },
      minApprovalScore: {
        row: 8,
        col: 6,
      },
      usePageLinkData: {
        row: 8,
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
    title: {
      fullPrompt: {
        row: 16,
        col: 2,
      },
      minApprovalScore: {
        row: 14,
        col: 6,
      },
      usePageLinkData: {
        row: 14,
        col: 8,
      },
      preferGeneratedValues: {
        row: 19,
        col: 2,
      },
      useLlmTitles: {
        row: 20,
        col: 2,
      },
      allowedWords: {
        row: 21,
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
    quotaLimitDelay: 30 * 1000,
  },
  caching: {
    keyPrefix: 'PAGEINFO_',
    defaultExpiration: 60,
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
  clearCellContents(notation, sheetName) {
    const sheet = sheetName
      ? this.getSpreadsheet().getSheetByName(sheetName)
      : this.getSpreadsheet().getActiveSheet();
    if (!sheet) return;
    sheet.getRange(notation).clearContent();
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
  static fetchHtmlContent(url) {
    try {
      const response = UrlFetchApp.fetch(url);
      if (response.getResponseCode() === 200) {
        return Util.extractTextFromHtml(response.getContentText());
      }
    } catch (e) {
      MultiLogger.getInstance().log(String(e));
    }
    return '';
  }
  static extractTextFromHtml(html) {
    const regex_replace_head = /<head.*<\/head>/gs;
    const regex_replace_script = /<script[^<\/script].*/g;
    const regex_replace_svg = /<svg[^<\/svg].*/g;
    const regex_replace_path = /<path[^<\/path].*/g;
    const regex_replace_iframe = /<iframe[^<\/iframe].*/g;
    const regex_replace_anchor = /<a [^<\/a].*/g;
    const regex_extract_span = /<span[^<\/span](.*)/g;
    const regex_extract_p = /<p[^<\/p](.*)/g;
    const regex_extract_text = />(?<content>.*)</s;
    const sanitizedHtml = html
      .replace(regex_replace_head, '')
      .replaceAll(regex_replace_script, '')
      .replaceAll(regex_replace_svg, '')
      .replaceAll(regex_replace_path, '')
      .replaceAll(regex_replace_iframe, '')
      .replaceAll(regex_replace_anchor, '');
    const extractedHtml = [
      ...(sanitizedHtml.match(regex_extract_span) ?? []),
      ...(sanitizedHtml.match(regex_extract_p) ?? []),
    ];
    const lines = [];
    for (const line of extractedHtml) {
      const matches = line.match(regex_extract_text);
      if (matches && matches.groups && matches.groups.content) {
        lines.push(matches.groups.content);
      }
    }
    return lines.join(' ');
  }
}

var SafetyThreshold;
(function (SafetyThreshold) {
  SafetyThreshold[(SafetyThreshold['HARM_BLOCK_THRESHOLD_UNSPECIFIED'] = 0)] =
    'HARM_BLOCK_THRESHOLD_UNSPECIFIED';
  SafetyThreshold[(SafetyThreshold['BLOCK_LOW_AND_ABOVE'] = 1)] =
    'BLOCK_LOW_AND_ABOVE';
  SafetyThreshold[(SafetyThreshold['BLOCK_MEDIUM_AND_ABOVE'] = 2)] =
    'BLOCK_MEDIUM_AND_ABOVE';
  SafetyThreshold[(SafetyThreshold['BLOCK_ONLY_HIGH'] = 3)] = 'BLOCK_ONLY_HIGH';
  SafetyThreshold[(SafetyThreshold['BLOCK_NONE'] = 4)] = 'BLOCK_NONE';
})(SafetyThreshold || (SafetyThreshold = {}));
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
  generate(model, prompt, imageUrl) {
    if (model.startsWith('gemini')) {
      return this.multimodalGenerate(prompt, imageUrl);
    }
    return this.predict(prompt);
  }
  predict(prompt) {
    MultiLogger.getInstance().log(`Prompt: ${prompt}`);
    const predictEndpoint = `https://${CONFIG.vertexAi.location}-${CONFIG.vertexAi.endpoint}/v1/projects/${this.projectId}/locations/${CONFIG.vertexAi.location}/publishers/google/models/${this.modelId}:predict`;
    const res = this.fetchJson(
      predictEndpoint,
      this.addAuth({
        instances: [{ prompt: prompt }],
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
  multimodalGenerate(prompt, imageUrl) {
    const message =
      `Prompt: ${prompt}` + (imageUrl ? `\nImage URL: ${imageUrl}` : '');
    MultiLogger.getInstance().log(message);
    const endpoint = `https://${CONFIG.vertexAi.location}-${CONFIG.vertexAi.endpoint}/v1/projects/${this.projectId}/locations/${CONFIG.vertexAi.location}/publishers/google/models/${this.modelId}:streamGenerateContent`;
    const request = {
      contents: {
        role: 'user',
        parts: [{ text: prompt }],
      },
      generationConfig: this.modelParams,
      safetySettings: [
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: SafetyThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: SafetyThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: SafetyThreshold.BLOCK_ONLY_HIGH,
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: SafetyThreshold.BLOCK_ONLY_HIGH,
        },
      ],
    };
    if (imageUrl) {
      if (imageUrl.startsWith('gs://')) {
        request.contents.parts.push({
          fileData: { mimeType: 'image/png', fileUri: imageUrl },
        });
      } else {
        const [imageData, mime] = this.downloadImage(imageUrl);
        if (imageData !== null && mime !== null) {
          request.contents.parts.push({
            inlineData: { mimeType: mime, data: imageData },
          });
        }
      }
    }
    MultiLogger.getInstance().log(request);
    const res = this.fetchJson(endpoint, this.addAuth(request));
    MultiLogger.getInstance().log(res);
    const content = [];
    res.forEach(candidate => {
      if ('SAFETY' === candidate.candidates[0].finishReason) {
        throw new Error(
          `Request was blocked as it triggered API safety filters. ${message}`
        );
      }
      content.push(candidate.candidates[0].content.parts[0].text);
    });
    const contentText = content.join('');
    if (!contentText) {
      throw new Error(JSON.stringify(res));
    }
    return contentText;
  }
  downloadImage(imageUrl) {
    let [imageData, mime] = [null, null];
    const response = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      const blob = response.getBlob();
      mime = blob.getContentType();
      imageData = Utilities.base64Encode(blob.getBytes());
    }
    return [imageData, mime];
  }
  static getInstance(projectId, modelId, modelParams) {
    if (typeof this.instance === 'undefined') {
      this.instance = new VertexHelper(projectId, modelId, modelParams);
    }
    return this.instance;
  }
}

const app = null;
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
function onEdit(event) {
  const sheet = event.source.getActiveSheet();
  const range = event.range;
  const isModelFamilyCell =
    sheet.getName() === CONFIG.sheets.config.name &&
    range.getA1Notation() ===
      CONFIG.userSettings.vertexAi.languageModelFamily.notation;
  const isModelIdCell =
    sheet.getName() === CONFIG.sheets.config.name &&
    range.getA1Notation() ===
      CONFIG.userSettings.vertexAi.languageModelId.notation;
  const useImageUnderstanding = getConfigSheetValue(
    CONFIG.userSettings.feed.imageUnderstanding
  );
  if (isModelFamilyCell) {
    SheetsService.getInstance().clearCellContents(
      CONFIG.userSettings.vertexAi.languageModelId.notation
    );
  }
  if (
    isModelIdCell &&
    range.getValue() !== 'gemini-pro-vision' &&
    useImageUnderstanding
  ) {
    SheetsService.getInstance().clearCellContents(
      CONFIG.userSettings.feed.imageUnderstanding.notation
    );
  }
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
  const imageUrl =
    dataObj[getConfigSheetValue(CONFIG.userSettings.feed.imageColumnName)];
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
    res = fetchTitleGenerationData(
      dataObj,
      getConfigSheetValue(CONFIG.userSettings.feed.imageUnderstanding)
        ? imageUrl
        : null
    );
    const regexStr =
      '^.*product attribute keys in original title:(?<origTemplateRow>.*)' +
      '^product category:(?<genCategoryRow>.*)' +
      '^product attribute keys:(?<genTemplateRow>.*)' +
      '^product attribute values:(?<genAttributesRow>.*)';
    const replacedKeysRegexStr = '^replaced keys:(?<replacedKeysRow>.*)';
    const generatedTitleRegexStr = '^generated title:(?<genTitleRow>.*)';
    const completeRegex = new RegExp(
      regexStr + replacedKeysRegexStr + generatedTitleRegexStr + '$',
      'ms'
    );
    const noReplacedKeysRegex = new RegExp(
      regexStr + generatedTitleRegexStr + '$',
      'ms'
    );
    const matches = res.match(completeRegex) ?? res.match(noReplacedKeysRegex);
    if (!matches || !matches.groups) {
      throw new Error(
        `Received an incomplete title response from The API.\nResponse: ${res}`
      );
    }
    const [
      origTemplateRow,
      genCategoryRow,
      genTemplateRow,
      genAttributesRow,
      replacedKeysRow,
      genTitleRow,
    ] = [
      matches.groups['origTemplateRow'],
      matches.groups['genCategoryRow'],
      matches.groups['genTemplateRow'],
      matches.groups['genAttributesRow'],
      matches.groups['replacedKeysRow'],
      matches.groups['genTitleRow'],
    ];
    const replacedKeys = replacedKeysRow
      ? String(replacedKeysRow)
          .trim()
          .split(',')
          .filter(Boolean)
          .map(x => x.toLowerCase().trim())
      : [];
    genCategory = String(genCategoryRow).trim();
    const genAttributes = String(genTemplateRow)
      .trim()
      .split(SEPARATOR)
      .filter(Boolean)
      .map(x => x.trim());
    const origAttributes = String(origTemplateRow)
      .trim()
      .split(SEPARATOR)
      .filter(Boolean)
      .map(x => x.trim());
    const genAttributeValues = String(genAttributesRow)
      .trim()
      .split(SEPARATOR)
      .filter(Boolean)
      .map(x => x.trim());
    const [preferGeneratedValues, useLlmTitles, allowedWords] = [
      getConfigSheetValue(CONFIG.userSettings.title.preferGeneratedValues),
      getConfigSheetValue(CONFIG.userSettings.title.useLlmTitles),
      String(getConfigSheetValue(CONFIG.userSettings.title.allowedWords))
        .split(',')
        .filter(Boolean)
        .map(word => word.trim().toLowerCase()),
    ];
    const titleFeatures = [];
    const validGenAttributes = [];
    const extraFeatures = new Set();
    for (const [index, attribute] of genAttributes.entries()) {
      if (
        (!dataObj[attribute] &&
          genAttributeValues[index] &&
          (!origAttributes.includes(attribute) ||
            Object.keys(dataObj).includes(attribute))) ||
        replacedKeys.includes(attribute.toLowerCase())
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
          if (
            attribute === 'Image Features' ||
            attribute === 'Website Features'
          ) {
            const extraFeaturesMatches = value.match(WORD_MATCH_REGEX);
            if (extraFeaturesMatches) {
              extraFeaturesMatches.forEach(word =>
                extraFeatures.add(word.toLowerCase())
              );
            }
          }
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
    if (useLlmTitles) {
      genTitle = String(genTitleRow).trim();
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
    extraFeatures.forEach(word => inputWords.add(word));
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
    const response = fetchDescriptionGenerationData(
      dataObj,
      genTitle,
      getConfigSheetValue(CONFIG.userSettings.feed.imageUnderstanding)
        ? imageUrl
        : null
    );
    genDescription = response.description;
    genDescriptionScore = response.score;
    genDescriptionEvaluation = response.evaluation;
    genDescriptionApproval =
      genDescriptionScore >=
      parseFloat(
        getConfigSheetValue(CONFIG.userSettings.description.minApprovalScore)
      );
  }
  const status =
    genTitle.length <= TITLE_MAX_LENGTH &&
    genTitle.length > 0 &&
    genDescription.length <= DESCRIPTION_MAX_LENGTH &&
    genDescription.length > 0
      ? Status.SUCCESS
      : Status.NON_COMPLIANT;
  const score = status === Status.NON_COMPLIANT ? String(-1) : totalScore;
  const approval =
    Number(score) >=
      parseFloat(
        getConfigSheetValue(CONFIG.userSettings.title.minApprovalScore)
      ) && genDescriptionApproval;
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
    `${res.trim()}\nProduct description: ${genDescription}\nDescription evaluation: Score: ${genDescriptionScore}\n${genDescriptionEvaluation}`,
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
function fetchLandingPageInfo(data, useLandingPageInfo) {
  if (!useLandingPageInfo) {
    return '';
  }
  const itemId =
    data[getConfigSheetValue(CONFIG.userSettings.feed.itemIdColumnName)];
  const cachedHtml = CacheService.getScriptCache().get(
    `${CONFIG.caching.keyPrefix}${itemId}`
  );
  if (cachedHtml) {
    console.log(`Fetching cached landing page for ${itemId}`);
    return cachedHtml;
  }
  let landingPageInfo = '';
  const pageLink =
    data[getConfigSheetValue(CONFIG.userSettings.feed.pageLinkColumnName)];
  if (pageLink) {
    landingPageInfo = Util.fetchHtmlContent(String(pageLink));
  }
  if (landingPageInfo) {
    landingPageInfo = `Website: ${landingPageInfo}\n\n`;
    console.log(`Adding landing page to cache for ${itemId}`);
    CacheService.getScriptCache().put(
      `${CONFIG.caching.keyPrefix}${itemId}`,
      landingPageInfo,
      CONFIG.caching.defaultExpiration
    );
  }
  return landingPageInfo;
}
function fetchTitleGenerationData(data, imageUrl) {
  const dataContext = `Context: ${JSON.stringify(data)}\n\n`;
  const landingPageInfo = fetchLandingPageInfo(
    data,
    getConfigSheetValue(CONFIG.userSettings.title.usePageLinkData)
  );
  let prompt =
    getConfigSheetValue(CONFIG.userSettings.title.fullPrompt) + dataContext;
  if (landingPageInfo) {
    prompt += landingPageInfo;
  }
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
    }).generate(
      getConfigSheetValue(CONFIG.userSettings.vertexAi.languageModelId),
      prompt,
      imageUrl
    )
  );
  return res;
}
function fetchDescriptionGenerationData(data, generatedTitle, imageUrl) {
  const modifiedData = Object.assign(
    {
      'Generated Title': generatedTitle,
    },
    data
  );
  const dataContext = `Context: ${JSON.stringify(modifiedData)}\n\n`;
  let prompt =
    getConfigSheetValue(CONFIG.userSettings.description.fullPrompt) +
    dataContext;
  const landingPageInfo = fetchLandingPageInfo(
    data,
    getConfigSheetValue(CONFIG.userSettings.description.usePageLinkData)
  );
  if (landingPageInfo) {
    prompt += landingPageInfo;
  }
  if (isErroneousPrompt(prompt)) {
    throw new Error(
      'Could not read the description prompt from the "Config" sheet. ' +
        'Please refresh the sheet by adding a new row before the ' +
        '"Description Prompt Settings" section then immediately deleting it.'
    );
  }
  const res = Util.executeWithRetry(CONFIG.vertexAi.maxRetries, () =>
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
    }).generate(
      getConfigSheetValue(CONFIG.userSettings.vertexAi.languageModelId),
      prompt,
      imageUrl
    )
  );
  const regex =
    /^.*description:(?<description>.*)^score:(?<score>.*)^reasoning:(?<evaluation>.*)$/ms;
  const matches = res.match(regex);
  if (!matches) {
    throw new Error(
      `Received an incomplete description response from the API. Response: ${res}`
    );
  }
  let { description, score, evaluation } = matches.groups;
  description = String(description).trim();
  score = String(score).trim();
  evaluation = String(evaluation).trim();
  return {
    description: description,
    score: parseFloat(score),
    evaluation: evaluation,
  };
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
