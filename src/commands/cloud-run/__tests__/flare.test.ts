import fs from 'fs'
import process from 'process'
import stream from 'stream'

import {Logging} from '@google-cloud/logging'
import {GoogleAuth} from 'google-auth-library'

import {API_KEY_ENV_VAR, CI_API_KEY_ENV_VAR} from '../../../constants'
import {
  createMockContext,
  MOCK_CWD,
  MOCK_DATADOG_API_KEY,
  MOCK_FLARE_FOLDER_PATH,
} from '../../../helpers/__tests__/fixtures'
import * as fsModule from '../../../helpers/fs'
import * as helpersPromptModule from '../../../helpers/prompt'

import * as flareModule from '../flare'
import {checkAuthentication, getCloudRunServiceConfig, getLogs, maskConfig, MAX_LOGS, saveLogsFile} from '../flare'

import {makeCli} from './fixtures'

const MOCK_REGION = 'us-east1'
const MOCK_SERVICE = 'mock-service'
const MOCK_PROJECT = 'mock-project'
const MOCK_LOG_CLIENT = new Logging({projectId: MOCK_PROJECT})
const MOCK_REQUIRED_FLAGS = [
  'cloud-run',
  'flare',
  '-s',
  MOCK_SERVICE,
  '-p',
  MOCK_PROJECT,
  '-r',
  MOCK_REGION,
  '-c',
  '123',
  '-e',
  'test@test.com',
]
const MOCK_CLOUDRUN_CONFIG = {
  template: {
    containers: [
      {
        env: [
          {
            name: 'DD_API_KEY',
            value: MOCK_DATADOG_API_KEY,
            values: 'value',
          },
          {
            name: 'DD_TRACE_ENABLED',
            value: 'true',
            values: 'value',
          },
          {
            name: 'DD_SITE',
            value: 'datad0g.com',
            values: 'value',
          },
        ],
        image: 'gcr.io/datadog-sandbox/nicholas-hulston-docker-test',
      },
    ],
    someData: 'data',
  },
}
const MOCK_READ_STREAM = new stream.Readable({
  read() {
    this.push(JSON.stringify(MOCK_CLOUDRUN_CONFIG, undefined, 2))
    this.push(undefined)
  },
})

// Mocks
jest.mock('google-auth-library', () => {
  return {
    GoogleAuth: jest.fn().mockImplementation(() => ({
      getApplicationDefault: () => Promise.resolve(),
    })),
  }
})
jest.mock('@google-cloud/run', () => {
  return {
    ServicesClient: jest.fn().mockImplementation(() => ({
      servicePath: jest.fn().mockReturnValue('servicePath'),
      getService: () => Promise.resolve([MOCK_CLOUDRUN_CONFIG]),
    })),
  }
})
jest.spyOn(helpersPromptModule, 'requestConfirmation').mockResolvedValue(true)
jest.mock('util')
jest.mock('jszip')
jest.mock('@google-cloud/logging')
jest.useFakeTimers({now: new Date(Date.UTC(2023, 0))})

// File system mocks
process.cwd = jest.fn().mockReturnValue(MOCK_CWD)
jest.mock('fs')
fs.existsSync = jest.fn().mockReturnValue(true)
;(fs.statSync as jest.Mock).mockImplementation((file_path: string) => ({
  isDirectory: () => file_path === MOCK_FLARE_FOLDER_PATH || file_path === MOCK_CWD,
}))
fs.readdirSync = jest.fn().mockReturnValue([])
fs.createReadStream = jest.fn().mockReturnValue(MOCK_READ_STREAM)

