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

const ORIGINAL_TITLE_TEMPLATE_PROMPT =
  'product attribute keys in original title:';
const CATEGORY_PROMPT = 'product category:';
const TEMPLATE_PROMPT = 'product attribute keys:';
const ATTRIBUTES_PROMPT = 'product attributes values:';
const TITLE_PROMPT =
  'Generated title based on all product attributes (100-130 characters):';
const SEPARATOR = '|';

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
const GENERIC_WORDS = new Set(['in', 'of', 'for', 'then', 'also', 'if']);

type GenerationMetrics = {
  titleChanged: boolean;
  attributesAreAdded: boolean;
  generatedValuesAdded: boolean;

  scores: () => [number];
};

/**
 * Handle 'onOpen' Sheets event to show menu.
 */
export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FeedGen')
    .addItem('Launch', 'showSidebar')
    .addToUi();
}

function logSummary() {
  MultiLogger.getInstance().log('Summary: ');
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

  const lastProcessedRow = generatedSheet.getLastRow();

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

function getHallucinationMetrics(
  data: string[],
  genTitle: string,
  genAttributes: string[]
) {
  // Get words
  const inputContextWords = Util.splitWords(data.join(' '));
  const genTitleWords = Util.splitWords(genTitle);
  const missingGenAttributesInGenTitle = genAttributes.filter(
    attr => !genTitle.includes(attr)
  );
  const newWordsNotFoundInContext = Util.getSetDifference(
    genTitleWords,
    inputContextWords
  );
  const hallucinationScore =
    missingGenAttributesInGenTitle.length + newWordsNotFoundInContext.length;
  return [
    newWordsNotFoundInContext.join(', '),
    missingGenAttributesInGenTitle.join(', '),
    hallucinationScore,
  ];
}

const getGenerationMetrics = (
  origTitle: string,
  genTitle: string,
  origAttributes: Set<string>,
  genAttributes: Set<string>,
  genAttributeValues: Set<string>
): GenerationMetrics => {
  const isTitleChanged = origTitle !== genTitle;
  const attributesInOrigTitleCount = Util.countSetOccurencesInString(
    genAttributeValues,
    origTitle
  );
  const attributesInGenTitleCount = Util.countSetOccurencesInString(
    genAttributeValues,
    genTitle
  );
  const attributesAdded =
    attributesInGenTitleCount > attributesInOrigTitleCount;
  const genAttributeValuesAdded = genAttributeValues.size > 0;
  return {
    attributesAreAdded: attributesAdded,
    generatedValuesAdded: genAttributeValuesAdded,
    titleChanged: isTitleChanged,
    scores: () => {
      return [
        (Number(attributesAdded) +
          Number(genAttributeValuesAdded) +
          Number(isTitleChanged)) /
          3,
      ];
    },
  };
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
 * @returns {string[]}
 */
function optimizeRow(headers: string[], data: string[]): string[] {
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
  const res = generateTitle(dataObj);

  const [
    origTemplateRow,
    genCategoryRow,
    genTemplateRow,
    genAttributesRow,
    genTitleRow,
  ] = res.split('\n');

  const genCategory = genCategoryRow.replace(CATEGORY_PROMPT, '').trim();

  const genAttributes = genTemplateRow
    .replace(TEMPLATE_PROMPT, '')
    .split(SEPARATOR)
    .map((x: string) => `${x.trim()}`);

  const genTemplate = genAttributes
    .map((x: string) => `<${x.trim()}>`)
    .join(' ');

  const origAttributes = origTemplateRow
    .replace(ORIGINAL_TITLE_TEMPLATE_PROMPT, '')
    .split(SEPARATOR);

  const origTemplate = origAttributes
    .map((x: string) => `<${x.trim()}>`)
    .join(' ');

  const genAttributeValues = genAttributesRow
    .replace(ATTRIBUTES_PROMPT, '')
    .split(SEPARATOR)
    .map((x: string) => x.trim());

  // Collect all title features with priority on user provided data
  // (use generated only when user provided data is not available)
  const titleFeatures = genAttributes.map(
    (attribute: string, index: number) =>
      dataObj[attribute] || genAttributeValues[index]
  );

  // create title solely based on titleFeatures to reduce hallucination potential
  const genTitle = titleFeatures.join(' ');

  const hallucinationMetrics = getHallucinationMetrics(
    data,
    genTitle,
    genAttributeValues
  );
  const generationMetrics = getGenerationMetrics(
    origTitle,
    genTitle,
    origAttributes,
    genAttributes,
    genAttributeValues
  );

  const row: Array<string | boolean> = [];

  row[CONFIG.sheets.generated.cols.approval] = false;
  row[CONFIG.sheets.generated.cols.status] = 'Success';
  row[CONFIG.sheets.generated.cols.id] = itemId;
  row[CONFIG.sheets.generated.cols.titleOriginal] = origTitle;
  row[CONFIG.sheets.generated.cols.titleGenerated] = genTitle;

  return [
    ...row,
    genTemplate,
    origTemplate,
    genCategory,
    genAttributeValues.join(', '),
    ...hallucinationMetrics,
    ...generationMetrics.scores(),
    res,
    JSON.stringify(dataObj),
  ];
}

/**
 * Count characters in string.
 *
 * @param {string} inputString
 * @returns {number}
 */
function charCount(inputString: string) {
  return inputString.trim().length;
}

/**
 * Count words in string.
 *
 * @param {string} inputString
 * @returns {number}
 */
function wordCount(inputString: string) {
  return inputString.trim().split(' ').length;
}

function generateTitle(data: Record<string, unknown>) {
  const prompt = `
    Context:
    {
      "item_id": "220837",
      "title": "Seymour Duncan SM-1 Mini Humbucker B CHR",
      "description": "Seymour Duncan SM-1 Mini Humbucker B CHR Vintage Fire-bird Mini Humbucker, 2 - adrig, Bridge Position, Finish Chrome Cover",
      "brand": "Seymour Duncan",
      "color": "Chrome Cover",
      "product_type": "Gitarren und Bässe > Pickups und Tonabnehmer > Tonabnehmer für E-Gitarre > Sonstige Tonabnehmer für E-Gitarre",
      "impressions_7d": 13,
      "clicks_7d": 0
    }

    ${ORIGINAL_TITLE_TEMPLATE_PROMPT} brand ${SEPARATOR} model ${SEPARATOR} product
    ${CATEGORY_PROMPT} Guitars
    ${TEMPLATE_PROMPT} brand ${SEPARATOR} model ${SEPARATOR} product ${SEPARATOR} color ${SEPARATOR} design
    ${ATTRIBUTES_PROMPT} Seymour Duncan ${SEPARATOR} SM-1 ${SEPARATOR} Mini Humbucker ${SEPARATOR} Chrome ${SEPARATOR} Vintage
    ${TITLE_PROMPT} Seymour Duncan SM-1 Mini Humbucker Pickup in Chrome

    Context:
    {
      "item_id": "565119",
      "title": "Gretsch Drums 14\"\"x7\"\" 140th Anniversary Snare",
      "description": "Gretsch Drums 140th Anniversary Snare + Bag; Farbe: Natur; Hochglanz lackiert; Ahorn Kessel; 16 Einzelböckchen; Nickel Hardware; Figured Ash Außenlage; Micro Sensitive Anhebung; Snap-in Stimmschlüsselhalter; inkluseive 140th Anniversary Tasche; Zertifikat unterzeichnet von allen Produktionsmitarbeitern; 140 Stück limitiert",
      "brand": "Gretsch Drums",
      "color": "Natur",
      "product_type": "Drums und Percussion > Akustik-Drums > Snaredrums mit Holzkessel > 14\"\" Holz Snaredrums",
      "impressions_7d": 84,
      "clicks_7d": 1
    }

    ${ORIGINAL_TITLE_TEMPLATE_PROMPT} brand ${SEPARATOR} size ${SEPARATOR} edition ${SEPARATOR} product
    ${CATEGORY_PROMPT} Drums
    ${TEMPLATE_PROMPT} brand ${SEPARATOR} product ${SEPARATOR} material ${SEPARATOR} edition ${SEPARATOR} size
    ${ATTRIBUTES_PROMPT} Gretsch Drums ${SEPARATOR} Snare + Bag ${SEPARATOR} Ahorn ${SEPARATOR} 140th Anniversary ${SEPARATOR} 14"x7"
    ${TITLE_PROMPT} Gretsch Snare Drums + Bag aus Ahorn, 140th Anniversary edition

    Context:
    {
      "item_id": "302293",
      "title": "Thon CD Player Case American Audio",
      "description": "Thon CD Player Case American Audio, maßgefertigtes Haubencase für American Audio Radius 1000, 2000 und 3000, aus 7mm Multiplex, 25 x 25 mm Alukante, Schaumstoffpolsterung, 2x Butterfly-Verschlüsse, 1 Koffergriff, Gummifüße, Platz für Netzkabel, Stahlkugelecken, hergestellt in Deutschland, Außenmaße (BxTxH): ca. 34 x 50 x 19,4 cm, Gewicht: ca. 4,9 kg, Gewicht mit Radius: ca. 8,7 kg",
      "brand": "Thon",
      "color": "Phenol Braun",
      "product_type": "DJ-Equipment > Zubehör für DJs > DJ Player Cases/Bags",
      "impressions_7d": 15,
      "clicks_7d": 0
    }

    ${ORIGINAL_TITLE_TEMPLATE_PROMPT} brand ${SEPARATOR} product ${SEPARATOR} compatibility
    ${CATEGORY_PROMPT} DJ Equimpent
    ${TEMPLATE_PROMPT} brand ${SEPARATOR} product ${SEPARATOR} weight ${SEPARATOR} compatibility ${SEPARATOR} color
    ${ATTRIBUTES_PROMPT} Thon ${SEPARATOR} CD Player Case ${SEPARATOR} 4,9 kg ${SEPARATOR} American Audio ${SEPARATOR} braun
    ${TITLE_PROMPT} Thon CD PlayerCase, 4,9 kg, American Audio, braun

    Context:
    ${JSON.stringify(data, null, 2)}

    `;

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
 * Get rows from 'Supplemental Feed' sheet.
 *
 * @returns {string[][]}
 */
function getApprovedData() {
  return SheetsService.getInstance().getRangeData(
    CONFIG.sheets.output.name,
    CONFIG.sheets.output.startRow + 1,
    1
  );
}

/**
 * Write rows to 'Approved' Sheet.
 *
 * @param {string[][]} rows
 */
function writeApprovedRows(rows: string[][]) {
  MultiLogger.getInstance().log('Writing approved rows...');
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
function clearApprovedRows() {
  MultiLogger.getInstance().log('Clearing approved rows...');
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
 * Merge title and description from 'FeedGen' to 'Approved' sheet.
 */
export function exportApproved() {
  MultiLogger.getInstance().log('Exporting approved rows...');

  // Load approved 'FeedGen' rows
  const feedGenRows = getGeneratedRows().filter(row => {
    return row[CONFIG.sheets.generated.cols.approval] === true;
  });

  // Load 'Approved' sheet
  const approvedRows = getApprovedData();

  // Generate id-keyed object from approved rows
  const approvedRowsMap = arrayToMap(
    approvedRows,
    CONFIG.sheets.output.cols.id
  );

  const feedGenApprovedRowsMap: Record<string, string[]> = {};

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

    feedGenApprovedRowsMap[row[CONFIG.sheets.generated.cols.id]] = resRow;
  }

  // Merge with 'Approved' rows
  const merged = Object.values(
    Object.assign(approvedRowsMap, feedGenApprovedRowsMap)
  );

  // Clear 'Approved' sheet
  clearApprovedRows();

  // Write to 'Approved' sheet
  writeApprovedRows(merged);
}

/**
 * Create map from array with key column.
 * @param {Array<Array<string>>} arr
 * @param {number} keyCol
 * @returns {Record<string, Array<string>>}
 */
export function arrayToMap(arr: string[][], keyCol: number) {
  const map: Record<string, string[]> = {};

  for (const row of arr) {
    if (!row[keyCol]) continue;

    map[row[keyCol]] = row;
  }

  return map;
}
