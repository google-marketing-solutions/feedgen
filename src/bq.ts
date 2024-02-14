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
import { parseTitleGenerationData, parseDescriptionResponse } from './app';

/**
 * This is required to avoid treeshaking this file.
 * As long as anything from a file is being used, the entire file
 * is being kept.
 */
export const bq = null;

class BQConf {
  private _batchSize!: number;
  private _batchPointer!: number;
  private _projectId!: string;
  private _dataset!: string;
  private _connectionPath!: string;
  private _idFieldName!: string;
  private _titleFieldName!: string;
  private _inputTable!: string;
  private _modelName!: string;
  private _titlePromptPrefix!: string;
  private _titlePromptsTable!: string;
  private _title_temperature!: number;
  private _title_topK!: number;
  private _title_topP!: number;
  private _title_maxOutputTokens!: number;
  private _titleResponsesTable!: string;
  private _titleOutputsTable!: string;
  private _descriptionPromptPrefix!: string;
  private _descriptionPromptsTable!: string;
  private _description_temperature!: number;
  private _description_topK!: number;
  private _description_topP!: number;
  private _description_maxOutputTokens!: number;
  private _descriptionResponsesTable!: string;
  private _descriptionOutputsTable!: string;
  private _outputsTable!: string;
  private _inputSize!: number;

  getBatchSize() {
    return (
      this._batchSize ??
      (this._batchSize = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.batchSize
      ))
    );
  }

  getBatchPointer() {
    return (
      this._batchPointer ??
      (this._batchPointer = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.batchPointer
      ))
    );
  }

  getProjectId() {
    return (
      this._projectId ??
      (this._projectId = getConfigSheetValue(
        CONFIG.userSettings.vertexAi.gcpProjectId
      ))
    );
  }
  getDataset() {
    return (
      this._dataset ??
      (this._dataset = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.datsetName
      ))
    );
  }
  getConnectionPath() {
    return (
      this._connectionPath ??
      (this._connectionPath = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.modelPath
      ))
    );
  }
  getIdFieldName() {
    return (
      this._idFieldName ??
      (this._idFieldName = getConfigSheetValue(
        CONFIG.userSettings.feed.itemIdColumnName
      ))
    );
  }
  getInputTable() {
    return (
      this._inputTable ??
      (this._inputTable = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.inputTableName
      ))
    );
  }
  getModelName() {
    return (
      this._modelName ??
      (this._modelName = getConfigSheetValue(
        CONFIG.userSettings.vertexAi.languageModelId
      ))
    );
  }
  getTitlePromptPrefix() {
    return (
      this._titlePromptPrefix ??
      (this._titlePromptPrefix = getConfigSheetValue(
        CONFIG.userSettings.title.fullPrompt
      ))
    );
  }
  getTitlePromptsTable() {
    return (
      this._titlePromptsTable ??
      (this._titlePromptsTable = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.titlesPromptsTable
      ))
    );
  }
  getTitle_temperature() {
    return (
      this._title_temperature ??
      (this._title_temperature = getConfigSheetValue(
        CONFIG.userSettings.title.modelParameters.temperature
      ))
    );
  }
  getTitle_topK() {
    return (
      this._title_topK ??
      (this._title_topK = getConfigSheetValue(
        CONFIG.userSettings.title.modelParameters.topK
      ))
    );
  }
  getTitle_topP() {
    return (
      this._title_topP ??
      (this._title_topP = getConfigSheetValue(
        CONFIG.userSettings.title.modelParameters.topP
      ))
    );
  }
  getTitle_maxOutputTokens() {
    return (
      this._title_maxOutputTokens ??
      (this._title_maxOutputTokens = getConfigSheetValue(
        CONFIG.userSettings.title.modelParameters.maxOutputTokens
      ))
    );
  }
  getTitleResponsesTable() {
    return (
      this._titleResponsesTable ??
      (this._titleResponsesTable = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.titlesResponsesTable
      ))
    );
  }
  getTitleOutputsTable() {
    return (
      this._titleOutputsTable ??
      (this._titleOutputsTable = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.titlesOutputTable
      ))
    );
  }
  getDescriptionPromptPrefix() {
    return (
      this._descriptionPromptPrefix ??
      (this._descriptionPromptPrefix = getConfigSheetValue(
        CONFIG.userSettings.description.fullPrompt
      ))
    );
  }
  getDescriptionPromptsTable() {
    return (
      this._descriptionPromptsTable ??
      (this._descriptionPromptsTable = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.descriptionsPromptsTable
      ))
    );
  }
  getDescription_temperature() {
    return (
      this._description_temperature ??
      (this._description_temperature = getConfigSheetValue(
        CONFIG.userSettings.description.modelParameters.temperature
      ))
    );
  }
  getDescription_topK() {
    return (
      this._description_topK ??
      (this._description_topK = getConfigSheetValue(
        CONFIG.userSettings.description.modelParameters.topK
      ))
    );
  }
  getDescription_topP() {
    return (
      this._description_topP ??
      (this._description_topP = getConfigSheetValue(
        CONFIG.userSettings.description.modelParameters.topP
      ))
    );
  }
  getDescription_maxOutputTokens() {
    return (
      this._description_maxOutputTokens ??
      (this._description_maxOutputTokens = getConfigSheetValue(
        CONFIG.userSettings.description.modelParameters.maxOutputTokens
      ))
    );
  }
  getDescriptionResponsesTable() {
    return (
      this._descriptionResponsesTable ??
      (this._descriptionResponsesTable = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.descriptionsResponsesTable
      ))
    );
  }
  getDescriptionOutputsTable() {
    return (
      this._descriptionOutputsTable ??
      (this._descriptionOutputsTable = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.descriptionsOutputTable
      ))
    );
  }
  getOutputsTable() {
    return (
      this._outputsTable ??
      (this._outputsTable = getConfigSheetValue(
        CONFIG.userSettings.bigQuery.outputTable
      ))
    );
  }
  getTitleFieldName() {
    return (
      this._titleFieldName ??
      (this._titleFieldName = getConfigSheetValue(
        CONFIG.userSettings.feed.titleColumnName
      ))
    );
  }
  getInputSize() {
    return this._inputSize ?? (this._inputSize = this._readInputSize());
  }
  private _readInputSize(): number {
    const query = `select count(*) as totalRows from \`${this.getDataset()}.${this.getInputTable()}\``;
    const [values] = runQuery(query);
    const itemCount = parseInt(values[0][0]);
    return itemCount;
  }
}

