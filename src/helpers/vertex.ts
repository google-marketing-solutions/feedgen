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

export class VertexHelper {
  private static instance: VertexHelper;
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
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

  fetchJson(url: string, params: Record<string, unknown>) {
    return JSON.parse(UrlFetchApp.fetch(url, params).getContentText());
  }

  predict(prompt: string) {
    Utilities.sleep(1000); // respect rate limitations
    console.log(`Prompt: ${prompt}`);

    const predictEndpoint = `https://${CONFIG.vertexAi.endpoint}/v1/projects/${this.projectId}/locations/us-central1/publishers/google/models/${CONFIG.vertexAi.modelId}:predict`;

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

    console.log(JSON.stringify(res, null, 2));

    return res.predictions[0].content;
  }

  /**
   * Returns the VertexHelper instance, initializing it if it does not exist yet.
   *
   * @returns {!VertexHelper} The initialized SheetsService instance
   */
  static getInstance(projectId: string) {
    if (typeof this.instance === 'undefined') {
      this.instance = new VertexHelper(projectId);
    }
    return this.instance;
  }
}
