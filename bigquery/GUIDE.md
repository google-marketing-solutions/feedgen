<!--
Copyright 2024 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# User's Guide

Below, you find step-by-step instructions on how to install and apply our BigQuery scripts to improve product feeds. Placeholders and examples are prefixed with "👉" and need to be replaced with the actual names before execution.

[1. Deploy model & stored procedures](#1-deploy-model--stored-procedures)\
[2. Prepare input feed](#2-prepare-input-feed)\
[3. Prepare examples](#3-prepare-examples)\
[4. Prepare output table](#4-prepare-output-table)\
[5. Trigger generation of titles & descriptions](#5-trigger-generation-of-titles--descriptions)\
[6. Check results](#6-check-results)\
[7. Export to Merchant Center](#7-export-to-merchant-center)

## 1. Deploy model & stored procedures

Download [generation.sql](./generation.sql) and [install.sh](./install.sh), execute the latter (in GCP: `bash install.sh`) and input the requested configuration. Alternatively, you can perform the following manually:
1. [Create a dataset](https://cloud.google.com/bigquery/docs/datasets#create-dataset). Use the chosen name instead of `[👉DATASET]` in the code below.
2. [Create a connection](https://cloud.google.com/bigquery/docs/generate-text-tutorial\#create\_a\_connection). Use the chosen name instead of `[👉CONNECTION]` in the code below.
4. [Grant](https://console.corp.google.com/iam-admin/iam) *Vertex AI User* to the connection's service account.
5. [Create a model](https://cloud.google.com/bigquery/docs/reference/standard-sql/bigqueryml-syntax-create-remote-model) `GeminiFlash` in your dataset. (You can find the needed command near the end of [install.sh](./install.sh).)
6. In [these scripts](generation.sql), replace all occurrences of `[DATASET]` with the actual one to be used, and execute them. This deploys the stored functions (building prompts) and procedures (using prompts).

⚠️ Note: Before deploying these functions, or as an improvement after initial testing, you may want to modify them so that the prompts reflect your preferences for the titles and descriptions in terms of length, tone and other aspects, perhaps even adapted to the product category at hand. To improve the output quality with languages other than English, the prompts might also be re-written in that language.

## 2. Prepare input feed

The main procedures expect the data to be in a table `InputProcessing`, which needs a field `id` (with a unique identifier for each product) along with the feed's actual data fields. All those other fields are going to be used for the generation of titles and descriptions, so what should not be used should not be in `InputProcessing`.

The following describes how that table might be filled. You don't have to follow this, but may need to adapt later examples to your nomenclature.

1. **Put some superset of the needed feed in `InputRaw`.**
1. **Filter the part to be processed into `InputFiltered`.**\
   This mainly restricts the set of products, but the [examples on input filtering](./example_filtering.sql) also already restrict the set of fields to be used.
1. **Optional: Add product descriptions from a website into `InputFilteredWeb`.**\
   This requires non-SQL scripts to obtain and parse the data – see [Parsing web shops for product descriptions](./parsed_descriptions.md).
1. **Optional: Add descriptions of product images into `InputFilteredImages`.**\
   This requires several steps on the command line – see [Describing images in BigQuery](./image_descriptions.md).
1. **Merge all data into `InputProcessing`.**\
   As mentioned above, this table must only have fields to be used for the generation of titles & descriptions. See the following example with both website and image content, which may differ from your situation in terms of the fields used and the join condition:

```sql
CREATE OR REPLACE TABLE `[👉DATASET]`.InputProcessing AS
SELECT
  F.id, F.title, F.description, F.`👉brand`, F.`👉category`
  W.text AS webpage_content,
  I.description AS image_description
FROM `[👉DATASET]`.InputFiltered AS F
LEFT JOIN `[👉DATASET]`.InputFilteredWeb AS W USING (id)
LEFT JOIN `[👉DATASET]`.InputFilteredImages AS I
  ON F.image_link LIKE CONCAT('%', REGEXP_EXTRACT(uri, '.*/([^/]+)'), '%');
```

⚠️ Note: As with the prompts, it may be beneficial to have the field names in the target language in order not to confuse the language model.

## 3. Prepare examples

The processing code expects a set of good titles and descriptions in a table `[👉DATASET].Examples`. For the required structure, see the following description of different ways to fill that table:

### Option A: Examples without relation to the source feed

In case the examples are not part of the source feed, the product properties can be provided directly. (In this case, the ID supplied is inconsequential and merely serves to have a structural equivalent to those in the actual feed.)

```sql
CREATE OR REPLACE TABLE `[👉DATASET]`.Examples AS
SELECT * FROM UNNEST(ARRAY<STRUCT<id STRING, properties STRING, title STRING, description STRING>>[
  STRUCT(
    '👉1234567',
    """👉{specifications: "...", brand: "...", color: "...", size: "...", ...}""",
    """👉This is an exemplary product title.""",
    """👉This is an exemplary product description.""")
]);
```

Inside the \[ \], several STRUCT expressions can be provided as examples. To allow the language model to extrapolate from the examples, the fields referenced there should match those of the actual input. As the generating procedures use all fields of `InputProcessing` as input, all those fields should appear in the examples as well.

### Option B: Examples in the feed to be processed, but with manually provided titles & descriptions

To use products as examples that are in the feed, but whose titles & descriptions there are not good, the above can be modified so that the product data does not need to be copied to the SQL code:

```sql
CREATE OR REPLACE TABLE `[👉DATASET]`.Examples AS
WITH Examples AS (
  SELECT * FROM UNNEST(ARRAY<STRUCT<id STRING, title STRING, description STRING>>[
    STRUCT(
      '👉1234567',
      """👉This is an exemplary product title.""",
      """👉This is an exemplary product description.""")
  ])
)
SELECT
  id,
  E.title,
  E.description,
  TO_JSON_STRING((SELECT AS STRUCT * EXCEPT(id) FROM UNNEST([I]))) AS properties
FROM Examples AS E
INNER JOIN `[👉DATASET]`.InputProcessing AS I USING (id);
```

### Option C: Examples in the feed to be processed, with good-performing titles & descriptions

You can pick some already well-performing examples from the source feed as follows:

```sql
CREATE OR REPLACE TABLE `[👉DATASET]`.Examples AS
SELECT
  id, title, description,
  TO_JSON_STRING((SELECT AS STRUCT * EXCEPT(id) FROM UNNEST([I]))) AS properties
FROM `[👉DATASET]`.InputProcessing AS I
WHERE id IN ('👉1234567', '👉2345678')
```

Alternatively, you might join `InputRaw` to use a performance metric that's already in the data. (Metrics should not be in `InputProcessing` to avoid confusing the language model when generating titles and descriptions.)

Of course, the well-performing products may not even be present in `InputProcessing` in order not to overwrite what's already working well. In this case, you'd either need to change that (and instead exclude those products later, when updating the feed), or get the examples directly from `InputRaw` – though this means that you may need to manually map the field names, in case they differ from those in `InputProcessing`:

```sql
CREATE OR REPLACE TABLE `[👉DATASET]`.Examples AS
SELECT
  id, title, description,
  TO_JSON_STRING(STRUCT(
    `👉title`, `👉description`, `👉specifications` AS `👉specs`, `👉...`)) AS properties
FROM `[👉DATASET]`.InputRaw
ORDER BY `👉clicks` DESC
LIMIT 3;
```

## 4. Prepare output table

The table to receive the new titles and description needs to be initialised with the IDs of the products to be processed:
```sql
CREATE OR REPLACE TABLE `[👉DATASET]`.Output AS
SELECT
  id,
  CAST(NULL AS STRING) AS title,
  CAST(NULL AS STRING) AS description,
  0 AS tries
FROM `[👉DATASET]`.InputFiltered;
```

The `tries` field addresses the fact that the generation of titles or descriptions may fail, usually due to Vertex AI's "[safety filters](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/configure-safety-attributes)". The field counts the number of re-generation attempts, which the generating procedures use to limit repeated failures – currently set to 2 retries in the procedure definition.

⚠️ Note: Due to chunked processing, problems generating text will affect the whole chunk, so at the end products may be without texts despite not being problematic by themselves. Whatever remains non-generated can be individually retried – see the parameter `IDS` in the next section.

## 5. Trigger generation of titles & descriptions

Once the input data has been made available, the actual processing can start with a one-liner each for titles and descriptions, looping through the records by themselves:

``CALL `[DATASET]`.BatchedUpdateTitles(ITEMS_PER_PROMPT, LANGUAGE, PARTS, PART, IDS);``

``CALL `[DATASET]`.BatchedUpdateDescriptions(ITEMS_PER_PROMPT, LANGUAGE, PARTS, PART, IDS);``

These procedures expect the following parameters:

* `ITEMS_PER_PROMPT`: The number of records to group into a single LLM request to increase throughput – see [Performance](./README.md#performance) for thoughts on reasonable upper limits. For efficiency reasons, this should be a divisor of the number of products processed per loop (hard-coded, currently set to 600 in [here](generation.sql)).
* `LANGUAGE`: The language in which to generate the texts, as an English word.
* `PARTS`: Together with the next parameter, this allows the parallel processing of different parts of the feed. This parameter denotes the number of parts. Consider the [maximally allowed](https://cloud.google.com/bigquery/quotas\#cloud\_ai\_service\_functions) parallelisation for `ML.GENERATE_TEXT` as well as any other queries that you may be running with that function. Use NULL if you don't want any such partitioning.
* `PART`: This denotes which of the parts (0 up to `PARTS`–1) to compute.
* `IDS`: This is NULL for the default scaled execution, but if specific items' texts are to be (re-)generated, their item IDs can be provided in this array.

Here are two example calls, one with partitioning, one without:
```
CALL `[👉DATASET]`.BatchedUpdateDescriptions(10, '👉English', 4, 2, NULL);
CALL `[👉DATASET]`.BatchedUpdateTitles(15, '👉German', NULL, NULL, NULL);
```

⚠️ Note: In case the table `Output` has undesired data from a previous execution, it should be re-initialised as shown [here](#4-prepare-output-table).

## 6. Check results

The generating procedures write their results into the table `Output` in the same dataset, where they can be assessed for quality – manually, using [similarity measures](./example_check.sql), or with tailor-made prompts.

Integrating such checks in the actual generation loop (and discarding anything inadequate) would allow automatic retries, as described above for cases in which no output is generated for "safety" reasons. Like in those cases, time may be lost by retrying, and/or products might be left without content once all allowed retries fail.

## 7. Export to Merchant Center


As Google requires AI-generated feed content to be flagged, the following function needs to be used to encapsulate [titles](https://support.google.com/merchants/answer/6324415) or [descriptions](https://support.google.com/merchants/answer/6324468) before actually using them:

```sql
CREATE OR REPLACE FUNCTION `[👉DATASET]`.EmbedForMerchantFeed(value STRING, isAiGenerated BOOL) AS (
  CONCAT(IF(isAiGenerated, 'trained_algorithmic_media', ''), ':"', REPLACE(value, '"', '""'), '"')
);
```

Depending on whether a supplemental or full feed is to be used, see the corresponding example:

### Option A: Supplemental feed

The output table can essentially already be used as a supplemental feed by exporting the result of a query like the following as a TSV file and importing it into Merchant Center:

```sql
SELECT
  id,
  `[👉DATASET]`.EmbedForMerchantFeed(title, TRUE) AS structured_title,
  `[👉DATASET]`.EmbedForMerchantFeed(description, TRUE) AS structured_description
FROM `[👉DATASET]`.Output
WHERE title IS NOT NULL AND description IS NOT NULL;
```

If only part of the products are to be deployed (and potentially later the other part) for impact analyses, corresponding filters are needed, e.g. using conditions on the `id` column.

### Option B: Full feed

A product feed to replace the existing one can be created by taking a table that has the existing feed and combining it with the output table as follows before exporting it as TSV:

```sql
SELECT
  * EXCEPT (title, description),
  `[👉DATASET]`.EmbedForMerchantFeed(COALESCE(O.title, I.title), O.title IS NOT NULL)
    AS structured_title,
  `[👉DATASET]`.EmbedForMerchantFeed(COALESCE(O.description, I.description), O.description IS NOT NULL)
    AS structured_description
FROM `[👉DATASET]`.InputRaw AS I
LEFT JOIN `[👉DATASET]`.Output AS O USING (id);
```
