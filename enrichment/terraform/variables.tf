# Copyright 2020 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

variable "PROJECT_ID" {
  type        = string
  description = "GCP Project ID."
}

variable "PROJECT_NUMBER" {
  type        = string
  description = "GCP Project number, to build the system service accounts name."
}

variable "LOCATION" {
  type        = string
  description = "GCP region https://cloud.google.com/compute/docs/regions-zones."
}
variable "REGION" {
  type        = string
  description = "GCP region https://cloud.google.com/compute/docs/regions-zones."
}

variable "DEPLOYMENT_NAME" {
  type        = string
  description = "Solution name to add to the Cloud Functions, secrets and scheduler names."
  default     = "feedgen_enrich"
}

variable "SERVICE_ACCOUNT" {
  type        = string
  description = "Service Account for running Feedgen enrich."
  default     = "feedgen-enrich-service-account"
}

variable "DESCRIPTION_COLUMN_NAME" {
  type        = string
  description = "Name of the 'description' column"
}

variable "TARGET_COLUMN_NAME" {
  type        = string
  description = "Name of the column to generate"
}

variable "TITLE_COLUMN_NAME" {
  type        = string
  description = "Name of the 'title' column"
}

variable "ID_COLUMN_NAME" {
  type        = string
  description = "Name of the 'id' column"
}

variable "INPUT_FILE_NAME" {
  type        = string
  description = "Name of the input file without the extension. It MUST BE a CSV"
}

variable "TARGET_CATEGORY_DESCRIPTION" {
  type        = string
  description = "Description of the target category to enrich. It can be empty"
}

variable "TARGET_LANGUAGE" {
  type        = string
  description = "Language in which the target category will be generated."
}

variable "BUILD_GCS_BUCKET" {
  type        = string
  description = "Bucket for the deployment of the solution."
  default     = "feedgen_enrich_deploy_bucket"
}

variable "FEEDGEN_ENRICH_GCS_BUCKET" {
  type        = string
  description = "Bucket for the deployment of the solution."
  default     = "feedgen_enrich_source"
}
