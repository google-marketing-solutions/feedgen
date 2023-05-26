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

/**
 * This is required to avoid treeshaking this file.
 * As long as anything from a file is being used, the entire file
 * is being kept.
 */
export const app = null;

/**
 * Handle 'onOpen' Sheets event to show menu.
 */
export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FeedGen')
    .addItem('Add Data', 'addData')
    .addItem('Clear Data', 'clearSheet')
    .addToUi();
}

/**
 * Handle 'onEdit' sheets event.
 *
 * @param {GoogleAppsScript.Events.SheetsOnEdit} e
 * @returns {null}
 */
export function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit) {
  // Check if column 'A'
  const column = e.range.getColumn();

  if (column !== 1) return;

  // Determine checked state
  const checked = e.range.isChecked();

  // Determine if control index
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const group = sheet.getRowGroup(e.range.getRowIndex(), 1);

  if (!group) return;

  const isControlIndex = group.getControlIndex() === e.range.getRowIndex();

  // Get group range
  const groupRange = group.getRange();
  const startRow = groupRange.getRowIndex();
  const numRows = groupRange.getNumRows();

  // Set checked state
  const targetRange = sheet.getRange(startRow, 1, numRows, 1);

  // Apply checked status
  if (isControlIndex) {
    if (checked) {
      targetRange.check();
    } else {
      targetRange.uncheck();
    }
  }
}

/**
 * Add artificial data for debugging
 */
export function addData() {
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

  // Reset sheet
  removeAllGroupsFromSheet();
  clearSheet();

  for (const category of categories) {
    // 1 to account for 1-based
    // 1 to skip header row
    // 1 to skip category head
    const range = sheet.getRange(
      rows.length + 1 + 1 + 1,
      1,
      category.items.length
    );
    range.shiftRowGroupDepth(1);

    rows.push([category.name]);

    for (const item of category.items) {
      rows.push([item.title]);
    }
  }

  // Write values to sheet
  sheet.getRange(2, 2, rows.length, rows[0].length).setValues(rows);
}

/**
 * Clear sheet values and groups.
 *
 * @returns {null}
 */
function clearSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

  if (sheet.getLastRow() < 1) return;

  sheet.getRange(2, 1, sheet.getLastRow(), sheet.getLastColumn()).clear();
}

/**
 * Remove all groups from sheet.
 */
function removeAllGroupsFromSheet() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getDataRange().getLastRow();

  for (let row = 1; row < lastRow; row++) {
    const depth = sheet.getRowGroupDepth(row);

    if (depth < 1) continue;
    const group = sheet.getRowGroup(row, depth);

    if (group) {
      group.remove();
    }
  }
}
