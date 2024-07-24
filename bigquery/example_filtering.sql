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

-- This shows examples of how to identify products to be processed.


-- Example 1: Choose products based on ID
CREATE OR REPLACE TABLE `[DATASET]`.InputFiltered AS
SELECT id, title, description, condition, brand, category
FROM `[DATASET]`.InputRaw
WHERE id IN ('...');


-- Example 2: Choose products based on performance
-- Declare constants and variables:
DECLARE MIN_CLICKS_TO_PROCESS DEFAULT 0.1;
DECLARE MAX_CLICKS_TO_PROCESS DEFAULT 0.9;
DECLARE QUANTILES_PRECISION DEFAULT 100;
DECLARE ClickQuantiles ARRAY<INT64>;

-- Determine range of clicks:
SET ClickQuantiles = (
    SELECT APPROX_QUANTILES(clicks, QUANTILES_PRECISION)
    FROM `[DATASET]`.InputRaw
);

-- Fill `InputFiltered` with a mid-range number of clicks:
CREATE OR REPLACE TABLE `[DATASET]`.InputFiltered AS
SELECT id, title, description, condition, brand, category
FROM `[DATASET]`.InputRaw
WHERE clicks
  BETWEEN ClickQuantiles[OFFSET(0)] + MIN_CLICKS_TO_PROCESS * (ClickQuantiles[OFFSET(QUANTILES_PRECISION - 1)] - ClickQuantiles[OFFSET(0)])
  AND ClickQuantiles[OFFSET(0)] + MAX_CLICKS_TO_PROCESS * (ClickQuantiles[OFFSET(QUANTILES_PRECISION - 1)] - ClickQuantiles[OFFSET(0)]);
