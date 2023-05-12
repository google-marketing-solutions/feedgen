<img align="left" width="150" src="https://services.google.com/fh/files/misc/feedgen_logo.png" alt="feedgen_logo"></img><br>

# FeedGen: Optimise Google Shopping feeds with Generative AI

**Disclaimer: This is not an official Google product.**

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/google/feedgen/blob/main/feedgen.ipynb)

[What it solves](#challenges) •
[How it works](#solution-overview) •
[Get started](#get-started)

## Overview

**FeedGen** is an open-source tool that uses Google Cloud's state-of-the-art
Large Language Models (LLMs) to generate optimised Google Shopping ad titles and
descriptions. It helps merchants and advertisers surface and fix quality issues
in their Shopping feeds using Generative AI in a configurable, user-friendly and
privacy-preserving manner.

The tool relies on GCP's Vertex PaLM API to provide both zero-shot and few-shot
inference capabilities on GCP's foundational LLMs. With
[few-shot prompting](https://cloud.google.com/vertex-ai/docs/generative-ai/text/text-overview),
you use the best 5-10 samples from your own Shopping feeds to customise the
model's responses towards your own data, thus achieving higher quality and more
consistent output. This can be optimised further by fine-tuning the
foundational models with your own proprietary data. Find out how to fine-tune
models with Vertex AI, along with the benefits of doing so, at this
[guide](https://cloud.google.com/vertex-ai/docs/generative-ai/models/tune-models).

## Challenges

Optimising Shopping feeds is a goal for every advertiser working with Google
Merchant Center (MC), as doing so would help improve query matching,
click-through rates (CTR), and conversions. However, it is cumbersome to sift
through product disapprovals in Merchant Center or manually fix quality issues.

FeedGen tackles this using Generative AI, allowing users to surface and fix
quality issues with their titles and descriptions in an automated fashion.

## Solution Overview

The solution consists of a Colab notebook where all the magic happens, along
with a Google Sheets
[spreadsheet template](https://docs.google.com/spreadsheets/d/1Ro91GhHaurph5zaqgr4n1PDqFZwuln-jpwam3irYq5k/edit#gid=1221408551)
that is used for both (optional) human validation as well as setting up a
**supplemental feed** in MC. Follow the instructions defined in this
[Help Center article](https://support.google.com/merchants/answer/7439058) to
set up a supplemental feed in MC, and this
[Help Center article](https://support.google.com/merchants/answer/9651854) to
set up a supplemental feed for a multi-client account (MCA).

> Generative Language in Vertex AI, and in general, is an experimental feature /
technology. We highly recommend manually reviewing and verifying the generated
titles and descriptions. FeedGen helps users expedite this process by
pre-approving titles and descriptions that already fulfill all the validation
and evaluation rules defined within the Colab notebook.

### Best Practices

We recommend the following patterns for titles according to your business domain:

|Domain|Recommended title structure|Example|
|---|---|---|
|Apparel|Brand + Gender + Product Type + Attributes (Color, Size, Material)|Ann Taylor Women’s Sweater, Black (Size 6)|
|Consumable|Brand + Product Type + Attributes (Weight, Count)|TwinLab Mega CoQ10, 50 mg, 60 caps|
|Hard Goods|Brand + Product + Attributes (Size, Weight, Quantity)|Frontgate Wicker Patio Chair Set, Brown, 4-Piece|
|Electronics|Brand + Attribute + Product Type|Samsung 88” Smart LED TV with 4K 3D Curved Screen|
|Books|Title + Type + Format (Hardcover, eBook) + Author|1,000 Italian Recipe Cookbook, Hardcover by Michele Scicolone|

These patterns can be set up in the Colab notebook by defining the set of
features that are considered **main features**, and thus must exist in all
generated titles and descriptions, as well as defining individual features to
use for composing the title and description model prompts, respectively.

We also suggest the following:

*  Provide as many product attributes as possible for enriching **description** generation.
*  Use **size**, **color**, and **gender / age group** for title generation, if available.
*  Do **NOT** use model numbers or promotional text in titles.

### Vertex AI Pricing and Quotas

Please refer to the Vertex AI
[Pricing](https://cloud.google.com/vertex-ai/pricing#generative_ai_models) and
[Quotas and Limits](https://cloud.google.com/vertex-ai/docs/quotas#request_quotas)
guides for more information.

## Get Started

The quickest way to get started with FeedGen is to load the `feedgen.ipynb`
notebook in Google Colaboratory via the link below:

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](https://colab.research.google.com/github/google/feedgen/blob/main/feedgen.ipynb)

The notebook provides an easy to use interface for configuring and running the
tool, along with a code walkthrough and results visualization.
