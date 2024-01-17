import streamlit as st
import pandas as pd
import numpy as np


from google.cloud import bigquery

# Construct a BigQuery client object.
# client = bigquery.Client()

# prompts_generation_query = ""

# ""
# rows = client.query_and_wait(prompts_generation_query)  # Make an API request.

title_prompt = """You are a leading digital marketer working for a top retail organisation. You are an expert at generating high-performing product listing ad titles and identifying the most important product attributes for influencing a buying decision.
Given the "Context" information for a product, do the following steps in order:
1. Generate "product attribute keys in original title", "product category", "product attribute keys" and "product attribute values" in English. Every attribute key in "product attribute keys" MUST have a corresponding attribute value in "product attribute values". Use whitespaces to represent empty attribute values.
2. If provided with an image, first extract all visible product features from it and compare extracted features with the generated "product attribute values". If the generated value for a certain key does not match the extracted value, replace the generated value with the extracted one then add the replaced key to "replaced keys", separated by a comma. Finally, add a new key in "product attribute keys" named "Image Features", and an associated value in "product attribute values" that contains all the extracted values. You MUST output "Image Features" if an image is provided.
3. If provided with the content of the product's webpage as "Website", first extract the main product highlights and any additional product features that are NOT mentioned in "Context" from it. Then add another new key in "product attribute keys" named "Website Features", and an associated value in "product attribute values" that contains all the extracted values. You MUST output "Website Features" if "Website" information is provided.
4. Prefix the size attribute value with "Size" and replace Small, Medium, Large and X-Large with their abbreviations (S, M, L, XL).
5. Separate attribute values with commas.
6. Concatenate all "product attribute values" in order and REMOVE ANY duplicate word you've already concatenated. The length of the final value MUST NOT exceed 150 characters, and it MUST NOT contain any duplicate words - THIS IS VERY IMPORTANT. Output it on a new line, prefixed with "generated title: ".

Your answer should include ONLY the following generated values in order:
"product attribute keys in original title:"
"product category:"
"product attribute keys:"
"product attribute values:"
"replaced keys:"
"generated title:"

Let's work this out step by step to make sure we have the right answer.

Context:"""

description_prompt = """Follow these instructions in order:

1. You are a leading digital marketer working for a top retail organization. You are an expert in building detailed and catchy descriptions for the products on your website. 
Generate a product description in English that highlights the product's features using the following "Context" information. 
If you find a "description" in the given "Context", do NOT reuse it, but make sure you describe any features listed within it in more detail.
If provided with an image, describe the product you see in as much detail as possible and highlight all visible features. You MUST then add this information to the generated description.
If provided with the content of the product's webpage as "Website", extract additional information about the product that is NOT mentioned in "Context". You MUST then add this information to the generated description.
DO NOT use any Markdown syntax, and avoid special characters as much as possible.
The generated description should be at least 500 characters long, preferably at least 1000.

2. I want you to act as a critic with an IQ of 140 and evaluate the description you generated based on the following criteria and points per criterion. Here is the scoring criteria:
Criterion: Repeating sentences depict poor quality and should be scored low.
Criterion: The generated description should strictly be about the provided product. Correct product type, number of items contained in the the product as well as product features such as color should be followed. Any product features that are not present in the input should not be present in the generated description.
Criterion: Hyperbolic text, over promising or guarantees are to be avoided.
Criterion: The generated description must be at least 500 characters in length, but not longer than 5000 characters.
Criterion: The generated description MUST NOT use special characters or any Markdown syntax.

3. Assign a score of 1-5 to the generated description, based on the above criteria:
5 points: The generated description is accurate, well-structured, unique, uses appropriate language, and references the provided "Context", image, and "Website" data only. It is 1000 characters or longer and does not contain any special characters.
4 points: The generated description is accurate and well-structured, but very minor criteria misses are present. It is 700 characters or longer.
3 points: The generated description meets most of the criteria, but may have some issues, such as a few repeating keywords or phrases, or a slightly too formal tone. It is 500 characters or longer and there are special characters present.
2 points: The generated description meets some of the criteria, but has some significant issues, such as inaccurate information, poor structure, or excessive hyperbole.
1 point: The generated description meets very few of the criteria and is of low quality. It is shorter than 500 characters.

4. Answer as follows:
"description: " followed by the description you generated
"score: " followed by the score you assigned to the description
"reasoning: " followed by your reasoning for the score, with examples.

Let's work this out step by step to make sure we have the right answer.	

Context:"""


def generate_prompts(project_id, dataset_name, input_table_id, title_prompt_prefix, description_prompt_prefix):
    client = bigquery.Client()

    prompts_generation_query = """"
        create or replace table `"""+project_id+"""."""+dataset_name+""".prompts` as
        
        SELECT id,
            CONCAT("""+title_prompt_prefix+""",TO_JSON_STRING(input)) as title_prompt,
            CONCAT("""+description_prompt_prefix+""",TO_JSON_STRING(input)) as description_prompt,
        FROM `""" + input_table_id + """` as input
        WHERE id is not null 
        LIMIT 10
    """
    client.query_and_wait(prompts_generation_query)  # Make an API request.



st.title('FeedGen V2')
st.header("Title")
title_prompt_prefix = st.text_area(
    label="Title Prompt", value=title_prompt, height=500)
st.header("Description")
description_prompt_prefix = st.text_area(
    label="Description Prompt", value=description_prompt, height=500)

project_id = st.text_input(label="GCP Project", value="feedgen-backend-2")
dataset_name = st.text_input(label="Dataset", value="feedgen")
input_table_id = st.text_input(label="Table ID", value="input_1")

if st.button("Generate Prompts"):
    generate_prompts(project_id,
          dataset_name, input_table_id, title_prompt_prefix, description_prompt_prefix)
    st.success("Prompts generated")
