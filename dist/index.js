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
                projectId: {
                    row: 1,
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
            startRow: 1,
            cols: {
                titleStatus: 0,
                id: 1,
                titleOriginal: 2,
                titleGenerated: 3,
            },
            headers: [
                'Approval',
                'Item ID',
                'Title',
                'Generated Title',
                'Generated Title Template',
                'Original Title Template',
                'Generated Category',
                'Generated Attributes',
                'Introduced Words',
                'Imagined Missing Attributes',
                'Hallucination Score',
                'Original Title Characters',
                'Generated Title Characters',
                'Original Title Words',
                'Generated Title Words',
                'Original Title Attributes (inferred)',
                'Generated Title Attributes',
                'Title Delta Score',
                'Title Changed',
                'Full Response (debug)',
                'original input data',
            ],
        },
        output: {
            startRow: 1,
            name: 'Output Feed',
            cols: {
                id: 0,
                title: 1,
            },
        },
    },
    vertexAi: {
        endpoint: 'us-central1-autopush-aiplatform.sandbox.googleapis.com',
        modelId: 'text-bison@001',
    },
};

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
                console.log(`Error occurred: ${error.message}`);
                retryCount++;
                Utilities.sleep(delayMillies);
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
    constructor(projectId) {
        this.projectId = projectId;
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
        return JSON.parse(UrlFetchApp.fetch(url, params).getContentText());
    }
    predict(prompt) {
        Utilities.sleep(1000);
        console.log(`Prompt: ${prompt}`);
        const predictEndpoint = `https://${CONFIG.vertexAi.endpoint}/v1/projects/${this.projectId}/locations/us-central1/publishers/google/models/${CONFIG.vertexAi.modelId}:predict`;
        const res = this.fetchJson(predictEndpoint, this.addAuth({
            instances: [{ content: prompt }],
            parameters: {
                temperature: 0.1,
                maxOutputTokens: 1024,
                topP: 0.8,
                topK: 1001,
            },
        }));
        console.log(JSON.stringify(res, null, 2));
        return res.predictions[0].content;
    }
    static getInstance(projectId) {
        if (typeof this.instance === 'undefined') {
            this.instance = new VertexHelper(projectId);
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
const projectId = SheetsService.getInstance().getCellValue(CONFIG.sheets.config.name, CONFIG.sheets.config.fields.projectId.row, CONFIG.sheets.config.fields.projectId.col);
function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('FeedGen')
        .addItem('Launch', 'showSidebar')
        .addToUi();
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
    const lastProcessedRow = generatedSheet.getLastRow();
    if (lastProcessedRow >= inputSheet.getLastRow())
        return;
    const row = inputSheet
        .getRange(lastProcessedRow + 1, 1, 1, inputSheet.getMaxColumns())
        .getValues()[0];
    try {
        const inputHeaders = SheetsService.getInstance().getHeaders(inputSheet);
        const optimizedRow = optimizeRow(inputHeaders, row);
        console.log('optimizedRow', optimizedRow);
        generatedSheet.appendRow([false, ...optimizedRow]);
    }
    catch (e) {
        generatedSheet.appendRow([false, ...row, `ERROR: ${e}`]);
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
function getHallucinationMetrics(data, genTitle, genAttributes) {
    const inputContextWords = Util.splitWords(data.join(' '));
    const genTitleWords = Util.splitWords(genTitle);
    const missingGenAttributesInGenTitle = genAttributes.filter(attr => !genTitle.includes(attr));
    const newWordsNotFoundInContext = Util.getSetDifference(genTitleWords, inputContextWords);
    const hallucinationScore = missingGenAttributesInGenTitle.length + newWordsNotFoundInContext.length;
    return [
        newWordsNotFoundInContext.join(', '),
        missingGenAttributesInGenTitle.join(', '),
        hallucinationScore,
    ];
}
const getGenerationMetrics = (origTitle, genTitle, origAttributes, genAttributes) => {
    const origCharCount = charCount(origTitle);
    const genCharCount = charCount(genTitle);
    const origWordCount = wordCount(origTitle);
    const genWordCount = wordCount(genTitle);
    const titleChangeScore = Math.abs(genCharCount - origCharCount) +
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
function optimizeRow(headers, data) {
    const itemId = data[0];
    const origTitle = data[1];
    const dataObj = Object.fromEntries(data.map((item, index) => [headers[index], item]));
    const res = generateTitle(dataObj);
    console.log(res);
    const [origTemplateRow, genCategoryRow, genTemplateRow, genAttributesRow, genTitleRow,] = res.split('\n');
    const genCategory = genCategoryRow.replace(CATEGORY_PROMPT, '').trim();
    const genAttributes = genTemplateRow
        .replace(TEMPLATE_PROMPT, '')
        .split(SEPARATOR);
    const genTemplate = genAttributes
        .map((x) => `<${x.trim()}>`)
        .join(', ');
    const origAttributes = origTemplateRow
        .replace(ORIGINAL_TITLE_TEMPLATE_PROMPT, '')
        .split(SEPARATOR);
    const origTemplate = origAttributes
        .map((x) => `<${x.trim()}>`)
        .join(', ');
    const genAttributeValues = genAttributesRow
        .replace(ATTRIBUTES_PROMPT, '')
        .split(SEPARATOR)
        .map((x) => x.trim());
    const genTitle = genTitleRow.replace(TITLE_PROMPT, '').trim();
    const hallucinationMetrics = getHallucinationMetrics(data, genTitle, genAttributeValues);
    const generationMetrics = getGenerationMetrics(origTitle, genTitle, origAttributes, genAttributes);
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
function charCount(inputString) {
    return inputString.trim().length;
}
function wordCount(inputString) {
    return inputString.trim().split(' ').length;
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
    return Util.executeWithRetry(10, 6000, () => VertexHelper.getInstance(projectId).predict(prompt));
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
    SheetsService.getInstance().setValuesInDefinedRange(CONFIG.sheets.output.name, CONFIG.sheets.output.startRow + 1, 1, rows);
}
function clearApprovedRows() {
    SheetsService.getInstance().clearDefinedRange(CONFIG.sheets.output.name, CONFIG.sheets.output.startRow + 1, 1);
}
function clearGeneratedRows() {
    SheetsService.getInstance().clearDefinedRange(CONFIG.sheets.generated.name, CONFIG.sheets.generated.startRow + 1, 1);
}
function approveFiltered() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.sheets.generated.name);
    const rows = getGeneratedRows();
    if (!sheet || !rows)
        return;
    rows.map((row, index) => {
        row[CONFIG.sheets.generated.cols.titleStatus] = sheet.isRowHiddenByFilter(index + 1 + 1)
            ? row[CONFIG.sheets.generated.cols.titleStatus]
            : true;
        return row;
    });
    writeGeneratedRows(rows);
}
function exportApproved() {
    const feedGenRows = getGeneratedRows().filter(row => {
        return row[CONFIG.sheets.generated.cols.titleStatus] === true;
    });
    console.log('feedGenRows', feedGenRows);
    const approvedRows = getApprovedData();
    console.log('approvedRows', approvedRows);
    const approvedRowsMap = arrayToMap(approvedRows, CONFIG.sheets.output.cols.id);
    const feedGenApprovedRowsMap = {};
    for (const row of feedGenRows) {
        const resRow = [];
        resRow[CONFIG.sheets.output.cols.id] = row[CONFIG.sheets.generated.cols.id];
        resRow[CONFIG.sheets.output.cols.title] =
            row[CONFIG.sheets.generated.cols.titleStatus] === true
                ? row[CONFIG.sheets.generated.cols.titleGenerated]
                : row[CONFIG.sheets.generated.cols.titleOriginal];
        feedGenApprovedRowsMap[row[CONFIG.sheets.generated.cols.id]] = resRow;
    }
    const merged = Object.values(Object.assign(approvedRowsMap, feedGenApprovedRowsMap));
    console.log('merged', merged);
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
