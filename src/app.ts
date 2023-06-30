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

//@OnlyCurrentDoc
/* eslint-disable no-useless-escape */

import { CONFIG, Status } from './config';
import { MultiLogger } from './helpers/logger';
import { SheetsService } from './helpers/sheets';
import { Util } from './helpers/util';
import { VertexHelper } from './helpers/vertex';

/**
 * This is required to avoid treeshaking this file.
 * As long as anything from a file is being used, the entire file
 * is being kept.
 */
export const app = null;

const ORIGINAL_TITLE_TEMPLATE_PROMPT_PART =
  'product attribute keys in original title:';
const CATEGORY_PROMPT_PART = 'product category:';
const TEMPLATE_PROMPT_PART = 'product attribute keys:';
const ATTRIBUTES_PROMPT_PART = 'product attribute values:';
const SEPARATOR = '|';
const WORD_MATCH_REGEX = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g;

const TITLE_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 5000;

const [
  vertexAiGcpProjectId,
  vertexAiGcpProjectLocation,
  vertexAiLanguageModelId,
] = [
  getConfigSheetValue(CONFIG.userSettings.vertexAi.gcpProjectId),
  getConfigSheetValue(CONFIG.userSettings.vertexAi.gcpProjectLocation),
  getConfigSheetValue(CONFIG.userSettings.vertexAi.languageModelId),
];

/**
 * Handle 'onOpen' Sheets event to show menu.
 */
export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FeedGen')
    .addItem('Launch', 'showSidebar')
    .addToUi();
}

/**
 * Initialises context triggering Apps Script auth if not already done.
 */
export function init() {
  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(CONFIG.sheets.config.name)
    ?.getDataRange();
}

/**
 * Open sidebar.
 */
export function showSidebar() {
  const html = HtmlService.createTemplateFromFile('static/index').evaluate();
  html.setTitle('FeedGen');
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Sheets utility function to fetch JSON'd context from input feed for few-shot
 * examples.
 */
export function FEEDGEN_CREATE_CONTEXT_JSON(itemId: string) {
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
    headers
      .filter((key: string) => key)
      .map((key: string, index: number) => [key, selectedRow[index]])
  );
  return JSON.stringify(contextObject);
}

/**
 * Fetch all unprocessed rows, optionally filtering out already processed ones.
 *
 * @param filterProcessed Whether to filter processed rows or not. Defaults to
 *     True.
 * @returns JSON string corresponding to all unprocessed rows, with or without
 *     already processed ones. Needs to be a JSON string as Apps Script may end
 *     up nullifying the array if it contained a non-primitive data type.
 */
export function getUnprocessedInputRows(filterProcessed = true) {
  const inputSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.input.name
  );
  const generatedSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.generated.name
  );
  let inputRows = SheetsService.getInstance().getNonEmptyRows(inputSheet!);

  // Add a 'target ouput row' index value to each input row, except header row
  inputRows.forEach((row, index) => {
    if (index > 0) {
      row.push(CONFIG.sheets.generated.startRow + index);
    }
  });

  const generatedRowIds = SheetsService.getInstance()
    .getNonEmptyRows(generatedSheet!)
    .filter(
      row => String(row[CONFIG.sheets.generated.cols.status]) === Status.SUCCESS
    )
    .map(row => String(row[CONFIG.sheets.generated.cols.id]));

  if (filterProcessed && generatedRowIds.length) {
    // Fetch index of the ItemId column from the headers row
    const itemIdIndex = inputRows[0].indexOf(
      String(getConfigSheetValue(CONFIG.userSettings.feed.itemIdColumnName))
    );
    inputRows = inputRows.filter(
      row => !generatedRowIds.includes(String(row[itemIdIndex]))
    );
  }
  return JSON.stringify(inputRows);
}

/**
 * Generates content for a single feed input row and writes it to the output
 * sheet at the row's defined "target output row" index value, whether as a
 * success or failure. This method is the target of async requests fired by the
 * HTML sidebar defined in `index.html`, and therefore must be a self-contained
 * unit; all needed inputs are provided, and its outcome must always be
 * deterministic.
 *
 * @param headers The header row freom the input feed.
 * @param row The corresponding input row data that needs to be generated. A
 *     'target output row' index value is appened to the input row.
 */
