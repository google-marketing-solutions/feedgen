# Copyright 2024 Google LLC
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#       http://www.apache.org/licenses/LICENSE-2.0
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

#!/bin/bash
# Request parameters from the user
echo "Please provide the following information:"
read -p "Project ID (textual name): " PROJECT
read -p "Location (e.g. \"eu\"): " LOCATION
read -p "Dataset name: " DATASET
read -p "Connection name: " CONNECTION

if [ -z "$PROJECT" ] || [ -z "$DATASET" ] || [ -z "$CONNECTION" ] || [ -z "$LOCATION" ]; then
  echo "Error: All parameters are required."
  exit 1
fi

# Create dataset
bq --location=$LOCATION mk --dataset $PROJECT:$DATASET

# Create connection
bq mk --connection --location=$LOCATION --project_id=$PROJECT --connection_type=CLOUD_RESOURCE $CONNECTION

# Grant Vertex AI User to the BQ service account
SERVICEACCOUNT=`bq show --connection $LOCATION.$CONNECTION | grep -oP '(?<="serviceAccountId": ")[^"]+'`
gcloud projects add-iam-policy-binding $PROJECT --member=user:$SERVICEACCOUNT --role=roles/aiplatform.user

# Create model
echo "CREATE OR REPLACE MODEL \`$DATASET\`.GeminiFlash REMOTE WITH CONNECTION \`$LOCATION.$CONNECTION\` OPTIONS (endpoint = 'gemini-1.5-flash-001');" | bq query --use_legacy_sql=false

# Install stored functions & procedures
sed "s/\[DATASET\]/$DATASET/" generation.sql | bq query --use_legacy_sql=false
