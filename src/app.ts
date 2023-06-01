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
const projectId = SheetsService.getInstance().getCellValue(
  CONFIG.sheets.config.name,
  CONFIG.sheets.config.fields.projectId.row,
  CONFIG.sheets.config.fields.projectId.col
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

export function showSidebar() {
  const html = HtmlService.createTemplateFromFile('static/index').evaluate();
  html.setTitle('FeedGen');
  SpreadsheetApp.getUi().showSidebar(html);
}

export function prepareGeneratedSheet() {
  const generatedSheet = SpreadsheetApp.getActive().getSheetByName(
    CONFIG.sheets.generated.name
  );

  if (!generatedSheet) return;

  generatedSheet.getDataRange().clearContent();
  generatedSheet.appendRow(CONFIG.sheets.generated.headers);
}

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

  const row = inputSheet
    .getRange(lastProcessedRow + 1, 1, 1, inputSheet.getMaxColumns())
    .getValues()[0];

  try {
    const inputHeaders = SheetsService.getInstance().getHeaders(inputSheet);
    const optimizedRow = optimizeRow(inputHeaders, row);
    console.log('optimizedRow', optimizedRow);

    generatedSheet.appendRow([false, ...optimizedRow]);
  } catch (e) {
    generatedSheet.appendRow([false, ...row, `ERROR: ${e}`]);
  }

  return lastProcessedRow;
}

export function totalInputRows() {
  return SheetsService.getInstance().totalRows(CONFIG.sheets.input.name);
}

export function totalGeneratedRows() {
  return SheetsService.getInstance().totalRows(CONFIG.sheets.generated.name);
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
  origAttributes: string[],
  genAttributes: string[]
) => {
  const origCharCount = charCount(origTitle);
  const genCharCount = charCount(genTitle);
  const origWordCount = wordCount(origTitle);
  const genWordCount = wordCount(genTitle);
  const titleChangeScore =
    Math.abs(genCharCount - origCharCount) +
    Math.abs(genWordCount - origWordCount);
  const isTitleChanged = Number(origTitle !== genTitle);
  return [
    origCharCount,
    genCharCount,
    origWordCount,
    genWordCount,
    origAttributes.length,
    genAttributes.length,
    titleChangeScore,
    isTitleChanged,
  ];
};

function optimizeRow(headers: string[], data: string[]): string[] {
  const itemId = data[0];
  const origTitle = data[1];

  // build context object
  const dataObj = Object.fromEntries(
    data.map((item, index) => [headers[index], item])
  );

  // gnerate title with all available context
  const res = generateTitle(dataObj);
  console.log(res);

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
    .split(SEPARATOR);

  const genTemplate = genAttributes
    .map((x: string) => `<${x.trim()}>`)
    .join(', ');

  const origAttributes = origTemplateRow
    .replace(ORIGINAL_TITLE_TEMPLATE_PROMPT, '')
    .split(SEPARATOR);

  const origTemplate = origAttributes
    .map((x: string) => `<${x.trim()}>`)
    .join(', ');

  const genAttributeValues = genAttributesRow
    .replace(ATTRIBUTES_PROMPT, '')
    .split(SEPARATOR)
    .map((x: string) => x.trim());

  const genTitle = genTitleRow.replace(TITLE_PROMPT, '').trim();
  const hallucinationMetrics = getHallucinationMetrics(
    data,
    genTitle,
    genAttributeValues
  );
  const generationMetrics = getGenerationMetrics(
    origTitle,
    genTitle,
    origAttributes,
    genAttributes
  );

  return [
    itemId,
    origTitle,
    genTitle,
    genTemplate,
    origTemplate,
    genCategory,
    genAttributeValues.join(', '),
    ...hallucinationMetrics,
    ...generationMetrics,
    res,
    JSON.stringify(dataObj),
  ];
}

function charCount(inputString: string) {
  return inputString.trim().length;
}

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

  return Util.executeWithRetry(10, 6000, () =>
    VertexHelper.getInstance(projectId).predict(prompt)
  );
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

function writeApprovedRows(rows: string[][]) {
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
  SheetsService.getInstance().clearDefinedRange(
    CONFIG.sheets.output.name,
    CONFIG.sheets.output.startRow + 1,
    1
  );
}

/**
 * Set status for title and descrition to 'Approved' for rows.
 * Depending on current status.
 */
export function approveFiltered() {
  // Load 'Generated' sheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    CONFIG.sheets.generated.name
  );

  // Load 'Generated' rows
  //const rows = getSelectedGeneratedRows();
  const rows = getGeneratedRows();

  console.log('selectedGeneratedRows', rows);

  if (!sheet || !rows) return;

  // Update status to 'Approved'
  rows.map((row, index) => {
    // Update title status
    row[CONFIG.sheets.generated.cols.titleStatus] = sheet.isRowHiddenByFilter(
      index + 1 + 1
    )
      ? row[CONFIG.sheets.generated.cols.titleStatus]
      : true;

    return row;
  });

  console.log('mapped', rows);

  // Write back to 'FeedGen' sheet
  writeGeneratedRows(rows);
}

/*function getSelectedGeneratedRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(
    CONFIG.sheets.generated.name
  );

  if (!sheet) return [[]];

  const rows = getGeneratedRows();

  return rows.filter((row, index) => {
    return !sheet.isRowHiddenByFilter(index + 1 + 1);
  });
}*/

/**
 * Merge title and description from 'FeedGen' to 'Approved' sheet.
 */
export function exportApproved() {
  // Load approved 'FeedGen' rows
  const feedGenRows = getGeneratedRows().filter(row => {
    return row[CONFIG.sheets.generated.cols.titleStatus] === true;
  });

  console.log('feedGenRows', feedGenRows);

  // Load 'Approved' sheet
  const approvedRows = getApprovedData();

  console.log('approvedRows', approvedRows);

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
      row[CONFIG.sheets.generated.cols.titleStatus] === true
        ? row[CONFIG.sheets.generated.cols.titleGenerated]
        : row[CONFIG.sheets.generated.cols.titleOriginal];

    feedGenApprovedRowsMap[row[CONFIG.sheets.generated.cols.id]] = resRow;
  }

  // Merge with 'Approved' rows
  const merged = Object.values(
    Object.assign(approvedRowsMap, feedGenApprovedRowsMap)
  );

  console.log('merged', merged);

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
