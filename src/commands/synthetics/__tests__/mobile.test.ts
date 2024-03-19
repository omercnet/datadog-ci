import fs from 'fs'
import path from 'path'

import { EndpointError } from '../api'
import { CiError, CriticalError } from '../errors'
import { TestWithOverride, TriggerConfig } from '../interfaces'
import * as mobile from '../mobile'
import { AppUploadReporter } from '../reporters/appUpload'

import {APP_UPLOAD_POLL_RESULTS, MOBILE_PRESIGNED_URLS_PAYLOAD, getApiHelper, getMobileTest, getTestPayload, APP_UPLOAD_SIZE_AND_PARTS, APP_UPLOAD_PART_RESPONSES, getTriggerConfig, getTestAndConfigOverride, uploadCommandConfig, getMockAppUploadReporter} from './fixtures'

describe('getSizeAndPartsFromFile', () => {
  test('correctly get size and parts of a file', async () => {
    const tmpdir = fs.mkdtempSync('getSizeAndPartsFromFile')
    try {
      // write test content to a file in the temporary directory
      const filename = path.join(tmpdir, 'compute_md5_test')
      const fileContent = '7 bytes'
      fs.writeFileSync(filename, fileContent)

      expect(await mobile.getSizeAndPartsFromFile(filename)).toEqual({
        appSize: 7,
        parts: [
          {
            blob: Buffer.from(fileContent),
            md5: 'QCi9PCxLLuyHmU0aRshoeA==',
            partNumber: 1,
          },
        ],
      })
    } finally {
      // always clean up created tmpdir
      fs.rmSync(tmpdir, {recursive: true, force: true})
    }
  })
})

