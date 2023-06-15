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

import { CONFIG } from './config';
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
const WORD_MATCH_REGEX = /(\w|\s)*\w(?=")|\w+/g;

// Get Vertex AI config info
const vertexAiProjectId = getConfigSheetValue(
  CONFIG.sheets.config.fields.vertexAiProjectId
);

const vertexAiLocation = getConfigSheetValue(
  CONFIG.sheets.config.fields.vertexAiLocation
);

const vertexAiModelId = getConfigSheetValue(
  CONFIG.sheets.config.fields.vertexAiModelId
);

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
 * Open sidebar.
 */
export function showSidebar() {
  const html = HtmlService.createTemplateFromFile('static/index').evaluate();
  html.setTitle('FeedGen');
  SpreadsheetApp.getUi().showSidebar(html);
}

export function FEEDGEN_CREATE_JSON_CONTEXT_FOR_ITEM(itemId: string) {
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
    headers.map((key: string, index: number) => [key, selectedRow[index]])
  );
  return JSON.stringify(contextObject);
}
/**
 * Generate content for next row.
 *
 * @returns {null}
 */
export function generateNextRow() {
  const inputSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.input.name
  );
  const generatedSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.generated.name
  );

  if (!inputSheet || !generatedSheet) return;

  const lastProcessedRow =
    generatedSheet.getLastRow() - (CONFIG.sheets.generated.startRow - 1);

  if (lastProcessedRow >= inputSheet.getLastRow()) return;

  MultiLogger.getInstance().log(`Generating for row ${lastProcessedRow}`);

  const row = inputSheet
    .getRange(lastProcessedRow + 1, 1, 1, inputSheet.getMaxColumns())
    .getValues()[0];

  try {
    const inputHeaders = SheetsService.getInstance().getHeaders(inputSheet);
    const optimizedRow = optimizeRow(inputHeaders, row);

    generatedSheet.appendRow(optimizedRow);
    MultiLogger.getInstance().log('Success');
  } catch (e) {
    MultiLogger.getInstance().log(`Error: ${e}`);
    row[CONFIG.sheets.generated.cols.status] = `Error: ${e}`;

    const failedRow = [];
    failedRow[CONFIG.sheets.generated.cols.status] =
      'Failed. See log for more details.';
    generatedSheet.appendRow(failedRow);
  }

  return lastProcessedRow;
}

/**
 * Get total number of data rows in 'Input' Sheet.
 *
 * @returns {number}
 */
export function getTotalInputRows() {
  const totalRows = SheetsService.getInstance().getTotalRows(
    CONFIG.sheets.input.name
  );

  return typeof totalRows === 'undefined'
    ? 0
    : totalRows - CONFIG.sheets.input.startRow;
}

/**
 * Get total number of data rows in 'Generated' Sheet.
 *
 * @returns {number}
 */
export function getTotalGeneratedRows() {
  const totalRows = SheetsService.getInstance().getTotalRows(
    CONFIG.sheets.generated.name
  );

  return typeof totalRows === 'undefined'
    ? 0
    : totalRows - CONFIG.sheets.generated.startRow;
}

