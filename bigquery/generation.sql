/**
    Copyright 2024 Google LLC
    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at
        https://www.apache.org/licenses/LICENSE-2.0
    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
 */



CREATE OR REPLACE FUNCTION `[DATASET]`.TitlesPrompt(
  LANGUAGE STRING,
  EXAMPLES ARRAY<STRUCT<id STRING, properties STRING, title STRING, description STRING>>,
  PROPERTIES ARRAY<STRING>) AS (
  CONCAT(
    """You are a leading digital marketer working for a top retail organisation.
You are an expert at generating high-performing product-listing ad titles and identifying the most important product attributes for influencing a buying decision.


Given the input product data below, for each described product generate a title in """,
    LANGUAGE,
    """. Adhere to the following rules:
1) Put each title on a separate output line, in the same order as the input, and prepended with the product's ID.
2) Don't make this a numbered list or a list with dashes: each title must consist of pure text, without any formatting characters.
3) Do not prepend your output with a headline announcing what's following.
4) Each title must list product attributes, should not exceed 20 words warranted by the product data, among them no duplicates.
5) If there is a named size attribute, prefix its value with the word for "Size" in the requested language and replace long identifiers with their usual abbreviations. (E.g. for English, this means Small, Medium, Large and X-Large are to be replaced by S, M, L and XL, respectively.)
6) Product attributes should be enumerated with commas, as seen in the examples, but not vertical bars, dashes or parentheses.
7) Write dimension without spaces, i.e. do not use "10 x 5 cm", but instead "10×5cm".


Let's first look at some examples of how to write good titles:""",
    "\n\nExample input product data:\n\n", ARRAY_TO_STRING(
      (SELECT ARRAY_AGG(properties) FROM UNNEST(EXAMPLES)), '\n', ''),
    "\n\nExample output product titles (adhering to all seven rules):\n\n", ARRAY_TO_STRING(
      (SELECT ARRAY_AGG(CONCAT(id, ': ', title)) FROM UNNEST(EXAMPLES)), '\n', ''),
    """\n\nBefore getting to the actual task at hand, let's remember the rules by looking at some bad examples for titles and how they would be corrected:
- "McDonald's Hamburger; great hamburger for evenings; with 200g meat, ketchup & salad" – this violates rule 3, as it has duplication and makes claims that are not objective attributes, and rule 6, as it uses semicolons instead of commas. Better: "McDonald's Hamburger, with 200g meat, ketchup & salad"
- "Siemens dishwasher DW45, 50 x 50 x 70 cm, (1231254)" – this violates rule 4, as it mentions a useless ID, and rule 7, as it uses spaces inside the dimensions. Better: "Siemens dishwasher DW45, 50×50×70cm"
- "Walkation runners' shoes, Xtra-large, beige, vegan leather" – this violates rule 5, as the named size attribute is not prefixed, nor abbreviated. Better: "Walkation runners' shoes, Size XL, beige, vegan leather"
- "IKEA - Hemnes Bed, 210 x 100cm, birch, reinforced frame" – this violates rule 6, as it separates the brand from the product name with a dash instead of a comma, and rule 7, as it has spaces between the dimensions. Better: "IKEA Hemnes Bed, 210×100cm, birch, reinforced frame"
- "axion Kinesio Tape Rolle Pink – 500 x 5 cm, 1 St" – this violates rule 6, as it separates the brand from the product name with a dash instead of a comma, and rule 7, as it has spaces between the dimensions. Better: "axion Kinesio Tape Rolle, pink, 500×5cm, 1 St"


Now let's tackle the actual task at hand:""",
    "\n\nActual input product data:\n\n", ARRAY_TO_STRING(PROPERTIES, '\n', ''),
    "\n\nActual output product titles (adhering to all seven rules):\n\n"
    )
);


