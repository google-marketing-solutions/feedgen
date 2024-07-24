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

-- This shows how to compute the semantic similarity between the original and generated titles,
-- as a coarse measure of quality. See the list of available embedding models:
-- https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models\#models

CREATE OR REPLACE MODEL `[DATASET]`.GeckoEmbedding
REMOTE WITH CONNECTION `[CONNECTION]`
OPTIONS (ENDPOINT = 'textembedding-gecko');

WITH
  Generated AS (
    SELECT id, title AS content
    FROM `[DATASET]`.Output
    WHERE title IS NOT NULL
  ),
  Input AS (
    SELECT id, I.title AS content
    FROM `[DATASET]`.InputProcessing AS I
    WHERE EXISTS (SELECT * FROM Generated AS G WHERE G.id = I.id)
  ),
  EmbeddingsGenerated AS (
    SELECT id, content, ml_generate_embedding_result
    FROM ML.GENERATE_EMBEDDING(
      MODEL `[DATASET]`.GeckoEmbedding,
      TABLE Generated,
      STRUCT(TRUE AS flatten_json_output)
    )
  ),
  EmbeddingsOriginal AS (
    SELECT id, content, ml_generate_embedding_result
    FROM ML.GENERATE_EMBEDDING(
      MODEL `[DATASET]`.GeckoEmbedding,
      TABLE Input,
      STRUCT(TRUE AS flatten_json_output)
    )
  ),
  Distances AS (
    SELECT
      id,
      O.content,
      G.content,
      ML.DISTANCE(
        O.ml_generate_embedding_result,
        G.ml_generate_embedding_result,
        'COSINE'
      ) AS distance
    FROM EmbeddingsOriginal AS O
    INNER JOIN EmbeddingsGenerated AS G USING (id)
  )
SELECT CEIL(distance * 10) / 10 AS distanceBucket, COUNT(*)
FROM Distances
GROUP BY 1
ORDER BY 1;