describe('cloud-run flare', () => {
  describe('prints correct headers', () => {
    it('prints non-dry-run header', async () => {
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(['cloud-run', 'flare'], context as any)
      const output = context.stdout.toString()
      expect(code).toBe(1)
      expect(output).toMatchSnapshot()
    })

    it('prints dry-run header', async () => {
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(['cloud-run', 'flare', '-d'], context as any)
      const output = context.stdout.toString()
      expect(code).toBe(1)
      expect(output).toMatchSnapshot()
    })
  })

  describe('validates required flags', () => {
    beforeEach(() => {
      process.env = {[CI_API_KEY_ENV_VAR]: MOCK_DATADOG_API_KEY}
    })

    it('prints error when no service specified', async () => {
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(
        ['cloud-run', 'flare', '-p', MOCK_PROJECT, '-r', MOCK_REGION, '-c', '123', '-e', 'test@test.com'],
        context as any
      )
      expect(code).toBe(1)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })

    it('prints error when no project specified', async () => {
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(
        ['cloud-run', 'flare', '-s', MOCK_SERVICE, '-r', MOCK_REGION, '-c', '123', '-e', 'test@test.com'],
        context as any
      )
      expect(code).toBe(1)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })

    it('prints error when no region specified', async () => {
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(
        ['cloud-run', 'flare', '-s', MOCK_SERVICE, '-p', MOCK_PROJECT, '-c', '123', '-e', 'test@test.com'],
        context as any
      )
      expect(code).toBe(1)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })

    it('prints error when no case ID specified', async () => {
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(
        ['cloud-run', 'flare', '-s', MOCK_SERVICE, '-p', MOCK_PROJECT, '-r', MOCK_REGION, '-e', 'test@test.com'],
        context as any
      )
      expect(code).toBe(1)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })

    it('prints error when no email specified', async () => {
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(
        ['cloud-run', 'flare', '-s', MOCK_SERVICE, '-p', MOCK_PROJECT, '-r', MOCK_REGION, '-c', '123'],
        context as any
      )
      expect(code).toBe(1)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })

    it('prints error when no API key in env variables', async () => {
      process.env = {}
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(MOCK_REQUIRED_FLAGS, context as any)
      expect(code).toBe(1)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })

    it('uses API key ENV variable and runs as expected', async () => {
      process.env = {}
      process.env[CI_API_KEY_ENV_VAR] = MOCK_DATADOG_API_KEY
      process.env[API_KEY_ENV_VAR] = undefined
      const cli = makeCli()
      const context = createMockContext()
      let code = await cli.run(MOCK_REQUIRED_FLAGS, context as any)
      expect(code).toBe(0)
      let output = context.stdout.toString()
      expect(output).toMatchSnapshot()

      process.env[CI_API_KEY_ENV_VAR] = undefined
      process.env[API_KEY_ENV_VAR] = MOCK_DATADOG_API_KEY
      code = await cli.run(MOCK_REQUIRED_FLAGS, context as any)
      expect(code).toBe(0)
      output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })

    it('runs successfully with all required options specified', async () => {
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(MOCK_REQUIRED_FLAGS, context as any)
      expect(code).toBe(0)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })
  })

  describe('checkAuthentication', () => {
    it('should return true when authentication is successful', async () => {
      ;(GoogleAuth as any).mockImplementationOnce(() => ({
        getApplicationDefault: () => Promise.resolve(),
      }))

      const result = await checkAuthentication()
      expect(result).toBeTruthy()
      expect(GoogleAuth).toBeCalledTimes(1)
    })

    it('should return false when authentication fails', async () => {
      ;(GoogleAuth as any).mockImplementationOnce(() => ({
        getApplicationDefault: () => Promise.reject(),
      }))

      const result = await checkAuthentication()
      expect(result).toBeFalsy()
      expect(GoogleAuth).toBeCalledTimes(1)
    })

    it('prints instructions on how to authenticate when authentication fails', async () => {
      ;(GoogleAuth as any).mockImplementationOnce(() => ({
        getApplicationDefault: () => Promise.reject(),
      }))

      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(MOCK_REQUIRED_FLAGS, context as any)
      expect(code).toBe(1)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })
  })

  describe('getCloudRunServiceConfig', () => {
    const getConfigSpy = jest.spyOn(flareModule, 'getCloudRunServiceConfig')

    afterAll(() => {
      getConfigSpy.mockRestore()
    })

    it('stops and prints error when getCloudRunServiceConfig fails', async () => {
      ;(getCloudRunServiceConfig as any).mockImplementation(() => {
        throw new Error('MOCK ERROR: Some API error')
      })
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(MOCK_REQUIRED_FLAGS, context as any)
      expect(code).toBe(1)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })

    it('prints config when running as a dry run', async () => {
      ;(getCloudRunServiceConfig as any).mockImplementation(() => Promise.resolve(MOCK_CLOUDRUN_CONFIG))
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run([...MOCK_REQUIRED_FLAGS, '-d'], context as any)
      expect(code).toBe(0)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
    })
  })

  describe('maskConfig', () => {
    it('should mask a Cloud Run config correctly', () => {
      const maskedConfig = maskConfig(MOCK_CLOUDRUN_CONFIG)
      expect(maskedConfig).toMatchSnapshot()
    })

    it('should not modify config if env vars are missing', () => {
      const cloudrunConfigCopy = JSON.parse(JSON.stringify(MOCK_CLOUDRUN_CONFIG))
      delete cloudrunConfigCopy.template.containers
      const maskedConfig = maskConfig(cloudrunConfigCopy)
      expect(maskedConfig).toMatchSnapshot()
    })
  })

  describe('prompts for confirmation before sending', () => {
    it('sends when user answers prompt with yes', async () => {
      jest.spyOn(helpersPromptModule, 'requestConfirmation').mockResolvedValueOnce(true)
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(MOCK_REQUIRED_FLAGS, context as any)
      expect(code).toBe(0)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
      expect(output).toContain('✅ Successfully sent flare file to Datadog Support!')
    })

    it('does not send when user answers prompt with no', async () => {
      jest.spyOn(helpersPromptModule, 'requestConfirmation').mockResolvedValueOnce(false)
      const cli = makeCli()
      const context = createMockContext()
      const code = await cli.run(MOCK_REQUIRED_FLAGS, context as any)
      expect(code).toBe(0)
      const output = context.stdout.toString()
      expect(output).toMatchSnapshot()
      expect(output).toContain('🚫 The flare files were not sent based on your selection.')
    })
  })

  describe('getLogs', () => {
    const logName = 'mock-logname'
    const mockLogs = [
      {metadata: {severity: 'DEFAULT', timestamp: '2023-07-28 00:00:00', logName, textPayload: 'Log 1'}},
      {metadata: {severity: 'INFO', timestamp: '2023-07-28 00:00:00', logName, textPayload: 'Log 2'}},
      {metadata: {severity: 'NOTICE', timestamp: '2023-07-28 01:01:01', logName, textPayload: 'Log 3'}},
    ]
    const MOCK_GET_ENTRIES = MOCK_LOG_CLIENT.getEntries as jest.Mock
    MOCK_GET_ENTRIES.mockResolvedValue([mockLogs, {pageToken: undefined}])
    const expectedOrder = 'timestamp asc'

    it('uses correct filter when `severityFilter` is unspecified', async () => {
      await getLogs(MOCK_LOG_CLIENT, MOCK_SERVICE, MOCK_REGION)
      const expectedFilter = `resource.labels.service_name="${MOCK_SERVICE}" AND resource.labels.location="${MOCK_REGION}" AND timestamp>="2022-12-31T00:00:00.000Z" AND (textPayload:* OR httpRequest:*)`

      expect(MOCK_LOG_CLIENT.getEntries).toHaveBeenCalledWith({
        filter: expectedFilter,
        orderBy: expectedOrder,
        pageSize: MAX_LOGS,
      })
    })

    it('uses correct filter when `severityFilter` is defined', async () => {
      await getLogs(MOCK_LOG_CLIENT, MOCK_SERVICE, MOCK_REGION, ' AND severity>="WARNING"')
      const expectedFilter = `resource.labels.service_name="${MOCK_SERVICE}" AND resource.labels.location="${MOCK_REGION}" AND timestamp>="2022-12-31T00:00:00.000Z" AND (textPayload:* OR httpRequest:*) AND severity>="WARNING"`

      expect(MOCK_LOG_CLIENT.getEntries).toHaveBeenCalledWith({
        filter: expectedFilter,
        orderBy: expectedOrder,
        pageSize: MAX_LOGS,
      })
    })

    it('converts logs to the CloudRunLog interface correctly', async () => {
      const page1 = [
        {metadata: {severity: 'DEFAULT', timestamp: '2023-07-28 00:00:00', logName, textPayload: 'Test log'}},
      ]
      MOCK_GET_ENTRIES.mockResolvedValueOnce([page1, {pageToken: undefined}])

      const logs = await getLogs(MOCK_LOG_CLIENT, MOCK_SERVICE, MOCK_REGION)

      expect(logs).toEqual([
        {
          severity: 'DEFAULT',
          timestamp: '2023-07-28 00:00:00',
          logName,
          message: '"Test log"',
        },
      ])
    })

    it('throws an error when `getEntries` fails', async () => {
      const error = new Error('getEntries failed')
      MOCK_GET_ENTRIES.mockRejectedValueOnce(error)

      await expect(getLogs(MOCK_LOG_CLIENT, MOCK_SERVICE, MOCK_REGION)).rejects.toMatchSnapshot()
    })

    it('returns an empty array when no logs are returned', async () => {
      MOCK_GET_ENTRIES.mockResolvedValueOnce([[], {pageToken: undefined}])
      const logs = await getLogs(MOCK_LOG_CLIENT, MOCK_SERVICE, MOCK_REGION)

      expect(logs).toEqual([])
    })

    it('handles httpRequest payload correctly', async () => {
      const page = [
        {
          metadata: {
            severity: 'DEFAULT',
            timestamp: '2023-07-28 00:00:00',
            logName,
            httpRequest: {
              requestMethod: 'GET',
              status: 200,
              responseSize: '1300',
              latency: {seconds: '1', nanos: '500000000'},
              requestUrl: '/test-endpoint',
            },
          },
        },
      ]
      MOCK_GET_ENTRIES.mockResolvedValueOnce([page, {pageToken: undefined}])

      const logs = await getLogs(MOCK_LOG_CLIENT, MOCK_SERVICE, MOCK_REGION)
      expect(logs).toMatchSnapshot()
    })

    it('handles textPayload correctly', async () => {
      const page = [
        {
          metadata: {
            severity: 'DEFAULT',
            timestamp: '2023-07-28 00:00:00',
            logName,
            textPayload: 'Some text payload',
          },
        },
      ]
      MOCK_GET_ENTRIES.mockResolvedValueOnce([page, {pageToken: undefined}])

      const logs = await getLogs(MOCK_LOG_CLIENT, MOCK_SERVICE, MOCK_REGION)
      expect(logs).toMatchSnapshot()
    })

    it('handles when a log is an HTTP request and has a textPayload', async () => {
      const page = [
        {metadata: {severity: 'DEFAULT', timestamp: '2023-07-28 00:00:00', logName, textPayload: 'Test log 1'}},
        {
          metadata: {
            httpRequest: {
              status: 504,
            },
            timestamp: '2023-07-28 00:00:01',
            logName,
            textPayload: 'some text payload.',
          },
        },
      ]
      MOCK_GET_ENTRIES.mockResolvedValueOnce([page, {pageToken: undefined}])

      const logs = await getLogs(MOCK_LOG_CLIENT, MOCK_SERVICE, MOCK_REGION)

      expect(logs).toMatchSnapshot()
    })
  })

  describe('saveLogsFile', () => {
    const mockLogs = [
      {severity: 'DEFAULT', timestamp: '2023-07-28 00:00:00', logName: 'mock-logname', message: 'Test log 1'},
      {severity: 'INFO', timestamp: '2023-07-28 00:00:01', logName: 'mock-logname', message: 'Test log 2'},
      {severity: 'NOTICE', timestamp: '2023-07-28 01:01:01', logName: 'mock-logname', message: 'Test log 3'},
    ]
    const writeFileSpy = jest.spyOn(fsModule, 'writeFile')
    const mockFilePath = 'path/to/logs.csv'

    it('should save logs to file correctly', () => {
      saveLogsFile(mockLogs, mockFilePath)
      const expectedContent = [
        'severity,timestamp,logName,message',
        '"DEFAULT","2023-07-28 00:00:00","mock-logname","Test log 1"',
        '"INFO","2023-07-28 00:00:01","mock-logname","Test log 2"',
        '"NOTICE","2023-07-28 01:01:01","mock-logname","Test log 3"',
      ].join('\n')
      expect(writeFileSpy).toHaveBeenCalledWith(mockFilePath, expectedContent)
    })
  })
})