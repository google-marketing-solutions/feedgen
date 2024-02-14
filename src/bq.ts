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

interface BQConf {
  batchSize: number;
  batchPointer: number;
  projectId: string;
  dataset: string;
  connectionPath: string;
  idFieldName: string;
  inputTable: string;
  modelName: string;
  titlePromptPrefix: string;
  titlePromptsTable: string;
  title_temperature: number;
  title_topK: number;
  title_topP: number;
  title_maxOutputTokens: number;
  titleResponsesTable: string;
  titleOutputsTable: string;
  itemCount: number;
  descriptionPromptPrefix: string;
  descriptionPromptsTable: string;
  description_temperature: number;
  description_topK: number;
  description_topP: number;
  description_maxOutputTokens: number;
  descriptionResponsesTable: string;
  descriptionOutputsTable: string;
  outputsTable: string;
}

let bqConf: BQConf;

export function shouldRunInBigQuery() {
  const useBq = getConfigSheetValue(CONFIG.userSettings.bigQuery.useBigQuery);
  Logger.log(`shouldRunInBigQuery:${useBq}`);
  return useBq;
}

export function getBatchSizeAndPointerAndInputSize() {
  bqConf.batchSize = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.batchSize
  );
  bqConf.batchPointer = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.batchPointer
  );
  bqConf.projectId = getConfigSheetValue(
    CONFIG.userSettings.vertexAi.gcpProjectId
  );
  bqConf.dataset = getConfigSheetValue(CONFIG.userSettings.bigQuery.datsetName);
  const itemCount = readInputSize();
  MultiLogger.getInstance().log(
    `Batch size: ${bqConf.batchSize}, batch pointer: ${bqConf.batchPointer}, input size: ${bqConf.itemCount}`
  );
  return [bqConf.batchSize, bqConf.batchPointer, itemCount];
}

function readBqConfig() {
  bqConf = {
    projectId: getConfigSheetValue(CONFIG.userSettings.vertexAi.gcpProjectId),
    dataset = getConfigSheetValue(CONFIG.userSettings.bigQuery.datsetName),
    // connectionPath = getConfigSheetValue(
    //     CONFIG.userSettings.bigQuery.connectionPath
    //   ),
    itemCount = readInputSize(),
    connectionPath = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.modelPath
    ),
    batchSize = getConfigSheetValue(CONFIG.userSettings.bigQuery.batchSize),
    batchPointer = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.batchPointer
    ),
    idFieldName = getConfigSheetValue(
      CONFIG.userSettings.feed.itemIdColumnName
    ),
    inputTable = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.inputTableName
    ),
    modelName = getConfigSheetValue(
      CONFIG.userSettings.vertexAi.languageModelId
    ),
    titlePromptPrefix = getConfigSheetValue(
      CONFIG.userSettings.title.fullPrompt
    ),
    descriptionPromptPrefix = getConfigSheetValue(
      CONFIG.userSettings.description.fullPrompt
    ),

    titlePromptsTable = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.titlesPromptsTable
    ),
    title_temperature = getConfigSheetValue(
      CONFIG.userSettings.title.modelParameters.temperature
    ),
    title_topK = getConfigSheetValue(
      CONFIG.userSettings.title.modelParameters.topK
    ),
    title_topP = getConfigSheetValue(
      CONFIG.userSettings.title.modelParameters.topP
    ),
    title_maxOutputTokens = getConfigSheetValue(
      CONFIG.userSettings.title.modelParameters.maxOutputTokens
    ),
    titleResponsesTable = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.titlesOutputTable
    ),
    titleOutputsTable = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.titlesOutputTable
    ),

    descriptionPromptsTable = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.descriptionsPromptsTable
    ),
    description_temperature = getConfigSheetValue(
      CONFIG.userSettings.description.modelParameters.temperature
    ),
    description_topK = getConfigSheetValue(
      CONFIG.userSettings.description.modelParameters.topK
    ),
    description_topP = getConfigSheetValue(
      CONFIG.userSettings.description.modelParameters.topP
    ),
    description_maxOutputTokens = getConfigSheetValue(
      CONFIG.userSettings.description.modelParameters.maxOutputTokens
    ),
    descriptionResponsesTable = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.descriptionsOutputTable
    ),
    descriptionOutputsTable = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.descriptionsOutputTable
    ),

    outputsTable = getConfigSheetValue(
      CONFIG.userSettings.bigQuery.outputTable
    ),
  };
}

