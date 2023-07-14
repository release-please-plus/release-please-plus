// Copyright 2022 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {readdirSync} from 'fs';
import {resolve} from 'path';
import {configSchema, manifestSchema} from '../src/index';

const fixturesPath = './test/fixtures/manifest';
const ajv = new Ajv();
addFormats(ajv);

describe('schemas', () => {
  describe('manifest file', () => {
    const manifestValidator = ajv.compile(manifestSchema);
    for (const manifestFile of readdirSync(resolve(fixturesPath, 'versions'))) {
      it(`validates ${manifestFile}`, () => {
        const manifest = require(resolve(
          fixturesPath,
          'versions',
          manifestFile
        ));
        const result = manifestValidator(manifest);
        expect(result).toBe(true);
        expect(manifestValidator.errors).toBeNull();
      });
    }
  });

  describe('config file', () => {
    const configValidator = ajv.compile(configSchema);
    for (const manifestFile of readdirSync(resolve(fixturesPath, 'config'))) {
      it(`validates ${manifestFile}`, () => {
        const config = require(resolve(fixturesPath, 'config', manifestFile));
        const result = configValidator(config);
        expect(result).toBe(true);
        expect(configValidator.errors).toBeNull();
      });
    }

    it('rejects extra properties', () => {
      const config = {
        extraField: 'foo',
        packages: {
          '.': {},
        },
      };
      const result = configValidator(config);
      expect(result).toBe(false);
      expect(configValidator.errors).toHaveLength(1);
      const error = configValidator.errors![0];
      expect(error.message).toEqual('must NOT have additional properties');
      expect(error.instancePath).toEqual('');
      expect(error.params.additionalProperty).toEqual('extraField');
    });
  });
});
