<template>
  <div v-if="options.length" class="dir-chip-group">
    <el-checkbox-group :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
      <el-checkbox-button v-for="dir in options" :key="dir" :value="dir">
        {{ dir }}
      </el-checkbox-button>
    </el-checkbox-group>
  </div>
  <div v-else class="empty-dir">{{ emptyText }}</div>
</template>

<script setup>
defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  options: {
    type: Array,
    default: () => []
  },
  emptyText: {
    type: String,
    default: "No Vault directories found"
  }
});

defineEmits(["update:modelValue"]);
</script>
