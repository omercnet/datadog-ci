import {
  CI_JOB_NAME,
  CI_JOB_URL,
  CI_PIPELINE_ID,
  CI_PIPELINE_NAME,
  CI_PIPELINE_NUMBER,
  CI_PIPELINE_URL,
  CI_PROVIDER_NAME,
  CI_STAGE_NAME,
  CI_WORKSPACE_PATH,
  GIT_BRANCH,
  GIT_COMMIT_AUTHOR_DATE,
  GIT_COMMIT_AUTHOR_EMAIL,
  GIT_COMMIT_AUTHOR_NAME,
  GIT_COMMIT_COMMITTER_DATE,
  GIT_COMMIT_COMMITTER_EMAIL,
  GIT_COMMIT_COMMITTER_NAME,
  GIT_COMMIT_MESSAGE,
  GIT_REPOSITORY_URL,
  GIT_SHA,
  GIT_TAG,
} from '../tags'

import {getUserCIMetadata, getUserGitMetadata} from '../user-provided-git'

describe('getUserGitMetadata', () => {
  const DD_GIT_METADATA = {
    DD_GIT_COMMIT_SHA: 'DD_GIT_COMMIT_SHA',
    DD_GIT_REPOSITORY_URL: 'DD_GIT_REPOSITORY_URL',
    DD_GIT_BRANCH: 'DD_GIT_BRANCH',
    DD_GIT_COMMIT_MESSAGE: 'DD_GIT_COMMIT_MESSAGE',
    DD_GIT_COMMIT_AUTHOR_NAME: 'DD_GIT_COMMIT_AUTHOR_NAME',
    DD_GIT_COMMIT_AUTHOR_EMAIL: 'DD_GIT_COMMIT_AUTHOR_EMAIL',
    DD_GIT_COMMIT_AUTHOR_DATE: 'DD_GIT_COMMIT_AUTHOR_DATE',
    DD_GIT_COMMIT_COMMITTER_NAME: 'DD_GIT_COMMIT_COMMITTER_NAME',
    DD_GIT_COMMIT_COMMITTER_EMAIL: 'DD_GIT_COMMIT_COMMITTER_EMAIL',
    DD_GIT_COMMIT_COMMITTER_DATE: 'DD_GIT_COMMIT_COMMITTER_DATES',
  }

  it('reads user defined git metadata successfully', () => {
    process.env = {...DD_GIT_METADATA}
    const result = getUserGitMetadata()
    expect(result).toEqual({
      [GIT_REPOSITORY_URL]: 'DD_GIT_REPOSITORY_URL',
      [GIT_BRANCH]: 'DD_GIT_BRANCH',
      [GIT_SHA]: 'DD_GIT_COMMIT_SHA',
      [GIT_COMMIT_MESSAGE]: 'DD_GIT_COMMIT_MESSAGE',
      [GIT_COMMIT_COMMITTER_DATE]: 'DD_GIT_COMMIT_COMMITTER_DATE',
      [GIT_COMMIT_COMMITTER_EMAIL]: 'DD_GIT_COMMIT_COMMITTER_EMAIL',
      [GIT_COMMIT_COMMITTER_NAME]: 'DD_GIT_COMMIT_COMMITTER_NAME',
      [GIT_COMMIT_AUTHOR_DATE]: 'DD_GIT_COMMIT_AUTHOR_DATE',
      [GIT_COMMIT_AUTHOR_EMAIL]: 'DD_GIT_COMMIT_AUTHOR_EMAIL',
      [GIT_COMMIT_AUTHOR_NAME]: 'DD_GIT_COMMIT_AUTHOR_NAME',
    })
  })
  it('does not include empty values', () => {
    process.env = {...DD_GIT_METADATA, DD_GIT_COMMIT_SHA: undefined}
    const result = getUserGitMetadata()
    expect(result).toEqual({
      [GIT_REPOSITORY_URL]: 'DD_GIT_REPOSITORY_URL',
      [GIT_BRANCH]: 'DD_GIT_BRANCH',
      [GIT_COMMIT_MESSAGE]: 'DD_GIT_COMMIT_MESSAGE',
      [GIT_COMMIT_COMMITTER_DATE]: 'DD_GIT_COMMIT_COMMITTER_DATE',
      [GIT_COMMIT_COMMITTER_EMAIL]: 'DD_GIT_COMMIT_COMMITTER_EMAIL',
      [GIT_COMMIT_COMMITTER_NAME]: 'DD_GIT_COMMIT_COMMITTER_NAME',
      [GIT_COMMIT_AUTHOR_DATE]: 'DD_GIT_COMMIT_AUTHOR_DATE',
      [GIT_COMMIT_AUTHOR_EMAIL]: 'DD_GIT_COMMIT_AUTHOR_EMAIL',
      [GIT_COMMIT_AUTHOR_NAME]: 'DD_GIT_COMMIT_AUTHOR_NAME',
    })
  })
  it('overwrites branch when tag is available', () => {
    process.env = {...DD_GIT_METADATA, DD_GIT_TAG: 'DD_GIT_TAG'}
    const result = getUserGitMetadata()
    expect(result).toEqual({
      [GIT_TAG]: 'DD_GIT_TAG',
      [GIT_REPOSITORY_URL]: 'DD_GIT_REPOSITORY_URL',
      [GIT_COMMIT_MESSAGE]: 'DD_GIT_COMMIT_MESSAGE',
      [GIT_COMMIT_COMMITTER_DATE]: 'DD_GIT_COMMIT_COMMITTER_DATE',
      [GIT_COMMIT_COMMITTER_EMAIL]: 'DD_GIT_COMMIT_COMMITTER_EMAIL',
      [GIT_COMMIT_COMMITTER_NAME]: 'DD_GIT_COMMIT_COMMITTER_NAME',
      [GIT_COMMIT_AUTHOR_DATE]: 'DD_GIT_COMMIT_AUTHOR_DATE',
      [GIT_COMMIT_AUTHOR_EMAIL]: 'DD_GIT_COMMIT_AUTHOR_EMAIL',
      [GIT_COMMIT_AUTHOR_NAME]: 'DD_GIT_COMMIT_AUTHOR_NAME',
    })
  })
  it('returns an empty object if no user git is defined', () => {
    process.env = {}
    const result = getUserGitMetadata()
    expect(result).toEqual({})
  })
})

