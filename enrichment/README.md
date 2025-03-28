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

# Enriching Product Feeds with Gemini

For [FeedGen](https://github.com/google-marketing-solutions/feedgen)'s core purpose of applying LLM prompts at scale, Gemini Batch Prediction functionality is an obvious option: provided that the source feed is uploaded as CSV in Cloud Storage, the generation of dedicated missing field can be done there. [This Guide](./GUIDE.md) describes how to do this, with a focus on one-field generation (either generate missing values for an existing column or generate all new values for a new column) for a given set of products.

⚠️ This does **not** cover:
* how to facilitate recurring processing of newly added products,
* how to extract multiple product attributes at the same time (like [FeedGen](../README.md) does),
* How to generate alternative titles and/or description at the same time (like [FeedGen](../README.md) does),
* how to use the Product Studio API from BigQuery, or Gemini from BigQuery,
* how to build a graphical user interface around this.

## Performance

The solution relies on [Gemini Batch Prediction](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-gemini) to perform at once all the requests. In such a way, they are processed in a faster time than linear. 

## Cost

The [Batch Prediction cost](https://cloud.google.com/vertex-ai/generative-ai/pricing#gemini-models) of this approach should rather be less than those of FeedGen, as the titles and descriptions are processed in batches and there is just one request per product. The additional [Cloud Storage costs](https://cloud.google.com/storage/pricing) and [Cloud Run Function costs](https://cloud.google.com/run/pricing) should be rather low (if any) at the scale of usual product feeds.

For more information, see Google Cloud's [pricing calculator](https://cloud.google.com/products/calculator?hl=en).