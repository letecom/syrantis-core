var SYRANTIS_TO_PROCESS_LABEL = 'Syrantis/ToProcess';
var SYRANTIS_PROCESSED_LABEL = 'Syrantis/Processed';
var SYRANTIS_ERROR_LABEL = 'Syrantis/Error';

var INTAKE_LOG_HEADER = [
  'timestamp',
  'source',
  'gmailMessageId',
  'gmailThreadId',
  'fromEmail',
  'contactName',
  'subject',
  'receivedAt',
  'httpStatus',
  'success',
  'isReplay',
  'diagnosticTraceId',
  'leadId',
  'scoringJobId',
  'externalId',
  'errorCode',
  'errorMessageSafe',
  'retryCount'
];

function setupGmailLabels() {
  getOrCreateLabel_(SYRANTIS_TO_PROCESS_LABEL);
  getOrCreateLabel_(SYRANTIS_PROCESSED_LABEL);
  getOrCreateLabel_(SYRANTIS_ERROR_LABEL);
}

function setupIntakeLogHeader() {
  var sheet = getIntakeLogSheet_();
  var existing = sheet.getRange(1, 1, 1, INTAKE_LOG_HEADER.length).getValues()[0];
  var hasHeader = existing.some(function (value) {
    return String(value || '').trim() !== '';
  });

  if (!hasHeader) {
    sheet.getRange(1, 1, 1, INTAKE_LOG_HEADER.length).setValues([INTAKE_LOG_HEADER]);
  }
}

function processSyrantisInbox() {
  // SECURITY: API key must stay in Script Properties.
  // SECURITY: Never write bodyText to the Sheet.
  // SECURITY: Never write raw API responses to the Sheet.
  // SECURITY: Do not share this Sheet or Script publicly.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return;
  }

  try {
    setupGmailLabels();
    setupIntakeLogHeader();

    var config = getConfig_();
    var toProcessLabel = GmailApp.getUserLabelByName(SYRANTIS_TO_PROCESS_LABEL);
    var processedLabel = GmailApp.getUserLabelByName(SYRANTIS_PROCESSED_LABEL);
    var errorLabel = GmailApp.getUserLabelByName(SYRANTIS_ERROR_LABEL);
    var sheet = getIntakeLogSheet_();
    var threads = toProcessLabel.getThreads(0, config.maxEmailsPerRun);

    threads.forEach(function (thread) {
      processThread_(thread, sheet, config, processedLabel, errorLabel, toProcessLabel);
    });
  } finally {
    lock.releaseLock();
  }
}

function processThread_(thread, sheet, config, processedLabel, errorLabel, toProcessLabel) {
  var message = getLastMessage_(thread);
  var gmailMessageId = message.getId();
  var gmailThreadId = thread.getId();
  var externalId = 'gmail:' + gmailMessageId;
  var fromParts = parseFrom_(message.getFrom());
  var subject = truncate_(message.getSubject() || '', 500);
  var bodyText = truncate_(message.getPlainBody() || '', 10000);
  var receivedAt = message.getDate().toISOString();

  var payload = {
    fromEmail: fromParts.email,
    bodyText: bodyText,
    source: config.sourceTag,
    externalId: externalId,
    contactName: fromParts.name || null,
    subject: subject || null,
    receivedAt: receivedAt
  };

  var result = postWithRetry_(config.intakeUrl, config.apiKey, payload);
  var success = (result.httpStatus === 200 || result.httpStatus === 201) &&
    result.responseJson &&
    result.responseJson.success === true;
  var data = success && result.responseJson.data ? result.responseJson.data : {};
  var idempotency = data.idempotency || {};
  var lead = data.lead || {};
  var scoringJob = data.scoringJob || {};
  var errorCode = success ? '' : result.errorCode;
  var errorMessageSafe = success ? '' : result.errorMessageSafe;

  sheet.appendRow([
    new Date().toISOString(),
    safeSheetText_(config.sourceTag),
    safeSheetText_(gmailMessageId),
    safeSheetText_(gmailThreadId),
    safeSheetText_(fromParts.email),
    safeSheetText_(fromParts.name),
    safeSheetText_(subject),
    safeSheetText_(receivedAt),
    result.httpStatus || '',
    success,
    Boolean(idempotency.isReplay),
    safeSheetText_(data.diagnosticTraceId || ''),
    safeSheetText_(lead.id || ''),
    safeSheetText_(scoringJob.id || ''),
    safeSheetText_(externalId),
    safeSheetText_(errorCode || ''),
    safeSheetText_(errorMessageSafe || ''),
    result.retryCount
  ]);

  if (success) {
    thread.addLabel(processedLabel);
  } else {
    thread.addLabel(errorLabel);
  }
  thread.removeLabel(toProcessLabel);
}

