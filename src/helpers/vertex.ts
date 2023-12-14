/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { CONFIG } from '../config';
import { MultiLogger } from './logger';

interface VertexAiModelParams {
  temperature: number;
  maxOutputTokens: number;
  topK: number;
  topP: number;
}

interface VertexAiPalmPrediction {
  content: string;
  safetyAttributes: {
    blocked: boolean;
  };
}

interface VertexAiPalmResponse {
  predictions: VertexAiPalmPrediction[] | null;
}

interface VertexAiGeminiRequest {
  contents: {
    role: 'user';
    parts: [
      { text: string },
      { inlineData: { mimeType: string; data: string } }?,
      { fileData: { mimeType: string; fileUri: string } }?
    ];
  };
  generationConfig: VertexAiModelParams;
}

interface VertexAiGeminiResponseCandidate {
  candidates: [
    {
      content: {
        parts: [{ text: string }];
      };
      finishReason?: string;
    }
  ];
}

export class VertexHelper {
  private static instance: VertexHelper;
  private projectId: string;
  private modelId: string;
  private modelParams: VertexAiModelParams;

  constructor(
    projectId: string,
    modelId: string,
    modelParams: VertexAiModelParams
  ) {
    this.projectId = projectId;
    this.modelId = modelId;
    this.modelParams = modelParams;
  }

  addAuth(params: unknown) {
    const baseParams = {
      method: 'POST',
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${ScriptApp.getOAuthToken()}`,
      },
    };

    return Object.assign({ payload: JSON.stringify(params) }, baseParams);
  }

  fetchJson(
    url: string,
    params: Record<string, unknown>
  ): VertexAiPalmResponse | VertexAiGeminiResponseCandidate[] {
    const response = UrlFetchApp.fetch(url, params);

    if (response.getResponseCode() === 429) {
      MultiLogger.getInstance().log(
        `Waiting ${
          Number(CONFIG.vertexAi.quotaLimitDelay) / 1000
        }s as API quota limit has been reached...`
      );
      Utilities.sleep(CONFIG.vertexAi.quotaLimitDelay);
      return this.fetchJson(url, params);
    }
    return JSON.parse(response.getContentText());
  }

  generate(model: string, prompt: string, imageUrl: string | null) {
    if (model.startsWith('gemini')) {
      return this.multimodalGenerate(prompt, imageUrl);
    }
    return this.predict(prompt);
  }

  predict(prompt: string) {
    MultiLogger.getInstance().log(`Prompt: ${prompt}`);

    const predictEndpoint = `https://${CONFIG.vertexAi.location}-${CONFIG.vertexAi.endpoint}/v1/projects/${this.projectId}/locations/${CONFIG.vertexAi.location}/publishers/google/models/${this.modelId}:predict`;

    const res = this.fetchJson(
      predictEndpoint,
      this.addAuth({
        instances: [{ prompt: prompt }],
        parameters: this.modelParams,
      })
    ) as VertexAiPalmResponse;

    MultiLogger.getInstance().log(res);

    if (res.predictions) {
      if (res.predictions[0].safetyAttributes.blocked) {
        throw new Error(
          `Request was blocked as it triggered API safety filters. Prompt: ${prompt}`
        );
      } else if (!res.predictions[0].content) {
        throw new Error(`Received empty response from API. Prompt: ${prompt}`);
      } else {
        return res.predictions[0].content;
      }
    }
    throw new Error(JSON.stringify(res));
  }

  multimodalGenerate(prompt: string, imageUrl: string | null) {
    const message =
      `Prompt: ${prompt}` + (imageUrl ? `\nImage URL: ${imageUrl}` : '');
    MultiLogger.getInstance().log(message);

    const endpoint = `https://${CONFIG.vertexAi.location}-${CONFIG.vertexAi.endpoint}/v1/projects/${this.projectId}/locations/${CONFIG.vertexAi.location}/publishers/google/models/${this.modelId}:streamGenerateContent`;

    const request: VertexAiGeminiRequest = {
      contents: {
        role: 'user',
        parts: [{ text: prompt }],
      },
      generationConfig: this.modelParams,
    };
    if (imageUrl) {
      if (imageUrl.startsWith('gs://')) {
        request.contents.parts.push({
          fileData: { mimeType: 'image/png', fileUri: imageUrl },
        });
      } else {
        const [imageData, mime] = this.downloadImage(imageUrl);

        if (imageData !== null && mime !== null) {
          request.contents.parts.push({
            inlineData: { mimeType: mime, data: imageData },
          });
        }
      }
    }

    MultiLogger.getInstance().log(request);

    const res = this.fetchJson(
      endpoint,
      this.addAuth(request)
    ) as VertexAiGeminiResponseCandidate[];
    MultiLogger.getInstance().log(res);
    const content: string[] = [];

    res.forEach(candidate => {
      if ('SAFETY' === candidate.candidates[0].finishReason) {
        throw new Error(
          `Request was blocked as it triggered API safety filters. ${message}`
        );
      }
      content.push(candidate.candidates[0].content.parts[0].text);
    });

    const contentText = content.join('');
    if (!contentText) {
      throw new Error(JSON.stringify(res));
    }

    return contentText;
  }

  downloadImage(imageUrl: string): Array<string | null> {
    let [imageData, mime]: Array<string | null> = [null, null];
    const response = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true });

    if (response.getResponseCode() === 200) {
      const blob = response.getBlob();
      mime = blob.getContentType();
      imageData = Utilities.base64Encode(blob.getBytes());
    }
    return [imageData, mime];
  }

  /**
   * Returns the VertexHelper instance, initializing it if it does not exist yet.
   *
   * @param {string} projectId
   * @param {string} endpoint
   * @param {string} modelId
   * @param {VertexAiModelParams} modelParams
   * @returns {!VertexHelper} The initialized SheetsService instance
   */
  static getInstance(
    projectId: string,
    modelId: string,
    modelParams: VertexAiModelParams
  ) {
    if (typeof this.instance === 'undefined') {
      this.instance = new VertexHelper(projectId, modelId, modelParams);
    }
    return this.instance;
  }
}