const bqConf: BQConf = new BQConf();

export function shouldRunInBigQuery() {
  const useBq = getConfigSheetValue(CONFIG.userSettings.bigQuery.useBigQuery);
  Logger.log(`shouldRunInBigQuery:${useBq}`);
  return useBq;
}

export function getBatchSizeAndPointerAndInputSize() {
  MultiLogger.getInstance().log(
    `Batch size: ${bqConf.getBatchSize()}, batch pointer: ${bqConf.getBatchPointer()}, input size: ${bqConf.getInputSize()}`
  );
  return [
    bqConf.getBatchSize(),
    bqConf.getBatchPointer(),
    bqConf.getInputSize(),
  ];
}

//TODO batch pointer and size as params
export function runBigqueryProcess() {
  MultiLogger.getInstance().log(
    `Running BQ process against ${bqConf.getModelName()} model`
  );
  if (bqConf.getModelName() in ['text-bison', 'text-bison-32k']) {
    throw new Error(
      `Model ${bqConf.getModelName()} cannot be used in BigQuery. Choose text-bison or text-bison-32k instead.`
    );
  }

  // generate titles
  generateTitlePrompts();
  runTitleGeneration();
  processTitleResponses();

  // generate descriptions
  generateDescriptionPrompts();
  runDescriptionGeneration();
  processDescriptionResponses();
  // merge titles and descriptions
  mergeTitlesAndDescriptions();
}

export function createModelInBq() {
  MultiLogger.getInstance().log(
    `(re-)Creating model ${bqConf.getModelName()}...`
  );
  const query = `CREATE OR REPLACE MODEL \`${bqConf.getDataset()}.${bqConf.getModelName()}\`
   REMOTE WITH CONNECTION \`${bqConf.getConnectionPath()}\`
  OPTIONS (ENDPOINT = '${bqConf.getModelName()}')`;
  runQuery(query);
  Logger.log(`Model ${bqConf.getModelName()} Created`);
}

