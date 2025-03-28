<!--
Copyright 2025 Google LLC

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

Below, you find step-by-step instructions on how to install and apply our FeedGen enrichment version to improve product feeds. Placeholders and examples are prefixed with "👉" and need to be replaced with the actual names before execution.

[1. Deploy solution on Google Cloud](#1-deploy-solution-on-Google-Cloud)\
[2. Prepare input feed](#2-prepare-input-feed)\
[3. Run the solution](#3-run-the-solution)\
[4. Prepare output table](#4-prepare-output-table)\
[5. EXTRA: change configuration](#extra:-change-configuration)\

## 1. Deploy solution on Google Cloud

Clone the solution on your Google Cloud Project via:
`git clone https://github.com/google-marketing-solutions/feedgen.git` and navigate via CLoud Shel to the folder `FeedGen Enrich/Terraform`. Now open the file `terraform.tfvars` and update the value of the following fields:
- PROJECT_ID: Id of the Google Cloud Project where you want to install this solution.
- PROJECT_NUMBER: Google Cloud Project number, you can find it in the Welcome page of your Google Cloud Project
- REGION: Region where you have configured your GCP project. Please verify that Gemini is available in your region.
- LOCATION: Location where you have configured your GCP project.
- DEPLOYMENT_NAME: Name of the Cloud Run Function that contains the code of the solution
- SERVICE_ACCOUNT: Name of the Service Account that will be used to execute the solution
- DESCRIPTION_COLUMN_NAME: Name of the column in your CSV input feed file that contains the description of the products 
- TITLE_COLUMN_NAME: Name of the column in your CSV input feed file that contains the title of the products 
- ID_COLUMN_NAME: Name of the column in your CSV input feed file that contains the id of the products 
- TARGET_COLUMN_NAME: Name of the column that you want to enrich with missing values or add from scratch
- TARGET_CATEGORY_DESCRIPTION: Description of the column that you want to add or complete by filling missing fields.
- TARGET_LANGUAGE: Language in which you want your values to be generated.
- INPUT_FILE_NAME: Name of the feed CSV file that you will upload to Cloud Storage and that will contain your products 
- FEEDGEN_ENRICH_GCS_BUCKET: Name of the Cloud Storage bucket in which you will upload your feed CSV file.

via Cloud Shell now run the following commands:
`terraform init -upgrade`
`Terraform apply` 👉 Confirm the execution plan with `yes` when prompted to. 

⚠️ Note: Before deploying the Cloud Run Function, or as an improvement after initial testing, you may want to modify it so that the prompts reflect your preferences for the titles and descriptions in terms of length, tone and other aspects, perhaps even adapted to the product category at hand. To improve the output quality with languages other than English, the prompts might also be re-written in that language.
You can find the prompt inside the file src/main.py at line 43.

## 2. Prepare input feed

The main procedures expect the data to be in a CSV file. You will need to manually upload the file into the Google Cloud Storage bucket with the name defined in the variable `FEEDGEN_ENRICH_GCS_BUCKET`.

## 3. Run the solution

Open the Cloud Run Function section and click on the Cloud Run Function which name you defined in the variable `DEPLOYMENT_NAME`.
Now click on `Test` ON the top-center of the screen. Click now on `Test in Cloud Shell` and then run the proposed command.

## 4. Retrieve the output

The execution will take a few minutes depending on your input feed file size, you can monitor the status in the logs.
Once you read `results written in the bucket, task completed succesfully` in the logs, your processing will be completed.
You will find the output of the execution by navigating to the CLoud Storage Bucket which name you defined with the variable `FEEDGEN_ENRICH_GCS_BUCKET`.
Inside the bucket, navigate to the latest folder which names starts with `prediction-model` (you can identify the latests since the date and time of the request is included as part of the folder name).
Your results will be stored as a CSV file named `feed_updated_by_feedgen.csv`, download them and check if they satisfy your need.

## EXTRA: change configuration

At any point you might want to change one or more configurations (E.G. the column name and description) for another scenarios.
You can easily do that by navigating to the Cloud Run Functions section on GCP and clicking on the function which name you defined in the variable `DEPLOYMENT_NAME`.
From there, click on `Edit & deploy new revision`.
Within the tab `Container(s)` you will find the tab `Variables & Secrets`, click it and you will see the list of variables defined at step [1. Deploy solution on Google Cloud](#1-deploy-solution-on-Google-Cloud).
You can now change any of the variables according to your needs. Hit the `Deploy` button on the bottom left corner once done.
Wait until the deploy is completed and now you can resume your feed enrichment from step [2. Prepare input feed](#2-prepare-input-feed).