//TODO batch pointer and size as params
export function runBigqueryProcess() {
  readBqConfig();

  MultiLogger.getInstance().log(
    `Running BQ process against ${bqConf.modelName} model`
  );
  if (bqConf.modelName in ['text-bison', 'text-bison-32k']) {
    throw new Error(
      `Model ${bqConf.modelName} cannot be used in BigQuery. Choose text-bison or text-bison-32k instead.`
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
  MultiLogger.getInstance().log(`(re-)Creating model ${bqConf.modelName}...`);
  const query = `CREATE OR REPLACE MODEL \`${bqConf.dataset}.${bqConf.modelName}\`
   REMOTE WITH CONNECTION \`${bqConf.connectionPath}\`
  OPTIONS (ENDPOINT = '${bqConf.modelName}')`;
  runQuery(query);
  Logger.log(`Model ${bqConf.modelName} Created`);
}

function readInputSize(): number {
  MultiLogger.getInstance().log(`Reading input size...`);
  const query = `select count(*) as totalRows from \`${bqConf.dataset}.${bqConf.inputTable}\``;
  const [values] = runQuery(query);
  const itemCount = parseInt(values[0][0]);
  return itemCount;
}

function generateTitlePrompts() {
  MultiLogger.getInstance().log(
    `Generating title prompts into ${bqConf.titlePromptsTable}..`
  );
  const query = `create or replace table \`${bqConf.dataset}.${
    bqConf.titlePromptsTable
  }\` as (
  with contexts as (
    SELECT ${
      bqConf.idFieldName
    }, ROW_NUMBER() OVER() as row_number, TO_JSON_STRING(input) as Context
    FROM \`${bqConf.dataset}.${bqConf.inputTable}\` as input
    ORDER BY ${bqConf.idFieldName}
  )
  SELECT ${bqConf.idFieldName},
    CONCAT("${bqConf.titlePromptPrefix
      .replaceAll('\n', '\\n')
      .replaceAll('"', '\\"')}\\n\\n Context: ",Context) as prompt,
    FROM contexts
    WHERE row_number >= ${bqConf.batchPointer}
      AND row_number < ${bqConf.batchPointer + bqConf.batchSize}
  )`;
  runQuery(query);
  Logger.log(`Table ${bqConf.titlePromptsTable} Created`);
}

function runTitleGeneration() {
  MultiLogger.getInstance().log(
    `Generating title responses into ${bqConf.titleResponsesTable}...`
  );
  const query = `create or replace table \`${bqConf.dataset}.${bqConf.titleResponsesTable}\` as
  select ml_generate_text_result['predictions'][0]['content'] AS generated_text,
  ml_generate_text_result['predictions'][0]['safetyAttributes'] AS safety_attributes,
  * EXCEPT (ml_generate_text_result)
  FROM
  ML.GENERATE_TEXT(MODEL \`${bqConf.dataset}.${bqConf.modelName}\`,
  (select ${bqConf.idFieldName}, prompt from \`${bqConf.dataset}.${bqConf.titlePromptsTable}\`),
  struct (${bqConf.title_temperature} AS temperature,
      ${bqConf.title_maxOutputTokens} AS max_output_tokens,
      ${bqConf.title_topK} as top_k,
      ${bqConf.title_topP} as top_p)
  )`;
  runQuery(query);
  Logger.log(`Table ${bqConf.titleResponsesTable} Created`);
}

function processTitleResponses() {
  MultiLogger.getInstance().log(
    `Processing title responses into ${bqConf.titleOutputsTable}}...`
  );
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.feed.itemIdColumnName
  );
  const query = `select items.*, responses.generated_text as generated_text,
  from \`${bqConf.dataset}.${bqConf.titleResponsesTable}\` as responses
  join \`${bqConf.dataset}.${bqConf.inputTable}\` as items
  on responses.${bqConf.idFieldName} = items.${bqConf.idFieldName}`;
  const titleFieldName = getConfigSheetValue(
    CONFIG.userSettings.feed.titleColumnName
  );
  const [values, fields] = runQuery(query);

  const result: Record<string, string>[] = values.map(row => {
    return fields.reduce((acc, field, i) => {
      acc[field] = row[i];
      return acc;
    }, {} as Record<string, string>);
  });

  const objectsWithTitleGenerationData = result.map(inputObj => {
    const dataObj = Object.assign({}, inputObj);
    const origTitle = dataObj[titleFieldName];
    let res = dataObj['generated_text'];
    res = res.substring(2, res.length - 1);
    res = res.replaceAll('\\n', '\n');
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
    dataObj['gapAttributesAndValues'] = JSON.stringify(gapAttributesAndValues);

    return dataObj;
  });

  const titleResultsData = objectsWithTitleGenerationData.map(obj => {
    const output: Record<string, string> = {};
    output[idFieldName] = obj[idFieldName];
    output['genTitle'] = obj['genTitle'];
    return output;
  });

  writeToTable(bqConf.titleOutputsTable, titleResultsData, true);

  return objectsWithTitleGenerationData;
}

function generateDescriptionPrompts() {
  MultiLogger.getInstance().log(
    `Generating description prompts into ${bqConf.descriptionPromptsTable}}...`
  );
  const query = `create or replace table \`${bqConf.dataset}.${
    bqConf.descriptionPromptsTable
  }\` as (
  with contexts as (
    SELECT ${
      bqConf.idFieldName
    }, ROW_NUMBER() OVER() as row_number, TO_JSON_STRING(input) as Context
    FROM \`${bqConf.dataset}.${bqConf.inputTable}\` as input
    ORDER BY ${bqConf.idFieldName}
  )
  SELECT ${bqConf.idFieldName},
    CONCAT("${bqConf.descriptionPromptPrefix
      .replaceAll('\n', '\\n')
      .replaceAll('"', '\\"')}\\n\\n Context: ",Context) as prompt,
    FROM contexts
    WHERE row_number >= ${bqConf.batchPointer}
      AND row_number < ${bqConf.batchPointer + bqConf.batchSize}
  )`;
  runQuery(query);
  Logger.log(`Table ${bqConf.descriptionPromptsTable} Created`);
}

function runDescriptionGeneration() {
  MultiLogger.getInstance().log(
    `Generating description responses into ${bqConf.descriptionResponsesTable}}...`
  );
  const query = `create or replace table \`${bqConf.dataset}.${bqConf.descriptionResponsesTable}\` as
  select ml_generate_text_result['predictions'][0]['content'] AS generated_text,
  ml_generate_text_result['predictions'][0]['safetyAttributes'] AS safety_attributes,
  * EXCEPT (ml_generate_text_result)
  FROM
  ML.GENERATE_TEXT(MODEL \`${bqConf.dataset}.${bqConf.modelName}\`,
  (select ${bqConf.idFieldName}, prompt from \`${bqConf.dataset}.${bqConf.descriptionPromptsTable}\`),
  struct (${bqConf.description_temperature} AS temperature,
      ${bqConf.description_maxOutputTokens} AS max_output_tokens,
      ${bqConf.description_topK} as top_k,
      ${bqConf.description_topP} as top_p)
  )`;
  runQuery(query);
  Logger.log(`Table ${bqConf.descriptionResponsesTable} Created`);
}

function processDescriptionResponses() {
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.feed.itemIdColumnName
  );

  MultiLogger.getInstance().log(
    `Processing description responses into ${bqConf.descriptionOutputsTable}...`
  );
  const query = `select items.*, responses.generated_text as generated_text,
  from \`${bqConf.dataset}.${bqConf.descriptionResponsesTable}\` as responses
  join \`${bqConf.dataset}.${bqConf.inputTable}\` as items
  on responses.${bqConf.idFieldName} = items.${bqConf.idFieldName}`;

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
    const { description, score, evaluation } = parseDescriptionResponse(res);
    dataObj['description'] = description;
    dataObj['score'] = score.toString();
    dataObj['evaluation'] = evaluation;
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

  writeToTable(bqConf.descriptionOutputsTable, descriptionResultsData, true);

  return objectsWithDescriptionGenerationData;
}

