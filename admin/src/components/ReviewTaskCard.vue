<template>
  <el-card class="task-card" shadow="never">
    <template #header>
      <div class="task-card-header">
        <div class="task-title">
          <el-switch v-model="task.enabled" :active-text="labels.enableThisTask" />
          <strong>{{ task.name || task.id }}</strong>
        </div>
        <div class="task-actions">
          <el-button size="small" type="primary" plain @click="$emit('run', task.id)">{{ labels.runNow }}</el-button>
          <el-button size="small" @click="$emit('duplicate')">{{ labels.duplicate }}</el-button>
          <el-button size="small" type="danger" plain @click="$emit('remove')">{{ labels.remove }}</el-button>
        </div>
      </div>
    </template>

    <el-form label-position="top">
      <el-row :gutter="14">
        <el-col :xs="24" :md="12">
          <el-form-item :label="labels.taskId">
            <el-input v-model="task.id" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item :label="labels.name">
            <el-input v-model="task.name" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="8">
          <el-form-item :label="labels.period">
            <el-select v-model="task.period" class="full-width">
              <el-option value="weekly" :label="labels.weekly" />
              <el-option value="monthly" :label="labels.monthly" />
              <el-option value="quarterly" :label="labels.quarterly" />
              <el-option value="yearly" :label="labels.yearly" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="8">
          <el-form-item :label="labels.targetPeriod">
            <el-select v-model="task.targetPeriod" class="full-width">
              <el-option value="previous" :label="labels.previous" />
              <el-option value="current" :label="labels.current" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="8">
          <el-form-item :label="labels.runTime">
            <el-time-picker v-model="task.schedule.time" value-format="HH:mm" format="HH:mm" class="full-width" />
          </el-form-item>
        </el-col>
        <el-col v-if="task.period === 'weekly'" :xs="24" :md="8">
          <el-form-item :label="labels.weekday">
            <el-select v-model="task.schedule.weekday" class="full-width">
              <el-option :value="0" :label="labels.sunday" />
              <el-option :value="1" :label="labels.monday" />
              <el-option :value="2" :label="labels.tuesday" />
              <el-option :value="3" :label="labels.wednesday" />
              <el-option :value="4" :label="labels.thursday" />
              <el-option :value="5" :label="labels.friday" />
              <el-option :value="6" :label="labels.saturday" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col v-if="task.period === 'monthly' || task.period === 'yearly'" :xs="24" :md="8">
          <el-form-item :label="labels.monthDay">
            <el-input-number v-model="task.schedule.monthDay" :min="1" :max="31" class="full-width" />
          </el-form-item>
        </el-col>
        <el-col v-if="task.period === 'quarterly'" :xs="24" :md="8">
          <el-form-item :label="labels.quarterDayOffset">
            <el-input-number v-model="task.schedule.quarterDayOffset" :min="1" :max="31" class="full-width" />
          </el-form-item>
        </el-col>
        <el-col v-if="task.period === 'yearly'" :xs="24" :md="8">
          <el-form-item :label="labels.month">
            <el-input-number v-model="task.schedule.month" :min="1" :max="12" class="full-width" />
          </el-form-item>
        </el-col>
        <el-col :xs="24">
          <el-checkbox v-model="task.includeDailyNotes">{{ labels.includeDailyNotes }}</el-checkbox>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item :label="labels.sourceDirs">
            <DirectorySelector v-model="task.sourceDirs" :options="dirOptions" :empty-text="labels.noVaultDirs" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item :label="labels.semanticRecallScopeDirs">
            <DirectorySelector v-model="task.semanticRecall.scopeDirs" :options="dirOptions" :empty-text="labels.noVaultDirs" />
          </el-form-item>
        </el-col>
        <el-col :xs="24">
          <el-checkbox v-model="task.semanticRecall.enabled">{{ labels.semanticRecall }}</el-checkbox>
        </el-col>
        <el-col :xs="24" :md="18">
          <el-form-item :label="labels.semanticRecallQuery">
            <el-input v-model="task.semanticRecall.query" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="6">
          <el-form-item :label="labels.semanticRecallLimit">
            <el-input-number v-model="task.semanticRecall.limit" :min="1" :max="50" class="full-width" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item :label="labels.outputPathTemplate">
            <el-input v-model="task.output.pathTemplate" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item :label="labels.reviewTemplatePath">
            <el-input v-model="task.output.templatePath" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :md="12">
          <el-form-item :label="labels.outputHeading">
            <el-input v-model="task.output.heading" />
          </el-form-item>
        </el-col>
        <el-col :xs="24">
          <el-form-item :label="labels.prompt">
            <el-input v-model="task.prompt" type="textarea" :rows="5" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </el-card>
</template>

<script setup>
import DirectorySelector from "./DirectorySelector.vue";

const task = defineModel({
  type: Object,
  required: true
});

defineProps({
  dirOptions: {
    type: Array,
    default: () => []
  },
  labels: {
    type: Object,
    required: true
  }
});

defineEmits(["duplicate", "remove", "run"]);
</script>