describe('uploadMobileApplication', () => {
  const api = getApiHelper()
  let getSizeAndPartsFromFileSpy: jest.SpyInstance
  let getMobileApplicationPresignedURLsSpy: jest.SpyInstance
  let uploadMobileApplicationPartSpy: jest.SpyInstance
  let completeMultipartMobileApplicationUploadSpy: jest.SpyInstance
  let pollMobileApplicationUploadResponseSpy: jest.SpyInstance
  const jobId = 'jobId'

  beforeEach(() => {
    getSizeAndPartsFromFileSpy = jest.spyOn(mobile, 'getSizeAndPartsFromFile').mockImplementation(async () => APP_UPLOAD_SIZE_AND_PARTS)
    getMobileApplicationPresignedURLsSpy = jest.spyOn(api, 'getMobileApplicationPresignedURLs').mockImplementation(async () => MOBILE_PRESIGNED_URLS_PAYLOAD)
    uploadMobileApplicationPartSpy = jest.spyOn(api, 'uploadMobileApplicationPart').mockImplementation(async () => APP_UPLOAD_PART_RESPONSES)
    completeMultipartMobileApplicationUploadSpy = jest.spyOn(api, 'completeMultipartMobileApplicationUpload').mockImplementation(async () => jobId)
    pollMobileApplicationUploadResponseSpy = jest.spyOn(api, 'pollMobileApplicationUploadResponse').mockImplementation(async () => APP_UPLOAD_POLL_RESULTS)
  })

  test('happy path', async () => {
    const result = await mobile.uploadMobileApplication(api, 'new-application-path.ipa', 'mobileAppUuid')

    expect(getSizeAndPartsFromFileSpy).toHaveBeenCalledWith('new-application-path.ipa')
    expect(getMobileApplicationPresignedURLsSpy).toHaveBeenCalledWith('mobileAppUuid', APP_UPLOAD_SIZE_AND_PARTS.appSize, APP_UPLOAD_SIZE_AND_PARTS.parts)
    expect(uploadMobileApplicationPartSpy).toHaveBeenCalledWith(APP_UPLOAD_SIZE_AND_PARTS.parts, MOBILE_PRESIGNED_URLS_PAYLOAD.multipart_presigned_urls_params)
    expect(completeMultipartMobileApplicationUploadSpy).toHaveBeenCalledWith('mobileAppUuid', MOBILE_PRESIGNED_URLS_PAYLOAD.multipart_presigned_urls_params.upload_id, MOBILE_PRESIGNED_URLS_PAYLOAD.multipart_presigned_urls_params.key, APP_UPLOAD_PART_RESPONSES, undefined)
    expect(pollMobileApplicationUploadResponseSpy).toHaveBeenCalledWith(jobId)
    expect(result).toEqual({appUploadResponse: APP_UPLOAD_POLL_RESULTS, fileName: MOBILE_PRESIGNED_URLS_PAYLOAD.file_name})
  })

  test('happy path with new version params', async () => {
    const newVersionParams = {
      originalFileName: 'originalFileName',
      versionName: 'versionName',
      isLatest: true,
    }
    const result = await mobile.uploadMobileApplication(api, 'new-application-path.ipa', 'mobileAppUuid', newVersionParams)

    expect(getSizeAndPartsFromFileSpy).toHaveBeenCalledWith('new-application-path.ipa')
    expect(getMobileApplicationPresignedURLsSpy).toHaveBeenCalledWith('mobileAppUuid', APP_UPLOAD_SIZE_AND_PARTS.appSize, APP_UPLOAD_SIZE_AND_PARTS.parts)
    expect(uploadMobileApplicationPartSpy).toHaveBeenCalledWith(APP_UPLOAD_SIZE_AND_PARTS.parts, MOBILE_PRESIGNED_URLS_PAYLOAD.multipart_presigned_urls_params)
    expect(completeMultipartMobileApplicationUploadSpy).toHaveBeenCalledWith('mobileAppUuid', MOBILE_PRESIGNED_URLS_PAYLOAD.multipart_presigned_urls_params.upload_id, MOBILE_PRESIGNED_URLS_PAYLOAD.multipart_presigned_urls_params.key, APP_UPLOAD_PART_RESPONSES, newVersionParams)
    expect(pollMobileApplicationUploadResponseSpy).toHaveBeenCalledWith(jobId)
    expect(result).toEqual({appUploadResponse: APP_UPLOAD_POLL_RESULTS, fileName: MOBILE_PRESIGNED_URLS_PAYLOAD.file_name})
  })

  test('invalid app throws', async () => {
    const appUploadResponse = {
      status: 'complete',
      is_valid: false,
      invalid_app_result: {
        invalid_message: 'invalid message',
        invalid_reason: 'invalid reason',
      },
    }
    pollMobileApplicationUploadResponseSpy.mockImplementation(async () => appUploadResponse)
    const expectedError = new CiError('INVALID_MOBILE_APP', `Mobile application failed validation for reason: ${appUploadResponse.invalid_app_result.invalid_message}`)

    await expect(mobile.uploadMobileApplication(api, 'invalid-application-path.ipa', 'mobileAppUuid')).rejects.toThrow(expectedError)
  })

  test('user error upload throws', async () => {
    const appUploadResponse = {
      status: 'user_error',
      user_error_result: {
        user_error_reason: 'user error reason',
        user_error_message: 'user error message',
      },
    }
    pollMobileApplicationUploadResponseSpy.mockImplementation(async () => appUploadResponse)
    const expectedError = new CiError('INVALID_MOBILE_APP_UPLOAD_PARAMETERS', `Mobile application failed validation for reason: ${appUploadResponse.user_error_result.user_error_message}`)

    await expect(mobile.uploadMobileApplication(api, 'user-error-application-path.ipa', 'mobileAppUuid')).rejects.toThrow(expectedError)
  })

  test('user 500 validation error throws', async () => {
    const appUploadResponse = {
      status: 'error',
    }
    pollMobileApplicationUploadResponseSpy.mockImplementation(async () => appUploadResponse)
    const expectedError = new CriticalError('UNKNOWN_MOBILE_APP_UPLOAD_FAILURE', 'Unknown mobile application upload error.')

    await expect(mobile.uploadMobileApplication(api, 'error-application-path.ipa', 'mobileAppUuid')).rejects.toThrow(expectedError)
  })
})

