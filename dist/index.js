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

const CONFIG = {
    sheets: {
        config: {
            name: 'Config',
            fields: {
                vertexAiProjectId: {
                    row: 1,
                    col: 2,
                },
                vertexAiLocation: {
                    row: 2,
                    col: 2,
                },
                vertexAiModelId: {
                    row: 3,
                    col: 2,
                },
                itemIdColumnName: {
                    row: 4,
                    col: 2,
                },
                titleColumnName: {
                    row: 5,
                    col: 2,
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
            },
        },
        output: {
            startRow: 1,
            name: 'Output Feed',
            cols: {
                id: 0,
                title: 1,
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
        this.sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheets.log.name);
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
            }
            catch (e) {
                console.error(e);
                throw new Error(`Unable to identify spreadsheet with provided ID: ${spreadsheetId}!`);
            }
        }
        else {
            spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        }
        this.spreadsheet_ = spreadsheet;
    }
    getHeaders(sheet) {
        return sheet
            .getRange(1, 1, 1, sheet.getMaxColumns())
            .getValues()[0]
            .filter((cell) => cell !== '');
    }
    getTotalRows(sheetName) {
        const sheet = this.spreadsheet_.getSheetByName(sheetName);
        if (!sheet)
            return;
        return sheet.getDataRange().getLastRow();
    }
    getNonEmptyRows(sheet) {
        return sheet
            .getDataRange()
            .getValues()
            .filter((row) => row.join('').length > 0);
    }
    getRangeData(sheetName, startRow, startCol, numRows = 0, numCols = 0) {
        const sheet = this.getSpreadsheet().getSheetByName(sheetName);
        if (!sheet || numRows + sheet.getLastRow() - startRow + 1 === 0) {
            return [[]];
        }
        return sheet
            .getRange(startRow, startCol, numRows || sheet.getLastRow() - startRow + 1, numCols || sheet.getLastColumn() - startCol + 1)
            .getValues();
    }
    setValuesInDefinedRange(sheetName, row, col, values) {
        const sheet = this.getSpreadsheet().getSheetByName(sheetName);
        if (!sheet)
            return;
        if (values[0]) {
            sheet
                .getRange(row, col, values.length, values[0].length)
                .setValues(values);
        }
    }
    clearDefinedRange(sheetName, row, col, numRows = 0, numCols = 0) {
        const sheet = this.getSpreadsheet().getSheetByName(sheetName);
        if (!sheet)
            return;
        sheet
            .getRange(row, col, numRows || sheet.getLastRow(), numCols || sheet.getLastColumn())
            .clear();
    }
    getCellValue(sheetName, row, col) {
        const sheet = this.getSpreadsheet().getSheetByName(sheetName);
        if (!sheet)
            return null;
        const cell = sheet.getRange(row, col);
        return cell.getValue();
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
            }
            catch (err) {
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
        const res = this.fetchJson(predictEndpoint, this.addAuth({
            instances: [{ content: prompt }],
            parameters: {
                temperature: 0.1,
                maxOutputTokens: 1024,
                topK: 1,
                topP: 0.8,
            },
        }));
        MultiLogger.getInstance().log(res);
        if (res.predictions[0].safetyAttributes.blocked) {
            throw new Error('Blocked for safety reasons.');
        }
        else if (!res.predictions[0].content) {
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
const ORIGINAL_TITLE_TEMPLATE_PROMPT = 'product attribute keys in original title:';
const CATEGORY_PROMPT = 'product category:';
const TEMPLATE_PROMPT = 'product attribute keys:';
const ATTRIBUTES_PROMPT = 'product attributes values:';
const TITLE_PROMPT = 'Generated title based on all product attributes (100-130 characters):';
const SEPARATOR = '|';
const WORD_MATCH_REGEX = /(\w|\s)*\w(?=")|\w+/g;
const vertexAiProjectId = getConfigSheetValue(CONFIG.sheets.config.fields.vertexAiProjectId);
const vertexAiLocation = getConfigSheetValue(CONFIG.sheets.config.fields.vertexAiLocation);
const vertexAiModelId = getConfigSheetValue(CONFIG.sheets.config.fields.vertexAiModelId);
const generationMetrics = (titleChanged, addedAttributes, generatedValuesAdded, newWordsAdded) => { };
function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('FeedGen')
        .addItem('Launch', 'showSidebar')
        .addToUi();
}
function logSummary() {
    MultiLogger.getInstance().log('Summary: ');
}
function showSidebar() {
    const html = HtmlService.createTemplateFromFile('static/index').evaluate();
    html.setTitle('FeedGen');
    SpreadsheetApp.getUi().showSidebar(html);
}
function generateNextRow() {
    const inputSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.input.name);
    const generatedSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.sheets.generated.name);
    if (!inputSheet || !generatedSheet)
        return;
    const lastProcessedRow = generatedSheet.getLastRow() - (CONFIG.sheets.generated.startRow - 1);
    if (lastProcessedRow >= inputSheet.getLastRow())
        return;
    MultiLogger.getInstance().log(`Generating for row ${lastProcessedRow}`);
    const row = inputSheet
        .getRange(lastProcessedRow + 1, 1, 1, inputSheet.getMaxColumns())
        .getValues()[0];
    try {
        const inputHeaders = SheetsService.getInstance().getHeaders(inputSheet);
        const optimizedRow = optimizeRow(inputHeaders, row);
        generatedSheet.appendRow(optimizedRow);
        MultiLogger.getInstance().log('Success');
    }
    catch (e) {
        MultiLogger.getInstance().log(`Error: ${e}`);
        row[CONFIG.sheets.generated.cols.status] = `Error: ${e}`;
        const failedRow = [];
        failedRow[CONFIG.sheets.generated.cols.status] =
            'Failed. See log for more details.';
        generatedSheet.appendRow(failedRow);
    }
    return lastProcessedRow;
}
function getTotalInputRows() {
    const totalRows = SheetsService.getInstance().getTotalRows(CONFIG.sheets.input.name);
    return typeof totalRows === 'undefined'
        ? 0
        : totalRows - CONFIG.sheets.input.startRow;
}
function getTotalGeneratedRows() {
    const totalRows = SheetsService.getInstance().getTotalRows(CONFIG.sheets.generated.name);
    return typeof totalRows === 'undefined'
        ? 0
        : totalRows - CONFIG.sheets.generated.startRow;
}
const getGenerationMetrics = (origTitle, genTitle, origAttributes, genAttributes, inputWords) => {
    const titleChanged = origTitle !== genTitle;
    const addedAttributes = Util.getSetDifference(genAttributes, origAttributes);
    const newWordsAdded = new Set();
    const genTitleWords = genTitle.match(WORD_MATCH_REGEX);
    if (genTitleWords !== null) {
        genTitleWords
            .filter((genTitleWord) => !inputWords.has(genTitleWord))
            .forEach((newWord) => newWordsAdded.add(newWord));
    }
    const totalScore = (Number(addedAttributes.length > 0) +
        Number(titleChanged) +
        Number(newWordsAdded.size === 0)) /
        3;
    return [
        totalScore.toString(),
        titleChanged.toString(),
        addedAttributes.map((attr) => `<${attr}>`).join(' '),
        [...newWordsAdded].join(SEPARATOR),
    ];
};
function getConfigSheetValue(field) {
    return SheetsService.getInstance().getCellValue(CONFIG.sheets.config.name, field.row, field.col);
}
function optimizeRow(headers, data) {
    const dataObj = Object.fromEntries(data.map((item, index) => [headers[index], item]));
    const itemIdColumnName = getConfigSheetValue(CONFIG.sheets.config.fields.itemIdColumnName);
    const titleColumnName = getConfigSheetValue(CONFIG.sheets.config.fields.titleColumnName);
    const itemId = dataObj[itemIdColumnName];
    const origTitle = dataObj[titleColumnName];
    const res = generateTitle(dataObj);
    const [origTemplateRow, genCategoryRow, genTemplateRow, genAttributesRow, genTitleRow,] = res.split('\n');
    const genCategory = genCategoryRow.replace(CATEGORY_PROMPT, '').trim();
    const genAttributes = genTemplateRow
        .replace(TEMPLATE_PROMPT, '')
        .split(SEPARATOR)
        .map((x) => `${x.trim()}`);
    const genTemplate = genAttributes
        .map((x) => `<${x.trim()}>`)
        .join(' ');
    const origAttributes = origTemplateRow
        .replace(ORIGINAL_TITLE_TEMPLATE_PROMPT, '')
        .split(SEPARATOR)
        .map((x) => x.trim());
    const origTemplate = origAttributes
        .map((x) => `<${x.trim()}>`)
        .join(' ');
    const genAttributeValues = genAttributesRow
        .replace(ATTRIBUTES_PROMPT, '')
        .split(SEPARATOR)
        .map((x) => x.trim());
    const titleFeatures = genAttributes.map((attribute, index) => dataObj[attribute] || genAttributeValues[index]);
    const genTitle = titleFeatures.join(' ');
    const inputWords = new Set();
    Object.values(dataObj).forEach((value) => {
        const match = new String(value).match(WORD_MATCH_REGEX);
        if (match !== null) {
            match.forEach((word) => inputWords.add(word));
        }
    });
    const generationMetrics = getGenerationMetrics(origTitle, genTitle, new Set(origAttributes), new Set(genAttributes), inputWords);
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
        res,
        JSON.stringify(dataObj),
    ];
}
function generateTitle(data) {
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
    const res = Util.executeWithRetry(CONFIG.vertexAi.maxRetries, 0, () => VertexHelper.getInstance(vertexAiProjectId, vertexAiLocation, vertexAiModelId).predict(prompt));
    return res;
}
function getGeneratedRows() {
    return SheetsService.getInstance().getRangeData(CONFIG.sheets.generated.name, CONFIG.sheets.generated.startRow + 1, 1);
}
function writeGeneratedRows(rows, withHeader = false) {
    const offset = withHeader ? 0 : 1;
    SheetsService.getInstance().setValuesInDefinedRange(CONFIG.sheets.generated.name, CONFIG.sheets.generated.startRow + offset, 1, rows);
}
function getApprovedData() {
    return SheetsService.getInstance().getRangeData(CONFIG.sheets.output.name, CONFIG.sheets.output.startRow + 1, 1);
}
function writeApprovedRows(rows) {
    MultiLogger.getInstance().log('Writing approved rows...');
    SheetsService.getInstance().setValuesInDefinedRange(CONFIG.sheets.output.name, CONFIG.sheets.output.startRow + 1, 1, rows);
}
function clearApprovedRows() {
    MultiLogger.getInstance().log('Clearing approved rows...');
    SheetsService.getInstance().clearDefinedRange(CONFIG.sheets.output.name, CONFIG.sheets.output.startRow + 1, 1);
}
function clearGeneratedRows() {
    MultiLogger.getInstance().log('Clearing generated rows...');
    MultiLogger.getInstance().clear();
    SheetsService.getInstance().clearDefinedRange(CONFIG.sheets.generated.name, CONFIG.sheets.generated.startRow + 1, 1);
}
function approveFiltered() {
    MultiLogger.getInstance().log('Approving filtered rows...');
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheets.generated.name);
    const rows = getGeneratedRows();
    if (!sheet || !rows)
        return;
    rows.map((row, index) => {
        row[CONFIG.sheets.generated.cols.approval] = sheet.isRowHiddenByFilter(index + 1 + 1)
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
    const approvedRows = getApprovedData();
    const approvedRowsMap = arrayToMap(approvedRows, CONFIG.sheets.output.cols.id);
    const feedGenApprovedRowsMap = {};
    for (const row of feedGenRows) {
        const resRow = [];
        resRow[CONFIG.sheets.output.cols.id] = row[CONFIG.sheets.generated.cols.id];
        resRow[CONFIG.sheets.output.cols.title] =
            row[CONFIG.sheets.generated.cols.approval] === true
                ? row[CONFIG.sheets.generated.cols.titleGenerated]
                : row[CONFIG.sheets.generated.cols.titleOriginal];
        feedGenApprovedRowsMap[row[CONFIG.sheets.generated.cols.id]] = resRow;
    }
    const merged = Object.values(Object.assign(approvedRowsMap, feedGenApprovedRowsMap));
    clearApprovedRows();
    writeApprovedRows(merged);
}
function arrayToMap(arr, keyCol) {
    const map = {};
    for (const row of arr) {
        if (!row[keyCol])
            continue;
        map[row[keyCol]] = row;
    }
    return map;
}

app;
