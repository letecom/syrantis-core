var SYRANTIS_PROCESSED_LABEL = "Syrantis/Processed";
var SYRANTIS_FAILED_LABEL = "Syrantis/Failed";

function runSyrantisGmailBridge() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    safeLog_("bridge_skipped reason=lock_busy");
    return;
  }

  try {
    setupSyrantisLabels();
    var config = getSyrantisConfig_();

    if (config.intakeEnabled) {
      processSyrantisIntake_(config);
    } else {
      safeLog_("intake_skipped reason=disabled");
    }

    if (config.exportEnabled) {
      exportSyrantisDrafts_(config);
    } else {
      safeLog_("export_skipped reason=disabled");
    }
  } finally {
    lock.releaseLock();
  }
}

function setupSyrantisLabels() {
  getOrCreateLabel_(SYRANTIS_PROCESSED_LABEL);
  getOrCreateLabel_(SYRANTIS_FAILED_LABEL);
}

function processSyrantisIntake_(config) {
  if (!config.apiKey) {
    safeLog_("intake_skipped reason=missing_api_key");
    return;
  }

  var processedLabel = GmailApp.getUserLabelByName(SYRANTIS_PROCESSED_LABEL);
  var failedLabel = GmailApp.getUserLabelByName(SYRANTIS_FAILED_LABEL);
  var threads = GmailApp.search(config.gmailQuery, 0, config.intakeBatchLimit);

  threads.forEach(function (thread) {
    var message = getLastMessage_(thread);
    var gmailMessageId = message.getId();
    var fromParts = parseFrom_(message.getFrom());
    var payload = {
      fromEmail: fromParts.email,
      bodyText: truncate_(message.getPlainBody() || "", 10000),
      source: config.source,
      externalId: "gmail:" + gmailMessageId,
      contactName: fromParts.name || null,
      subject: truncate_(message.getSubject() || "", 500) || null,
      receivedAt: message.getDate().toISOString(),
    };

    var result = postJson_(config.apiBase + "/api/intake/inbound-message", config.apiKey, payload);
    var success = result.httpStatus === 200 || result.httpStatus === 201;

    if (success) {
      thread.addLabel(processedLabel);
      safeLog_("intake_succeeded messageId=" + gmailMessageId + " status=" + result.httpStatus);
    } else {
      thread.addLabel(failedLabel);
      safeLog_("intake_failed messageId=" + gmailMessageId + " status=" + result.httpStatus);
    }
  });

  safeLog_("intake_finished count=" + threads.length);
}

function exportSyrantisDrafts_(config) {
  if (!config.apiKey) {
    safeLog_("export_skipped reason=missing_api_key");
    return;
  }

  var pendingUrl =
    config.apiBase +
    "/api/drafts/gmail-export-pending?limit=" +
    encodeURIComponent(config.exportBatchLimit);
  var pendingResult = fetchJson_(pendingUrl, config.apiKey);

  if (pendingResult.httpStatus !== 200 || !pendingResult.json || !pendingResult.json.success) {
    safeLog_("export_pending_failed status=" + pendingResult.httpStatus);
    return;
  }

  var drafts = Array.isArray(pendingResult.json.data) ? pendingResult.json.data : [];

  drafts.forEach(function (draft) {
    try {
      GmailApp.createDraft(draft.toEmail, draft.subject, draft.bodyText);
      var confirmUrl =
        config.apiBase +
        "/api/drafts/" +
        encodeURIComponent(draft.draftId) +
        "/gmail-export-confirmed";
      var confirmResult = postJson_(confirmUrl, config.apiKey, {
        leaseToken: draft.leaseToken,
      });

      if (confirmResult.httpStatus === 200) {
        safeLog_("export_confirmed draftId=" + draft.draftId);
      } else {
        safeLog_(
          "export_confirm_failed draftId=" + draft.draftId + " status=" + confirmResult.httpStatus,
        );
      }
    } catch (error) {
      safeLog_(
        "export_create_failed draftId=" + safeDraftId_(draft) + " error=" + safeError_(error),
      );
    }
  });

  safeLog_("export_finished count=" + drafts.length);
}

function getSyrantisConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    apiBase: stripTrailingSlash_(
      props.getProperty("SYRANTIS_API_BASE") || "https://api.syrantis.fr",
    ),
    apiKey: props.getProperty("SYRANTIS_API_KEY") || "",
    intakeEnabled: props.getProperty("INTAKE_ENABLED") === "true",
    exportEnabled: props.getProperty("EXPORT_ENABLED") === "true",
    source: props.getProperty("SYRANTIS_SOURCE") || "gmail_apps_script_client",
    gmailQuery:
      props.getProperty("SYRANTIS_GMAIL_QUERY") ||
      'subject:"[SYRANTIS-E2E]" newer_than:1d -label:"Syrantis/Processed" -label:"Syrantis/Failed"',
    intakeBatchLimit: boundedLimit_(props.getProperty("INTAKE_BATCH_LIMIT"), 10, 1, 25),
    exportBatchLimit: boundedLimit_(props.getProperty("EXPORT_BATCH_LIMIT"), 5, 1, 10),
  };
}

function fetchJson_(url, apiKey) {
  try {
    var response = UrlFetchApp.fetch(url, {
      method: "get",
      headers: {
        Authorization: "Bearer " + apiKey,
      },
      muteHttpExceptions: true,
    });
    return {
      httpStatus: response.getResponseCode(),
      json: parseJsonSafe_(response.getContentText()),
    };
  } catch (error) {
    return {
      httpStatus: "",
      json: null,
    };
  }
}

function postJson_(url, apiKey, payload) {
  try {
    var response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + apiKey,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    return {
      httpStatus: response.getResponseCode(),
    };
  } catch (error) {
    return {
      httpStatus: "",
    };
  }
}

function getLastMessage_(thread) {
  var messages = thread.getMessages();
  return messages[messages.length - 1];
}

function parseFrom_(fromValue) {
  var value = String(fromValue || "").trim();
  var match = value.match(/^(.*)<([^<>]+)>$/);
  if (match) {
    return {
      name: cleanDisplayName_(match[1]),
      email: match[2].trim().toLowerCase(),
    };
  }
  return {
    name: "",
    email: value.trim().toLowerCase(),
  };
}

function cleanDisplayName_(value) {
  return String(value || "")
    .replace(/^["']|["']$/g, "")
    .trim();
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

function truncate_(value, maxLength) {
  var text = String(value || "");
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength);
}

function boundedLimit_(rawValue, fallback, min, max) {
  var parsed = Number(rawValue || fallback);
  if (!isFinite(parsed)) {
    return fallback;
  }
  parsed = Math.floor(parsed);
  return Math.max(min, Math.min(max, parsed));
}

function stripTrailingSlash_(value) {
  return String(value || "").replace(/\/+$/, "");
}

function safeDraftId_(draft) {
  return draft && draft.draftId ? String(draft.draftId) : "unknown";
}

function safeError_(error) {
  var message = error && error.message ? String(error.message) : "unknown";
  return message.slice(0, 120).replace(/[\r\n]+/g, " ");
}

function safeLog_(message) {
  Logger.log(String(message || "").slice(0, 240));
}