describe('getUserGitMetadata', () => {
  const DD_CI_METADATA = {
    DD_CI_JOB_NAME: 'DD_CI_JOB_NAME',
    DD_CI_JOB_URL: 'DD_CI_JDD_OB_URL',
    DD_CI_PIPELINE_ID: 'DD_CI_PIPELINE_ID',
    DD_CI_PIPELINE_NAME: 'DD_CI_PIPELINE_NAME',
    DD_CI_PIPELINE_NUMBER: 'DD_CI_PIPELINE_NUMBER',
    DD_CI_PIPELINE_URL: 'DD_CI_PIPELINE_URL',
    DD_CI_PROVIDER_NAME: 'DD_CI_PROVIDER_NAME',
    DD_CI_STAGE_NAME: 'DD_CI_STAGE_NAME',
    DD_CI_WORKSPACE_PATH: 'DD_CI_WORKSPACE_PATH',
  }

  it('reads user defined git metadata successfully', () => {
    process.env = {...DD_CI_METADATA}
    const result = getUserCIMetadata()
    expect(result).toEqual({
      [CI_JOB_NAME]: 'DD_CI_JOB_NAME',
      [CI_JOB_URL]: 'DD_CI_JOB_URL',
      [CI_PIPELINE_ID]: 'DD_CI_PIPELINE_ID',
      [CI_PIPELINE_NAME]: 'DD_CI_PIPELINE_NAME',
      [CI_PIPELINE_NUMBER]: 'DD_CI_PIPELINE_NUMBER',
      [CI_PIPELINE_URL]: 'DD_CI_PIPELINE_URL',
      [CI_PROVIDER_NAME]: 'DD_CI_PROVIDER_NAME',
      [CI_STAGE_NAME]: 'DD_CI_STAGE_NAME',
      [CI_WORKSPACE_PATH]: 'DD_CI_WORKSPACE_PATH',
    })
  })
  it('does not include empty values', () => {
    process.env = {...DD_CI_METADATA, CI_PIPELINE_ID: undefined}
    const result = getUserGitMetadata()
    expect(result).toEqual({
      [CI_JOB_NAME]: 'DD_CI_JOB_NAME',
      [CI_JOB_URL]: 'DD_CI_JOB_URL',
      [CI_PIPELINE_NAME]: 'DD_CI_PIPELINE_NAME',
      [CI_PIPELINE_NUMBER]: 'DD_CI_PIPELINE_NUMBER',
      [CI_PIPELINE_URL]: 'DD_CI_PIPELINE_URL',
      [CI_PROVIDER_NAME]: 'DD_CI_PROVIDER_NAME',
      [CI_STAGE_NAME]: 'DD_CI_STAGE_NAME',
      [CI_WORKSPACE_PATH]: 'DD_CI_WORKSPACE_PATH',
    })
  })
  it('returns an empty object if no user git is defined', () => {
    process.env = {}
    const result = getUserGitMetadata()
    expect(result).toEqual({})
  })
})
