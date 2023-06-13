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
  static executeWithRetry(
    maxRetries: number,
    delayMillies: number,
    fn: Function
  ) {
    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        return fn();
      } catch (err) {
        const error = err as Error;
        MultiLogger.getInstance().log(`Error: ${error.message}`);
        retryCount++;
        if (delayMillies) {
          Utilities.sleep(delayMillies);
        }
      }
    }

    throw new Error(`Exceeded maximum number of retries (${maxRetries}).`);
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

  static countSetOccurencesInString(words: Set<string>, text: string) {
    const wordsArray = Array.from(words);
    return wordsArray.reduce((matchCount, value) => {
      return text.includes(value) ? matchCount + 1 : matchCount;
    }, 0);
  }
}
