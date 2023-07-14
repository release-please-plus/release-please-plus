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

import {Bootstrapper} from '../src/bootstrapper';
import {GitHub} from '../src/github';
import {assertHasUpdate} from './helpers';
import {ReleasePleaseManifest} from '../src/updaters/release-please-manifest';
import {ReleasePleaseConfig} from '../src/updaters/release-please-config';
import 'jest-extended';

describe('Bootstrapper', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'fake-owner',
      repo: 'fake-repo',
      defaultBranch: 'main',
      token: 'fake-token',
    });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });
  it('should open a PR', async () => {
    const expectedTitle = 'chore: bootstrap releases for path: .';
    const expectedHeadBranchName = 'release-please/bootstrap/default';
    const createPullRequestStub = jest
      .spyOn(github, 'createPullRequest')
      .mockResolvedValue({
        headBranchName: expectedHeadBranchName,
        baseBranchName: 'main',
        title: expectedTitle,
        body: 'body',
        files: [],
        labels: [],
        number: 123,
      });

    const bootstapper = new Bootstrapper(github, 'main');
    const pullRequest = await bootstapper.bootstrap('.', {
      releaseType: 'node',
    });
    expect(pullRequest.number).toEqual(123);
    expect(createPullRequestStub).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        headBranchName: expectedHeadBranchName,
        baseBranchName: 'main',
      }),
      'main',
      expectedTitle,
      expect.toBeArray(),
      expect.anything()
    );
    const updates = createPullRequestStub.mock.calls[0][3];
    assertHasUpdate(
      updates,
      '.release-please-manifest.json',
      ReleasePleaseManifest
    );
    const update = assertHasUpdate(
      updates,
      'release-please-config.json',
      ReleasePleaseConfig
    );
    expect(update.createIfMissing).toBe(true);
    const newContent = update.updater.updateContent(undefined);
    expect(newContent).toMatchSnapshot();
  });
});
