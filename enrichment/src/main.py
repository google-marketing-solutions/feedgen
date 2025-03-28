import functions_framework
from firebase_functions import logger
import os
import flask
import time
from typing import Any
from google.cloud import storage
from google import genai
from google.genai.types import CreateBatchJobConfig
import fsspec
import pandas as pd


@functions_framework.http
def main(request: flask.Request) -> flask.Response:
    """HTTP Cloud Function.
    Args:
        request (flask.Request): The request object.
        <https://flask.palletsprojects.com/en/1.1.x/api/#incoming-request-data>
    Returns:
        The response text, or any set of values that can be turned into a
        Response object using `make_response`
        <https://flask.palletsprojects.com/en/1.1.x/api/#flask.make_response>.
    """

    # Read environment variables
    google_cloud_project = os.environ.get("GOOGLE_CLOUD_PROJECT")
    google_cloud_project_location = os.environ.get("PROJECT_REGION")
    bucket_name = os.environ.get("BUCKET_NAME")
    input_file_name = f'{os.environ.get("INPUT_FILE_NAME")}.csv'
    description_column_name = os.environ.get("DESCRIPTION_COLUMN_NAME")
    title_column_name = os.environ.get("TITLE_COLUMN_NAME")
    id_column_name = os.environ.get("ID_COLUMN_NAME")
    target_column_name = os.environ.get("TARGET_COLUMN_NAME")
    target_category_description = os.environ.get("TARGET_CATEGORY_DESCRIPTION")
    target_language = os.environ.get("TARGET_LANGUAGE")

    
    blob_name = "batchinsert_gemini_request.jsonl"

    df = pd.read_csv(f'gs://{bucket_name}/{input_file_name}')
    jsonl = []
    prompt = 'You are a leading digital marketer working for a top retail organisation. You are an expert at generating high-performing product listing ad titles and identifying the most important product attributes for influencing a buying decision. Given the \'title\' and \'description\' information for a product, generate the \'' + target_column_name + '\' category in ' + target_language + '.'
    if target_category_description:
        target_category_description = target_category_description.replace("'", "\'")
        prompt += 'The ' + target_column_name + ' represents ' + target_category_description + '.'
    prompt += ' Do not return any other value, only \'' + target_column_name + '\''

    for index, row in df.iterrows():
        jsonl.append('{"request":{"contents": [{"role": "user", "parts": [{"text": "' + prompt +'"}, {"text": "Title: {' + row[title_column_name].replace('"','\"') + '"}, {"text": "Id: ' + row[id_column_name] + '"},{"text": "Description: ' + row[description_column_name].replace('"','\"') + '"} ]}],"generationConfig": {"temperature": 0.9}}}')

    client_storage = storage.Client()
    bucket = client_storage.get_bucket(bucket_name)
    blob = bucket.blob(blob_name)
    with blob.open("w") as f:
        f.write( "\n".join(jsonl) )

    # Create client to connect to Gemini
    client = genai.Client(vertexai=True, project=google_cloud_project, location=google_cloud_project_location)
    
    BUCKET_URI = f"gs://{bucket_name}"
    SOURCE = f"{BUCKET_URI}/{blob_name}"

    # https://cloud.google.com/vertex-ai/docs/reference/rest/v1/projects.locations.batchPredictionJobs#BatchPredictionJob
    batch_job = client.batches.create(
        model="gemini-2.0-flash-001",
        src=SOURCE,
        config=CreateBatchJobConfig(dest=BUCKET_URI),
    )

    logger.log(f"the batch job name is: {batch_job.name}")
    logger.log(f"batch job status is: {batch_job.state}")

    # Retrieve the batch reference 
    batch_job = client.batches.get(name=batch_job.name)

    # Refresh the job until complete (list of job statuses: https://cloud.google.com/vertex-ai/docs/reference/rest/v1/JobState )
    while batch_job.state in ["JOB_STATE_RUNNING", "JOB_STATE_PENDING", "JOB_STATE_QUEUED"]:
        time.sleep(5)
        batch_job = client.batches.get(name=batch_job.name)

    # Check if the job succeeds
    if batch_job.state == "JOB_STATE_SUCCEEDED":
        print("Job succeeded!")
    else:
        print(f"Job failed: {batch_job.error}")

    if batch_job.state == "JOB_STATE_SUCCEEDED":
        logger.log('Jon succeded, parsing the results')
        fs = fsspec.filesystem("gcs")
        # Retrieve the output file
        file_paths = fs.glob(f"{batch_job.dest.gcs_uri}/*/predictions.jsonl")
        last_path = file_paths[len(file_paths)-1]
        
        # Load the JSONL file into a DataFrame
        df_category = pd.read_json(f"gs://{last_path}", lines=True)

        # Extract the category from the response if available
        def category_response_parser(response):
            if "candidates" in response and len(response["candidates"][0]) > 0 and "content" in response["candidates"][0] and "parts" in response["candidates"][0]["content"] and len(response["candidates"][0]["content"]["parts"]) > 0:
                category = response["candidates"][0]["content"]["parts"][0]["text"]
                return category
            return "N/A"
            
        # Extract the id from the request
        def id_response_parser(request):
            for contents in request['contents']:
                for parts in contents['parts']:
                    if parts["text"].startswith("Id: "):
                        current_id = parts["text"].replace("Id: ", "")
                        return current_id
            return "N/A" # for good practice, but Id is always present in request

        df_category[target_column_name] = df_category['response'].apply(category_response_parser)
        df_category[id_column_name] = df_category['request'].apply(id_response_parser)

        df = df.set_index(id_column_name).join(df_category.set_index(id_column_name))
        df.drop(columns=['status', 'processed_time','request', 'response'], axis=1, inplace=True)

        current_folder = last_path.replace("predictions.jsonl", "").replace(f"{bucket_name}/", "")
        logger.log(f"Parsing operation completed, writing the results to the Cloud Storage bucket '{current_folder}'")

        bucket.blob(f'{current_folder}feed_updated_by_feedgen.csv').upload_from_string(df.to_csv(), 'text/csv')
        logger.log("results written in the bucket, task completed succesfully")
    return flask.Response(
        flask.json.dumps({
            "status": 'Success',
            "message": 'Execution completed',
        }),
        status=200,
        mimetype='application/json',
    )
