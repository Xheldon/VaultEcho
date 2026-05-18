<template>
  <el-config-provider :locale="elementLocale">
    <main class="app-shell">
      <header class="app-header">
        <div>
          <h1>VaultEcho</h1>
          <p>{{ t("tagline") }}</p>
        </div>
        <div class="header-actions">
          <el-button @click="toggleLanguage">{{ language === "zh" ? "English" : "中文" }}</el-button>
          <el-button :icon="Refresh" @click="loadConfig">{{ t("loadConfig") }}</el-button>
        </div>
      </header>

      <el-alert class="access-alert" type="info" :closable="false" show-icon>
        <template #title>{{ t("accessTitle") }}</template>
        <template #default>
          <span v-html="t('accessBody')" />
        </template>
      </el-alert>

      <el-card class="section-card" shadow="never">
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
          </el-row>
        </el-form>
      </el-card>

      <el-row :gutter="18">
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
        <el-collapse-item name="daily">
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
          </el-form>
        </el-collapse-item>

        <el-collapse-item name="reviews">
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
    </main>
  </el-config-provider>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import en from "element-plus/es/locale/lang/en";
import { Check, Delete, Plus, Refresh } from "@element-plus/icons-vue";
import DirectorySelector from "./components/DirectorySelector.vue";
import ModelForm from "./components/ModelForm.vue";
import ReviewTaskCard from "./components/ReviewTaskCard.vue";
import SectionTitle from "./components/SectionTitle.vue";

const legacyAllowedDirs = ["Inbox", "Notes", "Ideas", "Projects", "Daily", "Reviews", "Templates", "Attachments", "Archive"];
const legacyTaskDirs = ["Daily", "Inbox", "Notes", "Ideas", "Projects"];
const legacyRecallDirs = ["Daily", "Notes", "Ideas", "Projects"];

const translations = {
  zh: {
    tagline: "捕捉任意内容，让你的 Vault 回应你。管理页使用 Basic Auth；外部 API 使用 Bearer Token。",
    loadConfig: "加载配置",
    saveConfig: "保存配置",
    accessTitle: "访问权限",
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
    aiModel: "AI 模型",
    aiModelDesc: "供内置回顾任务调用的 OpenAI-compatible Chat API。",
    semanticIndex: "语义索引",
    semanticDesc: "远程 Embedding API + 本地 JSON 向量索引。",
    provider: "服务商",
    providerHint: "当前版本固定使用 OpenAI-compatible 协议；请通过 Base URL 和模型名切换不同服务。",
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
    timeSlots: "时间段",
    heading: "Heading",
    start: "开始",
    end: "结束",
    addSlot: "添加时间段",
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
const form = reactive(defaultForm());

const timeZoneOptions = computed(() => {
  const fallback = ["UTC", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Taipei", "Asia/Tokyo", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/Los_Angeles", "America/New_York"];
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : fallback;
  return mergeUnique([Intl.DateTimeFormat().resolvedOptions().timeZone, form.timeZone], fallback, supported);
});

const allowedDirOptions = computed(() => mergeUnique(vaultDirs.value, form.allowedDirs));

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
  tagline: "Capture anything. Let your vault answer back. Admin pages use Basic Auth; external API calls use Bearer tokens.",
  loadConfig: "Load Config",
  saveConfig: "Save Config",
  accessTitle: "Access",
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
  aiModel: "AI Model",
  aiModelDesc: "OpenAI-compatible Chat API used by built-in review tasks.",
  semanticIndex: "Semantic Index",
  semanticDesc: "Remote embedding API plus a local JSON vector index.",
  provider: "Provider",
  providerHint: "This version only supports the OpenAI-compatible protocol. Use Base URL and Model to switch services.",
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
  timeSlots: "Time Slots",
  heading: "Heading",
  start: "Start",
  end: "End",
  addSlot: "Add Slot",
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
    attachments: { imageDir: "Attachments/Images", audioDir: "Attachments/Audio" },
    ai: { provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "", apiKey: "", apiKeySet: false, temperature: 0.2, maxOutputTokens: 1600 },
    embedding: { enabled: false, provider: "openai-compatible", baseUrl: "https://api.openai.com/v1", model: "", apiKey: "", apiKeySet: false, dimensions: 0, batchSize: 16, maxChunkChars: 1600, searchLimit: 8, autoIndexAfterWrite: true, autoScanIntervalMinutes: 0 },
    dailyNote: { pathTemplate: "Daily/{{YYYY}}-{{MM}}-{{DD}}.md", templatePath: "", createIfMissing: true, headingLevel: 2, linePattern: "^\\[\\d{2}:\\d{2}\\]", lineFormat: "[{{HH:mm}}] {{content}}", blankLineBetweenEntries: true, slots: [] },
    reviews: { enabled: false, maxSourceChars: 60000, maxRecallChars: 16000, tasks: [] }
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
    setStatus("Config loaded", "success");
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
  form.dailyNote = { ...defaults.dailyNote, ...(config.dailyNote || {}) };
  form.reviews = {
    ...defaults.reviews,
    ...(config.reviews || {}),
    tasks: (config.reviews?.tasks || []).map(normalizeTaskForForm)
  };
  reviewStatus.value = null;
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
    provider: "openai-compatible"
  };
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
