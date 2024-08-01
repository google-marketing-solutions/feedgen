<!--
Copyright 2023 Google LLC

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

# Improving Product Feeds with BigQuery

For [FeedGen](https://github.com/google-marketing-solutions/feedgen)'s core purpose of applying LLM prompts at scale, BigQuery's ML.GENERATE\_TEXT() function is an obvious option: provided that the source feed is available in BigQuery, the generation of titles and descriptions can be done entirely there. [This Guide](./GUIDE.md) describes how to do this, with a focus on one-time generation of titles & descriptions for a given set of products.

⚠️ Note: To match FeedGen's functionality of incorporating product descriptions obtained from [web shops](./parsed_descriptions.md) or [images](./image_descriptions.md), steps outside BigQuery are needed – see those linked pages.

⚠️ This does **not** cover:
* how to facilitate recurring processing of newly added products,
* how to extract product attributes (like [FeedGen](../README.md) does),
* how to use the Product Studio API from BigQuery, or
* how to build a graphical user interface around this.

## Performance

The following factors determine the throughput you can expect:

1. **Prompting frequency**\
   This limit defaults to 60 requests per minute for Gemini 1.5 Pro and 200 for Flash. To increase this, both of the following need to be changed:
   1. [General Vertex AI limits](https://cloud.google.com/vertex-ai/generative-ai/docs/quotas\#quotas\_by\_region\_and\_model) ([how to change](https://cloud.google.com/docs/quotas/view-manage\#requesting\_higher\_quota))
   1. [BQ-specific limits](https://cloud.google.com/bigquery/quotas\#cloud\_ai\_service\_functions) (for ML.GENERATE\_TEXT, request changes at bqml-feedback@google.com)
1. **Response latency / Records processed in parallel**\
   Each prompt may take several seconds to be processed, so processing them sequentially would force throughput drastically below the above limits. Hence, by default, for Pro 3 records are processed in parallel, and 5 for Flash. Increases can be requested at bqml-feedback@google.com.
1. **Queries processed in parallel**\
   This [limit](https://cloud.google.com/bigquery/quotas\#cloud\_ai\_service\_functions) is 5 for both Pro and Flash. In practice, it appears that the 5th execution might fail, but 4 seem safe to use.
1. **Prompts needed per product**\
   Titles and descriptions are generated separately, so we need 2 prompts per product.
1. **Products processed per prompt**\
   This can be freely set, as long as the [model's limits](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models\#gemini-1.5-flash) are not exceeded: for Flash, these are 1M tokens for the input and 8k tokens for the output (Pro: 2M / 8k).

Assuming that the first three factors let us max out 200 requests per minute and we process 10 products per title/description prompt, we could process 200×10÷2 \= 1000 products per minute. In practice, it will be much less than that, unless the amount of records processed in parallel is increased.

⚠️ Note: BigQuery has a [limit](https://cloud.google.com/bigquery/quotas\#standard_tables) on the number of table operations per day, which equates to about one per minute. If quotas are increased so that table modifications might happen too often, this can be counteracted by increasing the number of products processed per query (see `LIMIT 600` in [here](generation.sql)). While there is also a limit on [rows per query](https://cloud.google.com/bigquery/quotas#cloud_ai_service_functions), that is over 20k, compared with about 60 resulting from the default 600 input records per query when grouping 10 products per prompt. The reason to keep this figure low is rather that progress is then saved more frequently.

## Cost

The [Vertex AI costs](https://cloud.google.com/vertex-ai/generative-ai/pricing) of this approach should rather be less than those of FeedGen, as titles and descriptions are processed in batches, so the static parts of prompts are evaluated less often. Prominently, one needs to choose between the Flash and Pro models that have a price factor of 10 between them (as of July 2024). The additional [BigQuery costs](https://cloud.google.com/bigquery/pricing) should be rather low at the scale of usual product feeds.

For more information, see Google Cloud's [pricing calculator](https://cloud.google.com/products/calculator?hl=en).