CREATE OR REPLACE FUNCTION `[DATASET]`.DescriptionsPrompt(
  LANGUAGE STRING,
  EXAMPLES ARRAY<STRUCT<id STRING, properties STRING, title STRING, description STRING>>,
  PROPERTIES ARRAY<STRING>) AS (
  CONCAT(
    """You are a leading digital marketer working for a top retail organisation.
You are an expert at generating product descriptions that increase the likelihood for the product to be bought, without misleading the customer.


Given the product data below, for each described product generate a description in grammatically correct """,
    LANGUAGE,
    """, each one on a separate output line, in the same order as the input, and prepended with the product's ID.
Don't make this a numbered list or a list with dashes: each description must consist of pure text, without any formatting characters.
Do not prepend your output with a headline announcing what's following.
The description should be detailed, but should not exceed 100 words, and only contain claims justifiable from the product data.


Before looking at the actual product data to be processed, let's look at some examples:""",
    "\n\nExample input product data:\n\n", ARRAY_TO_STRING(
      (SELECT ARRAY_AGG(properties) FROM UNNEST(EXAMPLES)), '\n', ''),
    "\n\nExample output product descriptions (in the same order as the input, prepended with the respective ID, but without headline, without empty lines, without indentation, without leading dashes):\n\n", ARRAY_TO_STRING(
      (SELECT ARRAY_AGG(CONCAT(id, ': ', description)) FROM UNNEST(EXAMPLES)), '\n', ''),
    "\n\nNow let's tackle the actual task at hand:",
    "\n\nActual input product data:\n\n", ARRAY_TO_STRING(PROPERTIES, '\n', ''),
    "\n\nActual output product descriptions (in the same order as the input, prepended with the respective ID, but without headline, without empty lines, without indentation, without leading dashes):\n\n"
    )
);


CREATE OR REPLACE PROCEDURE `[DATASET].BatchedUpdateTitles`(
  ITEMS_PER_PROMPT INT64,
  LANGUAGE STRING,
  PARTS INT64,
  PART INT64,
  IDS ARRAY<STRING>)
BEGIN
  DECLARE EXAMPLES ARRAY<STRUCT<id STRING, properties STRING, title STRING, description STRING>> DEFAULT (
    SELECT ARRAY_AGG(Examples) FROM fg_me2.Examples
  );
  LOOP
    IF (
      SELECT COUNT(*) = 0 AND IDS IS NULL
      FROM `[DATASET]`.Output
      WHERE title IS NULL AND tries < 3
        AND (PARTS IS NULL OR ABS(MOD(FARM_FINGERPRINT(id), PARTS)) = PART)
    ) THEN LEAVE;
    END IF;

    -- Generate prompts
    CREATE OR REPLACE TEMP TABLE Prompts AS
    WITH
      Input AS (
        SELECT id, TO_JSON_STRING(I) AS properties
        FROM `[DATASET]`.Output AS O
        INNER JOIN `[DATASET]`.InputProcessing AS I USING (id)
        WHERE (PARTS IS NULL OR ABS(MOD(FARM_FINGERPRINT(id), PARTS)) = PART)
          AND IF(IDS IS NOT NULL,
            O.id IN UNNEST(IDS),
            O.title IS NULL AND O.tries < 3)
        ORDER BY RAND()
        LIMIT 600 -- TODO: Find out how to use a parameter ITEMS_PER_ITERATION here.
      ),
      Numbered AS (
        SELECT id, properties, ROW_NUMBER() OVER (ORDER BY id) - 1 AS row_id
        FROM Input
      )
    SELECT
      DIV(row_id, ITEMS_PER_PROMPT) AS chunk_id,
      `[DATASET]`.TitlesPrompt(LANGUAGE, EXAMPLES, ARRAY_AGG(properties ORDER BY id)) AS prompt,
      ARRAY_AGG(id ORDER BY id) AS ids
    FROM Numbered
    GROUP BY 1;

    -- Generate titles
    CREATE OR REPLACE TEMP TABLE Generated AS
    SELECT ids, COALESCE(SPLIT(ml_generate_text_llm_result, '\n'), ids) AS output,
    FROM
      ML.GENERATE_TEXT(
        MODEL `[DATASET]`.GeminiFlash,
        TABLE Prompts,
        STRUCT(
          0.1 AS temperature,
          2048 AS max_output_tokens,
          TRUE AS flatten_json_output));

    -- Store generated titles in output feed
    MERGE `[DATASET]`.Output AS O
    USING (
      SELECT
        COALESCE(REGEXP_EXTRACT(output, r'^([^:]+): .*'), REGEXP_EXTRACT(output, r'^([^:]+)$')) AS id,
        REGEXP_EXTRACT(output, r'^[^:]+: (.*)$') AS title
      FROM Generated AS G
      CROSS JOIN G.output
      QUALIFY ROW_NUMBER() OVER (PARTITION BY id) = 1 AND id IN UNNEST(G.ids)
    ) AS G
      ON O.id = G.id
    WHEN MATCHED THEN UPDATE SET
      O.title = IFNULL(G.title, O.title),
      O.tries = O.tries + 1;


    IF IDS IS NOT NULL THEN LEAVE;
    END IF;
  END LOOP;