describe('AppUploadCache', () => {
  let triggerConfigs: TriggerConfig[]
  let testsAndConfigsOverride: TestWithOverride[]

  beforeEach(() => {
    triggerConfigs = [
      getTriggerConfig('appPath1'),
      getTriggerConfig('appPath2'),
      getTriggerConfig('appPath1'),
      getTriggerConfig('appPath3'),
    ]
    testsAndConfigsOverride = [
      getTestAndConfigOverride('appId1'),
      getTestAndConfigOverride('appId2'),
      getTestAndConfigOverride('appId1'),
      getTestAndConfigOverride('appId3'),
    ]
  })

  test('setAppCacheKeys', () => {
    const cache = new mobile.AppUploadCache()
    cache.setAppCacheKeys(triggerConfigs, testsAndConfigsOverride)

    expect(cache.getAppsToUpload()).toEqual([
      {appId: 'appId1', appPath: 'appPath1'},
      {appId: 'appId2', appPath: 'appPath2'},
      {appId: 'appId3', appPath: 'appPath3'},
    ])
  })

  test('setFileName', () => {
    const cache = new mobile.AppUploadCache()
    cache.setAppCacheKeys(triggerConfigs, testsAndConfigsOverride)
    cache.setFileName('appPath1', 'appId1', 'fileName')

    expect(cache.getFileName('appPath1', 'appId1')).toBe('fileName')
  })

})

describe('overrideMobileConfig', () => {
  test('mobileApplicationVersionFilePath', () => {
    const test = getMobileTest()
    const overriddenConfig = getTestPayload({public_id: test.public_id})
    mobile.overrideMobileConfig(
      overriddenConfig,
      test.options.mobileApplication!.applicationId,
      'fileName'
    )

    expect(overriddenConfig.mobileApplication).toEqual({
      applicationId: test.options.mobileApplication!.applicationId,
      referenceId: 'fileName',
      referenceType: 'temporary',
    })
  })

  test('mobileApplicationVersion', () => {
    const test = getMobileTest()
    const overriddenConfig = getTestPayload({public_id: test.public_id})
    mobile.overrideMobileConfig(
      overriddenConfig,
      test.options.mobileApplication!.applicationId,
      undefined,
      'newAndroidVersionId'
    )

    expect(overriddenConfig.mobileApplication).toEqual({
      applicationId: test.options.mobileApplication!.applicationId,
      referenceId: 'newAndroidVersionId',
      referenceType: 'version',
    })
  })

  test('Temporary takes precedence over version', () => {
    const test = getMobileTest()
    const overriddenConfig = getTestPayload({public_id: test.public_id})
    mobile.overrideMobileConfig(
      overriddenConfig,
      test.options.mobileApplication!.applicationId,
      'fileName',
      'androidVersionId'
    )

    expect(overriddenConfig.mobileApplication).toEqual({
      applicationId: test.options.mobileApplication!.applicationId,
      referenceId: 'fileName',
      referenceType: 'temporary',
    })
  })
})

