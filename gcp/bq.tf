terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "4.51.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region = var.region
  zone   = var.zone
}

import {
  to = google_project_service.bigquery_service
  id = "bigquery.googleapis.com"
}

resource "google_project_service" "bigquery_service" {
  service = "bigquery.googleapis.com"
}

import {
  to = google_project_service.bigquery_connection_service
  id = "bigqueryconnection.googleapis.com"
}

resource "google_project_service" "bigquery_connection_service" {
  service = "bigqueryconnection.googleapis.com"
}

import {
  to = google_bigquery_connection.vertex-connection
  id = "projects/${var.project_id}/locations/${var.region}/connections/vertex-connection"
}

resource "google_bigquery_connection" "vertex-connection" {
   connection_id = "vertex-connection"
   location      = var.region
   friendly_name = "Connection to Vertex GenAI models"
   description   = "Connection to Vertex GenAI models"
   cloud_resource {}
}

import {
  to = google_bigquery_dataset.feedgen
  id = "${var.project_id}.feedgen"
}

resource "google_bigquery_dataset" "feedgen" {
  dataset_id                  = "feedgen"
  friendly_name               = "FeedGen Dataset"
  description                 = "Dataset to be used as backend to FeedGen"
  location                    = var.region
}

# import {
#   to = google_bigquery_table.prompts
#   id = "${var.project_id}/datasets/feedgen/tables/prompts"
# }

resource "google_bigquery_table" "prompts" {
    dataset_id = google_bigquery_dataset.feedgen.dataset_id
    table_id   = "prompts"

      schema = <<EOF
[
  {
    "name": "id",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "Item ID"
  },
  {
    "name": "title_prompt",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "Full prompt for title"
  },
  {
    "name": "description_prompt",
    "type": "STRING",
    "mode": "NULLABLE",
    "description": "Full prompt for description"
  }
]
EOF

}

resource "null_resource" "bison_model" {
  provisioner "local-exec" {
    command = <<EOF
bq query --nouse_legacy_sql \
'CREATE OR REPLACE MODEL `${var.project_id}.feedgen.text-bison` 
REMOTE WITH CONNECTION `${google_bigquery_connection.vertex-connection.id}`
OPTIONS (ENDPOINT = "text-bison")'
EOF
  }
}