const getGenerationMetrics = (
  origTitle: string,
  genTitle: string,
  origAttributes: Set<string>,
  genAttributes: Set<string>,
  inputWords: Set<string>
): string[] => {
  const titleChanged = origTitle !== genTitle;
  const addedAttributes = Util.getSetDifference(genAttributes, origAttributes);
  const newWordsAdded = new Set<String>();
  const genTitleWords = genTitle.match(WORD_MATCH_REGEX);
  if (genTitleWords) {
    genTitleWords
      .filter((genTitleWord: string) => !inputWords.has(genTitleWord))
      .forEach((newWord: string) => newWordsAdded.add(newWord));
  }
  const totalScore =
    (Number(addedAttributes.length > 0) +
      Number(titleChanged) +
      Number(newWordsAdded.size === 0)) /
    3;
  return [
    totalScore.toString(), // 0-1 score total
    titleChanged.toString(),
    addedAttributes.map((attr: string) => `<${attr}>`).join(' '),
    [...newWordsAdded].join(` ${SEPARATOR} `),
  ];
};

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
  // Build context object
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

  // Generate title with all available context
  const res = fetchTitleGenerationData(dataObj);

  const [origTemplateRow, genCategoryRow, genTemplateRow, genAttributesRow] =
    res.split('\n');

  const genCategory = genCategoryRow.replace(CATEGORY_PROMPT_PART, '').trim();

  const genAttributes = genTemplateRow
    .replace(TEMPLATE_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter((x: string) => x)
    .map((x: string) => x.trim());

  const genTemplate = genAttributes
    .map((x: string) => `<${x.trim()}>`)
    .join(' ');

  const origAttributes = origTemplateRow
    .replace(ORIGINAL_TITLE_TEMPLATE_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter((x: string) => x)
    .map((x: string) => x.trim());

  const origTemplate = origAttributes
    .map((x: string) => `<${x.trim()}>`)
    .join(' ');

  const genAttributeValues = genAttributesRow
    .replace(ATTRIBUTES_PROMPT_PART, '')
    .split(SEPARATOR)
    .filter((x: string) => x)
    .map((x: string) => x.trim());

  // Collect all title features with priority on user provided data
  // (use generated only when user provided data is not available)
  const titleFeatures: string[] = [];
  const gapAttributesAndValues: Record<string, string> = {};

  genAttributes.forEach((attribute: string, index: number) => {
    if (!dataObj[attribute]) {
      gapAttributesAndValues[attribute] = genAttributeValues[index];
    }
    titleFeatures.push(dataObj[attribute] || genAttributeValues[index]);
  });

  // create title solely based on titleFeatures to reduce hallucination potential
  const genTitle = titleFeatures.join(' ');

  const inputWords = new Set<string>();
  Object.values(dataObj).forEach((value: string) => {
    const match = new String(value).match(WORD_MATCH_REGEX);
    if (match) {
      match.forEach((word: string) => inputWords.add(word));
    }
  });

  const generationMetrics = getGenerationMetrics(
    origTitle,
    genTitle,
    new Set(origAttributes),
    new Set(genAttributes),
    inputWords
  );

  const row: Array<string | boolean> = [];

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

function fetchTitleGenerationData(data: Record<string, unknown>): string {
  // Extra lines instruct LLM to comlpete what is missing. Don't remove.
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

/**
 * Get rows from 'FeedGen' sheet.
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
 * Write data rows to 'FeedGen' sheet.
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

/**
 * Clear all data rows from 'Supplemental Feed' sheet.
 */
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
  // Load 'Generated' sheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    CONFIG.sheets.generated.name
  );

  // Load 'Generated' rows
  //const rows = getSelectedGeneratedRows();
  const rows = getGeneratedRows();

  if (!sheet || !rows) return;

  // Update status to 'Approved'
  rows.map((row, index) => {
    // Update title status
    row[CONFIG.sheets.generated.cols.approval] = sheet.isRowHiddenByFilter(
      index + 1 + 1
    )
      ? row[CONFIG.sheets.generated.cols.approval]
      : true;

    return row;
  });

  // Write back to 'FeedGen' sheet
  writeGeneratedRows(rows);

  MultiLogger.getInstance().log('Writing approved rows...');
}

/**
 * Merge title and other attributes from 'FeedGen' to 'Approved' sheet.
 */
export function exportApproved() {
  MultiLogger.getInstance().log('Exporting approved rows...');

  // Load approved 'FeedGen' rows
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

  const rowsToWrite: string[][] = [];
  // Process rows
  for (const row of feedGenRows) {
    // Row container
    const resRow: string[] = [];

    // Add ID
    resRow[CONFIG.sheets.output.cols.id] = row[CONFIG.sheets.generated.cols.id];

    // Determine and add title
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

  // Clear 'Approved' sheet
  clearApprovedData();

  // Write to 'Approved' sheet
  writeApprovedData(filledInGapAttributes, rowsToWrite);
}
