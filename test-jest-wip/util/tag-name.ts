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

import {TagName} from '../../src/util/tag-name';

describe('TagName', () => {
  describe('parse', () => {
    describe('with component', () => {
      it('handles a default separator', () => {
        const name = 'some-component-v1.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toEqual('some-component');
        expect(tagName?.version.toString()).toEqual('1.2.3');
        expect(tagName?.separator).toEqual('-');
        expect(tagName?.toString()).toEqual(name);
      });
      it('handles a / separator', () => {
        const name = 'some-component/v1.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toEqual('some-component');
        expect(tagName?.version.toString()).toEqual('1.2.3');
        expect(tagName?.separator).toEqual('/');
        expect(tagName?.toString()).toEqual(name);
      });
      it('handles tag without a v', () => {
        const name = 'some-component-1.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toEqual('some-component');
        expect(tagName?.version.toString()).toEqual('1.2.3');
        expect(tagName?.separator).toEqual('-');
        expect(tagName?.toString()).toEqual(name);
      });
      it('handles tag without a v with a / separator', () => {
        const name = 'some-component/1.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toEqual('some-component');
        expect(tagName?.version.toString()).toEqual('1.2.3');
        expect(tagName?.separator).toEqual('/');
        expect(tagName?.toString()).toEqual(name);
      });
    });
    describe('without component', () => {
      it('handles a version', () => {
        const name = 'v1.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toBeUndefined();
        expect(tagName?.version.toString()).toEqual('1.2.3');
        expect(tagName?.separator).toEqual('-');
        expect(tagName?.toString()).toEqual(name);
      });
      it('handles a version without a v', () => {
        const name = '1.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toBeUndefined();
        expect(tagName?.version.toString()).toEqual('1.2.3');
        expect(tagName?.separator).toEqual('-');
        expect(tagName?.toString()).toEqual(name);
      });
      it('handles a dual digit version without v', () => {
        const name = '10.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toBeUndefined();
        expect(tagName?.version.toString()).toEqual('10.2.3');
        expect(tagName?.separator).toEqual('-');
        expect(tagName?.toString()).toEqual(name);
      });
      it('handles a dual digit version', () => {
        const name = 'v10.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toBeUndefined();
        expect(tagName?.version.toString()).toEqual('10.2.3');
        expect(tagName?.separator).toEqual('-');
        expect(tagName?.toString()).toEqual(name);
      });
      it('handles a triple digit version without v', () => {
        const name = '178.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toBeUndefined();
        expect(tagName?.version.toString()).toEqual('178.2.3');
        expect(tagName?.separator).toEqual('-');
        expect(tagName?.toString()).toEqual(name);
      });
      it('handles a triple digit version', () => {
        const name = 'v178.2.3';
        const tagName = TagName.parse(name);
        expect(tagName).toBeDefined();
        expect(tagName?.component).toBeUndefined();
        expect(tagName?.version.toString()).toEqual('178.2.3');
        expect(tagName?.separator).toEqual('-');
        expect(tagName?.toString()).toEqual(name);
      });
    });
  });
});
