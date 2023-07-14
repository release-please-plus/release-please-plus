import {ReleasePullRequest} from './release-pull-request';
import {PullRequest} from './pull-request';
import {PullRequestBody} from './util/pull-request-body';

export type ExtraJsonFile = {
  type: 'json';
  path: string;
  jsonpath: string;
  glob?: boolean;
};
export type ExtraYamlFile = {
  type: 'yaml';
  path: string;
  jsonpath: string;
  glob?: boolean;
};
export type ExtraXmlFile = {
  type: 'xml';
  path: string;
  xpath: string;
  glob?: boolean;
};
export type ExtraPomFile = {
  type: 'pom';
  path: string;
  glob?: boolean;
};
export type ExtraTomlFile = {
  type: 'toml';
  path: string;
  jsonpath: string;
  glob?: boolean;
};
export type ExtraFile =
  | string
  | ExtraJsonFile
  | ExtraYamlFile
  | ExtraXmlFile
  | ExtraPomFile
  | ExtraTomlFile;

/**
 * Interface for managing the pull request body contents when the content
 * is too large to fit into a pull request.
 */
export interface PullRequestOverflowHandler {
  /**
   * If a pull request's body is too big, store it somewhere and return
   * a new pull request body with information about the new location.
   * @param {ReleasePullRequest} pullRequest The candidate release pull request
   * @returns {string} The new pull request body which may contain a link to
   *   the full content.
   */
  handleOverflow(
    pullRequest: ReleasePullRequest,
    maxSize?: number
  ): Promise<string>;

  /**
   * Given a pull request, parse the pull request body from the pull request
   * or storage if the body was too big to store in the pull request body.
   * @param {PullRequest} pullRequest The pull request from GitHub
   * @return {PullRequestBody} The parsed pull request body
   */
  parseOverflow(pullRequest: PullRequest): Promise<PullRequestBody | undefined>;
}

export type ChangelogNotesType = string;

export type ReleaseType = string;

export type VersioningStrategyType = string;

export interface ChangelogSection {
  type: string;
  section: string;
  hidden?: boolean;
}

/**
 * These are configurations provided to each strategy per-path.
 */
export interface ReleaserConfig {
  releaseType: ReleaseType;

  // Versioning config
  versioning?: VersioningStrategyType;
  bumpMinorPreMajor?: boolean;
  bumpPatchForMinorPreMajor?: boolean;

  // Strategy options
  releaseAs?: string;
  skipGithubRelease?: boolean; // Note this should be renamed to skipGitHubRelease in next major release
  draft?: boolean;
  prerelease?: boolean;
  draftPullRequest?: boolean;
  component?: string;
  packageName?: string;
  includeComponentInTag?: boolean;
  includeVInTag?: boolean;
  pullRequestTitlePattern?: string;
  pullRequestHeader?: string;
  tagSeparator?: string;
  separatePullRequests?: boolean;
  labels?: string[];
  releaseLabels?: string[];
  extraLabels?: string[];
  initialVersion?: string;

  // Changelog options
  changelogSections?: ChangelogSection[];
  changelogPath?: string;
  changelogType?: ChangelogNotesType;
  changelogHost?: string;

  // Ruby-only
  versionFile?: string;
  // Java-only
  extraFiles?: ExtraFile[];
  snapshotLabels?: string[];
  skipSnapshot?: boolean;
  // Manifest only
  excludePaths?: string[];
}

export type DirectPluginType = string;

export interface ConfigurablePluginType {
  type: string;
}

export interface LinkedVersionPluginConfig extends ConfigurablePluginType {
  type: 'linked-versions';
  groupName: string;
  components: string[];
  merge?: boolean;
}

export interface SentenceCasePluginConfig extends ConfigurablePluginType {
  specialWords?: string[];
}

export interface WorkspacePluginConfig extends ConfigurablePluginType {
  merge?: boolean;
  considerAllArtifacts?: boolean;
}

export interface GroupPriorityPluginConfig extends ConfigurablePluginType {
  groups: string[];
}

export type PluginType =
  | DirectPluginType
  | ConfigurablePluginType
  | GroupPriorityPluginConfig
  | LinkedVersionPluginConfig
  | SentenceCasePluginConfig
  | WorkspacePluginConfig;
// path => config
export type RepositoryConfig = Record<string, ReleaserConfig>;

export interface CandidateReleasePullRequest {
  path: string;
  pullRequest: ReleasePullRequest;
  config: ReleaserConfig;
}
