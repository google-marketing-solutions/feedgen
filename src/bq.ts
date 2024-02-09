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
import { parseTitleGenerationData, parseDescriptionResponse } from './app';

/**
 * This is required to avoid treeshaking this file.
 * As long as anything from a file is being used, the entire file
 * is being kept.
 */
export const bq = null;

export function shouldRunInBigQuery() {
  const useBq = getConfigSheetValue(CONFIG.userSettings.bigQuery.useBigQuery);
  Logger.log(`shouldRunInBigQuery:${useBq}`);
  return useBq;
}

export function runBigqueryProcess() {
  const project = getConfigSheetValue(
    CONFIG.userSettings.vertexAi.gcpProjectId
  );
  const dataset = getConfigSheetValue(CONFIG.userSettings.bigQuery.datsetName);
  const inputTable = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.inputTableName
  );
  const modelPath = getConfigSheetValue(CONFIG.userSettings.bigQuery.modelPath);
  const modelName = getConfigSheetValue(
    CONFIG.userSettings.vertexAi.languageModelId
  );
  const titlePromptPrefix = getConfigSheetValue(
    CONFIG.userSettings.title.fullPrompt
  );
  const descriptionPromptPrefix = getConfigSheetValue(
    CONFIG.userSettings.description.fullPrompt
  );

  const titlePromptTable = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.titlesPromptsTable
  );
  const title_temperature = getConfigSheetValue(
    CONFIG.userSettings.title.modelParameters.temperature
  );
  const title_topK = getConfigSheetValue(
    CONFIG.userSettings.title.modelParameters.topK
  );
  const title_topP = getConfigSheetValue(
    CONFIG.userSettings.title.modelParameters.topP
  );
  const title_maxOutputTokens = getConfigSheetValue(
    CONFIG.userSettings.title.modelParameters.maxOutputTokens
  );
  const titleResponsesTable = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.titlesOutputTable
  );
  const titlesOutputTable = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.titlesOutputTable
  );

  const descriptionsPromptsTable = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.descriptionsPromptsTable
  );
  const description_temperature = getConfigSheetValue(
    CONFIG.userSettings.description.modelParameters.temperature
  );
  const description_topK = getConfigSheetValue(
    CONFIG.userSettings.description.modelParameters.topK
  );
  const description_topP = getConfigSheetValue(
    CONFIG.userSettings.description.modelParameters.topP
  );
  const description_maxOutputTokens = getConfigSheetValue(
    CONFIG.userSettings.description.modelParameters.maxOutputTokens
  );
  const descriptionResponsesTable = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.descriptionsOutputTable
  );
  const descriptionsOutputTable = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.descriptionsOutputTable
  );

  const outputTable = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.outputTable
  );

  const batchPointer = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.batchPointer
  );
  const batchSize = getConfigSheetValue(CONFIG.userSettings.bigQuery.batchSize);

  MultiLogger.getInstance().log(
    `Running BQ process against ${modelName} model`
  );
  if (modelName in ['text-bison', 'text-bison-32k']) {
    throw new Error(
      `Model ${modelName} cannot be used in BigQuery. Choose text-bison or text-bison-32k instead.`
    );
  }

  createModelInBq(project, dataset, modelPath, modelName);
  const itemCount = readInputSize(project, dataset);
  // while (batchPointer < itemCount) {
  // generate titles
  generateTitlePrompts(
    project,
    dataset,
    inputTable,
    titlePromptPrefix,
    batchPointer,
    batchSize
  );
  runTitleGeneration(
    project,
    dataset,
    modelName,
    titlePromptTable,
    titleResponsesTable,
    title_temperature,
    title_maxOutputTokens,
    title_topK,
    title_topP
  );
  processTitleResponses(
    project,
    dataset,
    titleResponsesTable,
    titlesOutputTable
  );

  // generate descriptions
  generateDescriptionPrompts(
    project,
    dataset,
    inputTable,
    descriptionsPromptsTable,
    descriptionPromptPrefix,
    batchPointer,
    batchSize
  );
  runDescriptionGeneration(
    project,
    dataset,
    modelName,
    descriptionsPromptsTable,
    descriptionResponsesTable,
    title_temperature,
    title_maxOutputTokens,
    title_topK,
    title_topP
  );
  processDescriptionResponses(
    project,
    dataset,
    descriptionResponsesTable,
    descriptionsOutputTable
  );
  // merge titles and descriptions
  mergeTitlesAndDescriptions(
    project,
    dataset,
    titlesOutputTable,
    descriptionsOutputTable,
    outputTable
  );
  //   batchPointer += batchSize;
  //   storeBatchPointer(batchPointer);
  // }
}

