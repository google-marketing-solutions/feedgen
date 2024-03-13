import { MultiLogger } from './logger';

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
export class Util {
  static executeWithRetry(maxRetries: number, fn: Function, delayMillies = 0) {
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        return fn();
      } catch (err) {
        if (delayMillies) {
          Utilities.sleep(delayMillies);
        }
        retryCount++;
        if (retryCount === maxRetries) {
          throw err;
        }
      }
    }
  }

  static splitWords(text: string) {
    return new Set(text.match(/\w+/g));
  }

  static getSetIntersection(set1: Set<string>, set2: Set<string>) {
    return [...[...set1].filter(element => set2.has(element))];
  }

  static getSetDifference(set1: Set<string>, set2: Set<string>) {
    return [...[...set1].filter(element => !set2.has(element))];
  }

  static fetchHtmlContent(url: string) {
    try {
      const response = UrlFetchApp.fetch(url);

      if (response.getResponseCode() === 200) {
        const headers = <GoogleAppsScript.URL_Fetch.HttpHeaders>(
          response.getHeaders()
        );
        if ('application/json' === headers['Content-Type']) {
          return response.getContentText();
        }
      }
      return Util.extractTextFromHtml(response.getContentText());
    } catch (e) {
      MultiLogger.getInstance().log(String(e));
    }
    return '';
  }

  /* eslint-disable no-useless-escape */
  static extractTextFromHtml(html: string) {
    const regex_replace_head = /<head.*<\/head>/gs;
    const regex_replace_script = /<script[^<\/script].*/g;
    const regex_replace_svg = /<svg[^<\/svg].*/g;
    const regex_replace_path = /<path[^<\/path].*/g;
    const regex_replace_iframe = /<iframe[^<\/iframe].*/g;
    const regex_replace_anchor = /<a [^<\/a].*/g;

    const regex_extract_span = /<span[^<\/span](.*)/g;
    const regex_extract_p = /<p[^<\/p](.*)/g;
    const regex_extract_text = />(?<content>.*)</s;

    const sanitizedHtml = html
      .replace(regex_replace_head, '')
      .replaceAll(regex_replace_script, '')
      .replaceAll(regex_replace_svg, '')
      .replaceAll(regex_replace_path, '')
      .replaceAll(regex_replace_iframe, '')
      .replaceAll(regex_replace_anchor, '');

    const extractedHtml = [
      ...(sanitizedHtml.match(regex_extract_span) ?? []),
      ...(sanitizedHtml.match(regex_extract_p) ?? []),
    ];

    const lines = [];
    for (const line of extractedHtml) {
      const matches = line.match(regex_extract_text);
      if (matches && matches.groups && matches.groups.content) {
        lines.push(matches.groups.content);
      }
    }
    return lines.join(' ');
  }
}
