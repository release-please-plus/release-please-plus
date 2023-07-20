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

import {ChangelogNotes, BuildNotesOptions} from '../changelog-notes';
import {ConventionalCommit} from '../commit';
import {ChangelogSection} from '../types';
import {fetch} from 'node-fetch-native';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const conventionalChangelogWriter = require('conventional-changelog-writer');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const presetFactory = require('conventional-changelog-conventionalcommits');
const DEFAULT_HOST = 'https://github.com';

interface DefaultChangelogNotesOptions {
  commitPartial?: string;
  headerPartial?: string;
  mainTemplate?: string;
}

interface Note {
  title: string;
  text: string;
}

export class DefaultChangelogNotes implements ChangelogNotes {
  // allow for customized commit template.
  private commitPartial?: string;
  private headerPartial?: string;
  private mainTemplate?: string;

  constructor(options: DefaultChangelogNotesOptions = {}) {
    this.commitPartial = options.commitPartial;
    this.headerPartial = options.headerPartial;
    this.mainTemplate = options.mainTemplate;
  }

  async buildNotes(
    commits: ConventionalCommit[],
    options: BuildNotesOptions
  ): Promise<string> {
    const context = {
      host: options.host || DEFAULT_HOST,
      owner: options.owner,
      repository: options.repository,
      version: options.version,
      previousTag: options.previousTag,
      currentTag: options.currentTag,
      linkCompare: !!options.previousTag,
    };

    const config: {[key: string]: ChangelogSection[]} = {};
    if (options.changelogSections) {
      config.types = options.changelogSections;
    }
    const preset = await presetFactory(config);
    preset.writerOpts.commitPartial =
      this.commitPartial || preset.writerOpts.commitPartial;
    preset.writerOpts.headerPartial =
      this.headerPartial || preset.writerOpts.headerPartial;
    preset.writerOpts.mainTemplate =
      this.mainTemplate || preset.writerOpts.mainTemplate;
    const changelogCommits = commits.map(commit => {
      const notes = commit.notes
        .filter(note => note.title === 'BREAKING CHANGE')
        .map(note =>
          replaceIssueLink(
            note,
            context.host,
            context.owner,
            context.repository
          )
        );
      return {
        body: '', // commit.body,
        subject: htmlEscape(commit.bareMessage),
        type: commit.type,
        scope: commit.scope,
        notes,
        references: commit.references,
        mentions: [],
        merge: null,
        revert: null,
        header: commit.message,
        footer: commit.notes
          .filter(note => note.title === 'RELEASE AS')
          .map(note => `Release-As: ${note.text}`)
          .join('\n'),
        hash: commit.sha,
      };
    });

    let result = conventionalChangelogWriter
      .parseArray(changelogCommits, context, preset.writerOpts)
      .trim() as string;

    const _authors = new Map<string, {email: Set<string>; github?: string}>();
    for (const commit of commits) {
      if (!commit.author) {
        continue;
      }
      const name = formatName(commit.author.name);
      if (!name || name.includes('[bot]')) {
        continue;
      }
      if (_authors.has(name)) {
        const entry = _authors.get(name);
        entry!.email.add(commit.author.email);
      } else {
        _authors.set(name, {
          email: new Set([commit.author.email]),
          github: commit.author?.user?.login,
        });
      }
    }

    // Try to map authors to github usernames
    await Promise.all(
      [..._authors.keys()].map(async authorName => {
        const meta = _authors.get(authorName);
        for (const email of meta!.email) {
          if (!meta?.github) {
            const {user} = await fetch(`https://ungh.cc/users/find/${email}`)
              .then(r => r.json())
              .catch(() => ({user: null}));
            if (user) {
              meta!.github = user.username;
              break;
            }
          }
        }
      })
    );

    const authors = [..._authors.entries()].map(e => ({name: e[0], ...e[1]}));
    const markdown: string[] = [];
    if (authors.length > 0) {
      //  Gitmoji
      // '### ❤️  Contributors',
      markdown.push(
        '### Contributors',
        '',
        ...authors.map(i => {
          // const _email = [...i.email].find(
          //   e => !e.includes('noreply.github.com')
          // );
          // const email = _email ? `<${_email}>` : '';
          // ? `([@${i.github}](http://github.com/${i.github}))`
          // github will add hover card and link automatically
          const github = i.github ? `(@${i.github})` : '';
          return `* ${i.name} ${github}`;
        })
      );
      result += '\n\n';
      result += markdown.join('\n').trim();
    }
    //gitmoji
    // convert(markdown.join('\n').trim(), true);
    return result;
  }
}

function replaceIssueLink(
  note: Note,
  host: string,
  owner: string,
  repo: string
): Note {
  note.text = note.text.replace(
    /\(#(\d+)\)/,
    `([#$1](${host}/${owner}/${repo}/issues/$1))`
  );
  return note;
}

function htmlEscape(message: string): string {
  return message.replace('<', '&lt;').replace('>', '&gt;');
}

function formatName(name = '') {
  return name
    .split(' ')
    .map(p => upperFirst(p.trim()))
    .join(' ');
}

export function upperFirst<S extends string>(string_: S): Capitalize<S> {
  return (
    !string_ ? '' : string_[0].toUpperCase() + string_.slice(1)
  ) as Capitalize<S>;
}
