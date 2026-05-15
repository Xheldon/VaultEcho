import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const outputDir = path.resolve("shortcuts");
const sourceDir = path.join(outputDir, "source");
const baseUrl = process.env.VAULTECHO_SHORTCUT_BASE_URL || "https://YOUR_DOMAIN";
const apiToken = process.env.VAULTECHO_SHORTCUT_API_TOKEN || "CHANGE_ME_API_TOKEN";

fs.mkdirSync(sourceDir, { recursive: true });

const shortcuts = [
  {
    name: "VaultEcho Daily Text Capture",
    glyph: 59764,
    color: 4282601983,
    captureAction: askForTextAction("Capture")
  },
  {
    name: "VaultEcho Daily Voice Capture",
    glyph: 59531,
    color: 4274264319,
    captureAction: dictateTextAction()
  }
];

for (const shortcut of shortcuts) {
  const workflow = buildWorkflow(shortcut);
  const jsonPath = path.join(sourceDir, `${shortcut.name}.json`);
  const unsignedPath = path.join(sourceDir, `${shortcut.name}.unsigned.shortcut`);
  const outputPath = path.join(outputDir, `${shortcut.name}.shortcut`);

  fs.writeFileSync(jsonPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
  execFileSync("plutil", ["-convert", "binary1", "-o", unsignedPath, jsonPath]);

  try {
    execFileSync("shortcuts", ["sign", "--mode", "anyone", "--input", unsignedPath, "--output", outputPath], {
      stdio: "pipe"
    });
  } catch (error) {
    fs.copyFileSync(unsignedPath, outputPath);
    console.warn(`Signing failed for ${shortcut.name}; wrote unsigned shortcut instead.`);
    if (error.stderr?.length) {
      console.warn(String(error.stderr).trim());
    }
  }

  console.log(`Wrote ${outputPath}`);
}

function buildWorkflow(shortcut) {
  const captureUuid = randomUUID().toUpperCase();
  const requestUuid = randomUUID().toUpperCase();
  const notificationUuid = randomUUID().toUpperCase();

  return {
    WFWorkflowName: shortcut.name,
    WFWorkflowClientRelease: "18.0",
    WFWorkflowClientVersion: "2700.0.4",
    WFWorkflowIcon: {
      WFWorkflowIconGlyphNumber: shortcut.glyph,
      WFWorkflowIconStartColor: shortcut.color
    },
    WFWorkflowImportQuestions: [],
    WFWorkflowInputContentItemClasses: ["WFTextContentItem"],
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowHasOutputFallback: false,
    WFWorkflowMinimumClientVersion: 1300,
    WFWorkflowMinimumClientVersionString: "1300",
    WFWorkflowTypes: ["WatchKit", "NCWidget"],
    WFWorkflowActions: [
      withUuid(shortcut.captureAction, captureUuid),
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.downloadurl",
        WFWorkflowActionParameters: {
          UUID: requestUuid,
          ShowHeaders: true,
          WFURL: `${baseUrl.replace(/\/+$/g, "")}/v1/api/daily/append-by-time`,
          WFHTTPMethod: "POST",
          WFHTTPBodyType: "JSON",
          WFHTTPHeaders: dictionary({
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json"
          }),
          WFJSONValues: dictionary({
            content: actionOutput(captureUuid, captureOutputName(shortcut.captureAction)),
            source: "apple-shortcuts"
          })
        }
      },
      {
        WFWorkflowActionIdentifier: "is.workflow.actions.notification",
        WFWorkflowActionParameters: {
          UUID: notificationUuid,
          WFNotificationActionTitle: "VaultEcho",
          WFNotificationActionBody: "Captured to daily note.",
          WFNotificationActionSound: false
        }
      }
    ]
  };
}

function askForTextAction(prompt) {
  return {
    WFWorkflowActionIdentifier: "is.workflow.actions.ask",
    WFWorkflowActionParameters: {
      WFAskActionPrompt: prompt,
      WFInputType: "Text"
    }
  };
}

function dictateTextAction() {
  return {
    WFWorkflowActionIdentifier: "is.workflow.actions.dictatetext",
    WFWorkflowActionParameters: {
      WFDictateTextStopListening: "After Pause"
    }
  };
}

function withUuid(action, uuid) {
  return {
    ...action,
    WFWorkflowActionParameters: {
      ...(action.WFWorkflowActionParameters || {}),
      UUID: uuid
    }
  };
}

function captureOutputName(action) {
  if (action.WFWorkflowActionIdentifier === "is.workflow.actions.dictatetext") return "Dictated Text";
  return "Provided Input";
}

function dictionary(items) {
  return {
    Value: {
      WFDictionaryFieldValueItems: Object.entries(items).map(([key, value]) => ({
        WFItemType: 0,
        WFKey: key,
        WFValue: value
      }))
    },
    WFSerializationType: "WFDictionaryFieldValue"
  };
}

function actionOutput(outputUuid, outputName) {
  return {
    Value: {
      OutputUUID: outputUuid,
      Type: "ActionOutput",
      OutputName: outputName
    },
    WFSerializationType: "WFTextTokenAttachment"
  };
}