function createModelInBq(
  projectId: string,
  dataset: string,
  connectionPath: string,
  modelName: string
) {
  MultiLogger.getInstance().log(`(re-)Creating model ${modelName}...`);
  const query = `CREATE OR REPLACE MODEL \`${dataset}.${modelName}\`
   REMOTE WITH CONNECTION \`${connectionPath}\`
  OPTIONS (ENDPOINT = '${modelName}')`;
  runQuery(projectId, query);
  Logger.log(`Model ${modelName} Created`);
}

function readInputSize(projectId: string, dataset: string): number {
  MultiLogger.getInstance().log(`Reading input size...`);
  const inputTable = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.inputTableName
  );
  const query = `select count(*) as totalRows from \`${dataset}.${inputTable}\``;
  const [values, fields] = runQuery(projectId, query);
  const itemCount = parseInt(values[0][0]);
  return itemCount;
}

function generateTitlePrompts(
  projectId: string,
  dataset: string,
  inputTable: string,
  titlePromptPrefix: string,
  batchPointer: number,
  batchSize: number
) {
  MultiLogger.getInstance().log(`Generating title prompts...`);
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.inputTableName
  );
  const titlePromptsTable = 'title_prompts';
  const query = `create or replace table \`${dataset}.${titlePromptsTable}\` as (
  with contexts as (
    SELECT ${idFieldName}, ROW_NUMBER() OVER() as row_number, TO_JSON_STRING(input) as Context
    FROM \`${dataset}.${inputTable}\` as input
    ORDER BY ${idFieldName}
  )
  SELECT ${idFieldName},
    CONCAT("${titlePromptPrefix
      .replaceAll('\n', '\\n')
      .replaceAll('"', '\\"')}",Context) as prompt,
    FROM contexts
    WHERE row_number >= ${batchPointer}
      AND row_number < ${batchPointer + batchSize}
  )`;
  runQuery(projectId, query);
  Logger.log(`Table ${titlePromptsTable} Created`);
}

function runTitleGeneration(
  projectId: string,
  dataset: string,
  modelName: string,
  titlePromptsTable: string,
  titleResponsesTable: string,
  temperature: number,
  maxOutputTokens: number,
  topK: number,
  topP: number
) {
  MultiLogger.getInstance().log(`Generating title responses...`);
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.inputTableName
  );
  const query = `create or replace table \`${dataset}.${titleResponsesTable}\` as
  select ml_generate_text_result['predictions'][0]['content'] AS generated_text,
  ml_generate_text_result['predictions'][0]['safetyAttributes'] AS safety_attributes,
  * EXCEPT (ml_generate_text_result)
  FROM
  ML.GENERATE_TEXT(MODEL \`${dataset}.${modelName}\`,
  (select ${idFieldName}, prompt from \`${dataset}.${titlePromptsTable}\`),
  struct (${temperature} AS temperature,
      ${maxOutputTokens} AS max_output_tokens,
      ${topK} as top_k,
      ${topP} as top_p)
  )`;
  runQuery(projectId, query);
  Logger.log(`Table ${titleResponsesTable} Created`);
}

function processTitleResponses(
  project: string,
  dataset: string,
  titleResponsesTable: string,
  titlesOutputTable: string
) {
  MultiLogger.getInstance().log(`Processing title responses...`);
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.feed.itemIdColumnName
  );
  const query = `select items.*, responses.generated_text as generated_text,
  from \`${dataset}.${titleResponsesTable}\` as responses
  join \`${dataset}.${getConfigSheetValue(
    CONFIG.userSettings.bigQuery.inputTableName
  )}\` as items
  on responses.${idFieldName} = items.${idFieldName}`;
  const titleFieldName = getConfigSheetValue(
    CONFIG.userSettings.feed.titleColumnName
  );
  const [values, fields] = runQuery(project, query);

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

  writeToTable(project, dataset, titlesOutputTable, titleResultsData, true);

  return objectsWithTitleGenerationData;
}

