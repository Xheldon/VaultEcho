<template>
  <div :class="['section-title', { inline }]">
    <div class="section-icon">
      <component :is="iconComponent" />
    </div>
    <div>
      <h2>{{ title }}</h2>
      <p v-if="description">{{ description }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Clock, Connection, Cpu, FolderOpened, Notebook } from "@element-plus/icons-vue";

const props = defineProps({
  icon: {
    type: String,
    default: "FolderOpened"
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ""
  },
  inline: {
    type: Boolean,
    default: false
  }
});

const iconMap = { Clock, Connection, Cpu, FolderOpened, Notebook };
const iconComponent = computed(() => iconMap[props.icon] || FolderOpened);
</script>
