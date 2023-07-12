// Jest Snapshot v1, https://goo.gl/fbAQLP

exports[`ChartYaml updateContent updates version in Chart.yaml 1`] = `
"# Copyright 2021 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the \\"License\\");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an \\"AS IS\\" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

name: helm-test-repo
version: 1.1.0
apiVersion: v2
# renovate: image=imageName
appVersion: 2.0.0
dependencies:
  - name: another-repo
    version: 0.15.3
    repository: \\"linkToHelmChartRepo\\"
maintainers:
  - Abhinav Khanna
"
`;
