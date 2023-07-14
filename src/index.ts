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

export * as Errors from './errors';
export {Manifest, ManifestOptions} from './manifest';
export {Commit, ConventionalCommit} from './commit';
export {Strategy} from './strategy';
export {BaseStrategyOptions, BuildUpdatesOptions} from './strategies/base';
export {ReleaseBuilder, getReleaserTypes, registerReleaseType} from './factory';
export {
  ChangelogNotesBuilder,
  ChangelogNotesFactoryOptions,
  getChangelogTypes,
  registerChangelogNotes,
} from './factories/changelog-notes-factory';
export {
  PluginBuilder,
  PluginFactoryOptions,
  getPluginTypes,
  registerPlugin,
} from './factories/plugin-factory';
export {
  VersioningStrategyBuilder,
  VersioningStrategyFactoryOptions,
  getVersioningStrategyTypes,
  registerVersioningStrategy,
} from './factories/versioning-strategy-factory';
export {BuildNotesOptions, ChangelogNotes} from './changelog-notes';
export {Logger, setLogger} from './util/logger';
export {GitHub} from './github';
export {ReleaserConfig} from './types';
export {ChangelogNotesType} from './types';
export {ReleaseType} from './types';
export {VersioningStrategyType} from './types';
export {ChangelogSection} from './types';
export {PluginType} from './types';
export const configSchema = require('../schemas/config.json');
export const manifestSchema = require('../schemas/manifest.json');
