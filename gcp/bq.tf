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

resource "google_bigquery_connection" "vertex-connection" {
   connection_id = "vertex-connection"
   location      = var.region
   friendly_name = "Connection to Vertex GenAI models"
   description   = "Connection to Vertex GenAI models"
   cloud_resource {}
}

resource "google_bigquery_dataset" "feedgen" {
  dataset_id                  = "feedgen"
  friendly_name               = "FeedGen Dataset"
  description                 = "Dataset to be used as backend to FeedGen"
  location                    = var.region
}

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