function generateDescriptionPrompts(
  projectId: string,
  dataset: string,
  inputTable: string,
  descriptionsPromptsTable: string,
  descriptionPromptPrefix: string,
  batchPointer: number,
  batchSize: number
) {
  MultiLogger.getInstance().log(`Generating description prompts...`);
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.inputTableName
  );
  const query = `create or replace table \`${dataset}.${descriptionsPromptsTable}\` as (
  with contexts as (
    SELECT ${idFieldName}, ROW_NUMBER() OVER() as row_number, TO_JSON_STRING(input) as Context
    FROM \`${dataset}.${inputTable}\` as input
    ORDER BY ${idFieldName}
  )
  SELECT ${idFieldName},
    CONCAT("${descriptionPromptPrefix
      .replaceAll('\n', '\\n')
      .replaceAll('"', '\\"')}",Context) as prompt,
    FROM contexts
    WHERE row_number >= ${batchPointer}
      AND row_number < ${batchPointer + batchSize}
  )`;
  runQuery(projectId, query);
  Logger.log(`Table ${descriptionsPromptsTable} Created`);
}

function runDescriptionGeneration(
  projectId: string,
  dataset: string,
  modelName: string,
  descriptionsPromptsTable: string,
  descriptionsResponsesTable: string,
  temperature: number,
  maxOutputTokens: number,
  topK: number,
  topP: number
) {
  MultiLogger.getInstance().log(`Generating title responses...`);
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.inputTableName
  );
  const query = `create or replace table \`${dataset}.${descriptionsResponsesTable}\` as
  select ml_generate_text_result['predictions'][0]['content'] AS generated_text,
  ml_generate_text_result['predictions'][0]['safetyAttributes'] AS safety_attributes,
  * EXCEPT (ml_generate_text_result)
  FROM
  ML.GENERATE_TEXT(MODEL \`${dataset}.${modelName}\`,
  (select ${idFieldName}, prompt from \`${dataset}.${descriptionsPromptsTable}\`),
  struct (${temperature} AS temperature,
      ${maxOutputTokens} AS max_output_tokens,
      ${topK} as top_k,
      ${topP} as top_p)
  )`;
  runQuery(projectId, query);
  Logger.log(`Table ${descriptionsResponsesTable} Created`);
}

function processDescriptionResponses(
  project: string,
  dataset: string,
  descriptionResponsesTable: string,
  descriptionsOutputTable: string
) {
  const idFieldName = getConfigSheetValue(
    CONFIG.userSettings.bigQuery.inputTableName
  );

  MultiLogger.getInstance().log(`Processing description responses...`);
  const query = `select items.*, responses.generated_text as generated_text,
  from \`${dataset}.${descriptionResponsesTable}\` as responses
  join \`${dataset}.${getConfigSheetValue(
    CONFIG.userSettings.bigQuery.inputTableName
  )}\` as items
  on responses.${idFieldName} = items.${idFieldName}`;

  const [values, fields] = runQuery(project, query);

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

  writeToTable(
    project,
    dataset,
    descriptionsOutputTable,
    descriptionResultsData,
    true
  );

  return objectsWithDescriptionGenerationData;
}

function mergeTitlesAndDescriptions(
  project: string,
  dataset: string,
  titlesTable: string,
  descriptionsTable: string,
  outputTable: string
) {}

function storeBatchPointer(batchPointer: number) {
  SheetsService.getInstance().setValuesInDefinedRange(
    CONFIG.sheets.config.name,
    CONFIG.userSettings.bigQuery.batchPointer.row,
    CONFIG.userSettings.bigQuery.batchPointer.col,
    [[batchPointer]]
  );
}

function writeToTable(
  project: string,
  dataset: string,
  outputTable: string,
  data: Record<string, string>[],
  overwrite = true
) {
  // Create a load job configuration
  const jobConfig = {
    configuration: {
      load: {
        destinationTable: {
          projectId: project,
          datasetId: dataset,
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
  BigQuery?.Jobs?.insert(jobConfig, project, blob);
}

function runQuery(projectId: string, query: string): [string[][], string[]] {
  const request = { query: query, useLegacySql: false };
  MultiLogger.getInstance().log(`Running query: ${query}`);
  let queryResults = BigQuery.Jobs?.query(request, projectId);
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
    queryResults = BigQuery.Jobs.getQueryResults(projectId, jobId);
  }

  // Get all the rows of results.
  let rows = queryResults.rows;
  if (!rows) {
    MultiLogger.getInstance().log('No rows returned.');
    return [[], []];
  }
  while (queryResults.pageToken) {
    queryResults = BigQuery.Jobs.getQueryResults(projectId, jobId, {
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