function postWithRetry_(url, apiKey, payload) {
  var maxRetries = 2;
  var attempt = 0;
  var lastResult = null;

  for (attempt = 0; attempt <= maxRetries; attempt += 1) {
    lastResult = postOnce_(url, apiKey, payload, attempt);
    if (!shouldRetry_(lastResult.httpStatus) || attempt === maxRetries) {
      lastResult.retryCount = attempt;
      return lastResult;
    }
    Utilities.sleep(500 * (attempt + 1));
  }

  lastResult.retryCount = maxRetries;
  return lastResult;
}

function postOnce_(url, apiKey, payload, attempt) {
  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Bearer ' + apiKey
      }
    });
    var httpStatus = response.getResponseCode();
    var responseJson = parseJsonSafe_(response.getContentText());
    var errorCode = '';
    if (responseJson && responseJson.error && responseJson.error.code) {
      errorCode = String(responseJson.error.code);
    }

    return {
      httpStatus: httpStatus,
      responseJson: responseJson,
      errorCode: errorCode,
      errorMessageSafe: httpStatus >= 200 && httpStatus < 300 ? '' : safeErrorMessage_(httpStatus),
      retryCount: attempt
    };
  } catch (error) {
    return {
      httpStatus: '',
      responseJson: null,
      errorCode: 'FETCH_ERROR',
      errorMessageSafe: 'Request failed before receiving an HTTP response',
      retryCount: attempt
    };
  }
}

function shouldRetry_(httpStatus) {
  return httpStatus === 429 || (httpStatus >= 500 && httpStatus <= 599);
}

function safeErrorMessage_(httpStatus) {
  if (httpStatus === 400) return 'Syrantis API rejected the request';
  if (httpStatus === 401) return 'Syrantis API key is invalid or revoked';
  if (httpStatus === 422) return 'Syrantis API payload validation failed';
  if (httpStatus === 429) return 'Syrantis API rate limit reached';
  if (httpStatus >= 500) return 'Syrantis API returned a server error';
  return 'Syrantis API returned HTTP ' + String(httpStatus);
}

function getLastMessage_(thread) {
  var messages = thread.getMessages();
  return messages[messages.length - 1];
}

function parseFrom_(fromValue) {
  var value = String(fromValue || '').trim();
  var match = value.match(/^(.*)<([^<>]+)>$/);
  if (match) {
    return {
      name: cleanDisplayName_(match[1]),
      email: match[2].trim().toLowerCase()
    };
  }
  return {
    name: '',
    email: value.trim().toLowerCase()
  };
}

function cleanDisplayName_(value) {
  return String(value || '').replace(/^["']|["']$/g, '').trim();
}

function getConfig_() {
  var properties = PropertiesService.getScriptProperties();
  var apiKey = properties.getProperty('SYRANTIS_API_KEY');
  var sheetId = properties.getProperty('INTAKE_LOG_SHEET_ID');
  if (!apiKey) {
    throw new Error('Missing SYRANTIS_API_KEY Script Property');
  }
  if (!sheetId) {
    throw new Error('Missing INTAKE_LOG_SHEET_ID Script Property');
  }

  return {
    apiKey: apiKey,
    intakeUrl: properties.getProperty('SYRANTIS_INTAKE_URL') ||
      'https://api.syrantis.fr/api/intake/inbound-message',
    sourceTag: properties.getProperty('SOURCE_TAG') || 'gmail_client',
    sheetId: sheetId,
    sheetName: properties.getProperty('INTAKE_LOG_SHEET_NAME') || 'Intake Log',
    maxEmailsPerRun: parsePositiveInt_(properties.getProperty('MAX_EMAILS_PER_RUN'), 5)
  };
}

function getIntakeLogSheet_() {
  var properties = PropertiesService.getScriptProperties();
  var sheetId = properties.getProperty('INTAKE_LOG_SHEET_ID');
  var sheetName = properties.getProperty('INTAKE_LOG_SHEET_NAME') || 'Intake Log';
  if (!sheetId) {
    throw new Error('Missing INTAKE_LOG_SHEET_ID Script Property');
  }

  var spreadsheet = SpreadsheetApp.openById(sheetId);
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  return sheet;
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function parseJsonSafe_(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
}

function parsePositiveInt_(value, fallback) {
  var parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
}

function truncate_(value, maxLength) {
  var text = String(value || '');
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

function safeSheetText_(value) {
  var text = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }
  return text;
}
