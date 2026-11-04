<script setup lang="ts">
import { ref } from 'vue';
import type { PlanTemplate, PlanTemplatePreview } from '@/types/workout';

const open = defineModel<boolean>({ required: true });

defineProps<{
  templates: PlanTemplate[];
  loading: boolean;
  busy: boolean;
  preview: PlanTemplatePreview | null;
}>();

const emit = defineEmits<{
  saveTemplate: [name: string];
  previewTemplate: [id: number];
  applyTemplate: [id: number];
  deleteTemplate: [id: number];
  clearPreview: [];
}>();

const newName = ref('');

function submitSave() {
  const trimmed = newName.value.trim();
  if (!trimmed) return;
  emit('saveTemplate', trimmed);
  newName.value = '';
}
</script>

<template>
  <q-dialog v-model="open">
    <q-card class="editor-dialog template-dialog">
      <!-- Preview Mode -->
      <template v-if="preview">
        <q-card-section>
          <p class="eyebrow">TEMPLATE PREVIEW</p>
          <h2>{{ preview.template.name }}</h2>
          <p class="template-copy">
            {{ preview.exerciseCount }} planned movements across seven days.
          </p>
          <q-banner class="template-warning" rounded>
            {{ preview.warning }}
          </q-banner>
          <div class="template-day-list">
            <div v-for="day in preview.plan.days" :key="day.dayIndex">
              <strong>{{ day.dayName }}</strong>
              <span>{{ day.title }}</span>
              <small>{{ day.isRestDay ? 'Rest day' : `${day.exercises.length} movements` }}</small>
            </div>
          </div>
        </q-card-section>
        <q-card-actions align="between">
          <q-btn flat no-caps label="Back to list" @click="emit('clearPreview')" />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Confirm and apply template"
            :loading="busy"
            @click="emit('applyTemplate', preview.template.id)"
          />
        </q-card-actions>
      </template>

      <!-- Templates List Mode -->
      <template v-else>
        <q-card-section>
          <p class="eyebrow">PLAN TEMPLATES</p>
          <h2>Saved programs</h2>
          <p class="template-copy">
            Save your weekly plan as a named program to switch splits or restore your routine.
          </p>

          <div class="save-template-form">
            <q-input
              v-model="newName"
              dense
              outlined
              label="Template name (e.g. Hypertrophy 6-day)"
              maxlength="80"
              class="save-input"
              @keyup.enter="submitSave"
            />
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="Save current week"
              :disable="!newName.trim() || busy"
              :loading="busy"
              @click="submitSave"
            />
          </div>

          <div v-if="templates.length" class="template-list">
            <article v-for="tmpl in templates" :key="tmpl.id" class="template-item">
              <div class="template-info">
                <h3>{{ tmpl.name }}</h3>
                <p>{{ tmpl.exerciseCount }} movements · 7 days</p>
              </div>
              <div class="template-actions">
                <q-btn
                  outline
                  dense
                  no-caps
                  label="Preview & apply"
                  :disable="busy"
                  @click="emit('previewTemplate', tmpl.id)"
                />
                <q-btn
                  flat
                  round
                  dense
                  icon="delete_outline"
                  aria-label="Delete template"
                  :disable="busy"
                  @click="emit('deleteTemplate', tmpl.id)"
                />
              </div>
            </article>
          </div>
          <div v-else class="empty-templates">
            <p>No saved templates yet. Name and save your current split above.</p>
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Close" v-close-popup />
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.editor-dialog {
  width: min(580px, 94vw);
  border-radius: 9px;
}
.eyebrow {
  margin: 0 0 10px;
  color: #778071;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
}
.template-dialog h2 {
  margin: 0;
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 34px;
}
.template-copy {
  margin: 6px 0 18px;
  color: #646c60;
  font-size: 13px;
}
.save-template-form {
  display: flex;
  gap: 8px;
  margin-bottom: 22px;
}
.save-input {
  flex: 1;
}
.template-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}
.template-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  border: 1px solid #dfe3db;
  border-radius: 7px;
  background: #fbfcf9;
}
.template-info h3 {
  margin: 0 0 2px;
  font-size: 15px;
  font-weight: 700;
  color: #1a1a1a;
}
.template-info p {
  margin: 0;
  font-size: 12px;
  color: #778071;
}
.template-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.empty-templates {
  padding: 24px 12px;
  text-align: center;
  color: #778071;
  background: #fbfcf9;
  border: 1px dashed #dfe3db;
  border-radius: 7px;
}
.empty-templates p {
  margin: 0;
  font-size: 13px;
}
.template-warning {
  margin: 12px 0 16px;
  background: #fff8e1;
  color: #8d6b00;
  border: 1px solid #ffe082;
  font-size: 12px;
}
.template-day-list {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
}
.template-day-list > div {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  background: #f5f6f2;
  border-radius: 5px;
  font-size: 12px;
}
.template-day-list strong {
  width: 70px;
  color: #1a1a1a;
}
.template-day-list span {
  flex: 1;
  color: #4b5247;
}
.template-day-list small {
  color: #778071;
}
</style>
