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