export function generateRow(headers: string[], row: string[]) {
  // Get the 'target output row' index value
  const rowIndex = Number(row.pop());
  let outputRow: (string | number | boolean)[] = [];

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
  origTitle: string,
  genTitle: string,
  origAttributes: Set<string>,
  genAttributes: Set<string>,
  inputWords: Set<string>,
  gapAttributesAndValues: Record<string, string>,
  originalInput: { [k: string]: string }
): Record<string, string> {
  const addedAttributes = Util.getSetDifference(genAttributes, origAttributes);
  const removedAttributes = Util.getSetDifference(
    origAttributes,
    genAttributes
  );
  const newWordsAdded = new Set<String>();
  const genTitleWords = new Set<String>();
  const genTitleWordsMatcher = String(genTitle)
    .replace("'s", '')
    .match(WORD_MATCH_REGEX);
  if (genTitleWordsMatcher) {
    genTitleWordsMatcher.forEach((word: string) =>
      genTitleWords.add(word.toLowerCase())
    );
    genTitleWordsMatcher
      .filter((word: string) => !inputWords.has(word.toLowerCase()))
      .forEach((word: string) => newWordsAdded.add(word));
  }
  const wordsRemoved = new Set<String>();
  const origTitleWordsMatcher = String(origTitle)
    .replace("'s", '')
    .match(WORD_MATCH_REGEX);
  if (origTitleWordsMatcher) {
    origTitleWordsMatcher
      .filter(
        (word: string) =>
          !genTitleWords.has(word.toLowerCase()) &&
          !genTitle.replace("'", '').includes(word)
      )
      .forEach((word: string) => wordsRemoved.add(word));
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
  const removedTitleAttributes =
    removedAttributes.filter(Boolean).length > 0 || wordsRemoved.size > 0;
  const hallucinatedTitle = newWordsAdded.size > 0;

  let score = 0;

  if (hallucinatedTitle) {
    score = -1;
  } else if (removedTitleAttributes) {
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
      .map((attr: string) => `<${attr}>`)
      .join(' '),
    removedAttributes: removedAttributes
      .filter(Boolean)
      .map((attr: string) => `<${attr}>`)
      .join(' '),
    newWordsAdded: [...newWordsAdded].join(` ${SEPARATOR} `),
    wordsRemoved: [...wordsRemoved].join(` ${SEPARATOR} `),
  };
}

function getConfigSheetValue(field: { row: number; col: number }) {
  return SheetsService.getInstance().getCellValue(
    CONFIG.sheets.config.name,
    field.row,
    field.col
  );
}

/**
 * Use Vertex AI to optimize row.
 *
 * @param {string[]} headers
 * @param {string[]} data
 * @returns {Array<string | boolean | number>}
 */
function optimizeRow(
  headers: string[],
  data: string[]
): Array<string | boolean | number> {
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
    .map((x: string) => x.trim());

  const origAttributes = origTemplateRow
    .replace(ORIGINAL_TITLE_TEMPLATE_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter(Boolean)
    .map((x: string) => x.trim());

  const genAttributeValues = genAttributesRow
    .replace(ATTRIBUTES_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter(Boolean)
    .map((x: string) => x.trim());

  // Use generated data only when user provided data is not available
  // Override with preferGeneratedAttributes
  const preferGeneratedAttributes = getConfigSheetValue(
    CONFIG.userSettings.title.preferGeneratedAttributes
  );

  const blocklistedAttributes = getConfigSheetValue(
    CONFIG.userSettings.title.blocklistedAttributes
  )
    .split(SEPARATOR)
    .filter(Boolean)
    .map((x: string) => x.trim().toLowerCase())
    .filter(
      (x: string, index: number, array: string[]) => array.indexOf(x) === index
    );

  const titleFeatures: string[] = [];
  const gapAttributesAndValues: Record<string, string> = {};
  const validGenAttributes: string[] = [];

  genAttributes
    .filter(
      (attribute: string) =>
        blocklistedAttributes.indexOf(attribute.trim().toLowerCase()) === -1
    )
    .forEach((attribute: string, index: number) => {
      if (
        !dataObj[attribute] && // matches gaps ({color: ""}) AND invented
        genAttributeValues[index] && // non-empty generated value
        (!origAttributes.includes(attribute) ||
          // force include gaps even if in generated template for original title
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

  const origTemplate = origAttributes
    .filter(Boolean)
    .map((x: string) => `<${x}>`)
    .join(' ');
  const genTemplate = validGenAttributes
    .filter(Boolean)
    .map((x: string) => `<${x}>`)
    .join(' ');

  const genTitle = titleFeatures.join(' ');
  const genDescription = fetchDescriptionGenerationData(dataObj, genTitle);

  const inputWords = new Set<string>();
  for (const [key, value] of Object.entries(dataObj)) {
    const keyAndValue = [String(key), String(value).replace("'s", '')].join(
      ' '
    );
    const match = keyAndValue.match(WORD_MATCH_REGEX);
    if (match) {
      match.forEach((word: string) => inputWords.add(word.toLowerCase()));
    }
  }

  const {
    totalScore,
    titleChanged,
    addedAttributes,
    removedAttributes,
    newWordsAdded,
    wordsRemoved,
  } = getGenerationMetrics(
    origTitle,
    genTitle,
    new Set(origAttributes),
    new Set(validGenAttributes),
    inputWords,
    gapAttributesAndValues,
    dataObj
  );

  const status =
    genTitle.length <= TITLE_MAX_LENGTH &&
    genTitle.length > 0 &&
    genDescription.length <= DESCRIPTION_MAX_LENGTH &&
    genDescription.length > 0
      ? Status.SUCCESS
      : Status.NON_COMPLIANT;
  const score = status === Status.NON_COMPLIANT ? String(-1) : totalScore;
  const approval = Number(score) > 0;

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
    String(genDescription.length),
    genCategory,
    `${res}\nproduct description: ${genDescription}`, // API response
    JSON.stringify(dataObj),
  ];
}

function fetchTitleGenerationData(data: Record<string, unknown>): string {
  // Extra lines (\n) instruct LLM to comlpete what is missing. Don't remove.
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

function fetchDescriptionGenerationData(
  data: Record<string, unknown>,
  generatedTitle: string
): string {
  // Extra lines (\n) instruct LLM to complete what is missing. Don't remove.
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

/**
 * Get rows from Generated Content sheet.
 *
 * @returns {string[][]}
 */
function getGeneratedRows() {
  return SheetsService.getInstance().getRangeData(
    CONFIG.sheets.generated.name,
    CONFIG.sheets.generated.startRow + 1,
    1
  );
}

/**
 * Write data rows to Generated Content sheet.
 */
function writeGeneratedRows(rows: string[][], withHeader = false) {
  const offset = withHeader ? 0 : 1;

  SheetsService.getInstance().setValuesInDefinedRange(
    CONFIG.sheets.generated.name,
    CONFIG.sheets.generated.startRow + offset,
    1,
    rows
  );
}

/**
 * Write rows to 'Approved' Sheet.
 *
 * @param {string[][]} rows
 */
function writeApprovedData(header: string[], rows: string[][]) {
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

/**
 * Clear all data rows from 'Supplemental Feed' sheet.
 */
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

/**
 * Clear all data rows from 'Supplemental Feed' sheet.
 */
export function clearGeneratedRows() {
  MultiLogger.getInstance().log('Clearing generated rows...');
  MultiLogger.getInstance().clear();
  SheetsService.getInstance().clearDefinedRange(
    CONFIG.sheets.generated.name,
    CONFIG.sheets.generated.startRow + 1,
    1
  );
}

/**
 * Set status for title and descrition to 'Approved' for rows.
 * Depending on current status.
 */
export function approveFiltered() {
  MultiLogger.getInstance().log('Approving filtered rows...');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    CONFIG.sheets.generated.name
  );
  const rows = getGeneratedRows().filter(
    (row: string[]) => row.join('').length > 0
  );

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

function getGapAndInventedAttributes(rows: string[][]) {
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

/**
 * Merge title and other attributes from 'FeedGen' to 'Approved' sheet.
 */
export function exportApproved() {
  MultiLogger.getInstance().log('Exporting approved rows...');

  const feedGenRows = getGeneratedRows().filter(
    row => row[CONFIG.sheets.generated.cols.approval] === true
  );

  if (feedGenRows.length === 0) return;

  const [inventedAttributes, gapAttributes] =
    getGapAndInventedAttributes(feedGenRows);

  const gapAndInventedAttributes = [...gapAttributes, ...inventedAttributes];

  const outputHeader: string[] = [
    CONFIG.sheets.output.cols.id.name,
    CONFIG.sheets.output.cols.title.name,
    CONFIG.sheets.output.cols.description.name,
    ...gapAttributes,
    ...inventedAttributes.map(
      key => `${CONFIG.sheets.output.newAttributesPrefix}${key}`
    ),
  ];

  const rowsToWrite: string[][] = [];
  for (const row of feedGenRows) {
    const resRow: string[] = [];

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

function _generateRowByRowNumber(inputRowNumber: number) {
  const inputSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.input.name
  );
  const inputRows = SheetsService.getInstance().getNonEmptyRows(inputSheet!);
  const header = inputRows[0];
  const row = inputRows[inputRowNumber];
  return generateRow(header, row);
}

function debugGenerateRowByNumber() {
  const rowNumber = 2;
  console.log(_generateRowByRowNumber(rowNumber));
}