function generateTitlePrompts() {
  MultiLogger.getInstance().log(
    `Generating title prompts into ${bqConf.getTitlePromptsTable()}..`
  );
  const query = `create or replace table \`${bqConf.getDataset()}.${bqConf.getTitlePromptsTable()}\` as (
  with contexts as (
    SELECT ${bqConf.getIdFieldName()}, ROW_NUMBER() OVER() as row_number, TO_JSON_STRING(input) as Context
    FROM \`${bqConf.getDataset()}.${bqConf.getInputTable()}\` as input
    ORDER BY ${bqConf.getIdFieldName()}
  )
  SELECT ${bqConf.getIdFieldName()},
    CONCAT("${bqConf
      .getTitlePromptPrefix()
      .replaceAll('\n', '\\n')
      .replaceAll('"', '\\"')}\\n\\n Context: ",Context) as prompt,
    FROM contexts
    WHERE row_number >= ${bqConf.getBatchPointer()}
      AND row_number < ${bqConf.getBatchPointer() + bqConf.getBatchSize()}
  )`;
  runQuery(query);
  Logger.log(`Table ${bqConf.getTitlePromptsTable()} Created`);
}

function runTitleGeneration() {
  MultiLogger.getInstance().log(
    `Generating title responses into ${bqConf.getTitleResponsesTable()}...`
  );
  const query = `create or replace table \`${bqConf.getDataset()}.${bqConf.getTitleResponsesTable()}\` as
  select ml_generate_text_result['predictions'][0]['content'] AS generated_text,
  ml_generate_text_result['predictions'][0]['safetyAttributes'] AS safety_attributes,
  * EXCEPT (ml_generate_text_result)
  FROM
  ML.GENERATE_TEXT(MODEL \`${bqConf.getDataset()}.${bqConf.getModelName()}\`,
  (select ${bqConf.getIdFieldName()}, prompt from \`${bqConf.getDataset()}.${bqConf.getTitlePromptsTable()}\`),
  struct (${bqConf.getTitle_temperature()} AS temperature,
      ${bqConf.getTitle_maxOutputTokens()} AS max_output_tokens,
      ${bqConf.getTitle_topK()} as top_k,
      ${bqConf.getTitle_topP()} as top_p)
  )`;
  runQuery(query);
  Logger.log(`Table ${bqConf.getTitleResponsesTable()} Created`);
}

function processTitleResponses() {
  MultiLogger.getInstance().log(
    `Processing title responses into ${bqConf.getTitleOutputsTable}()}...`
  );
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.feed.itemIdColumnName
  );
  const query = `select items.*, responses.generated_text as generated_text,
  from \`${bqConf.getDataset()}.${bqConf.getTitleResponsesTable()}\` as responses
  join \`${bqConf.getDataset()}.${bqConf.getInputTable()}\` as items
  on responses.${bqConf.getIdFieldName()} = items.${bqConf.getIdFieldName()}`;

  const [values, fields] = runQuery(query);

  const result: Record<string, string>[] = values.map(row => {
    return fields.reduce((acc, field, i) => {
      acc[field] = row[i];
      return acc;
    }, {} as Record<string, string>);
  });

  const objectsWithTitleGenerationData = result.map(inputObj => {
    const dataObj = Object.assign({}, inputObj);
    const origTitle = dataObj[bqConf.getTitleFieldName()];
    let res = dataObj['generated_text'];
    res = res.substring(2, res.length - 1);
    res = res.replaceAll('\\n', '\n');
    try {
      const {
        genCategory,
        origTemplate,
        genTemplate,
        genTitle,
        totalScore,
        titleChanged,
        addedAttributes,
        removedAttributes,
        newWordsAdded,
        wordsRemoved,
        gapAttributesAndValues,
      } = parseTitleGenerationData(res, dataObj, origTitle);
      dataObj['genCategory'] = genCategory;
      dataObj['origTemplate'] = origTemplate;
      dataObj['genTemplate'] = genTemplate;
      dataObj['genTitle'] = genTitle;
      dataObj['totalScore'] = totalScore;
      dataObj['titleChanged'] = titleChanged;
      dataObj['addedAttributes'] = addedAttributes;
      dataObj['removedAttributes'] = removedAttributes;
      dataObj['newWordsAdded'] = newWordsAdded;
      dataObj['wordsRemoved'] = wordsRemoved;
      dataObj['gapAttributesAndValues'] = JSON.stringify(
        gapAttributesAndValues
      );
    } catch (e: unknown) {
      MultiLogger.getInstance().log(
        `Error parsing title generation data for ${dataObj[idFieldName]}: ${e}`
      );
      dataObj['genTitle'] = '#ERROR';
    }
    return dataObj;
  });

  const titleResultsData = objectsWithTitleGenerationData.map(obj => {
    const output: Record<string, string> = {};
    output[idFieldName] = obj[idFieldName];
    output['genTitle'] = obj['genTitle'];
    return output;
  });

  writeToTable(bqConf.getTitleOutputsTable(), titleResultsData, true);

  return objectsWithTitleGenerationData;
}

