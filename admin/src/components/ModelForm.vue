<template>
  <el-form label-position="top">
    <el-form-item :label="labels.provider">
      <el-select v-model="model.provider" class="full-width">
        <el-option label="OpenAI Compatible" value="openai-compatible" />
      </el-select>
      <div class="form-hint">{{ labels.providerHint }}</div>
    </el-form-item>
    <el-form-item :label="labels.baseUrl">
      <el-input v-model="model.baseUrl" placeholder="https://api.openai.com/v1" />
    </el-form-item>
    <el-form-item :label="labels.model">
      <el-input v-model="model.model" />
    </el-form-item>
    <el-form-item v-if="embedding" :label="labels.dimensions">
      <el-input-number v-model="model.dimensions" :min="0" class="full-width" />
    </el-form-item>
    <el-form-item :label="labels.apiKey">
      <el-input v-model="model.apiKey" type="password" autocomplete="off" placeholder="Leave blank to keep the saved key" />
      <div class="form-hint">{{ apiKeyHint }}</div>
    </el-form-item>
    <el-row v-if="!embedding" :gutter="12">
      <el-col :span="12">
        <el-form-item :label="labels.temperature">
          <el-input-number v-model="model.temperature" :min="0" :max="2" :step="0.1" class="full-width" />
        </el-form-item>
      </el-col>
      <el-col :span="12">
        <el-form-item :label="labels.maxOutputTokens">
          <el-input-number v-model="model.maxOutputTokens" :min="100" :step="100" class="full-width" />
        </el-form-item>
      </el-col>
    </el-row>
  </el-form>
</template>

<script setup>
const model = defineModel({
  type: Object,
  required: true
});

defineProps({
  labels: {
    type: Object,
    required: true
  },
  apiKeyHint: {
    type: String,
    default: ""
  },
  embedding: {
    type: Boolean,
    default: false
  }
});
</script>
