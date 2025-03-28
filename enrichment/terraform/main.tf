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


resource "time_sleep" "wait_60s" {
  create_duration = "60s"

  depends_on = [
    google_project_iam_member.artifact-registry-writer,
    google_project_iam_member.storage-admin,
    google_storage_bucket.feedgen_enrich_solution_bucket
  ]
}



data "archive_file" "feedgen_enrich_archive" {
  type        = "zip"
  output_path = ".temp/feedgen_enrich_source.zip"
  source_dir  = "${path.module}/../src/"

  depends_on = [google_storage_bucket.feedgen_enrich_build_bucket]
}

resource "google_storage_bucket_object" "feedgen_enrich_bucket_object" {
  name       = "${var.DEPLOYMENT_NAME}-${data.archive_file.feedgen_enrich_archive.output_sha256}.zip"
  bucket     = google_storage_bucket.feedgen_enrich_build_bucket.name
  source     = data.archive_file.feedgen_enrich_archive.output_path
  depends_on = [data.archive_file.feedgen_enrich_archive]
}

resource "google_storage_bucket" "feedgen_enrich_solution_bucket" {
  name          = var.FEEDGEN_ENRICH_GCS_BUCKET
  location      = var.LOCATION
  force_destroy = true

  public_access_prevention = "enforced"
  uniform_bucket_level_access = true
}

resource "google_cloudfunctions2_function" "feedgen_enrich_cloudfunction" {
  name        = "${var.DEPLOYMENT_NAME}-runner"
  description = "It runs a feedgen enrich solution to generate the information for a new column on the provided CSV file."
  project     = var.PROJECT_ID
  location    = var.REGION
  depends_on = [ google_storage_bucket.feedgen_enrich_build_bucket, google_storage_bucket.feedgen_enrich_solution_bucket, google_storage_bucket_object.feedgen_enrich_bucket_object, time_sleep.wait_60s]

  service_config {
    available_memory      = "1024M"
    timeout_seconds       = 3600
    service_account_email = google_service_account.service_account.email
    ingress_settings      = "ALLOW_ALL"

    environment_variables = {
        GOOGLE_CLOUD_PROJECT = "${var.PROJECT_ID}"
        BUCKET_NAME = "${var.FEEDGEN_ENRICH_GCS_BUCKET}"
        PROJECT_LOCATION = "${var.PROJECT_REGION}"
        INPUT_FILE_NAME = "${var.INPUT_FILE_NAME}"
        DESCRIPTION_COLUMN_NAME = "${var.DESCRIPTION_COLUMN_NAME}"
        TARGET_CATEGORY_DESCRIPTION = "${var.TARGET_CATEGORY_DESCRIPTION}"
        TITLE_COLUMN_NAME = "${var.TITLE_COLUMN_NAME}"
        ID_COLUMN_NAME = "${var.ID_COLUMN_NAME}"
        TARGET_COLUMN_NAME = "${var.TARGET_COLUMN_NAME}"
        TARGET_LANGUAGE = "${var.TARGET_LANGUAGE}"
    }

  }

  build_config {
    runtime         = "python312"
    entry_point     = "main" # Set the entry point
    service_account = google_service_account.service_account.id
    source {
      storage_source {
        bucket = google_storage_bucket.feedgen_enrich_build_bucket.name
        object = google_storage_bucket_object.feedgen_enrich_bucket_object.name
      }
    }
  }
}