function mergeTitlesAndDescriptions() {
  const query = `insert into \`${bqConf.dataset}.${bqConf.outputsTable}\`
  select input.* , titles.genTitle as generated_title, descriptions.genDescription as generated_description,  
  from \`${bqConf.dataset}.${bqConf.titleOutputsTable} as titles\`
  join \`${bqConf.dataset}.${bqConf.inputTable}\ as input on input.${bqConf.idFieldName} = titles.${bqConf.idFieldName}
  join \`${bqConf.dataset}.${bqConf.descriptionOutputsTable}\` as descriptions in input.${bqConf.idFieldName} = descriptions.${bqConf.idFieldName}};`;
  runQuery(query);
  Logger.log(`Table ${bqConf.outputsTable} Created`);
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
          projectId: bqConf.projectId,
          datasetId: bqConf.dataset,
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
  BigQuery?.Jobs?.insert(jobConfig, bqConf.projectId, blob);
}

function runQuery(query: string): [string[][], string[]] {
  const request = { query: query, useLegacySql: false };
  MultiLogger.getInstance().log(`Running query: ${query}`);
  let queryResults = BigQuery.Jobs?.query(request, bqConf.projectId);
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
    queryResults = BigQuery.Jobs.getQueryResults(bqConf.projectId, jobId);
  }

  // Get all the rows of results.
  let rows = queryResults.rows;
  if (!rows) {
    MultiLogger.getInstance().log('No rows returned.');
    return [[], []];
  }
  while (queryResults.pageToken) {
    queryResults = BigQuery.Jobs.getQueryResults(bqConf.projectId, jobId, {
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