describe('uploadMobileApplicationsAndOverrideConfigs', () => {
  const api = getApiHelper()
  const triggerConfigs = [
    getTriggerConfig('appPath1'),
    getTriggerConfig('appPath2'),
    getTriggerConfig('appPath1'),
    getTriggerConfig('appPath3'),
    getTriggerConfig(undefined, 'appVersion1'),
  ]
  const testsAndConfigsOverride = [
    getTestAndConfigOverride('appId1'),
    getTestAndConfigOverride('appId2'),
    getTestAndConfigOverride('appId1'),
    getTestAndConfigOverride('appId3'),
    getTestAndConfigOverride('appId4'),
  ]
  let appUploadReporter: AppUploadReporter

  const uploadMobileApplicationSpy = jest.spyOn(mobile, 'uploadMobileApplication')
  const overrideMobileConfigSpy = jest.spyOn(mobile, 'overrideMobileConfig')

  beforeEach(() => {
    appUploadReporter = getMockAppUploadReporter()
    uploadMobileApplicationSpy.mockReset()
    overrideMobileConfigSpy.mockReset()
  })

  test('happy path', async () => {
    uploadMobileApplicationSpy.mockImplementation(async (_, __, appId) => {
      return {fileName: `fileName-${appId}`, appUploadResponse: APP_UPLOAD_POLL_RESULTS}
    })

    await mobile.uploadMobileApplicationsAndOverrideConfigs(api, triggerConfigs, testsAndConfigsOverride, appUploadReporter)

    expect(appUploadReporter.start).toHaveBeenCalledWith([
      {appId: 'appId1', appPath: 'appPath1'},
      {appId: 'appId2', appPath: 'appPath2'},
      {appId: 'appId3', appPath: 'appPath3'},
    ])
    expect(appUploadReporter.renderProgress).toHaveBeenCalledTimes(3)
    expect(appUploadReporter.reportSuccess).toHaveBeenCalledTimes(1)
    expect(overrideMobileConfigSpy).toHaveBeenCalledTimes(5)
    expect(overrideMobileConfigSpy.mock.calls).toEqual([
      [testsAndConfigsOverride[0].overriddenConfig, 'appId1', 'fileName-appId1', undefined],
      [testsAndConfigsOverride[1].overriddenConfig, 'appId2', 'fileName-appId2', undefined],
      [testsAndConfigsOverride[2].overriddenConfig, 'appId1', 'fileName-appId1', undefined],
      [testsAndConfigsOverride[3].overriddenConfig, 'appId3', 'fileName-appId3', undefined],
      [testsAndConfigsOverride[4].overriddenConfig, 'appId4', undefined, triggerConfigs[4].config.mobileApplicationVersion],
    ])
  })

  test('upload failure', async () => {
    uploadMobileApplicationSpy.mockImplementation(async () => {
      throw new Error('mock failure')
    })

    await expect(mobile.uploadMobileApplicationsAndOverrideConfigs(api, triggerConfigs, testsAndConfigsOverride, appUploadReporter)).rejects.toThrow(Error)

    expect(appUploadReporter.reportFailure).toHaveBeenCalledTimes(1)
    expect(appUploadReporter.reportSuccess).toHaveBeenCalledTimes(0)
    expect(overrideMobileConfigSpy).toHaveBeenCalledTimes(0)
  })
})

describe('uploadMobileApplicationVersion', () => {
  const uploadMobileApplicationSpy = jest.spyOn(mobile, 'uploadMobileApplication')
  const config = uploadCommandConfig

  beforeEach(() => {
    uploadMobileApplicationSpy.mockReset()
  })

  test('upload new application file', async () => {
    uploadMobileApplicationSpy.mockImplementation(async () => {
      return {fileName: 'abc-123', appUploadResponse: APP_UPLOAD_POLL_RESULTS}
    })

    await mobile.uploadMobileApplicationVersion(config)

    expect(uploadMobileApplicationSpy).toHaveBeenCalledWith(
      expect.anything(),
      uploadCommandConfig.mobileApplicationVersionFilePath,
      uploadCommandConfig.mobileApplicationId,
      {
        originalFileName: uploadCommandConfig.mobileApplicationVersionFilePath,
        versionName: uploadCommandConfig.versionName,
        isLatest: uploadCommandConfig.latest,
      }
    )
  })

  test('get pre-signed URL fails', async () => {
    uploadMobileApplicationSpy.mockImplementation(() => {
      throw new EndpointError('mock fail', 1)
    })

    await expect(mobile.uploadMobileApplicationVersion(config)).rejects.toThrow(EndpointError)
  })

  test('missing mobile application ID', async () => {
    config.mobileApplicationId = ''
    await expect(mobile.uploadMobileApplicationVersion(config)).rejects.toThrow(CiError)

    expect(uploadMobileApplicationSpy).toHaveBeenCalledTimes(0)
  })

  test('missing mobile application file', async () => {
    delete config.mobileApplicationVersionFilePath
    await expect(mobile.uploadMobileApplicationVersion(config)).rejects.toThrow(CiError)

    expect(uploadMobileApplicationSpy).toHaveBeenCalledTimes(0)
  })

  test('missing version name', async () => {
    delete config.versionName
    await expect(mobile.uploadMobileApplicationVersion(config)).rejects.toThrow(CiError)

    expect(uploadMobileApplicationSpy).toHaveBeenCalledTimes(0)
  })
})
