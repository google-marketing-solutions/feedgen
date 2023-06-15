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
 * Helper class to wrap spreadsheet actions
 */

export class SheetsService {
  private static instance: SheetsService;
  private readonly spreadsheet_: GoogleAppsScript.Spreadsheet.Spreadsheet;

  constructor(spreadsheetId?: string) {
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

  getHeaders(sheet: GoogleAppsScript.Spreadsheet.Sheet) {
    return sheet
      .getRange(1, 1, 1, sheet.getMaxColumns())
      .getValues()[0]
      .filter((cell: string) => cell !== '') as string[];
  }

  getTotalRows(sheetName: string) {
    const sheet = this.spreadsheet_.getSheetByName(sheetName);

    if (!sheet) return;

    return sheet.getDataRange().getLastRow();
  }

  getTotalColumns(sheetName: string) {
    const sheet = this.spreadsheet_.getSheetByName(sheetName);

    if (!sheet) return;

    return sheet.getDataRange().getLastColumn();
  }

  getNonEmptyRows(sheet: GoogleAppsScript.Spreadsheet.Sheet) {
    return sheet
      .getDataRange()
      .getValues()
      .filter((row: string[]) => row.join('').length > 0);
  }

  /**
   * Retrieves data from the underlying spreadsheet using the provided range
   * parameters and sheet name.
   *
   * @param {string} sheetName The name of the sheet
   * @param {number} startRow The range's start row
   * @param {number} startCol The range's start column
   * @param {number=} numRows Optional number of rows to retrieve. Defaults to
   *     all available rows
   * @param {number=} numCols Optional number of columns to retrieve. Defaults
   *     to all available columns
   * @return {?Array<?Array<?Object>>} The data found at the specified range
   */
  getRangeData(
    sheetName: string,
    startRow: number,
    startCol: number,
    numRows = 0,
    numCols = 0
  ) {
    const sheet = this.getSpreadsheet().getSheetByName(sheetName);

    // Return empty result if no rows
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

  /**
   * Writes the given values in the specified sheet and range.
   *
   * @param {string} sheetName The name of the sheet
   * @param {number} row The range's start row (1-based)
   * @param {number} col The range's start col (1-based)
   * @param {?Array<?Array<string|number|undefined|boolean>>} values The values to write
   */
  setValuesInDefinedRange(
    sheetName: string,
    row: number,
    col: number,
    values: Array<Array<string | number | undefined | boolean>>
  ) {
    const sheet = this.getSpreadsheet().getSheetByName(sheetName);

    if (!sheet) return;

    if (values[0]) {
      sheet
        .getRange(row, col, values.length, values[0].length)
        .setValues(values);
    }
  }

  /**
   * Clears the given range in the given sheet.
   *
   * @param {string} sheetName The name of the sheet
   * @param {number} row The range's start row
   * @param {number} col The range's start col
   * @param {number=} numRows Optional number of rows to clear. Defaults to
   *     all available rows
   * @param {number=} numCols Optional number of columns to clear. Defaults
   *     to all available columns
   */
  clearDefinedRange(
    sheetName: string,
    row: number,
    col: number,
    numRows = 0,
    numCols = 0
  ) {
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

  /**
   * Retrieves a cell's value by the given parameters.
   *
   * @param {string} sheetName The name of the sheet
   * @param {number} row The row identifier
   * @param {number} col The column identifier
   * @returns {?Object|null} The value of the cell
   */
  getCellValue(sheetName: string, row: number, col: number) {
    const sheet = this.getSpreadsheet().getSheetByName(sheetName);

    if (!sheet) return null;

    const cell = sheet.getRange(row, col);

    return cell.getValue();
  }

  /**
   * Sets a cell's value by the given parameters.
   *
   * @param {number} row The row identifier
   * @param {number} col The column identifier
   * @param {string} val The value to set
   * @param {?string=} sheetName The name of the sheet to use. Uses the
   *     sheet the user currently has open (active sheet) if not given
   */
  setCellValue(row: number, col: number, val: string, sheetName?: string) {
    const sheet = sheetName
      ? this.getSpreadsheet().getSheetByName(sheetName)
      : this.getSpreadsheet().getActiveSheet();

    if (!sheet) return;

    sheet.getRange(row, col).setValue(val);
  }

  /**
   * Returns the initialized {@link SpreadsheetApp.Spreadsheet} reference.
   *
   * @return {?SpreadsheetApp.Spreadsheet} The spreadsheet
   */
  getSpreadsheet() {
    return this.spreadsheet_;
  }

  /**
   * Returns the {@link SpreadsheetApp} reference.
   *
   * @return {!Object} The SpreadsheetApp reference
   */
  getSpreadsheetApp() {
    return SpreadsheetApp;
  }

  /**
   * Returns the SheetsService instance, initializing it if it does not exist yet.
   *
   * @param {string} spreadsheetId
   * @returns {!SheetsService} The initialized SheetsService instance
   */
  static getInstance(spreadsheetId?: string) {
    if (typeof this.instance === 'undefined') {
      this.instance = new SheetsService(spreadsheetId);
    }
    return this.instance;
  }
}
