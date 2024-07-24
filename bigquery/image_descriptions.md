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

# Describing images with BigQuery

The following Bash scripts fill the table `InputFilteredImages` with descriptions of product images. Note the [costs incurred by using Cloud Storage](https://cloud.google.com/storage/pricing/).

### 1. Load the images into GCS (CLI/Bash)

```bash
#!/bin/bash
dataset="[👉DATASET]"
source_table="InputFiltered"

query="SELECT DISTINCT 👉image_url FROM $dataset.$source_table"
bq query --use_legacy_sql=false --format=csv $query | tail -n +2 > imageurls.csv

mkdir image_download; cd image_download
xargs -n 1 curl -O -L < ../imageurls.csv
gsutil -m cp * gs://[👉BUCKET]/images/
cd ..

# Optionally change the content type in case the source files have no extension:
gcloud storage objects update gs://[👉BUCKET]/images/* --content-type=image/👉jpeg
```

### 2. Provide permissions (CLI)

The first line yields the service account to be used in the others:
```bash
bq show --connection [👉CONNECTION] | grep -oP '(?<="serviceAccountId": ")[^"]+'

# Permission to read images:
gcloud storage buckets add-iam-policy-binding gs://[👉BUCKET] \
  --member=serviceAccount:[👉SERVACC] --role=roles/storage.objectViewer
# Permission to use Vertex AI:
gcloud projects add-iam-policy-binding [👉PROJECT] --member=serviceAccount:[👉SERVACC] --role=roles/aiplatform.user
```

### 3. Create an Object Table (BQ SQL)

```sql
CREATE OR REPLACE EXTERNAL TABLE `[👉DATASET]`.Images
WITH CONNECTION `[👉CONNECTION]`
OPTIONS(
  object_metadata = 'SIMPLE',
  uris = ['gs://[👉BUCKET]/images/*'],
  max_staleness = INTERVAL 7 DAY,
  metadata_cache_mode = 'AUTOMATIC');
```

### 4. Describe the images (BQ SQL)

```sql
CREATE OR REPLACE TABLE `[👉DATASET]`.InputFilteredImages AS
SELECT uri, TRIM(ml_generate_text_llm_result) AS description
FROM
  ML.GENERATE_TEXT(
    MODEL `[👉DATASET]`.GeminiFlash,
    TABLE `[👉DATASET]`.Images,
    STRUCT(
      'Provide a detailed description of the product shown on this image, including any visible text.' AS prompt,
      0 AS temperature,
      1024 AS max_output_tokens,
      TRUE AS flatten_json_output));
```