function generateDescriptionPrompts() {
  MultiLogger.getInstance().log(
    `Generating description prompts into ${bqConf.getDescriptionPromptsTable()}...`
  );
  const query = `create or replace table \`${bqConf.getDataset()}.${bqConf.getDescriptionPromptsTable()}\` as (
  with contexts as (
    SELECT ${bqConf.getIdFieldName()}, ROW_NUMBER() OVER() as row_number, TO_JSON_STRING(input) as Context
    FROM \`${bqConf.getDataset()}.${bqConf.getInputTable()}\` as input
    ORDER BY ${bqConf.getIdFieldName()}
  )
  SELECT ${bqConf.getIdFieldName()},
    CONCAT("${bqConf
      .getDescriptionPromptPrefix()
      .replaceAll('\n', '\\n')
      .replaceAll('"', '\\"')}\\n\\n Context: ",Context) as prompt,
    FROM contexts
    WHERE row_number >= ${bqConf.getBatchPointer()}
      AND row_number < ${bqConf.getBatchPointer() + bqConf.getBatchSize()}
  )`;
  runQuery(query);
  Logger.log(`Table ${bqConf.getDescriptionPromptsTable()} Created`);
}

function runDescriptionGeneration() {
  MultiLogger.getInstance().log(
    `Generating description responses into ${bqConf.getDescriptionResponsesTable}()}...`
  );
  const query = `create or replace table \`${bqConf.getDataset()}.${bqConf.getDescriptionResponsesTable()}\` as
  select ml_generate_text_result['predictions'][0]['content'] AS generated_text,
  ml_generate_text_result['predictions'][0]['safetyAttributes'] AS safety_attributes,
  * EXCEPT (ml_generate_text_result)
  FROM
  ML.GENERATE_TEXT(MODEL \`${bqConf.getDataset()}.${bqConf.getModelName()}\`,
  (select ${bqConf.getIdFieldName()}, prompt from \`${bqConf.getDataset()}.${bqConf.getDescriptionPromptsTable()}\`),
  struct (${bqConf.getDescription_temperature()} AS temperature,
      ${bqConf.getDescription_maxOutputTokens()} AS max_output_tokens,
      ${bqConf.getDescription_topK()} as top_k,
      ${bqConf.getDescription_topP()} as top_p)
  )`;
  runQuery(query);
  Logger.log(`Table ${bqConf.getDescriptionResponsesTable()} Created`);
}

function processDescriptionResponses() {
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.feed.itemIdColumnName
  );

  MultiLogger.getInstance().log(
    `Processing description responses into ${bqConf.getDescriptionOutputsTable()}...`
  );
  const query = `select items.*, responses.generated_text as generated_text,
  from \`${bqConf.getDataset()}.${bqConf.getDescriptionResponsesTable()}\` as responses
  join \`${bqConf.getDataset()}.${bqConf.getInputTable()}\` as items
  on responses.${bqConf.getIdFieldName()} = items.${bqConf.getIdFieldName()}`;

  const [values, fields] = runQuery(query);

  const result: Record<string, string>[] = values.map(row => {
    return fields.reduce((acc, field, i) => {
      acc[field] = row[i];
      return acc;
    }, {} as Record<string, string>);
  });

  const objectsWithDescriptionGenerationData = result.map(inputObj => {
    const dataObj = Object.assign({}, inputObj);
    let res = dataObj['generated_text'];
    res = res.substring(2, res.length - 1);
    res = res.replaceAll('\\n', '\n');
    try {
      const { description, score, evaluation } = parseDescriptionResponse(res);
      dataObj['description'] = description;
      dataObj['score'] = score.toString();
      dataObj['evaluation'] = evaluation;
    } catch (e) {
      dataObj['description'] = '#ERROR';
      dataObj['score'] = '#ERROR';
      dataObj['evaluation'] = '#ERROR';
      MultiLogger.getInstance().log(
        `Error parsing description generation data for ${dataObj[idFieldName]}: ${e}`
      );
    }
    return dataObj;
  });

  const descriptionResultsData = objectsWithDescriptionGenerationData.map(
    obj => {
      const output: Record<string, string> = {};
      output[idFieldName] = obj[idFieldName];
      output['genDescription'] = obj['description'];
      return output;
    }
  );

  writeToTable(
    bqConf.getDescriptionOutputsTable(),
    descriptionResultsData,
    true
  );

  return objectsWithDescriptionGenerationData;
}

