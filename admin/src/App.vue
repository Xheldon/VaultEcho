<template>
  <el-config-provider :locale="elementLocale">
    <main class="app-layout">
      <aside class="app-sidebar">
        <div class="brand-block">
          <div class="brand-mark">VE</div>
          <div>
            <strong>VaultEcho</strong>
            <span>Admin</span>
          </div>
        </div>
        <nav class="sidebar-nav" aria-label="Admin sections">
          <a href="#vault-section">{{ t("vault") }}</a>
          <a href="#model-section">{{ t("aiModel") }}</a>
          <a href="#daily-section">{{ t("dailyRules") }}</a>
          <a href="#reviews-section">{{ t("reviewTasks") }}</a>
        </nav>
        <div class="sidebar-note">
          <strong>{{ t("accessTitle") }}</strong>
          <p>{{ t("sidebarAccessNote") }}</p>
        </div>
      </aside>

      <section class="app-main">
        <header class="app-header">
          <div class="topbar-title">
            <span class="eyebrow">{{ t("adminConsole") }}</span>
            <h1>VaultEcho</h1>
          <p>{{ t("tagline") }}</p>
        </div>
        <div class="header-actions">
          <el-button @click="toggleLanguage">{{ language === "zh" ? "English" : "中文" }}</el-button>
          <el-button :icon="Refresh" @click="loadConfig">{{ t("loadConfig") }}</el-button>
          <el-button type="primary" :icon="Check" @click="saveConfig">{{ t("saveConfig") }}</el-button>
        </div>
      </header>

      <el-alert class="access-alert" type="info" :closable="false" show-icon>
        <template #title>{{ t("accessTitle") }}</template>
        <template #default>
          <span v-html="t('accessBody')" />
        </template>
      </el-alert>

      <el-card id="vault-section" class="section-card" shadow="never">
        <template #header>
          <SectionTitle icon="FolderOpened" :title="t('vault')" :description="t('vaultDesc')" />
        </template>
        <el-form label-position="top">
          <el-row :gutter="18">
            <el-col :xs="24" :md="12">
              <el-form-item :label="t('vaultRoot')">
                <el-input v-model="form.vaultRoot" placeholder="/vault" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item :label="t('dataDir')">
                <el-input v-model="form.dataDir" placeholder="/data" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item :label="t('timeZone')">
                <el-select v-model="form.timeZone" filterable class="full-width">
                  <el-option v-for="zone in timeZoneOptions" :key="zone" :label="zone" :value="zone" />
                </el-select>
                <div class="form-hint">{{ t("timeZoneHint") }}</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item :label="t('maxJsonBodyBytes')">
                <el-input-number v-model="form.maxJsonBodyBytes" :min="1024" :step="1024" class="full-width" />
              </el-form-item>
            </el-col>
            <el-col :xs="24">
              <el-form-item :label="t('allowedDirs')">
                <DirectorySelector v-model="form.allowedDirs" :options="allowedDirOptions" :empty-text="t('noVaultDirs')" />
                <div class="form-hint">{{ t("allowedDirsHint") }}</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24">
              <el-checkbox v-model="form.includeRootMarkdownFiles">{{ t("includeRootMarkdownFiles") }}</el-checkbox>
              <div class="form-hint">{{ t("includeRootMarkdownFilesHint") }}</div>
            </el-col>
            <el-col :xs="24">
              <el-form-item :label="t('globalExcludePaths')">
                <el-select
                  v-model="form.excludePaths"
                  class="full-width"
                  multiple
                  filterable
                  allow-create
                  default-first-option
                  :placeholder="t('globalExcludePathsPlaceholder')"
                >
                  <el-option v-for="dir in allowedDirOptions" :key="dir" :value="dir" :label="dir" />
                </el-select>
                <div class="form-hint">{{ t("globalExcludePathsHint") }}</div>
              </el-form-item>
            </el-col>
            <el-col :xs="24">
              <div class="directory-toolbar">
                <el-button :icon="Refresh" :loading="loadingDirs" @click="loadVaultDirs()">{{ t("refreshVaultDirs") }}</el-button>
                <el-input v-model="customAllowedDir" :placeholder="t('customDirPlaceholder')" clearable />
                <el-button @click="addAllowedDir(customAllowedDir)">{{ t("addCustom") }}</el-button>
              </div>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item :label="t('imageAttachmentDir')">
                <el-input v-model="form.attachments.imageDir" placeholder="Attachments/Images" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item :label="t('audioAttachmentDir')">
                <el-input v-model="form.attachments.audioDir" placeholder="Attachments/Audio" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item :label="t('videoAttachmentDir')">
                <el-input v-model="form.attachments.videoDir" placeholder="Attachments/Video" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item :label="t('fileAttachmentDir')">
                <el-input v-model="form.attachments.fileDir" placeholder="Attachments/Files" />
              </el-form-item>
            </el-col>
            <el-col :xs="24" :md="12">
              <el-form-item :label="t('maxAttachmentBytes')">
                <el-input-number v-model="form.attachments.maxUploadBytes" :min="1024" :step="1024" class="full-width" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-card>

      <el-row id="model-section" :gutter="18" class="model-grid">
        <el-col :xs="24" :lg="12">
          <el-card class="section-card equal-card" shadow="never">
            <template #header>
              <SectionTitle icon="Cpu" :title="t('aiModel')" :description="t('aiModelDesc')" />
            </template>
            <ModelForm v-model="form.ai" :labels="labels" :api-key-hint="apiKeyHint(form.ai.apiKeySet)" />
          </el-card>
        </el-col>
        <el-col :xs="24" :lg="12">
          <el-card class="section-card equal-card" shadow="never">
            <template #header>
              <SectionTitle icon="Connection" :title="t('semanticIndex')" :description="t('semanticDesc')" />
            </template>
            <el-form label-position="top">
              <div class="feature-toggle-panel">
                <el-switch v-model="form.embedding.enabled" :active-text="t('enableRemoteEmbeddings')" />
                <div class="form-hint">{{ form.embedding.enabled ? t("embeddingEnabledHint") : t("embeddingDisabledHint") }}</div>
              </div>
              <template v-if="form.embedding.enabled">
                <ModelForm v-model="form.embedding" :labels="labels" :api-key-hint="apiKeyHint(form.embedding.apiKeySet)" embedding />
                <el-row :gutter="12">
                  <el-col :span="12">
                    <el-form-item :label="t('batchSize')">
                      <el-input-number v-model="form.embedding.batchSize" :min="1" class="full-width" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item :label="t('searchLimit')">
                      <el-input-number v-model="form.embedding.searchLimit" :min="1" :max="50" class="full-width" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item :label="t('maxChunkChars')">
                      <el-input-number v-model="form.embedding.maxChunkChars" :min="200" :step="100" class="full-width" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item :label="t('autoScanMinutes')">
                      <el-input-number v-model="form.embedding.autoScanIntervalMinutes" :min="0" class="full-width" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-checkbox v-model="form.embedding.autoIndexAfterWrite">{{ t("autoIndexAfterWrite") }}</el-checkbox>
                <div class="button-row">
                  <el-button @click="loadIndexStatus">{{ t("indexStatus") }}</el-button>
                  <el-button @click="clearIndexErrors">{{ t("clearIndexErrors") }}</el-button>
                  <el-button type="primary" plain @click="rebuildIndex">{{ t("rebuildIndex") }}</el-button>
                </div>
              </template>
            </el-form>
          </el-card>
        </el-col>
      </el-row>

      <el-collapse v-model="activePanels" class="panel-collapse">
        <el-collapse-item id="daily-section" name="daily">
          <template #title>
            <SectionTitle icon="Clock" :title="t('dailyRules')" :description="t('dailyDesc')" inline />
          </template>
          <el-form label-position="top" class="collapse-body">
            <el-row :gutter="18">
              <el-col :xs="24" :md="12">
                <el-form-item :label="t('dailyFilePath')">
                  <el-input v-model="form.dailyNote.pathTemplate" placeholder="Daily/{{YYYY}}-{{MM}}-{{DD}}.md" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :md="12">
                <el-form-item :label="t('dailyTemplatePath')">
                  <el-input v-model="form.dailyNote.templatePath" placeholder="Templates/daily.md" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :md="8">
                <el-form-item :label="t('headingLevel')">
                  <el-input-number v-model="form.dailyNote.headingLevel" :min="1" :max="6" class="full-width" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :md="8">
                <el-form-item :label="t('linePattern')">
                  <el-input v-model="form.dailyNote.linePattern" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :md="8">
                <el-form-item :label="t('lineFormat')">
                  <el-input v-model="form.dailyNote.lineFormat" />
                </el-form-item>
              </el-col>
              <el-col :xs="24">
                <el-checkbox v-model="form.dailyNote.createIfMissing">{{ t("createDailyIfMissing") }}</el-checkbox>
                <el-checkbox v-model="form.dailyNote.blankLineBetweenEntries">{{ t("blankLineBetweenEntries") }}</el-checkbox>
                <el-checkbox v-model="form.dailyNote.sortEntriesByTime">{{ t("sortEntriesByTime") }}</el-checkbox>
              </el-col>
            </el-row>
            <div class="subsection-title">{{ t("timeSlots") }}</div>
            <div class="slot-list">
              <div v-for="(slot, index) in form.dailyNote.slots" :key="index" class="slot-row">
                <el-input v-model="slot.heading" :placeholder="t('heading')" />
                <el-time-picker v-model="slot.start" value-format="HH:mm" format="HH:mm" :placeholder="t('start')" />
                <el-time-picker v-model="slot.end" value-format="HH:mm" format="HH:mm" :placeholder="t('end')" />
                <el-button :icon="Delete" text type="danger" @click="removeSlot(index)" />
              </div>
            </div>
            <el-button :icon="Plus" @click="addSlot">{{ t("addSlot") }}</el-button>
            <div class="subsection-title connector-subsection">{{ t("connectorData") }}</div>
            <div class="connector-panel">
              <div class="feature-toggle-panel connector-toggle-panel">
                <div>
                  <el-switch v-model="form.connectors.enabled" :active-text="t('enableConnectorScheduler')" />
                  <div class="form-hint">{{ form.connectors.enabled ? t("connectorSchedulerEnabledHint") : t("connectorSchedulerDisabledHint") }}</div>
                </div>
                <div class="button-row">
                  <el-button @click="loadConnectorStatus">{{ t("connectorStatus") }}</el-button>
                  <el-button :icon="Plus" type="primary" plain @click="addConnectorSource">{{ t("addConnectorSource") }}</el-button>
                </div>
              </div>
              <el-row :gutter="18">
                <el-col :xs="24" :md="12">
                  <el-form-item :label="t('pollInterval')">
                    <el-select v-model="form.connectors.schedule.intervalMinutes" class="full-width">
                      <el-option v-for="option in connectorPollIntervalOptions" :key="option.value" :label="option.label" :value="option.value" />
                    </el-select>
                    <div class="form-hint">{{ t("pollIntervalHint") }}</div>
                  </el-form-item>
                </el-col>
              </el-row>
              <div v-if="connectorStatus" class="connector-status-list">
                <div v-for="item in connectorStatus.connectors" :key="item.id" class="connector-status-item">
                  <strong>{{ item.name || item.id }}</strong>
                  <span>{{ item.scheduled ? `${t("nextRunAt")}: ${formatDateTime(item.nextRunAt)}` : t("connectorNotScheduled") }}</span>
                  <span>{{ t("lastRun") }}: {{ formatConnectorRun(item.lastRun) }}</span>
                </div>
              </div>
              <div v-if="!form.connectors.sources.length" class="connector-empty">
                <p>{{ t("connectorEmptyHint") }}</p>
                <el-button :icon="Plus" @click="addConnectorSource">{{ t("addConnectorSource") }}</el-button>
              </div>
              <div v-else class="connector-source-list">
                <section v-for="(source, index) in form.connectors.sources" :key="source.__key" class="connector-source-card">
                  <div class="connector-source-header">
                    <div>
                      <strong>{{ source.name || source.username || source.id }}</strong>
                      <span>{{ source.platform.toUpperCase() }} · {{ source.enabled ? t("enabled") : t("disabled") }}</span>
                    </div>
                    <div class="button-row">
                      <el-switch v-model="source.enabled" :active-text="t('connectorEnabled')" />
                      <el-button type="primary" plain :loading="runningConnectorId === source.id" @click="runConnectorNow(source)">{{ t("runConnectorNow") }}</el-button>
                      <el-button :icon="Delete" text type="danger" @click="removeConnectorSource(index)" />
                    </div>
                  </div>
                  <div v-if="connectorStatusForSource(source)" class="connector-source-status">
                    <span>{{ connectorStatusForSource(source).scheduled ? `${t("nextRunAt")}: ${formatDateTime(connectorStatusForSource(source).nextRunAt)}` : t("connectorNotScheduled") }}</span>
                    <span>{{ t("lastRun") }}: {{ formatConnectorRun(connectorStatusForSource(source).lastRun) }}</span>
                  </div>
                  <el-row :gutter="18">
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('connectorName')">
                        <el-input v-model="source.name" :placeholder="t('connectorNamePlaceholder')" />
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('connectorPlatform')">
                        <el-select v-model="source.platform" class="full-width" @change="onConnectorPlatformChange(source)">
                          <el-option label="X" value="x" />
                          <el-option label="Strava" value="strava" />
                        </el-select>
                      </el-form-item>
                    </el-col>
                    <template v-if="source.platform === 'x'">
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('xBaseUrl')">
                        <el-input v-model="source.baseUrl" placeholder="https://api.x.com/2" />
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('xBearerToken')">
                        <el-input v-model="source.bearerToken" type="password" show-password autocomplete="off" />
                        <div class="form-hint">{{ xTokenHint(source) }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('xUserId')">
                        <el-input v-model="source.userId" placeholder="2244994945" />
                        <div class="form-hint">{{ t("xUserIdHint") }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('xUsername')">
                        <el-input v-model="source.username" placeholder="xdevelopers" />
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('maxPostsPerRun')">
                        <el-input-number v-model="source.maxPostsPerRun" :min="5" :max="100" class="full-width" />
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12" class="connector-checkboxes">
                      <el-checkbox v-model="source.includeReplies">{{ t("includeReplies") }}</el-checkbox>
                      <el-checkbox v-model="source.includeRetweets">{{ t("includeRetweets") }}</el-checkbox>
                    </el-col>
                    </template>
                    <template v-else-if="source.platform === 'strava'">
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('stravaBaseUrl')">
                        <el-input v-model="source.baseUrl" placeholder="https://www.strava.com/api/v3" />
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('stravaClientId')">
                        <el-input v-model="source.clientId" placeholder="128619" />
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('stravaRedirectUri')">
                        <el-input v-model="source.redirectUri" :placeholder="adminUiRedirectUri()" />
                        <div class="form-hint">{{ t("stravaRedirectUriHint") }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('stravaClientSecret')">
                        <el-input v-model="source.clientSecret" type="password" show-password autocomplete="off" />
                        <div class="form-hint">{{ source.clientSecretSet ? t("stravaClientSecretSaved") : t("stravaClientSecretMissing") }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('stravaRefreshToken')">
                        <el-input v-model="source.refreshToken" type="password" show-password autocomplete="off" />
                        <div class="form-hint">{{ source.refreshTokenSet ? t("stravaRefreshTokenSaved") : t("stravaRefreshTokenMissing") }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('stravaAuthorizationCode')">
                        <el-input v-model="source.authorizationCode" type="password" show-password autocomplete="off" />
                        <div class="form-hint">{{ source.authorizationCodeSet ? t("stravaAuthorizationCodeSaved") : t("stravaAuthorizationCodeHint") }}</div>
                        <div v-if="stravaAuthorizationUrl(source)" class="form-hint">
                          <a :href="stravaAuthorizationUrl(source)" target="_blank" rel="noreferrer">{{ t("stravaAuthorizationUrl") }}</a>
                        </div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('maxActivitiesPerRun')">
                        <el-input-number v-model="source.maxActivitiesPerRun" :min="1" :max="30" class="full-width" />
                        <div class="form-hint">{{ t("maxActivitiesPerRunHint") }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('stravaRequestDelayMs')">
                        <el-input-number v-model="source.requestDelayMs" :min="0" :max="30000" :step="500" class="full-width" />
                        <div class="form-hint">{{ t("stravaRequestDelayHint") }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('minMovingTimeMinutes')">
                        <el-input-number v-model="source.minMovingTimeMinutes" :min="0" :max="240" class="full-width" />
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('stravaActivityHeadingMarkdown')">
                        <el-input v-model="source.output.headingMarkdown" placeholder="## 今日运动" />
                        <div class="form-hint">{{ t("stravaActivityHeadingHint") }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('stravaInsertAfterHeadingMarkdown')">
                        <el-input v-model="source.output.insertAfterHeadingMarkdown" :placeholder="t('stravaInsertAfterHeadingPlaceholder')" />
                        <div class="form-hint">{{ t("stravaInsertAfterHeadingHint") }}</div>
                      </el-form-item>
                    </el-col>
                    </template>
                    <template v-if="source.platform === 'x'">
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('connectorOutputTarget')">
                        <el-segmented v-model="source.output.target" :options="connectorOutputTargetOptions" class="full-width" />
                        <div class="form-hint">{{ source.output.target === 'time-slot' ? t("connectorTimeSlotTargetHint") : t("connectorHeadingTargetHint") }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col v-if="source.output.target === 'heading'" :xs="24" :md="12">
                      <el-form-item :label="t('connectorHeadingMarkdown')">
                        <el-input v-model="source.output.headingMarkdown" placeholder="## Twitter" />
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24" :md="12">
                      <el-form-item :label="t('connectorLineFormat')">
                        <el-input v-model="source.output.lineFormat" placeholder="[{{HH:mm}}] {{content}}" />
                        <div class="form-hint">{{ t("connectorLineFormatHint") }}</div>
                      </el-form-item>
                    </el-col>
                    <el-col :xs="24">
                      <el-form-item :label="t('connectorContentTemplate')">
                        <el-input v-model="source.output.contentTemplate" type="textarea" :rows="2" />
                        <div class="form-hint">{{ t("connectorContentTemplateHint") }}</div>
                      </el-form-item>
                    </el-col>
                    </template>
                  </el-row>
                </section>
              </div>
            </div>
          </el-form>
        </el-collapse-item>

        <el-collapse-item id="apple-health-section" name="appleHealth">
          <template #title>
            <SectionTitle icon="Clock" :title="t('appleHealthTitle')" :description="t('appleHealthDesc')" inline />
          </template>
          <div class="collapse-body">
            <div class="feature-toggle-panel">
              <div>
                <el-switch v-model="form.appleHealth.enabled" :active-text="t('appleHealthEnable')" />
                <div class="form-hint">{{ form.appleHealth.enabled ? t("appleHealthEnabledHint") : t("appleHealthDisabledHint") }}</div>
              </div>
            </div>
            <template v-if="form.appleHealth.enabled">
              <div class="form-hint apple-health-endpoint-hint">{{ t("appleHealthEndpointHint") }}</div>
              <el-form label-position="top">
                <div class="subsection-title">{{ t("appleHealthSleep") }}</div>
                <el-checkbox v-model="form.appleHealth.sleep.enabled">{{ t("appleHealthSleepEnable") }}</el-checkbox>
                <el-row v-if="form.appleHealth.sleep.enabled" :gutter="18">
                  <el-col :xs="24" :md="12">
                    <el-form-item :label="t('connectorOutputTarget')">
                      <el-segmented v-model="form.appleHealth.sleep.output.target" :options="connectorOutputTargetOptions" class="full-width" />
                      <div class="form-hint">{{ form.appleHealth.sleep.output.target === 'time-slot' ? t("connectorTimeSlotTargetHint") : t("connectorHeadingTargetHint") }}</div>
                    </el-form-item>
                  </el-col>
                  <el-col v-if="form.appleHealth.sleep.output.target === 'heading'" :xs="24" :md="12">
                    <el-form-item :label="t('connectorHeadingMarkdown')">
                      <el-input v-model="form.appleHealth.sleep.output.headingMarkdown" placeholder="## 今日睡眠" />
                    </el-form-item>
                  </el-col>
                  <el-col v-if="form.appleHealth.sleep.output.target === 'heading'" :xs="24" :md="12">
                    <el-form-item :label="t('stravaInsertAfterHeadingMarkdown')">
                      <el-input v-model="form.appleHealth.sleep.output.insertAfterHeadingMarkdown" :placeholder="t('stravaInsertAfterHeadingPlaceholder')" />
                      <div class="form-hint">{{ t("stravaInsertAfterHeadingHint") }}</div>
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24">
                    <el-form-item>
                      <template #label>
                        {{ t("appleHealthTemplate") }}
                        <el-tooltip placement="top" effect="dark">
                          <template #content>
                            <div class="placeholder-help">{{ t("appleHealthSleepPlaceholders") }}</div>
                          </template>
                          <el-icon class="placeholder-help-icon"><InfoFilled /></el-icon>
                        </el-tooltip>
                      </template>
                      <el-input v-model="form.appleHealth.sleep.output.contentTemplate" type="textarea" :rows="3" />
                      <div class="form-hint">{{ t("appleHealthTemplateHint") }}</div>
                    </el-form-item>
                  </el-col>
                </el-row>

                <div class="subsection-title">{{ t("appleHealthWorkouts") }}</div>
                <el-checkbox v-model="form.appleHealth.workouts.enabled">{{ t("appleHealthWorkoutsEnable") }}</el-checkbox>
                <el-row v-if="form.appleHealth.workouts.enabled" :gutter="18">
                  <el-col :xs="24" :md="8">
                    <el-form-item :label="t('appleHealthMinDuration')">
                      <el-input-number v-model="form.appleHealth.workouts.minDurationMinutes" :min="0" :max="240" class="full-width" />
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24" :md="8">
                    <el-form-item :label="t('connectorOutputTarget')">
                      <el-segmented v-model="form.appleHealth.workouts.output.target" :options="connectorOutputTargetOptions" class="full-width" />
                      <div class="form-hint">{{ form.appleHealth.workouts.output.target === 'time-slot' ? t("connectorTimeSlotTargetHint") : t("connectorHeadingTargetHint") }}</div>
                    </el-form-item>
                  </el-col>
                  <el-col v-if="form.appleHealth.workouts.output.target === 'heading'" :xs="24" :md="8">
                    <el-form-item :label="t('connectorHeadingMarkdown')">
                      <el-input v-model="form.appleHealth.workouts.output.headingMarkdown" placeholder="## 今日运动" />
                    </el-form-item>
                  </el-col>
                  <el-col v-if="form.appleHealth.workouts.output.target === 'heading'" :xs="24" :md="12">
                    <el-form-item :label="t('stravaInsertAfterHeadingMarkdown')">
                      <el-input v-model="form.appleHealth.workouts.output.insertAfterHeadingMarkdown" :placeholder="t('stravaInsertAfterHeadingPlaceholder')" />
                      <div class="form-hint">{{ t("stravaInsertAfterHeadingHint") }}</div>
                    </el-form-item>
                  </el-col>
                  <el-col :xs="24">
                    <el-form-item>
                      <template #label>
                        {{ t("appleHealthTemplate") }}
                        <el-tooltip placement="top" effect="dark">
                          <template #content>
                            <div class="placeholder-help">{{ t("appleHealthWorkoutPlaceholders") }}</div>
                          </template>
                          <el-icon class="placeholder-help-icon"><InfoFilled /></el-icon>
                        </el-tooltip>
                      </template>
                      <el-input v-model="form.appleHealth.workouts.output.contentTemplate" type="textarea" :rows="3" />
                      <div class="form-hint">{{ t("appleHealthTemplateHint") }}</div>
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </template>
          </div>
        </el-collapse-item>

        <el-collapse-item id="reviews-section" name="reviews">
          <template #title>
            <SectionTitle icon="Notebook" :title="t('reviewTasks')" :description="t('reviewDesc')" inline />
          </template>
          <div class="collapse-body">
            <div class="feature-toggle-panel review-global-panel">
              <div>
                <el-switch v-model="form.reviews.enabled" :active-text="t('enableReviewScheduler')" />
                <div class="form-hint">{{ form.reviews.enabled ? t("reviewSchedulerEnabledHint") : t("reviewSchedulerDisabledHint") }}</div>
              </div>
              <el-button @click="loadReviewStatus">{{ t("reviewStatus") }}</el-button>
            </div>
            <div v-if="reviewStatus" class="review-status-list">
              <div v-for="task in reviewStatus.tasks" :key="task.id" class="review-status-item">
                <strong>{{ task.name || task.id }}</strong>
                <span>{{ task.enabled ? `${t("nextRunAt")}: ${formatDateTime(task.nextRunAt)}` : t("taskDisabled") }}</span>
                <span>{{ t("lastRun") }}: {{ formatReviewRun(task.lastRun) }}</span>
              </div>
            </div>
            <template v-if="form.reviews.enabled">
              <el-row :gutter="18">
                <el-col :xs="24" :md="12">
                  <el-form-item :label="t('maxSourceChars')">
                    <el-input-number v-model="form.reviews.maxSourceChars" :min="1000" :step="1000" class="full-width" />
                  </el-form-item>
                </el-col>
                <el-col :xs="24" :md="12">
                  <el-form-item :label="t('maxRecallChars')">
                    <el-input-number v-model="form.reviews.maxRecallChars" :min="1000" :step="1000" class="full-width" />
                  </el-form-item>
                </el-col>
              </el-row>
              <div class="task-list">
                <ReviewTaskCard
                  v-for="(task, index) in form.reviews.tasks"
                  :key="task.__key"
                  v-model="form.reviews.tasks[index]"
                  :dir-options="taskDirOptions(task)"
                  :labels="labels"
                  @duplicate="duplicateTask(index)"
                  @remove="removeTask(index)"
                  @run="runReviewTask(task.id)"
                />
              </div>
              <div class="button-row">
                <el-button :icon="Plus" @click="addReviewTask">{{ t("addTask") }}</el-button>
              </div>
              <el-collapse class="advanced-collapse">
                <el-collapse-item name="json" :title="t('advancedJson')">
                  <el-input v-model="reviewTasksJson" type="textarea" :rows="14" />
                  <div class="button-row">
                    <el-button @click="syncReviewJsonFromTasks">{{ t("refreshFromCards") }}</el-button>
                    <el-button @click="applyReviewJson">{{ t("applyJsonToCards") }}</el-button>
                  </div>
                </el-collapse-item>
              </el-collapse>
            </template>
          </div>
        </el-collapse-item>
      </el-collapse>

      <div class="footer-actions">
        <el-button size="large" type="primary" :icon="Check" @click="saveConfig">{{ t("saveConfig") }}</el-button>
      </div>
      </section>
    </main>
  </el-config-provider>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import en from "element-plus/es/locale/lang/en";
import { Check, Delete, InfoFilled, Plus, Refresh } from "@element-plus/icons-vue";
import DirectorySelector from "./components/DirectorySelector.vue";
import ModelForm from "./components/ModelForm.vue";
import ReviewTaskCard from "./components/ReviewTaskCard.vue";
import SectionTitle from "./components/SectionTitle.vue";

const DEFAULT_AH_WORKOUT_TEMPLATE =
  "[{{time}}] {{#name}}{{name}}，{{/name}}{{type}}{{#duration}}，运动时间 {{duration}}{{/duration}}{{#totalDuration}}，总耗时 {{totalDuration}}{{/totalDuration}}{{#avgHeartRate}}，平均心率 {{avgHeartRate}} bpm{{/avgHeartRate}}{{#maxHeartRate}}，最大心率 {{maxHeartRate}} bpm{{/maxHeartRate}}{{#distance}}，总里程 {{distance}} km{{/distance}}{{#avgPace}}，配速 {{avgPace}}{{/avgPace}}{{#elevationGain}}，累计爬升 {{elevationGain}} m{{/elevationGain}}{{#avgSpeed}}，平均速度 {{avgSpeed}} km/h{{/avgSpeed}}{{#maxSpeed}}，最大速度 {{maxSpeed}} km/h{{/maxSpeed}}{{#calories}}，卡路里 {{calories}} kcal{{/calories}}{{#device}}，[[{{device}}]]{{/device}}。";
const DEFAULT_AH_SLEEP_TEMPLATE =
  "[{{wakeTime}}] 睡眠 {{asleep}}{{#inBed}}（卧床{{inBed}}）{{/inBed}}{{#stages}}｜{{stages}}{{/stages}}{{#vitals}}｜{{vitals}}{{/vitals}}";

const legacyAllowedDirs = ["Inbox", "Notes", "Ideas", "Projects", "Daily", "Reviews", "Templates", "Attachments", "Archive"];
const legacyTaskDirs = ["Daily", "Inbox", "Notes", "Ideas", "Projects"];
const legacyRecallDirs = ["Daily", "Notes", "Ideas", "Projects"];

const translations = {
  zh: {
    adminConsole: "管理控制台",
    tagline: "捕捉任意内容，让你的 Vault 回应你。管理页使用 Basic Auth；外部 API 使用 Bearer Token。",
    loadConfig: "加载配置",
    saveConfig: "保存配置",
    accessTitle: "访问权限",
    sidebarAccessNote: "管理页使用 Basic Auth，外部写入 API 使用 Bearer Token。",
    accessBody: "本页面由 <code>ADMIN_USERNAME</code> / <code>ADMIN_PASSWORD</code> 保护。<code>API_TOKEN</code> 只给 Coze、快捷指令等外部系统调用 <code>/v1/api/...</code> 使用。",
    vault: "Vault",
    vaultDesc: "路径、安全边界、附件目录和全局时区。",
    vaultRoot: "Vault Root",
    dataDir: "Data Dir",
    timeZone: "时区",
    timeZoneHint: "日记时间戳插入和回顾任务调度都使用这个全局时区。",
    allowedDirs: "允许的顶层目录",
    allowedDirsHint: "写入路径必须位于这些勾选的顶层目录中。刷新会读取当前 Vault 已有目录。",
    includeRootMarkdownFiles: "包含 Vault 根目录 Markdown 文件",
    includeRootMarkdownFilesHint: "启用后，根目录下的 .md 文件会进入语义索引和回顾任务周期来源；不改变写入安全目录。",
    globalExcludePaths: "全局排除路径",
    globalExcludePathsPlaceholder: "输入或选择要全局排除的 Vault 路径",
    globalExcludePathsHint: "会从语义索引和所有回顾任务来源中排除；任务自己的排除路径会与这里合并。",
    noVaultDirs: "未找到 Vault 顶层目录",
    refreshVaultDirs: "刷新 Vault 目录",
    customDirPlaceholder: "自定义顶层目录，例如 Reviews",
    addCustom: "添加自定义",
    maxJsonBodyBytes: "最大 JSON 请求体字节数",
    imageAttachmentDir: "图片附件目录",
    audioAttachmentDir: "音频附件目录",
    videoAttachmentDir: "视频附件目录",
    fileAttachmentDir: "通用附件目录",
    maxAttachmentBytes: "最大附件上传字节数",
    aiModel: "AI 模型",
    aiModelDesc: "供内置回顾任务调用的 AI 生成 API。",
    semanticIndex: "语义索引",
    semanticDesc: "远程 Embedding API + 本地 JSON 向量索引。",
    provider: "服务商",
    providerHint: "Provider 代表鉴权和网关类型；协议由 API Mode 决定。",
    embeddingProviderHint: "Embedding 固定调用 Base URL + /embeddings；OpenAI text-embedding-3 系列仍使用这个端点。",
    apiMode: "API Mode",
    apiModeHint: "Chat Completions 兼容 OpenRouter/Groq 等网关；Responses API 适合 OpenAI 官方强模型和长回顾。",
    chatCompletions: "Chat Completions",
    responsesApi: "Responses API",
    baseUrl: "Base URL",
    model: "模型",
    apiKey: "API Key",
    apiKeySaved: "API Key 已保存，留空表示不修改。",
    apiKeyMissing: "尚未保存 API Key。新 Key 会用 APP_ENCRYPTION_KEY 加密。",
    temperature: "Temperature",
    maxOutputTokens: "最大输出 Tokens",
    enableRemoteEmbeddings: "启用远程 Embedding",
    embeddingEnabledHint: "语义搜索、自动索引和回顾任务语义召回会使用这组配置。",
    embeddingDisabledHint: "关闭后不运行语义索引和语义召回；打开后再配置模型和索引参数。",
    dimensions: "维度",
    batchSize: "批量大小",
    searchLimit: "搜索结果数",
    maxChunkChars: "最大切块字符数",
    autoScanMinutes: "自动扫描间隔分钟数",
    autoIndexAfterWrite: "API 写入后自动索引文件",
    indexStatus: "索引状态",
    clearIndexErrors: "清空索引错误",
    rebuildIndex: "重建索引",
    dailyRules: "日记时间戳插入规则",
    dailyDesc: "按全局时区和时间段，把内容写入当天日记的目标 Heading。",
    dailyFilePath: "日记文件路径",
    dailyTemplatePath: "日记模板路径",
    headingLevel: "Heading 层级",
    linePattern: "行匹配模式",
    lineFormat: "行格式",
    createDailyIfMissing: "当天日记不存在时自动创建",
    blankLineBetweenEntries: "时间戳条目之间保留空行",
    sortEntriesByTime: "按时间顺序插入时间戳条目",
    timeSlots: "时间段",
    heading: "Heading",
    start: "开始",
    end: "结束",
    addSlot: "添加时间段",
    connectorData: "连接器数据",
    appleHealthTitle: "Apple 健康",
    appleHealthDesc: "接收设备推送的 Apple 健康原始数据，服务端聚合后写入每日笔记",
    appleHealthEnable: "启用 Apple 健康接收端点",
    appleHealthEnabledHint: "设备向 POST /v1/api/health/ingest 推送数据后，VaultEcho 负责聚合和格式化。这是只接收端点，不会主动拉取设备。",
    appleHealthDisabledHint: "已关闭。开启后才会处理 /v1/api/health/ingest 的推送。",
    appleHealthEndpointHint: "端点：POST /v1/api/health/ingest（Bearer 鉴权）。请求体可包含 sleep（一段睡眠，或 sleep.sessions 多段）和 workouts（HKWorkout 数组）。每段睡眠、每条运动各是一条 [HH:mm] 记录，在 heading 下合并并按时间排序（夜间睡眠和午休是两条）。睡眠按起床日归属、按会话 id（或入睡时间）去重，运动按 UUID 去重。",
    appleHealthSleep: "睡眠",
    appleHealthSleepEnable: "处理睡眠数据",
    appleHealthWorkouts: "运动（HKWorkout）",
    appleHealthWorkoutsEnable: "处理运动数据",
    appleHealthMinDuration: "最短时长（分钟）",
    appleHealthTemplate: "写入模板",
    appleHealthTemplateHint: "用占位符 + 文本自定义写入格式。用条件段 {{#字段}}…{{/字段}} 包住的内容，在该字段没有数据时整段省略（含标签和分隔符）。建议以 [{{time}}] 或 [{{wakeTime}}] 开头以便按时间排序；留空恢复默认格式。鼠标悬停左侧图标查看全部占位符。",
    appleHealthSleepPlaceholders:
      "睡眠占位符（有数据才显示）：\n{{wakeTime}} 起床  {{bedTime}} 入睡  {{date}} 日期\n{{asleep}} 总睡眠  {{inBed}} 卧床\n{{deep}}/{{core}}/{{rem}}/{{awake}} 各阶段时长\n{{latency}} 入睡延迟  {{awakenings}} 醒来次数\n{{avgHeartRate}}/{{minHeartRate}}/{{maxHeartRate}} 心率 bpm\n{{hrv}} HRV ms  {{respiratoryRate}} 呼吸率  {{wristTemperature}} 手腕温度  {{spo2}} 血氧%\n{{stages}} 分期合并  {{vitals}} 心率·HRV 合并\n条件段示例：{{#maxHeartRate}}，最高心率{{maxHeartRate}} bpm{{/maxHeartRate}}",
    appleHealthWorkoutPlaceholders:
      "运动占位符（有数据才显示）：\n{{time}} 开始时间  {{date}} 日期  {{name}} 名称\n{{type}} 类型(中文)  {{typeEn}} 类型(英文)  {{typeRaw}} 类型(原始)\n{{duration}} 运动时长  {{totalDuration}} 总耗时\n{{distance}} 里程(km)  {{avgPace}} 配速  {{avgSpeed}}/{{maxSpeed}} 速度 km/h\n{{avgHeartRate}}/{{maxHeartRate}} 心率 bpm  {{calories}} 卡路里\n{{elevationGain}} 爬升 m  {{flightsClimbed}} 爬楼层数  {{steps}} 步数  {{device}} 设备\n条件段示例：{{#distance}}，总里程 {{distance}} km{{/distance}}",
    enableConnectorScheduler: "启用连接器轮询",
    connectorSchedulerEnabledHint: "保存后，VaultEcho 会按固定间隔轮询所有已启用的连接器来源。",
    connectorSchedulerDisabledHint: "关闭后不会自动轮询；仍可用立即查找手动同步最近回看窗口内的内容。",
    connectorStatus: "连接器状态",
    runConnectorNow: "立即查找",
    addConnectorSource: "添加来源",
    connectorEmptyHint: "还没有连接器来源。添加来源后即可选择 X 或 Strava 并配置账号、Token 和写入方式。",
    connectorName: "来源名称",
    connectorNamePlaceholder: "例如：个人 X",
    disabled: "停用",
    connectorNotScheduled: "未启用自动轮询",
    connectorPlatform: "连接器平台",
    connectorEnabled: "启用来源",
    enableXConnector: "启用 X",
    xConnectorHint: "当前只支持 X；每个来源按轮询间隔滑动回看，并按帖子发布时间写入对应日记。",
    xBaseUrl: "X API Base URL",
    xBearerToken: "X Bearer / User Access Token",
    xTokenSaved: "Token 已保存，留空表示不修改。",
    xTokenMissing: "尚未保存 Token。新 Token 会用 APP_ENCRYPTION_KEY 加密。",
    xUserId: "X User ID",
    xUserIdHint: "推荐填写 User ID；只填 Username 时会先查询一次 User ID。",
    xUsername: "X Username",
    pollInterval: "轮询间隔",
    pollIntervalHint: "所有来源共用这个轮询间隔；每次按间隔滑动回看，23:59 会额外回看当天，并用来源 + 帖子 ID 去重写入。",
    pollEvery15: "15分钟",
    pollEvery30: "30分钟",
    pollEvery60: "1小时",
    pollEvery120: "2小时",
    pollEvery360: "6小时",
    pollEvery720: "12小时",
    pollEvery1440: "24小时",
    maxPostsPerRun: "单次最多帖子数",
    includeReplies: "包含回复",
    includeRetweets: "包含转帖",
    stravaBaseUrl: "Strava API Base URL",
    stravaClientId: "Strava Client ID",
    stravaRedirectUri: "Strava Redirect URI",
    stravaRedirectUriHint: "默认使用当前 Admin UI 地址；在 Strava App 设置里把 callback domain 配成这个 VPS 域名。",
    stravaClientSecret: "Strava Client Secret",
    stravaClientSecretSaved: "Client Secret 已保存，留空表示不修改。",
    stravaClientSecretMissing: "尚未保存 Client Secret。新 Secret 会用 APP_ENCRYPTION_KEY 加密。",
    stravaRefreshToken: "Strava Refresh Token",
    stravaRefreshTokenSaved: "Refresh Token 已保存，留空表示不修改。",
    stravaRefreshTokenMissing: "尚未保存 Refresh Token。同步时会自动刷新并保存最新 token 状态。",
    stravaAuthorizationCode: "Strava Authorization Code",
    stravaAuthorizationCodeSaved: "Authorization Code 已保存；下一次运行会优先换取新 Token。",
    stravaAuthorizationCodeHint: "用下方授权链接重新授权 activity:read_all 后，把回跳 URL 里的 code 粘贴到这里。",
    stravaAuthorizationUrl: "打开 Strava 授权链接",
    stravaAuthorizationCodeCaptured: "已从 Strava 回调捕获 Authorization Code。点立即查找会先保存并换取新 Token。",
    stravaAuthorizationDenied: "Strava 授权被取消。",
    stravaAuthorizationScopeMissing: "Strava 回调缺少活动读取权限，请重新授权并保留 activity:read_all。",
    stravaAuthorizationSourceMissing: "没有找到对应的 Strava 来源，无法自动填入 Authorization Code。",
    maxActivitiesPerRun: "单次最多活动数",
    maxActivitiesPerRunHint: "建议保持较小值；历史回填请继续用本地脚本，连接器只同步近期新增活动。",
    stravaRequestDelayMs: "详情请求间隔",
    stravaRequestDelayHint: "每条活动详情之间的等待时间，降低批量详情请求触发 429 的概率。",
    minMovingTimeMinutes: "最小运动时间",
    stravaActivityHeadingMarkdown: "运动 Heading Markdown",
    stravaActivityHeadingHint: "例如 ## 今日运动 或 # 运动；已存在则合并排序，不存在则用分割线新增块。",
    stravaInsertAfterHeadingMarkdown: "缺失时插入到此 Heading 后",
    stravaInsertAfterHeadingPlaceholder: "留空：最后一个日记时间段",
    stravaInsertAfterHeadingHint: "留空时自动使用 Daily Time Slots 配置中的最后一个时间段 heading；只有需要覆盖默认位置时才填写。",
    connectorOutputTarget: "插入位置",
    targetHeading: "单独 Heading",
    targetTimeSlot: "日记时间块",
    connectorHeadingTargetHint: "写入指定 Heading；如果当天日记里没有该 Heading，会在页面底部新建。",
    connectorTimeSlotTargetHint: "按帖子发布时间匹配上方时间段，例如 12:20 会写入下午时间块。",
    connectorHeadingMarkdown: "目标 Heading Markdown",
    connectorLineFormat: "连接器行格式",
    connectorLineFormatHint: "留空则使用上方日记 Line Format。",
    connectorContentTemplate: "帖子内容模板",
    connectorContentTemplateHint: "可用变量：{{text}}、{{url}}、{{id}}、{{username}}、{{created_at}}。",
    postsWrittenStatus: "条帖子已写入",
    activitiesWrittenStatus: "条活动已写入",
    connectorStatusLoaded: "连接器状态已更新",
    reviewTasks: "回顾任务",
    reviewDesc: "周、月、季、年 AI 回顾，支持语义召回和模板化输出文件。",
    enableReviewTasks: "启用定时回顾任务",
    enableReviewScheduler: "启用自动调度",
    reviewSchedulerEnabledHint: "自动调度会按下方已启用任务的周期和运行时间执行；保存配置后生效。",
    reviewSchedulerDisabledHint: "自动调度关闭时，下方任务不会自动执行；打开后才显示任务配置。",
    runTaskId: "运行任务 ID",
    reviewStatus: "回顾状态",
    reviewStatusLoaded: "回顾状态已更新",
    runNow: "立即运行",
    savingBeforeRun: "正在保存当前配置，然后运行任务...",
    enableThisTask: "启用此任务",
    nextRunAt: "下次运行",
    lastRun: "上次运行",
    taskDisabled: "此任务未启用",
    noLastRun: "暂无记录",
    maxSourceChars: "最大来源字符数",
    maxRecallChars: "最大召回字符数",
    addTask: "添加任务",
    advancedJson: "高级 JSON",
    refreshFromCards: "从卡片刷新",
    applyJsonToCards: "应用 JSON 到卡片",
    enabled: "启用",
    duplicate: "复制",
    remove: "删除",
    taskId: "任务 ID",
    name: "名称",
    period: "周期",
    targetPeriod: "目标周期",
    runTime: "运行时间",
    weekday: "星期",
    monthDay: "月份日期",
    quarterDayOffset: "季度日偏移",
    month: "月份",
    sourceDirs: "来源目录",
    excludePaths: "排除路径",
    excludePathsPlaceholder: "输入或选择要排除的 Vault 路径",
    excludePathsHint: "支持顶层目录或子目录，例如 Attachments、书影音/电影。会同时排除来源材料和语义召回结果。",
    includeDailyNotes: "包含按日记路径解析出的每日笔记",
    semanticRecall: "语义召回",
    semanticRecallQuery: "语义召回查询",
    semanticRecallLimit: "语义召回数量",
    semanticRecallScopeDirs: "语义召回范围目录",
    outputPathTemplate: "输出路径模板",
    reviewTemplatePath: "回顾模板路径",
    outputHeading: "输出 Heading",
    prompt: "提示词",
    weekly: "每周",
    monthly: "每月",
    quarterly: "每季度",
    yearly: "每年",
    previous: "上一个完整周期",
    current: "当前周期",
    sunday: "周日",
    monday: "周一",
    tuesday: "周二",
    wednesday: "周三",
    thursday: "周四",
    friday: "周五",
    saturday: "周六"
  }
};

const labels = computed(() => ({
  provider: t("provider"),
  providerHint: t("providerHint"),
  embeddingProviderHint: t("embeddingProviderHint"),
  apiMode: t("apiMode"),
  apiModeHint: t("apiModeHint"),
  chatCompletions: t("chatCompletions"),
  responsesApi: t("responsesApi"),
  baseUrl: t("baseUrl"),
  model: t("model"),
  apiKey: t("apiKey"),
  dimensions: t("dimensions"),
  temperature: t("temperature"),
  maxOutputTokens: t("maxOutputTokens"),
  enabled: t("enabled"),
  duplicate: t("duplicate"),
  remove: t("remove"),
  taskId: t("taskId"),
  name: t("name"),
  period: t("period"),
  targetPeriod: t("targetPeriod"),
  runTime: t("runTime"),
  weekday: t("weekday"),
  monthDay: t("monthDay"),
  quarterDayOffset: t("quarterDayOffset"),
  month: t("month"),
  sourceDirs: t("sourceDirs"),
  excludePaths: t("excludePaths"),
  excludePathsPlaceholder: t("excludePathsPlaceholder"),
  excludePathsHint: t("excludePathsHint"),
  includeDailyNotes: t("includeDailyNotes"),
  semanticRecall: t("semanticRecall"),
  semanticRecallQuery: t("semanticRecallQuery"),
  semanticRecallLimit: t("semanticRecallLimit"),
  semanticRecallScopeDirs: t("semanticRecallScopeDirs"),
  outputPathTemplate: t("outputPathTemplate"),
  reviewTemplatePath: t("reviewTemplatePath"),
  outputHeading: t("outputHeading"),
  prompt: t("prompt"),
  weekly: t("weekly"),
  monthly: t("monthly"),
  quarterly: t("quarterly"),
  yearly: t("yearly"),
  previous: t("previous"),
  current: t("current"),
  sunday: t("sunday"),
  monday: t("monday"),
  tuesday: t("tuesday"),
  wednesday: t("wednesday"),
  thursday: t("thursday"),
  friday: t("friday"),
  saturday: t("saturday"),
  noVaultDirs: t("noVaultDirs"),
  enableThisTask: t("enableThisTask"),
  runNow: t("runNow")
}));

const language = ref(localStorage.getItem("vaultecho.uiLanguage") || "en");
const elementLocale = computed(() => (language.value === "zh" ? zhCn : en));
const activePanels = ref([]);
const vaultDirs = ref([]);
const loadingDirs = ref(false);
const customAllowedDir = ref("");
const reviewTasksJson = ref("[]");
const reviewStatus = ref(null);
const connectorStatus = ref(null);
const runningConnectorId = ref("");
const form = reactive(defaultForm());

const timeZoneOptions = computed(() => {
  const fallback = ["UTC", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Tokyo", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/Los_Angeles", "America/New_York"];
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : fallback;
  return mergeUnique([Intl.DateTimeFormat().resolvedOptions().timeZone, form.timeZone], fallback, supported);
});

const allowedDirOptions = computed(() => mergeUnique(vaultDirs.value, form.allowedDirs));
const connectorOutputTargetOptions = computed(() => [
  { label: t("targetHeading"), value: "heading" },
  { label: t("targetTimeSlot"), value: "time-slot" }
]);
const connectorPollIntervalOptions = computed(() => [
  { label: t("pollEvery15"), value: 15 },
  { label: t("pollEvery30"), value: 30 },
  { label: t("pollEvery60"), value: 60 },
  { label: t("pollEvery120"), value: 120 },
  { label: t("pollEvery360"), value: 360 },
  { label: t("pollEvery720"), value: 720 },
  { label: t("pollEvery1440"), value: 1440 }
]);

watch(language, (value) => {
  localStorage.setItem("vaultecho.uiLanguage", value);
  document.documentElement.lang = value === "zh" ? "zh-CN" : "en";
});

watch(
  () => form.reviews.tasks,
  () => syncReviewJsonFromTasks(),
  { deep: true }
);

onMounted(async () => {
  document.documentElement.lang = language.value === "zh" ? "zh-CN" : "en";
  await loadConfig();
});

function t(key) {
  return language.value === "zh" ? translations.zh[key] || englishText[key] || key : englishText[key] || key;
}

const englishText = {
  adminConsole: "Admin Console",
  tagline: "Capture anything. Let your vault answer back. Admin pages use Basic Auth; external API calls use Bearer tokens.",
  loadConfig: "Load Config",
  saveConfig: "Save Config",
  accessTitle: "Access",
  sidebarAccessNote: "Admin pages use Basic Auth. External write APIs use Bearer tokens.",
  accessBody: "This page is protected by <code>ADMIN_USERNAME</code> / <code>ADMIN_PASSWORD</code>. <code>API_TOKEN</code> is only for external systems such as Coze or Shortcuts calling <code>/v1/api/...</code>.",
  vault: "Vault",
  vaultDesc: "Paths, safety boundary, attachment folders, and global timezone.",
  vaultRoot: "Vault Root",
  dataDir: "Data Dir",
  timeZone: "Time Zone",
  timeZoneHint: "Daily timestamp insertion and review task schedules both use this global timezone.",
  allowedDirs: "Allowed Top-Level Dirs",
  allowedDirsHint: "Every write path must stay inside the checked top-level directories. Refresh reads current Vault folders.",
  includeRootMarkdownFiles: "Include root Markdown files",
  includeRootMarkdownFilesHint: "When enabled, .md files directly under the Vault root are included in semantic indexing and review-task period sources. This does not change write safety boundaries.",
  globalExcludePaths: "Global Exclude Paths",
  globalExcludePathsPlaceholder: "Type or select Vault paths to exclude globally",
  globalExcludePathsHint: "Excluded from semantic indexing and all review-task sources. Task-level exclude paths are merged with this list.",
  noVaultDirs: "No Vault directories found",
  refreshVaultDirs: "Refresh Vault Dirs",
  customDirPlaceholder: "Custom top-level dir, for example Reviews",
  addCustom: "Add Custom",
  maxJsonBodyBytes: "Max JSON Body Bytes",
  imageAttachmentDir: "Image Attachment Dir",
  audioAttachmentDir: "Audio Attachment Dir",
  videoAttachmentDir: "Video Attachment Dir",
  fileAttachmentDir: "File Attachment Dir",
  maxAttachmentBytes: "Max Attachment Upload Bytes",
  aiModel: "AI Model",
  aiModelDesc: "AI generation API used by built-in review tasks.",
  semanticIndex: "Semantic Index",
  semanticDesc: "Remote embedding API plus a local JSON vector index.",
  provider: "Provider",
  providerHint: "Provider controls the credential and gateway family; API Mode controls the request protocol.",
  embeddingProviderHint: "Embeddings always call Base URL + /embeddings. OpenAI text-embedding-3 models still use this endpoint.",
  apiMode: "API Mode",
  apiModeHint: "Chat Completions works with OpenRouter, Groq, and compatible gateways. Responses API is for official OpenAI frontier models and long reviews.",
  chatCompletions: "Chat Completions",
  responsesApi: "Responses API",
  baseUrl: "Base URL",
  model: "Model",
  apiKey: "API Key",
  apiKeySaved: "API key is saved; leave blank to keep it unchanged.",
  apiKeyMissing: "No API key is saved. New keys are encrypted with APP_ENCRYPTION_KEY.",
  temperature: "Temperature",
  maxOutputTokens: "Max Output Tokens",
  enableRemoteEmbeddings: "Enable remote embeddings",
  embeddingEnabledHint: "Semantic search, auto-indexing, and review-task recall use this configuration.",
  embeddingDisabledHint: "Semantic indexing and recall are disabled. Enable it to configure the model and index settings.",
  dimensions: "Dimensions",
  batchSize: "Batch Size",
  searchLimit: "Search Limit",
  maxChunkChars: "Max Chunk Chars",
  autoScanMinutes: "Auto Scan Interval Minutes",
  autoIndexAfterWrite: "Index files automatically after API writes",
  indexStatus: "Index Status",
  clearIndexErrors: "Clear Index Errors",
  rebuildIndex: "Rebuild Index",
  dailyRules: "Daily Timestamp Insertion Rules",
  dailyDesc: "Use the global timezone and time slots to write into daily note headings.",
  dailyFilePath: "Daily File Path",
  dailyTemplatePath: "Daily Template Path",
  headingLevel: "Heading Level",
  linePattern: "Line Pattern",
  lineFormat: "Line Format",
  createDailyIfMissing: "Create the daily note when it does not exist",
  blankLineBetweenEntries: "Keep a blank line between timestamp entries",
  sortEntriesByTime: "Insert timestamp entries in chronological order",
  timeSlots: "Time Slots",
  heading: "Heading",
  start: "Start",
  end: "End",
  addSlot: "Add Slot",
  connectorData: "Connector Data",
  appleHealthTitle: "Apple Health",
  appleHealthDesc: "Receive raw Apple Health data pushed from a device; VaultEcho aggregates and writes it into the daily note",
  appleHealthEnable: "Enable Apple Health ingest endpoint",
  appleHealthEnabledHint: "After a device pushes to POST /v1/api/health/ingest, VaultEcho aggregates and formats it. Receive-only; VaultEcho never pulls from a device.",
  appleHealthDisabledHint: "Disabled. Turn this on to process pushes to /v1/api/health/ingest.",
  appleHealthEndpointHint: "Endpoint: POST /v1/api/health/ingest (Bearer auth). The body may include sleep (one session, or sleep.sessions for several) and workouts (HKWorkout array). Each sleep session and each workout becomes one [HH:mm] entry merged and time-sorted under the heading (a night and a nap are two entries). Sleep is attributed to the wake day and de-duplicated per session id (or fall-asleep time); workouts by UUID.",
  appleHealthSleep: "Sleep",
  appleHealthSleepEnable: "Process sleep data",
  appleHealthWorkouts: "Workouts (HKWorkout)",
  appleHealthWorkoutsEnable: "Process workout data",
  appleHealthMinDuration: "Minimum duration (minutes)",
  appleHealthTemplate: "Write template",
  appleHealthTemplateHint: "Customize the line with placeholders and text. Content wrapped in a conditional section {{#field}}…{{/field}} is dropped entirely (label and separator included) when that field has no data. Start with [{{time}}] or [{{wakeTime}}] so entries sort by time; leave empty to restore the default. Hover the icon on the left for all placeholders.",
  appleHealthSleepPlaceholders:
    "Sleep placeholders (shown only when present):\n{{wakeTime}} wake  {{bedTime}} fell asleep  {{date}} date\n{{asleep}} total sleep  {{inBed}} time in bed\n{{deep}}/{{core}}/{{rem}}/{{awake}} stage durations\n{{latency}} sleep latency  {{awakenings}} awakenings\n{{avgHeartRate}}/{{minHeartRate}}/{{maxHeartRate}} heart rate bpm\n{{hrv}} HRV ms  {{respiratoryRate}} respiratory  {{wristTemperature}} wrist temp  {{spo2}} SpO2%\n{{stages}} stages joined  {{vitals}} HR·HRV joined\nConditional example: {{#maxHeartRate}}, max HR {{maxHeartRate}} bpm{{/maxHeartRate}}",
  appleHealthWorkoutPlaceholders:
    "Workout placeholders (shown only when present):\n{{time}} start  {{date}} date  {{name}} name\n{{type}} type (localized)  {{typeEn}} type (English)  {{typeRaw}} type (raw)\n{{duration}} duration  {{totalDuration}} elapsed\n{{distance}} distance(km)  {{avgPace}} pace  {{avgSpeed}}/{{maxSpeed}} speed km/h\n{{avgHeartRate}}/{{maxHeartRate}} heart rate bpm  {{calories}} calories\n{{elevationGain}} elevation m  {{flightsClimbed}} flights  {{steps}} steps  {{device}} device\nConditional example: {{#distance}}, distance {{distance}} km{{/distance}}",
  enableConnectorScheduler: "Enable connector polling",
  connectorSchedulerEnabledHint: "After saving, VaultEcho polls all enabled connector sources at the configured interval.",
  connectorSchedulerDisabledHint: "Automatic polling is off. Run Now can still sync the recent lookback window manually.",
  connectorStatus: "Connector Status",
  runConnectorNow: "Run Now",
  addConnectorSource: "Add Source",
  connectorEmptyHint: "No connector sources yet. Add a source, choose X or Strava, then configure credentials and insertion rules.",
  connectorName: "Source Name",
  connectorNamePlaceholder: "For example: Personal X",
  disabled: "Disabled",
  connectorNotScheduled: "Automatic polling is off",
  connectorPlatform: "Connector Platform",
  connectorEnabled: "Enable Source",
  enableXConnector: "Enable X",
  xConnectorHint: "Only X is supported for now. Each source uses a sliding lookback window and writes posts into daily notes by post time.",
  xBaseUrl: "X API Base URL",
  xBearerToken: "X Bearer / User Access Token",
  xTokenSaved: "Token is saved; leave blank to keep it unchanged.",
  xTokenMissing: "No token is saved. New tokens are encrypted with APP_ENCRYPTION_KEY.",
  xUserId: "X User ID",
  xUserIdHint: "User ID is recommended. Username-only config performs one extra user lookup.",
  xUsername: "X Username",
  pollInterval: "Poll Interval",
  pollIntervalHint: "All sources share this interval. Each poll uses a sliding lookback window; 23:59 also catches up the local day. Writes dedupe by source plus post ID.",
  pollEvery15: "15 min",
  pollEvery30: "30 min",
  pollEvery60: "1 hour",
  pollEvery120: "2 hours",
  pollEvery360: "6 hours",
  pollEvery720: "12 hours",
  pollEvery1440: "24 hours",
  maxPostsPerRun: "Max Posts Per Run",
  includeReplies: "Include replies",
  includeRetweets: "Include reposts",
  stravaBaseUrl: "Strava API Base URL",
  stravaClientId: "Strava Client ID",
  stravaRedirectUri: "Strava Redirect URI",
  stravaRedirectUriHint: "Defaults to the current Admin UI URL. In Strava app settings, set the callback domain to this VPS domain.",
  stravaClientSecret: "Strava Client Secret",
  stravaClientSecretSaved: "Client Secret is saved; leave blank to keep it unchanged.",
  stravaClientSecretMissing: "No Client Secret is saved. New secrets are encrypted with APP_ENCRYPTION_KEY.",
  stravaRefreshToken: "Strava Refresh Token",
  stravaRefreshTokenSaved: "Refresh Token is saved; leave blank to keep it unchanged.",
  stravaRefreshTokenMissing: "No Refresh Token is saved. Sync automatically refreshes and stores the latest token state.",
  stravaAuthorizationCode: "Strava Authorization Code",
  stravaAuthorizationCodeSaved: "Authorization Code is saved. The next run will exchange it for new tokens first.",
  stravaAuthorizationCodeHint: "Use the authorization link below with activity:read_all, then paste the code from the redirected URL here.",
  stravaAuthorizationUrl: "Open Strava authorization URL",
  stravaAuthorizationCodeCaptured: "Captured the Strava authorization code from the callback. Run Now will save it and exchange it for new tokens first.",
  stravaAuthorizationDenied: "Strava authorization was denied.",
  stravaAuthorizationScopeMissing: "The Strava callback is missing activity read permission. Reauthorize and keep activity:read_all selected.",
  stravaAuthorizationSourceMissing: "No matching Strava source was found, so the authorization code could not be applied automatically.",
  maxActivitiesPerRun: "Max Activities Per Run",
  maxActivitiesPerRunHint: "Keep this small. Use the local import script for history backfills; the connector only syncs recent activity.",
  stravaRequestDelayMs: "Detail Request Delay",
  stravaRequestDelayHint: "Wait time between activity detail requests to reduce the chance of Strava 429s during small bursts.",
  minMovingTimeMinutes: "Min Moving Time",
  stravaActivityHeadingMarkdown: "Activity Heading Markdown",
  stravaActivityHeadingHint: "For example ## 今日运动 or # 运动. Existing headings are merged and sorted; missing headings are created with separators.",
  stravaInsertAfterHeadingMarkdown: "Create After Heading",
  stravaInsertAfterHeadingPlaceholder: "Blank: last daily time slot",
  stravaInsertAfterHeadingHint: "Leave blank to use the last configured Daily Time Slot heading. Fill this only when overriding the default insertion point.",
  connectorOutputTarget: "Insertion Target",
  targetHeading: "Separate Heading",
  targetTimeSlot: "Daily Time Slot",
  connectorHeadingTargetHint: "Write into the configured heading. If it is missing, it is created at the bottom of the daily note.",
  connectorTimeSlotTargetHint: "Match the post time against the daily time slots above, for example 12:20 writes into Afternoon.",
  connectorHeadingMarkdown: "Target Heading Markdown",
  connectorLineFormat: "Connector Line Format",
  connectorLineFormatHint: "Leave blank to use the Daily Line Format above.",
  connectorContentTemplate: "Post Content Template",
  connectorContentTemplateHint: "Available variables: {{text}}, {{url}}, {{id}}, {{username}}, {{created_at}}.",
  postsWrittenStatus: "posts written",
  activitiesWrittenStatus: "activities written",
  connectorStatusLoaded: "Connector status updated",
  reviewTasks: "Review Tasks",
  reviewDesc: "Weekly, monthly, quarterly, and yearly AI reviews with semantic recall.",
  enableReviewTasks: "Enable scheduled review tasks",
  enableReviewScheduler: "Enable automatic scheduling",
  reviewSchedulerEnabledHint: "Automatic scheduling runs the enabled task cards below. Save config to apply changes.",
  reviewSchedulerDisabledHint: "Automatic scheduling is off. Enable it to show and edit review task cards.",
  runTaskId: "Run Task ID",
  reviewStatus: "Review Status",
  reviewStatusLoaded: "Review status updated",
  runNow: "Run Now",
  savingBeforeRun: "Saving current config before running the task...",
  enableThisTask: "Enable this task",
  nextRunAt: "Next run",
  lastRun: "Last run",
  taskDisabled: "This task is disabled",
  noLastRun: "No run yet",
  maxSourceChars: "Max Source Chars",
  maxRecallChars: "Max Recall Chars",
  addTask: "Add Task",
  advancedJson: "Advanced JSON",
  refreshFromCards: "Refresh From Cards",
  applyJsonToCards: "Apply JSON To Cards",
  enabled: "Enabled",
  duplicate: "Duplicate",
  remove: "Delete",
  taskId: "Task ID",
  name: "Name",
  period: "Period",
  targetPeriod: "Target Period",
  runTime: "Run Time",
  weekday: "Weekday",
  monthDay: "Month Day",
  quarterDayOffset: "Quarter Day Offset",
  month: "Month",
  sourceDirs: "Source Dirs",
  excludePaths: "Exclude Paths",
  excludePathsPlaceholder: "Type or select Vault paths to exclude",
  excludePathsHint: "Supports top-level folders or subfolders, for example Attachments or Media/Movies. Applies to both source notes and semantic recall.",
  includeDailyNotes: "Include daily notes resolved from Daily File Path",
  semanticRecall: "Semantic Recall",
  semanticRecallQuery: "Semantic Recall Query",
  semanticRecallLimit: "Semantic Recall Limit",
  semanticRecallScopeDirs: "Semantic Recall Scope Dirs",
  outputPathTemplate: "Output Path Template",
  reviewTemplatePath: "Review Template Path",
  outputHeading: "Output Heading",
  prompt: "Prompt",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  previous: "Previous completed period",
  current: "Current period",
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday"
};

function defaultForm() {
  return {
    vaultRoot: "",
    dataDir: "",
    timeZone: "Asia/Shanghai",
    allowedDirs: [],
    includeRootMarkdownFiles: false,
    excludePaths: [],
    maxJsonBodyBytes: 1048576,
    attachments: { imageDir: "Attachments/Images", audioDir: "Attachments/Audio", videoDir: "Attachments/Video", fileDir: "Attachments/Files", maxUploadBytes: 10485760 },
    ai: { provider: "openai-compatible", apiMode: "chat-completions", baseUrl: "https://api.openai.com/v1", model: "", apiKey: "", apiKeySet: false, temperature: 0.2, maxOutputTokens: 1600 },
    embedding: { enabled: false, provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "", apiKey: "", apiKeySet: false, dimensions: 0, batchSize: 16, maxChunkChars: 1600, searchLimit: 8, autoIndexAfterWrite: true, autoScanIntervalMinutes: 0 },
    connectors: {
      enabled: false,
      schedule: { intervalMinutes: 1440 },
      sources: []
    },
    appleHealth: {
      enabled: false,
      sleep: { enabled: true, output: { target: "heading", headingMarkdown: "## 今日睡眠", insertAfterHeadingMarkdown: "", contentTemplate: DEFAULT_AH_SLEEP_TEMPLATE } },
      workouts: { enabled: true, minDurationMinutes: 0, output: { target: "heading", headingMarkdown: "## 今日运动", insertAfterHeadingMarkdown: "", contentTemplate: DEFAULT_AH_WORKOUT_TEMPLATE } }
    },
    dailyNote: { pathTemplate: "Daily/{{YYYY}}-{{MM}}-{{DD}}.md", templatePath: "", createIfMissing: true, headingLevel: 2, linePattern: "^\\[\\d{2}:\\d{2}\\]", lineFormat: "[{{HH:mm}}] {{content}}", blankLineBetweenEntries: true, sortEntriesByTime: true, slots: [] },
    reviews: { enabled: false, maxSourceChars: 60000, maxRecallChars: 16000, tasks: [] }
  };
}

function normalizeAppleHealthForForm(source = {}) {
  const defaults = defaultForm().appleHealth;
  const sleep = source.sleep || {};
  const workouts = source.workouts || {};
  return {
    enabled: Boolean(source.enabled),
    sleep: {
      enabled: sleep.enabled !== undefined ? Boolean(sleep.enabled) : defaults.sleep.enabled,
      output: { ...defaults.sleep.output, ...(sleep.output || {}) }
    },
    workouts: {
      enabled: workouts.enabled !== undefined ? Boolean(workouts.enabled) : defaults.workouts.enabled,
      minDurationMinutes: Number.isFinite(Number(workouts.minDurationMinutes))
        ? Number(workouts.minDurationMinutes)
        : defaults.workouts.minDurationMinutes,
      output: { ...defaults.workouts.output, ...(workouts.output || {}) }
    }
  };
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

async function loadConfig() {
  try {
    setStatus("Loading config...");
    const config = await request("/v1/config");
    applyConfig(config);
    await nextTick();
    await loadVaultDirs({ silent: true });
    if (!applyStravaOAuthCallbackFromUrl()) setStatus("Config loaded", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function saveConfig() {
  try {
    setStatus("Saving config...");
    await persistConfig();
    setStatus("Config saved", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function persistConfig() {
  const saved = await request("/v1/config", { method: "PUT", body: JSON.stringify(toPayload()) });
  applyConfig(saved);
  await loadVaultDirs({ silent: true });
  return saved;
}

function applyConfig(config) {
  const defaults = defaultForm();
  form.vaultRoot = config.vaultRoot || defaults.vaultRoot;
  form.dataDir = config.dataDir || defaults.dataDir;
  form.timeZone = config.timeZone || defaults.timeZone;
  form.allowedDirs = [...(config.allowedDirs || [])];
  form.includeRootMarkdownFiles = Boolean(config.includeRootMarkdownFiles);
  form.excludePaths = [...(config.excludePaths || [])];
  form.maxJsonBodyBytes = config.maxJsonBodyBytes || defaults.maxJsonBodyBytes;
  form.attachments = { ...defaults.attachments, ...(config.attachments || {}) };
  form.ai = normalizeProviderForForm({ ...defaults.ai, ...(config.ai || {}), apiKey: "" });
  form.embedding = normalizeProviderForForm({ ...defaults.embedding, ...(config.embedding || {}), apiKey: "" });
  form.connectors = normalizeConnectorsForForm({ ...defaults.connectors, ...(config.connectors || {}) });
  form.appleHealth = normalizeAppleHealthForForm(config.appleHealth || {});
  form.dailyNote = { ...defaults.dailyNote, ...(config.dailyNote || {}) };
  form.reviews = {
    ...defaults.reviews,
    ...(config.reviews || {}),
    tasks: (config.reviews?.tasks || []).map(normalizeTaskForForm)
  };
  reviewStatus.value = null;
  connectorStatus.value = null;
  syncReviewJsonFromTasks();
}

function toPayload() {
  return JSON.parse(JSON.stringify({
    vaultRoot: form.vaultRoot,
    dataDir: form.dataDir,
    timeZone: form.timeZone,
    allowedDirs: form.allowedDirs,
    includeRootMarkdownFiles: form.includeRootMarkdownFiles,
    excludePaths: form.excludePaths,
    maxJsonBodyBytes: form.maxJsonBodyBytes,
    attachments: form.attachments,
    ai: { ...form.ai, provider: "openai-compatible" },
    embedding: { ...form.embedding, provider: "openai-compatible" },
    connectors: stripConnectorsForSave(form.connectors),
    appleHealth: form.appleHealth,
    dailyNote: { ...form.dailyNote, timeZone: form.timeZone },
    reviews: {
      ...form.reviews,
      tasks: form.reviews.tasks.map(stripTaskForSave)
    }
  }));
}

async function loadVaultDirs(options = {}) {
  try {
    loadingDirs.value = true;
    if (!options.silent) setStatus("Refreshing Vault directories...");
    const payload = await request("/v1/config/vault-dirs");
    vaultDirs.value = Array.isArray(payload.dirs) ? payload.dirs : [];
    normalizeDirectorySelections();
    if (!options.silent) setStatus("Vault directories refreshed", "success");
  } catch (error) {
    if (!options.silent) setStatus(error.message, "error");
  } finally {
    loadingDirs.value = false;
  }
}

function normalizeDirectorySelections() {
  if (!vaultDirs.value.length) return;
  if (form.allowedDirs.length === 0 || sameSet(form.allowedDirs, legacyAllowedDirs)) {
    form.allowedDirs = [...vaultDirs.value];
  }
  for (const task of form.reviews.tasks) {
    if (sameSet(task.sourceDirs, legacyTaskDirs)) task.sourceDirs = [...form.allowedDirs];
    if (sameSet(task.semanticRecall.scopeDirs, legacyRecallDirs)) task.semanticRecall.scopeDirs = [...form.allowedDirs];
  }
}

function addAllowedDir(value) {
  const dir = String(value || "").trim().replace(/^\/+|\/+$/g, "");
  if (!dir) return;
  form.allowedDirs = mergeUnique(form.allowedDirs, [dir]);
  customAllowedDir.value = "";
}

function addSlot() {
  form.dailyNote.slots.push({ heading: "", start: "09:00", end: "11:59" });
}

function removeSlot(index) {
  form.dailyNote.slots.splice(index, 1);
}

async function loadIndexStatus() {
  try {
    const payload = await request("/v1/api/index/status", { method: "POST", body: "{}" });
    setStatus(`Index status: ${payload.result.files} files, ${payload.result.chunks} chunks, ready=${payload.result.ready}`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function clearIndexErrors() {
  try {
    await request("/v1/api/index/errors/clear", { method: "POST", body: "{}" });
    setStatus("Index errors cleared", "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function rebuildIndex() {
  try {
    setStatus("Rebuilding index. This may take a while...");
    const payload = await request("/v1/api/index/rebuild", { method: "POST", body: JSON.stringify({ force: false }) });
    setStatus(`Index updated: ${payload.result.files} files, ${payload.result.chunks} chunks`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function loadReviewStatus() {
  try {
    const payload = await request("/v1/api/reviews/status", { method: "POST", body: "{}" });
    reviewStatus.value = payload.result;
    setStatus(t("reviewStatusLoaded"), "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function runReviewTask(taskId) {
  try {
    if (!String(taskId || "").trim()) throw new Error("Task ID is required");
    setStatus(t("savingBeforeRun"));
    await persistConfig();
    const payload = await request("/v1/api/reviews/run", { method: "POST", body: JSON.stringify({ taskId: String(taskId).trim() }) });
    setStatus(`Review written to ${payload.result.path}`, "success");
    await loadReviewStatus();
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function loadConnectorStatus() {
  try {
    const payload = await request("/v1/api/connectors/status", { method: "POST", body: "{}" });
    connectorStatus.value = payload.result;
    setStatus(t("connectorStatusLoaded"), "success");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

async function runConnectorNow(source) {
  try {
    if (!source?.id) throw new Error("Connector source id is required");
    runningConnectorId.value = source.id;
    setStatus(t("savingBeforeRun"));
    await persistConfig();
    const payload = await request("/v1/api/connectors/run", { method: "POST", body: JSON.stringify({ connectorId: source.id }) });
    const result = payload.result;
    const written = result.activitiesWritten ?? result.postsWritten ?? 0;
    const found = result.activitiesFound ?? result.postsFound ?? 0;
    const label = result.platform === "strava" ? t("activitiesWrittenStatus") : t("postsWrittenStatus");
    setStatus(`${result.connectorName || result.connectorId}: ${written}/${found} ${label}`, "success");
    await loadConnectorStatus();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    runningConnectorId.value = "";
  }
}

function addConnectorSource() {
  form.connectors.sources.push(createDefaultConnectorSource());
}

function removeConnectorSource(index) {
  form.connectors.sources.splice(index, 1);
}

function connectorStatusForSource(source) {
  if (!connectorStatus.value?.connectors || !source?.id) return null;
  return connectorStatus.value.connectors.find((item) => item.id === source.id) || null;
}

function addReviewTask() {
  form.reviews.tasks.push(createDefaultReviewTask(`custom-review-${form.reviews.tasks.length + 1}`));
}

function duplicateTask(index) {
  const copy = normalizeTaskForForm(JSON.parse(JSON.stringify(form.reviews.tasks[index])));
  copy.id = uniqueTaskId(`${copy.id}-copy`);
  copy.name = `${copy.name} Copy`;
  copy.__key = crypto.randomUUID();
  form.reviews.tasks.splice(index + 1, 0, copy);
}

function removeTask(index) {
  form.reviews.tasks.splice(index, 1);
  if (!form.reviews.tasks.length) addReviewTask();
}

function syncReviewJsonFromTasks() {
  reviewTasksJson.value = JSON.stringify(form.reviews.tasks.map(stripTaskForSave), null, 2);
}

function applyReviewJson() {
  try {
    const tasks = JSON.parse(reviewTasksJson.value || "[]");
    form.reviews.tasks = (Array.isArray(tasks) ? tasks : []).map(normalizeTaskForForm);
    if (!form.reviews.tasks.length) addReviewTask();
    syncReviewJsonFromTasks();
    setStatus("Review task cards updated from JSON", "success");
  } catch (error) {
    setStatus(`Invalid review task JSON: ${error.message}`, "error");
  }
}

function taskDirOptions(task) {
  return mergeUnique(vaultDirs.value, form.allowedDirs, task.sourceDirs, task.semanticRecall.scopeDirs);
}

function apiKeyHint(saved) {
  return saved ? t("apiKeySaved") : t("apiKeyMissing");
}

function xTokenHint(source) {
  return source?.bearerTokenSet ? t("xTokenSaved") : t("xTokenMissing");
}

function setStatus(message, type = "info") {
  ElMessage({
    message,
    type,
    showClose: true,
    duration: type === "error" ? 6500 : 2800,
    grouping: true
  });
}

function toggleLanguage() {
  language.value = language.value === "en" ? "zh" : "en";
}

function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat(language.value === "zh" ? "zh-CN" : "en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: form.timeZone
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatReviewRun(run) {
  if (!run) return t("noLastRun");
  const status = run.ok === false ? `Failed: ${run.error || ""}` : run.path || "OK";
  return `${formatDateTime(run.ranAt)} · ${status}`;
}

function formatConnectorRun(run) {
  if (!run) return t("noLastRun");
  const status = run.ok === false
    ? `Failed: ${run.error || ""}`
    : `${run.postsWritten || 0}/${run.postsFound || 0} posts`;
  return `${formatDateTime(run.ranAt)} · ${status}`;
}

function normalizeTaskForForm(task) {
  const fallback = createDefaultReviewTask("weekly-review");
  return {
    ...fallback,
    ...task,
    __key: task.__key || crypto.randomUUID(),
    schedule: { ...fallback.schedule, ...(task.schedule || {}) },
    output: { ...fallback.output, ...(task.output || {}) },
    semanticRecall: { ...fallback.semanticRecall, ...(task.semanticRecall || {}) },
    sourceDirs: Array.isArray(task.sourceDirs) ? task.sourceDirs : fallback.sourceDirs,
    excludePaths: Array.isArray(task.excludePaths) ? task.excludePaths : fallback.excludePaths,
    includeDailyNotes: task.includeDailyNotes !== false
  };
}

function normalizeProviderForForm(config) {
  return {
    ...config,
    provider: "openai-compatible",
    apiMode: config.apiMode === "responses" ? "responses" : "chat-completions"
  };
}

function normalizeConnectorsForForm(config) {
  const defaults = defaultForm().connectors;
  const rawSources = Array.isArray(config.sources)
    ? config.sources
    : config.x
      ? [{ id: "x", name: "X", ...config.x }]
      : [];
  return {
    ...defaults,
    ...config,
    schedule: { ...defaults.schedule, ...(config.schedule || {}) },
    sources: rawSources.map(normalizeConnectorSourceForForm)
  };
}

function normalizeConnectorSourceForForm(source, index) {
  const platform = source.platform === "strava" ? "strava" : "x";
  const fallback = createDefaultConnectorSource(index === 0 ? platform : `${platform}-${index + 1}`, platform);
  return {
    ...fallback,
    ...source,
    __key: source.__key || crypto.randomUUID(),
    id: source.id || fallback.id,
    platform,
    bearerToken: "",
    bearerTokenSet: Boolean(source.bearerTokenSet),
    clientSecret: "",
    clientSecretSet: Boolean(source.clientSecretSet),
    refreshToken: "",
    refreshTokenSet: Boolean(source.refreshTokenSet),
    redirectUri: normalizeStravaRedirectUriForForm(source.redirectUri || fallback.redirectUri),
    authorizationCode: "",
    authorizationCodeSet: Boolean(source.authorizationCodeSet),
    accessTokenSet: Boolean(source.accessTokenSet),
    output: { ...fallback.output, ...(source.output || {}) }
  };
}

function createDefaultConnectorSource(id, platform = "x") {
  const normalizedPlatform = platform === "strava" ? "strava" : "x";
  const sourceId = id || uniqueConnectorSourceId(`${normalizedPlatform}-source`);
  if (normalizedPlatform === "strava") {
    return {
      __key: crypto.randomUUID(),
      id: sourceId,
      name: "",
      enabled: true,
      platform: "strava",
      baseUrl: "https://www.strava.com/api/v3",
      clientId: "",
      redirectUri: adminUiRedirectUri(),
      clientSecret: "",
      clientSecretSet: false,
      refreshToken: "",
      refreshTokenSet: false,
      authorizationCode: "",
      authorizationCodeSet: false,
      accessTokenSet: false,
      maxActivitiesPerRun: 10,
      requestDelayMs: 1000,
      minMovingTimeMinutes: 5,
      output: { headingMarkdown: "## 今日运动", insertAfterHeadingMarkdown: "" }
    };
  }
  return {
    __key: crypto.randomUUID(),
    id: sourceId,
    name: "",
    enabled: true,
    platform: "x",
    baseUrl: "https://api.x.com/2",
    userId: "",
    username: "",
    bearerToken: "",
    bearerTokenSet: false,
    includeReplies: true,
    includeRetweets: false,
    maxPostsPerRun: 50,
    output: { target: "heading", headingMarkdown: "## Twitter", lineFormat: "", contentTemplate: "{{text}}" }
  };
}

function stripConnectorsForSave(connectors) {
  return {
    enabled: Boolean(connectors.enabled),
    schedule: { ...(connectors.schedule || {}) },
    sources: (connectors.sources || []).map(stripConnectorSourceForSave)
  };
}

function stripConnectorSourceForSave(source) {
  const copy = JSON.parse(JSON.stringify(source));
  delete copy.__key;
  delete copy.bearerTokenSet;
  delete copy.clientSecretSet;
  delete copy.refreshTokenSet;
  delete copy.accessTokenSet;
  delete copy.authorizationCodeSet;
  return copy;
}

function stravaAuthorizationUrl(source) {
  if (source?.platform !== "strava" || !String(source.clientId || "").trim()) return "";
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", String(source.clientId).trim());
  url.searchParams.set("redirect_uri", normalizeStravaRedirectUriForForm(source.redirectUri));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "force");
  url.searchParams.set("scope", "read,activity:read_all");
  url.searchParams.set("state", source.id || "");
  return url.toString();
}

function applyStravaOAuthCallbackFromUrl() {
  const params = new URLSearchParams(window.location.search || "");
  const error = params.get("error");
  const code = params.get("code");
  if (!error && !code) return false;

  if (error) {
    setStatus(error === "access_denied" ? t("stravaAuthorizationDenied") : `Strava authorization failed: ${error}`, "error");
    cleanStravaOAuthCallbackUrl();
    return true;
  }

  const scope = params.get("scope") || "";
  if (scope && !stravaScopeHasActivityRead(scope)) {
    setStatus(t("stravaAuthorizationScopeMissing"), "error");
    cleanStravaOAuthCallbackUrl();
    return true;
  }

  const state = params.get("state") || "";
  const stravaSources = form.connectors.sources.filter((source) => source.platform === "strava");
  const source = stravaSources.find((item) => item.id === state) || (stravaSources.length === 1 ? stravaSources[0] : null);
  if (!source) {
    setStatus(t("stravaAuthorizationSourceMissing"), "error");
    cleanStravaOAuthCallbackUrl();
    return true;
  }

  source.authorizationCode = code;
  source.authorizationCodeSet = false;
  source.redirectUri = adminUiRedirectUri();
  setStatus(t("stravaAuthorizationCodeCaptured"), "success");
  cleanStravaOAuthCallbackUrl();
  return true;
}

function cleanStravaOAuthCallbackUrl() {
  const url = new URL(window.location.href);
  for (const key of ["code", "scope", "state", "error"]) {
    url.searchParams.delete(key);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, next || "/admin");
}

function stravaScopeHasActivityRead(scope) {
  const scopes = new Set(String(scope || "").split(/[,\s]+/).filter(Boolean));
  return scopes.has("activity:read") || scopes.has("activity:read_all");
}

function normalizeStravaRedirectUriForForm(value) {
  const raw = String(value || "").trim();
  if (!raw || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/i.test(raw)) {
    return adminUiRedirectUri();
  }
  return raw;
}

function adminUiRedirectUri() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (!url.pathname || url.pathname === "/") url.pathname = "/admin";
  return url.toString();
}

function onConnectorPlatformChange(source) {
  const next = createDefaultConnectorSource(source.id, source.platform);
  Object.assign(source, {
    ...next,
    __key: source.__key,
    id: source.id,
    name: source.name,
    enabled: source.enabled,
    platform: next.platform
  });
}

function createDefaultReviewTask(id) {
  return {
    __key: crypto.randomUUID(),
    id,
    enabled: false,
    name: "Review Task",
    period: "weekly",
    targetPeriod: "previous",
    schedule: { time: "08:00", weekday: 1, monthDay: 1, quarterDayOffset: 1, month: 1, period: "weekly" },
    includeDailyNotes: true,
    sourceDirs: [...form.allowedDirs],
    excludePaths: [],
    output: { pathTemplate: "Reviews/Weekly/{{YYYY}}-W{{WW}}.md", heading: "Review", templatePath: "" },
    semanticRecall: { enabled: true, query: "", limit: 8, scopeDirs: [...form.allowedDirs] },
    prompt: "Summarize this period, identify patterns, open loops, and questions worth thinking about next. Ground claims in the supplied notes."
  };
}

function stripTaskForSave(task) {
  const copy = JSON.parse(JSON.stringify(task));
  delete copy.__key;
  if (copy.output) delete copy.output.writeMode;
  return copy;
}

function uniqueTaskId(base) {
  const existing = new Set(form.reviews.tasks.map((task) => task.id));
  const normalizedBase = base.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "review-task";
  let candidate = normalizedBase;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${normalizedBase}-${index}`;
    index += 1;
  }
  return candidate;
}

function uniqueConnectorSourceId(base) {
  const existing = new Set(form.connectors.sources.map((source) => source.id));
  const normalizedBase = base.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "x-source";
  let candidate = normalizedBase;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${normalizedBase}-${index}`;
    index += 1;
  }
  return candidate;
}

function mergeUnique(...lists) {
  const values = [];
  const seen = new Set();
  for (const list of lists) {
    for (const item of Array.isArray(list) ? list : [list]) {
      const value = String(item || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      values.push(value);
    }
  }
  return values;
}

function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

</script>