END;


CREATE OR REPLACE PROCEDURE `[DATASET].BatchedUpdateDescriptions`(
  ITEMS_PER_PROMPT INT64,
  LANGUAGE STRING,
  PARTS INT64,
  PART INT64,
  IDS ARRAY<STRING>)
BEGIN
  DECLARE EXAMPLES ARRAY<STRUCT<id STRING, properties STRING, title STRING, description STRING>> DEFAULT (
    SELECT ARRAY_AGG(Examples) FROM fg_me2.Examples
  );
  LOOP
    IF (
      SELECT COUNT(*) = 0 AND IDS IS NULL
      FROM `[DATASET]`.Output
      WHERE description IS NULL AND tries < 3
        AND (PARTS IS NULL OR ABS(MOD(FARM_FINGERPRINT(id), PARTS)) = PART)
    ) THEN LEAVE;
    END IF;

    -- Generate prompts
    CREATE OR REPLACE TEMP TABLE Prompts AS
    WITH
      Input AS (
        SELECT id, TO_JSON_STRING(I) AS properties
        FROM `[DATASET]`.Output AS O
        INNER JOIN `[DATASET]`.InputProcessing AS I USING (id)
        WHERE (PARTS IS NULL OR ABS(MOD(FARM_FINGERPRINT(id), PARTS)) = PART)
          AND IF(IDS IS NOT NULL,
            O.id IN UNNEST(IDS),
            O.description IS NULL AND O.tries < 3)
        ORDER BY RAND()
        LIMIT 600 -- TODO: Find out how to use a parameter ITEMS_PER_ITERATION here.
      ),
      Numbered AS (
        SELECT id, properties, ROW_NUMBER() OVER (ORDER BY id) - 1 AS row_id
        FROM Input
      )
    SELECT
      DIV(row_id, ITEMS_PER_PROMPT) AS chunk_id,
      `[DATASET]`.DescriptionsPrompt(LANGUAGE, EXAMPLES, ARRAY_AGG(properties ORDER BY id)) AS prompt,
      ARRAY_AGG(id ORDER BY id) AS ids
    FROM Numbered
    GROUP BY 1;

    -- Generate descriptions
    CREATE OR REPLACE TEMP TABLE Generated AS
    SELECT ids, COALESCE(SPLIT(ml_generate_text_llm_result, '\n'), ids) AS output,
    FROM
      ML.GENERATE_TEXT(
        MODEL `[DATASET]`.GeminiFlash,
        TABLE Prompts,
        STRUCT(
          0.1 AS temperature,
          2048 AS max_output_tokens,
          TRUE AS flatten_json_output));

    -- Store generated descriptions in output feed
    MERGE `[DATASET]`.Output AS O
    USING (
      SELECT
        COALESCE(REGEXP_EXTRACT(output, r'^([^:]+): .*'), REGEXP_EXTRACT(output, r'^([^:]+)$')) AS id,
        REGEXP_EXTRACT(output, r'^[^:]+: (.*)$') AS description
      FROM Generated AS G
      CROSS JOIN G.output
      QUALIFY ROW_NUMBER() OVER (PARTITION BY id) = 1 AND id IN UNNEST(G.ids)
    ) AS G
      ON O.id = G.id
    WHEN MATCHED THEN UPDATE SET
      O.description = IFNULL(G.description, O.description),
      O.tries = O.tries + 1;

    IF IDS IS NOT NULL THEN LEAVE;
    END IF;
  END LOOP;
END;