function mergeTitlesAndDescriptions() {
  // const query = `insert into \`${bqConf.getDataset()}.${bqConf.getOutputsTable()}\`
  const query = `create or replace table \`${bqConf.getDataset()}.${bqConf.getOutputsTable()}\` as (
  select input.* , titles.genTitle as generated_title, descriptions.genDescription as generated_description,  
  from \`${bqConf.getDataset()}.${bqConf.getTitleOutputsTable()}\` as titles
  join \`${bqConf.getDataset()}.${bqConf.getInputTable()}\` as input on input.${bqConf.getIdFieldName()} = titles.${bqConf.getIdFieldName()}
  join \`${bqConf.getDataset()}.${bqConf.getDescriptionOutputsTable()}\` as descriptions on input.${bqConf.getIdFieldName()} = descriptions.${bqConf.getIdFieldName()})`;
  runQuery(query);
  Logger.log(`Table ${bqConf.getOutputsTable()} Created`);
}

export function storeBatchPointer(batchPointer: number) {
  SheetsService.getInstance().setValuesInDefinedRange(
    CONFIG.sheets.config.name,
    CONFIG.userSettings.bigQuery.batchPointer.row,
    CONFIG.userSettings.bigQuery.batchPointer.col,
    [[batchPointer]]
  );
}

function writeToTable(
  outputTable: string,
  data: Record<string, string>[],
  overwrite = true
) {
  // Create a load job configuration
  const jobConfig = {
    configuration: {
      load: {
        destinationTable: {
          projectId: bqConf.getProjectId(),
          datasetId: bqConf.getDataset(),
          tableId: outputTable,
        },
        autodetect: true,
        writeDisposition: overwrite ? 'WRITE_TRUNCATE' : 'WRITE_APPEND', // Optional: Overwrite if table exists
      },
    },
  };
  const first = data[0];

  const csvRows = [Object.keys(first)].concat(
    data.map(row =>
      Object.values(row).map(value =>
        JSON.stringify(value).replace(/\\"/g, '""')
      )
    )
  );

  const csvData = csvRows.map(values => values.join(',')).join('\n');
  const blob = Utilities.newBlob(csvData, 'application/octet-stream');
  BigQuery?.Jobs?.insert(jobConfig, bqConf.getProjectId(), blob);
}

function runQuery(query: string): [string[][], string[]] {
  const request = { query: query, useLegacySql: false };
  MultiLogger.getInstance().log(`Running query: ${query}`);
  let queryResults = BigQuery.Jobs?.query(request, bqConf.getProjectId());
  const jobId = queryResults?.jobReference?.jobId;
  if (
    queryResults === undefined ||
    queryResults.jobReference === undefined ||
    jobId === undefined ||
    BigQuery === undefined ||
    BigQuery.Jobs === undefined
  ) {
    MultiLogger.getInstance().log(`Query failed to run`);
    return [[], []];
  }
  // Check on status of the Query Job.
  let sleepTimeMs = 500;
  while (!queryResults?.jobComplete) {
    Utilities.sleep(sleepTimeMs);
    sleepTimeMs *= 2;
    queryResults = BigQuery.Jobs.getQueryResults(bqConf.getProjectId(), jobId);
  }

  // Get all the rows of results.
  let rows = queryResults.rows;
  if (!rows) {
    MultiLogger.getInstance().log('No rows returned.');
    return [[], []];
  }
  while (queryResults.pageToken) {
    queryResults = BigQuery.Jobs.getQueryResults(bqConf.getProjectId(), jobId, {
      pageToken: queryResults.pageToken,
    });
    if (!queryResults.rows) {
      MultiLogger.getInstance().log(
        'Query result page returned null result. Breaking'
      );
      break;
    }
    rows = rows.concat(queryResults.rows);
  }

  const data = rows.map(
    row => row.f?.map(cell => cell?.v?.toString() || '') || []
  );

  return [
    data,
    queryResults.schema?.fields?.map(field => field.name || '') || [],
  ];
}

function getConfigSheetValue(field: { row: number; col: number }) {
  return SheetsService.getInstance().getCellValue(
    CONFIG.sheets.config.name,
    field.row,
    field.col
  );
}
