// Copyright 2021 Google LLC
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

import {readFileSync} from 'fs';
import {resolve} from 'path';
import {PullRequestBody} from '../../src/util/pull-request-body';
import {Version} from '../../src/version';

const fixturesPath = './test/fixtures/release-notes';

describe('PullRequestBody', () => {
  describe('parse', () => {
    it('should parse multiple components', () => {
      const body = readFileSync(
        resolve(fixturesPath, './multiple.txt'),
        'utf8'
      );
      const pullRequestBody = PullRequestBody.parse(body);
      expect(pullRequestBody).toBeDefined();
      const releaseData = pullRequestBody!.releaseData;
      expect(releaseData).toHaveLength(4);
      expect(releaseData[0].component).toEqual(
        '@google-automations/bot-config-utils'
      );
      expect(releaseData[0].version?.toString()).toEqual('3.2.0');
      expect(releaseData[0].notes).toMatch(/^### Features/);
      expect(releaseData[1].component).toEqual(
        '@google-automations/label-utils'
      );
      expect(releaseData[1].version?.toString()).toEqual('1.1.0');
      expect(releaseData[1].notes).toMatch(/^### Features/);
      expect(releaseData[2].component).toEqual(
        '@google-automations/object-selector'
      );
      expect(releaseData[2].version?.toString()).toEqual('1.1.0');
      expect(releaseData[2].notes).toMatch(/^### Features/);
      expect(releaseData[3].component).toEqual(
        '@google-automations/datastore-lock'
      );
      expect(releaseData[3].version?.toString()).toEqual('2.1.0');
      expect(releaseData[3].notes).toMatch(/^### Features/);
    });
    it('should parse multiple components mixed with componentless', () => {
      const body = readFileSync(
        resolve(fixturesPath, './mixed-componentless-manifest.txt'),
        'utf8'
      );
      const pullRequestBody = PullRequestBody.parse(body);
      expect(pullRequestBody).toBeDefined();
      const releaseData = pullRequestBody!.releaseData;
      expect(releaseData).toHaveLength(2);
      expect(releaseData[0].component).toBeUndefined();
      expect(releaseData[0].version?.toString()).toEqual('3.2.0');
      expect(releaseData[0].notes).toMatch(/^### Features/);
      expect(releaseData[1].component).toEqual(
        '@google-automations/label-utils'
      );
      expect(releaseData[1].version?.toString()).toEqual('1.1.0');
      expect(releaseData[1].notes).toMatch(/^### Features/);
    });
    it('should parse single component from legacy manifest release', () => {
      const body = readFileSync(
        resolve(fixturesPath, './single-manifest.txt'),
        'utf8'
      );
      const pullRequestBody = PullRequestBody.parse(body);
      expect(pullRequestBody).toBeDefined();
      const releaseData = pullRequestBody!.releaseData;
      expect(releaseData).toHaveLength(1);
      expect(releaseData[0].component).toEqual(
        '@google-cloud/release-brancher'
      );
      expect(releaseData[0].version?.toString()).toEqual('1.3.1');
      expect(releaseData[0].notes).toMatch(/^### Bug Fixes/);
    });
    it('should parse standalone release', () => {
      const body = readFileSync(resolve(fixturesPath, './single.txt'), 'utf8');
      const pullRequestBody = PullRequestBody.parse(body);
      expect(pullRequestBody).toBeDefined();
      const releaseData = pullRequestBody!.releaseData;
      expect(releaseData).toHaveLength(1);
      expect(releaseData[0].component).toBeUndefined();
      expect(releaseData[0].version?.toString()).toEqual('3.2.7');
      expect(releaseData[0].notes).toMatch(/^### \[3\.2\.7\]/);
    });
    it('should parse legacy PHP body', () => {
      const body = readFileSync(
        resolve(fixturesPath, './legacy-php-yoshi.txt'),
        'utf8'
      );
      const pullRequestBody = PullRequestBody.parse(body);
      expect(pullRequestBody).toBeDefined();
      const releaseData = pullRequestBody!.releaseData;
      expect(releaseData).toHaveLength(109);
      expect(releaseData[0].component).toEqual('google/cloud-access-approval');
      expect(releaseData[0].version?.toString()).toEqual('0.3.0');
      expect(releaseData[0].notes).toMatch(/Database operations/);
    });

    it('can parse initial release pull rqeuest body', () => {
      const body = readFileSync(
        resolve(fixturesPath, './initial-version.txt'),
        'utf8'
      );
      const pullRequestBody = PullRequestBody.parse(body);
      expect(pullRequestBody).toBeDefined();
      const releaseData = pullRequestBody!.releaseData;
      expect(releaseData).toHaveLength(1);
      expect(releaseData[0].component).toBeUndefined();
      expect(releaseData[0].version?.toString()).toEqual('0.1.0');
      expect(releaseData[0].notes).toMatch(/initial generation/);
    });
  });
  describe('toString', () => {
    it('can handle multiple entries', () => {
      const data = [
        {
          component: 'pkg1',
          version: Version.parse('1.2.3'),
          notes: 'some special notes go here',
        },
        {
          component: 'pkg2',
          version: Version.parse('2.0.0'),
          notes: 'more special notes go here',
        },
      ];
      const pullRequestBody = new PullRequestBody(data);
      expect(pullRequestBody.toString()).toMatchSnapshot();
    });

    it('can handle a single entries', () => {
      const data = [
        {
          component: 'pkg1',
          version: Version.parse('1.2.3'),
          notes: 'some special notes go here',
        },
      ];
      const pullRequestBody = new PullRequestBody(data);
      expect(pullRequestBody.toString()).toMatchSnapshot();
    });

    it('can handle a single entries forced components', () => {
      const data = [
        {
          component: 'pkg1',
          version: Version.parse('1.2.3'),
          notes: 'some special notes go here',
        },
      ];
      const pullRequestBody = new PullRequestBody(data, {useComponents: true});
      expect(pullRequestBody.toString()).toMatchSnapshot();
    });

    it('can handle a custom header and footer', () => {
      const data = [
        {
          component: 'pkg1',
          version: Version.parse('1.2.3'),
          notes: 'some special notes go here',
        },
        {
          component: 'pkg2',
          version: Version.parse('2.0.0'),
          notes: 'more special notes go here',
        },
      ];
      const pullRequestBody = new PullRequestBody(data, {
        header: 'My special header!!!',
        footer: 'A custom footer',
      });
      expect(pullRequestBody.toString()).toMatchSnapshot();
    });

    it('can parse the generated output', () => {
      const data = [
        {
          component: 'pkg1',
          version: Version.parse('1.2.3'),
          notes: 'some special notes go here',
        },
        {
          component: 'pkg2',
          version: Version.parse('2.0.0'),
          notes: 'more special notes go here',
        },
      ];
      const pullRequestBody = new PullRequestBody(data, {
        header: 'My special header!!!',
        footer: 'A custom footer',
      });
      const pullRequestBody2 = PullRequestBody.parse(
        pullRequestBody.toString()
      );
      expect(pullRequestBody2?.releaseData).toEqual(data);
      expect(pullRequestBody2?.header).toEqual('My special header!!!');
      expect(pullRequestBody2?.footer).toEqual('A custom footer');
    });

    it('can handle componently entries', () => {
      const data = [
        {
          version: Version.parse('1.2.3'),
          notes: 'some special notes go here',
        },
        {
          component: 'pkg2',
          version: Version.parse('2.0.0'),
          notes: 'more special notes go here',
        },
      ];
      const pullRequestBody = new PullRequestBody(data);
      expect(pullRequestBody.toString()).toMatchSnapshot();
    });
  });
});
