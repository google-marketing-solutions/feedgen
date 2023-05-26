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

const app = null;
function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu('FeedGen')
        .addItem('Add Data', 'addData')
        .addItem('Clear Data', 'clearSheet')
        .addToUi();
}
function onEdit(e) {
    const column = e.range.getColumn();
    if (column !== 1)
        return;
    const checked = e.range.isChecked();
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const group = sheet.getRowGroup(e.range.getRowIndex(), 1);
    if (!group)
        return;
    const isControlIndex = group.getControlIndex() === e.range.getRowIndex();
    const groupRange = group.getRange();
    const startRow = groupRange.getRowIndex();
    const numRows = groupRange.getNumRows();
    const targetRange = sheet.getRange(startRow, 1, numRows, 1);
    if (isControlIndex) {
        if (checked) {
            targetRange.check();
        }
        else {
            targetRange.uncheck();
        }
    }
}
function addData() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    const rows = [];
    const categories = [
        {
            name: 'Shoes',
            items: [
                {
                    title: 'Shoe 1',
                },
                {
                    title: 'Shoe 2',
                },
                {
                    title: 'Shoe 3',
                },
            ],
        },
        {
            name: 'Cars',
            items: [
                {
                    title: 'Car 1',
                },
                {
                    title: 'Car 2',
                },
                {
                    title: 'Car 3',
                },
                {
                    title: 'Car 4',
                },
            ],
        },
    ];
    removeAllGroupsFromSheet();
    clearSheet();
    for (const category of categories) {
        const range = sheet.getRange(rows.length + 1 + 1 + 1, 1, category.items.length);
        range.shiftRowGroupDepth(1);
        rows.push([category.name]);
        for (const item of category.items) {
            rows.push([item.title]);
        }
    }
    sheet.getRange(2, 2, rows.length, rows[0].length).setValues(rows);
}
function clearSheet() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() < 1)
        return;
    sheet.getRange(2, 1, sheet.getLastRow(), sheet.getLastColumn()).clear();
}
function removeAllGroupsFromSheet() {
    const sheet = SpreadsheetApp.getActiveSheet();
    const lastRow = sheet.getDataRange().getLastRow();
    for (let row = 1; row < lastRow; row++) {
        const depth = sheet.getRowGroupDepth(row);
        if (depth < 1)
            continue;
        const group = sheet.getRowGroup(row, depth);
        if (group) {
            group.remove();
        }
    }
}

app;
console.log('Hello, World!');
