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

interface VertexAiPrediction {
  content: string;
  safetyAttributes: {
    blocked: boolean;
  };
}

interface VertexAiResponse {
  predictions: VertexAiPrediction[];
}

export class VertexHelper {
  private static instance: VertexHelper;
  private projectId: string;
  private location: string;
  private endpoint: string;
  private modelId: string;

  constructor(
    projectId: string,
    location: string,
    endpoint: string,
    modelId: string
  ) {
    this.projectId = projectId;
    this.location = location;
    this.endpoint = endpoint;
    this.modelId = modelId;
  }

  addAuth(params: Record<string, unknown>) {
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

  fetchJson(url: string, params: Record<string, unknown>): VertexAiResponse {
    const response = UrlFetchApp.fetch(url, params);

    if (response.getResponseCode() === 429) {
      Utilities.sleep(CONFIG.vertexAi.quotaLimitDelay);
      return this.fetchJson(url, params);
    }
    return JSON.parse(response.getContentText());
  }

  predict(prompt: string) {
    MultiLogger.getInstance().log(`Prompt: ${prompt}`);

    const predictEndpoint = `https://${this.location}-${this.endpoint}/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.modelId}:predict`;

    const res = this.fetchJson(
      predictEndpoint,
      this.addAuth({
        instances: [{ content: prompt }],
        // Refer to https://cloud.google.com/vertex-ai/docs/generative-ai/learn/models#text_model_parameters
        parameters: {
          temperature: 0.1,
          maxOutputTokens: 1024,
          topK: 1,
          topP: 0.8,
        },
      })
    );

    MultiLogger.getInstance().log(res);

    if (res.predictions[0].safetyAttributes.blocked) {
      throw new Error('Blocked for safety reasons.');
    } else if (!res.predictions[0].content) {
      throw new Error('No content');
    }

    return res.predictions[0].content;
  }

  /**
   * Returns the VertexHelper instance, initializing it if it does not exist yet.
   *
   * @param {string} projectId
   * @param {string} location
   * @param {string} endpoint
   * @param {string} modelId
   * @returns {!VertexHelper} The initialized SheetsService instance
   */
  static getInstance(
    projectId: string,
    location: string,
    endpoint: string,
    modelId: string
  ) {
    if (typeof this.instance === 'undefined') {
      this.instance = new VertexHelper(projectId, location, endpoint, modelId);
    }
    return this.instance;
  }
}
