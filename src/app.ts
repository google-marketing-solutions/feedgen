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
const SEPARATOR = '|';
const WORD_MATCH_REGEX = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+/g;

const TITLE_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 5000;

const [vertexAiGcpProjectId, vertexAiLanguageModelId] = [
  getConfigSheetValue(CONFIG.userSettings.vertexAi.gcpProjectId),
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
 * Handle 'onEdit' of Config worksheet.
 */
export function onEdit(event: GoogleAppsScript.Events.SheetsOnEdit) {
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
    useImageUnderstanding &&
    !range.getValue().startsWith('gemini-')
  ) {
    SheetsService.getInstance().clearCellContents(
      CONFIG.userSettings.feed.imageUnderstanding.notation
    );
  }
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
  refreshConfigSheet();
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
      row =>
        String(row[CONFIG.sheets.generated.cols.status]) === Status.SUCCESS ||
        String(row[CONFIG.sheets.generated.cols.status]) ===
          Status.NON_COMPLIANT
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
  const newWordsAdded = new Set<string>();
  const genTitleWords = new Set<string>();
  const genTitleWordsMatcher = String(genTitle)
    .replaceAll("'s", '')
    .match(WORD_MATCH_REGEX);
  if (genTitleWordsMatcher) {
    genTitleWordsMatcher.forEach((word: string) =>
      genTitleWords.add(word.toLowerCase())
    );
    genTitleWordsMatcher
      .filter((word: string) => !inputWords.has(word.toLowerCase()))
      .forEach((word: string) => newWordsAdded.add(word));
  }
  const wordsRemoved = new Set<string>();
  const origTitleWordsMatcher = String(origTitle)
    .replaceAll("'s", '')
    .match(WORD_MATCH_REGEX);
  if (origTitleWordsMatcher) {
    origTitleWordsMatcher
      .filter(
        (word: string) =>
          !genTitleWords.has(word.toLowerCase()) &&
          !genTitle.replaceAll("'", '').includes(word)
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
  const imageUrl =
    dataObj[getConfigSheetValue(CONFIG.userSettings.feed.imageColumnName)];

  let genTitle = origTitle;
  const gapAttributesAndValues: Record<string, string> = {};
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
      '^.*product attribute keys in original title:\\**(?<origTemplateRow>.*)' +
      '^.*product category:\\**(?<genCategoryRow>.*)' +
      '^.*product attribute keys:\\**(?<genTemplateRow>.*)' +
      '^.*product attribute values:\\**(?<genAttributesRow>.*)';
    const replacedKeysRegexStr = '^.*replaced keys:\\**(?<replacedKeysRow>.*)';
    const generatedTitleRegexStr = '^.*generated title:\\**(?<genTitleRow>.*)';
    const completeRegex = new RegExp(
      regexStr + replacedKeysRegexStr + generatedTitleRegexStr + '$',
      'ims'
    );
    const noReplacedKeysRegex = new RegExp(
      regexStr + generatedTitleRegexStr + '$',
      'ims'
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
          .map((x: string) => x.toLowerCase().trim())
      : [];

    genCategory = String(genCategoryRow).trim();

    const genAttributes = String(genTemplateRow)
      .trim()
      .split(SEPARATOR)
      .filter(Boolean)
      .map((x: string) => x.trim());

    const origAttributes = String(origTemplateRow)
      .trim()
      .split(SEPARATOR)
      .filter(Boolean)
      .map((x: string) => x.trim());

    const genAttributeValues = String(genAttributesRow)
      .trim()
      .split(SEPARATOR)
      .filter(Boolean)
      .map((x: string) => x.trim());

    // Title advanced settings
    const [preferGeneratedValues, useLlmTitles, allowedWords] = [
      getConfigSheetValue(CONFIG.userSettings.title.preferGeneratedValues),
      getConfigSheetValue(CONFIG.userSettings.title.useLlmTitles),
      String(getConfigSheetValue(CONFIG.userSettings.title.allowedWords))
        .split(',')
        .filter(Boolean)
        .map((word: string) => word.trim().toLowerCase()),
    ];
    const titleFeatures: string[] = [];
    const validGenAttributes: string[] = [];
    const extraFeatures = new Set<string>();

    for (const [index, attribute] of genAttributes.entries()) {
      if (
        (!dataObj[attribute] && // matches gaps ({color: ""}) AND invented
          genAttributeValues[index] && // non-empty generated value
          (!origAttributes.includes(attribute) ||
            // force include gaps even if in generated template for original title
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
              extraFeaturesMatches.forEach((word: string) =>
                extraFeatures.add(word.toLowerCase())
              );
            }
          }
        }
      }
    }

    origTemplate = origAttributes
      .filter(Boolean)
      .map((x: string) => `<${x}>`)
      .join(' ');
    genTemplate = validGenAttributes
      .filter(Boolean)
      .map((x: string) => `<${x}>`)
      .join(' ');

    genTitle = titleFeatures.join(' ');
    if (genTitle.endsWith(',')) {
      genTitle = genTitle.slice(0, -1);
    }

    if (useLlmTitles) {
      genTitle = String(genTitleRow).trim();
    }

    const inputWords = new Set<string>();
    for (const [key, value] of Object.entries(dataObj)) {
      const keyAndValue = [
        String(key),
        String(value).replaceAll("'s", ''),
      ].join(' ');
      const match = keyAndValue.match(WORD_MATCH_REGEX);
      if (match) {
        match.forEach((word: string) => inputWords.add(word.toLowerCase()));
      }
    }
    allowedWords.forEach((word: string) => inputWords.add(word));
    extraFeatures.forEach((word: string) => inputWords.add(word));

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
    `${res.trim()}\nProduct description: ${genDescription}\nDescription evaluation: Score: ${genDescriptionScore}\n${genDescriptionEvaluation}`, // API response
    JSON.stringify(dataObj),
  ];
}

function removeEmptyAttributeValues(
  key: string,
  value: string,
  removeTrailingComma = false
) {
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

function isErroneousPrompt(prompt: string): boolean {
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

function fetchLandingPageInfo(
  data: Record<string, unknown>,
  useLandingPageInfo: boolean
) {
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
    try {
      console.log(`Adding landing page to cache for ${itemId}`);
      CacheService.getScriptCache().put(
        `${CONFIG.caching.keyPrefix}${itemId}`,
        landingPageInfo,
        CONFIG.caching.defaultExpiration
      );
    } catch (e) {
      console.error(e);
      console.log(`Could not add landing page to cache for ${itemId}!`);
    }
  }
  return landingPageInfo;
}

function fetchTitleGenerationData(
  data: Record<string, unknown>,
  imageUrl: string | null
): string {
  // Extra lines (\n) instruct LLM to comlpete what is missing. Don't remove.
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

function fetchDescriptionGenerationData(
  data: Record<string, unknown>,
  generatedTitle: string,
  imageUrl: string | null
): { description: string; score: number; evaluation: string } {
  // Extra lines (\n) instruct LLM to complete what is missing. Don't remove.
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
    /.*description:\**(?<description>.*)\n+.*score:\**(?<score>.*)\n+.*reasoning:\**(?<evaluation>.*)/ims;
  const matches = res.match(regex);
  if (!matches) {
    throw new Error(
      `Received an incomplete description response from the API. Response: ${res}`
    );
  }
  let { description, score, evaluation } = matches.groups as {
    description: string;
    score: string;
    evaluation: string;
  };
  description = String(description).trim();
  score = String(score).trim();
  evaluation = String(evaluation).trim();
  return {
    description: description,
    score: parseFloat(score),
    evaluation: evaluation,
  };
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
